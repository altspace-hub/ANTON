/**
 * fc-rpc.ts — single configured RpcClient for the Pay app, pointed at
 * the public FutureChain light-hub at https://rpc.futurechain.eu.
 *
 * The hub is behind Caddy with a 7-endpoint allowlist; the API key
 * gates `POST /submit_signed_transaction`. Read endpoints (`/balance`,
 * `/get_utxos`, `/transaction`, `/iso_received`, `/info`, `/health`)
 * are unauthenticated — the data is already public on-chain.
 *
 * Phase F1+F2 (May 20 2026): the bearer is no longer a build-time
 * constant. Every install obtains its own token via
 * `enrollment.ts::getInstallToken` on first launch and stores it in
 * the OS keystore. Decompiling the APK/IPA yields no working token.
 * `getRpc()` is now `async` so the token can be resolved lazily.
 *
 * The default endpoint lives in the build; a future settings screen
 * will let advanced users point at their own node.
 */
import { rpc } from '@futurechain/sdk';
import { getInstallToken } from './enrollment';
import { getSecure, setSecure, removeSecure } from './secure-store';
import { makeAttestationTokenProvider } from './device-attestation';
import { httpFetch } from './native-http';

/** Production light-hub URL (Bahnhof, behind Caddy + LE). */
export const DEFAULT_ENDPOINT = 'https://rpc.futurechain.eu';

/** Secure-store key holding a user override. When absent, getRpc()
 *  uses DEFAULT_ENDPOINT. Stored in secure-store rather than IDB so
 *  it survives an app cache wipe (the wallet does too — and a
 *  payment app where wallet and endpoint disagree is dangerous). */
const ENDPOINT_KEY = 'fc.rpc.endpoint';

let cached: rpc.RpcClient | null = null;

/** Returns the currently-configured endpoint URL (override or
 *  default). Async because the override lives in async secure-store. */
export async function getEndpoint(): Promise<string> {
  const override = (await getSecure(ENDPOINT_KEY))?.trim();
  return override && /^https?:\/\//.test(override) ? override : DEFAULT_ENDPOINT;
}

/** Persist a user-chosen RPC endpoint. Pass `null` (or the default
 *  URL) to remove the override. Invalidates the cached client so the
 *  next getRpc() picks up the change immediately. */
export async function setEndpoint(url: string | null): Promise<void> {
  if (!url || url.trim() === DEFAULT_ENDPOINT) {
    await removeSecure(ENDPOINT_KEY);
  } else {
    if (!/^https?:\/\//.test(url.trim())) {
      throw new Error('Endpoint must start with http:// or https://');
    }
    await setSecure(ENDPOINT_KEY, url.trim());
  }
  cached = null;
}

/** The shared RpcClient for this app session. Resolves the per-install
 *  bearer token on first call (enrolling if necessary) and caches both
 *  the token and the client. Honors a user-set endpoint override. */
export async function getRpc(): Promise<rpc.RpcClient> {
  if (cached) return cached;
  const endpoint = await getEndpoint();
  // Public reads (/balance, /get_utxos, /transaction) need no token, so a
  // /enroll failure must NOT block them. It used to: getInstallToken()
  // threw, fetchBalanceFtc() swallowed it to null, and the UI rendered
  // "—" even though the wallet had real on-chain funds. Enrol best-effort;
  // on failure the client is built read-only and credentialed calls
  // (submit, ISO receive history) degrade until the next launch enrols.
  let apiKey: string | undefined;
  try {
    apiKey = await getInstallToken(endpoint);
  } catch {
    apiKey = undefined;
  }
  const client = new rpc.RpcClient({
    endpoint,
    apiKey,
    // Device-attestation session-token resolver. The provider caches
    // a 24-h Bahnhof session in secure-store, refreshes via Play
    // Integrity (Android) or the dev-mode escape (browser), and
    // attaches `X-Attestation-Token` to every auth-required request.
    // See docs/PAY_DEVICE_ATTESTATION_SPEC.md.
    attestationTokenProvider: makeAttestationTokenProvider(endpoint, apiKey ?? ''),
    // Native HTTP on-device → bypasses the WebView CORS layer that
    // otherwise 403s every hub call from the https://localhost origin.
    // On web this resolves to the platform fetch (unchanged behaviour).
    fetch: httpFetch,
    timeoutMs: 15_000,
  });
  // Only CACHE a fully-credentialed client. If enrolment failed, the
  // client is keyless — fine for public reads (balance/UTXOs), but caching
  // it would strand the submit path keyless (no X-API-Key / attestation →
  // 401) until an app restart. Returning it un-cached lets the NEXT call
  // retry enrolment and cache a credentialed client once the hub is back.
  if (apiKey) cached = client;
  return client;
}

/** Reset the cached client + force re-resolve on next getRpc. Useful
 *  after a wallet reset (token-bound install_id cleared) or a settings
 *  change. */
export function resetRpc(): void {
  cached = null;
}

/** Fetch the wallet's spendable balance in FTC (decimal). Returns null
 *  on any RPC error — UI is expected to show a dash rather than block. */
export async function fetchBalanceFtc(address: string): Promise<{
  ftc: number;
  utxoCount: number;
} | null> {
  try {
    const client = await getRpc();
    const b = await client.getBalance(address);
    return { ftc: b.balance_ftc, utxoCount: b.utxo_count };
  } catch {
    return null;
  }
}
