/**
 * native-http.ts — a `fetch`-compatible HTTP client that, on a device,
 * uses Capacitor's native HTTP bridge (CapacitorHttp) instead of the
 * WebView's `fetch`.
 *
 * Why this exists
 * ---------------
 * The Pay app runs in a Capacitor WebView whose origin is
 * `https://localhost`. Calls to the FutureChain hub
 * (`https://rpc.futurechain.eu`) are therefore CROSS-ORIGIN, and the hub's
 * CORS layer rejects the `https://localhost` origin with a 403
 * ("CORS request forbidden: origin not allowed"). The browser then
 * surfaces a bare `TypeError: Failed to fetch`, so on-device the wallet
 * could never read its own balance / UTXOs / receive history, and
 * `/enroll` + `/submit_signed_transaction` failed too.
 *
 * A native HTTP request is NOT a browser request — it carries no `Origin`
 * header and is not subject to CORS. Routing every hub call through
 * CapacitorHttp on-device makes reads AND signed-tx submits work
 * regardless of the hub's CORS allowlist, while web / dev builds fall
 * back to the platform `fetch` unchanged.
 *
 * The shim returns a minimal `Response`-shaped object exposing exactly
 * the members our callers use: `ok`, `status`, `headers`, `text()`,
 * `json()`. It honours an `AbortSignal` (CapacitorHttp cannot cancel a
 * native request, but we reject the promise so a caller's timeout still
 * fires and never hangs).
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const DEFAULT_TIMEOUT_MS = 15_000;

function toHeaderRecord(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) { h.forEach((v, k) => { out[k] = v; }); return out; }
  if (Array.isArray(h)) { for (const [k, v] of h) out[k] = String(v); return out; }
  for (const [k, v] of Object.entries(h)) out[k] = String(v);
  return out;
}

function makeResponse(status: number, url: string, bodyText: string, headers: Record<string, string>): Response {
  const ok = status >= 200 && status < 300;
  // We only ever read .ok / .status / .headers / .text() / .json() off
  // this — a structural Response is enough for the SDK + our callers.
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    url,
    headers: new Headers(headers),
    redirected: false,
    type: 'default' as ResponseType,
    bodyUsed: false,
    text: () => Promise.resolve(bodyText),
    // Defer the parse into the promise chain so a non-JSON body REJECTS
    // (like the real Response.json()) instead of throwing synchronously.
    json: () => Promise.resolve().then(() => JSON.parse(bodyText)),
  } as unknown as Response;
}

/**
 * A `fetch`-compatible function. Uses CapacitorHttp on native (bypassing
 * the WebView CORS layer); uses the platform `fetch` on web.
 */
export const httpFetch: typeof fetch = async (input, init) => {
  // On web (PWA / dev preview) keep the platform fetch — there is no
  // Capacitor bridge there, and the browser / dev-proxy rules apply.
  if (!Capacitor.isNativePlatform()) {
    return (globalThis.fetch as typeof fetch)(input as RequestInfo, init);
  }

  const url =
    typeof input === 'string' ? input
    : input instanceof URL ? input.toString()
    : (input as Request).url;
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = toHeaderRecord(init?.headers);

  // CapacitorHttp serialises `data` based on Content-Type. The SDK passes
  // a JSON string body; parse it back to an object so the bridge encodes
  // it once (passing the raw string would double-encode).
  let data: unknown;
  if (init?.body != null) {
    if (typeof init.body === 'string') {
      try { data = JSON.parse(init.body); } catch { data = init.body; }
    } else {
      data = init.body;
    }
  }

  const signal = init?.signal ?? undefined;
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');

  const reqPromise = CapacitorHttp.request({
    url,
    method,
    headers,
    data,
    responseType: 'text',
    connectTimeout: DEFAULT_TIMEOUT_MS,
    readTimeout: DEFAULT_TIMEOUT_MS,
  });

  // Honour an abort signal: CapacitorHttp can't cancel the native request,
  // but we reject so the caller's timeout/abort path runs instead of hanging.
  const result = signal
    ? await Promise.race<Awaited<typeof reqPromise>>([
        reqPromise,
        new Promise<never>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true },
          );
        }),
      ])
    : await reqPromise;

  const status = typeof result.status === 'number' ? result.status : 0;
  const bodyText =
    typeof result.data === 'string' ? result.data
    : result.data == null ? ''
    : JSON.stringify(result.data);
  const respHeaders = (result.headers as Record<string, string> | undefined) ?? {};
  return makeResponse(status, url, bodyText, respHeaders);
};
