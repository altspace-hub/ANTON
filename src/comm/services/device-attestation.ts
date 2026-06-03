/**
 * device-attestation.ts — Play Integrity (Android) attestation
 * client for ANTON Pay.
 *
 * Spec: docs/PAY_DEVICE_ATTESTATION_SPEC.md
 *
 * The flow at runtime:
 *   1. Pay-app obtains a Play Integrity verdict token via the
 *      `FcDeviceAttestation` native plugin (Android Java).
 *   2. Pay-app POSTs the token to Bahnhof `/attest` with the
 *      install bearer.
 *   3. Bahnhof returns an opaque 24-h session token.
 *   4. Pay-app caches the session token in secure-store and attaches
 *      it as `X-Attestation-Token` on every `/submit_signed_transaction`.
 *   5. Bahnhof's `/verify` (called by Caddy's forward_auth) enforces
 *      the session token on the high-risk path allowlist.
 *
 * Dev-mode escape (browser preview, vitest): the native plugin is
 * unavailable in non-native environments, so `requestPlayIntegrityToken()`
 * resolves to null. The wrapper falls back to `DEV_NO_ATTESTATION:<install_id>`
 * which Bahnhof accepts ONLY when `BAHNHOF_DEV_ATTESTATION_ALLOWED=true`
 * is set (it must NOT be in production).
 *
 * Caching: session token + expiry are persisted in secure-store, so
 * the 24-h window survives across app launches. A 5-minute headroom
 * triggers proactive refresh before a session would expire mid-tx.
 */
import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { getSecure, removeSecure, setSecure } from './secure-store';
import { getOrCreateInstallId } from './enrollment';
import { httpFetch } from './native-http';

// ── Native plugin interface (mirrors FcSecureSigner pattern) ──────

/** Result from the native plugin. `token` is the JWS string from
 *  Google Play Integrity. `verdict` is a short human-readable summary
 *  populated when the plugin can introspect (e.g. on the Android side
 *  it sets "MEETS_DEVICE_INTEGRITY" if it can read the decoded payload;
 *  otherwise empty). */
export interface IntegrityTokenResult {
  token: string;
  verdict?: string;
}

export interface FcDeviceAttestationPlugin {
  /** Request a fresh Play Integrity token for the given nonce.
   *  Native: calls IntegrityManager.requestIntegrityToken with the
   *  nonce + cloudProjectNumber the app was built with.
   *  Non-native (browser): rejects with a clearly-identified error
   *  that the JS layer translates into the dev-mode escape. */
  requestIntegrityToken(opts: { nonce: string }): Promise<IntegrityTokenResult>;
  /** Probe — true iff the native side can produce a real token.
   *  Used by the JS layer to decide whether to attempt the dev-mode
   *  fallback or to surface a hard error. */
  isAvailable(): Promise<{ available: boolean }>;
}

export const FcDeviceAttestation = registerPlugin<FcDeviceAttestationPlugin>(
  'FcDeviceAttestation',
);

// ── Storage keys + constants ──────────────────────────────────────

const SESSION_KEY = 'fc.attestation.session_token';
const EXPIRES_KEY = 'fc.attestation.expires_at';
const NONCE_BYTES = 16;
/** Refresh proactively when the cached session has less than this
 *  much time left. Prevents the worst-case "user taps Send, session
 *  expires between request build and submit, gets 401". */
const REFRESH_HEADROOM_MS = 5 * 60 * 1000;
/** Floor — never use a cached session with less than this remaining.
 *  Strictly redundant with REFRESH_HEADROOM_MS but kept as a sanity
 *  guard in case the proactive refresh path is bypassed (tests etc). */
const MIN_REMAINING_MS = 60 * 1000;
const DEV_TOKEN_PREFIX = 'DEV_NO_ATTESTATION:';

// ── Errors ────────────────────────────────────────────────────────

export class AttestationError extends Error {
  constructor(message: string, public readonly retryable: boolean = true) {
    super(message);
    this.name = 'AttestationError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function randomNonceB64Url(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function readCached(): Promise<{ token: string; expiresAt: number } | null> {
  const tok = await getSecure(SESSION_KEY);
  const exp = await getSecure(EXPIRES_KEY);
  if (!tok || !exp) return null;
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt)) return null;
  return { token: tok, expiresAt };
}

async function writeCached(token: string, expiresAt: number): Promise<void> {
  await setSecure(SESSION_KEY, token);
  await setSecure(EXPIRES_KEY, String(expiresAt));
}

/** Clear the cached session token. Called on a 401 with
 *  `WWW-Authenticate: attestation-required` so the next attempt
 *  re-attests rather than re-submitting the same dead session. */
export async function invalidateCachedAttestation(): Promise<void> {
  await removeSecure(SESSION_KEY);
  await removeSecure(EXPIRES_KEY);
}

/** Ask the native plugin for a fresh Play Integrity token. Returns
 *  null when the plugin isn't available (browser preview, vitest,
 *  desktop) — the caller falls back to the dev-mode escape. */
async function requestPlayIntegrityToken(
  nonce: string,
): Promise<IntegrityTokenResult | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { available } = await FcDeviceAttestation.isAvailable();
    if (!available) return null;
    return await FcDeviceAttestation.requestIntegrityToken({ nonce });
  } catch (e) {
    // Plugin present but failed (e.g. Google Play Services not
    // installed on the device, or transient network failure during the
    // Google integrity check). Treat as "no token" and let the caller
    // surface a UX error.
    if (typeof console !== 'undefined') {
      console.warn('Play Integrity request failed:', e);
    }
    return null;
  }
}

// ── POST /attest ─────────────────────────────────────────────────

interface AttestResponse {
  session_token: string;
  expires_in: number;
  issued_at: string;
  verdict: string;
}

async function postAttest(
  endpoint: string, apiKey: string, integrityToken: string, nonce: string,
): Promise<AttestResponse> {
  const url = endpoint.replace(/\/+$/, '') + '/attest';
  // Native HTTP on-device → bypasses the WebView CORS layer (origin
  // https://localhost) that 403s every hub call, exactly like /enroll and
  // the SDK RpcClient. Without this, /attest fails with "Failed to fetch"
  // on a phone, no attestation token is obtained, and every signed-tx
  // submit is rejected 401 even on a fully-enrolled device.
  const res = await httpFetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      play_integrity_token: integrityToken,
      nonce,
    }),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = await res.json() as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch { /* keep status-only detail */ }
    throw new AttestationError(
      `/attest rejected: ${detail}`,
      // 501 (server misconfig) is not retryable from the client side.
      // 401 is retryable iff the issue was a stale install token.
      res.status !== 501,
    );
  }
  return res.json() as Promise<AttestResponse>;
}

// ── Public API ────────────────────────────────────────────────────

/** Returns a fresh-enough attestation session token for the given
 *  install. Uses the cache when possible. On cache miss / near
 *  expiry, performs the full attest flow: native plugin → POST /attest
 *  → cache. In dev (no native plugin) sends the dev-mode token,
 *  which Bahnhof only accepts when BAHNHOF_DEV_ATTESTATION_ALLOWED=true. */
export async function getAttestationToken(
  endpoint: string, apiKey: string,
): Promise<string> {
  // 1. Cache hit?
  const cached = await readCached();
  if (cached) {
    const remaining = cached.expiresAt - Date.now();
    if (remaining > REFRESH_HEADROOM_MS) {
      return cached.token;
    }
    if (remaining > MIN_REMAINING_MS) {
      // In the headroom — return it now but fire-and-forget a refresh
      // so the NEXT call sees a fresh one. Best-effort; if it fails
      // we'll just refresh next time.
      void refreshInBackground(endpoint, apiKey);
      return cached.token;
    }
    // Effectively expired — fall through to a synchronous refresh.
  }

  // 2. Full attest flow.
  const installId = await getOrCreateInstallId();
  const nonce = randomNonceB64Url();
  const integrity = await requestPlayIntegrityToken(nonce);
  const tokenToSend = integrity
    ? integrity.token
    : `${DEV_TOKEN_PREFIX}${installId}`;
  const resp = await postAttest(endpoint, apiKey, tokenToSend, nonce);
  const expiresAt = Date.now() + (resp.expires_in * 1000);
  await writeCached(resp.session_token, expiresAt);
  return resp.session_token;
}

let _refreshInFlight: Promise<void> | null = null;

/** Internal: schedule a background refresh, deduplicated. Errors are
 *  swallowed — the foreground path will surface any real failure on
 *  the next cache-miss attempt. */
function refreshInBackground(endpoint: string, apiKey: string): Promise<void> {
  if (_refreshInFlight) return _refreshInFlight;
  _refreshInFlight = (async () => {
    try {
      // Force a cache miss by clearing first, then re-resolving.
      await invalidateCachedAttestation();
      await getAttestationToken(endpoint, apiKey);
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('background attestation refresh failed:', e);
      }
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

/** Provider factory for use with the SDK's `RpcConfig.attestationTokenProvider`.
 *  Resolves the bearer + endpoint lazily and never throws back into the
 *  caller — returns null if attestation isn't obtainable, so the SDK
 *  sends no header (and the server will 401 with a clear reason).
 *  fc-rpc.ts plumbs this into the RpcClient config. */
export function makeAttestationTokenProvider(
  endpoint: string, apiKey: string,
): () => Promise<string | null> {
  return async () => {
    try {
      return await getAttestationToken(endpoint, apiKey);
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('attestation provider failed:', e);
      }
      return null;
    }
  };
}
