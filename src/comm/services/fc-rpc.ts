/**
 * fc-rpc.ts — Comm App: cached RpcClient for Bahnhof.
 *
 * Mirrors `src/pay/services/fc-rpc.ts`. Same endpoint, same enrollment-
 * issued bearer model (Phase F1+F2, May 20 2026). Comm's RPC needs:
 *
 *   - submitSignedTransaction (send flow)
 *   - getUtxos                (send flow)
 *   - getBalance              (active-wallet balance display)
 *   - getIsoReceived          (inbound poller)
 *
 * Endpoint override (2026-05-21): users can point Comm at a custom
 * hub (local FutureChain via adb reverse, a private deployment, etc.)
 * via Settings → RPC endpoint. The override lives in secure-store so
 * it survives an app cache wipe in lock-step with the wallet.
 */
import { rpc } from '@futurechain/sdk';
import { getInstallToken } from './enrollment';
import { getSecure, setSecure, removeSecure } from './secure-store';
import { httpFetch } from './native-http';

export const DEFAULT_ENDPOINT = 'https://rpc.futurechain.eu';
const ENDPOINT_KEY = 'fc.rpc.endpoint';

let cached: rpc.RpcClient | null = null;

export async function getEndpoint(): Promise<string> {
  const override = (await getSecure(ENDPOINT_KEY))?.trim();
  return override && /^https?:\/\//.test(override) ? override : DEFAULT_ENDPOINT;
}

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

export async function getRpc(): Promise<rpc.RpcClient> {
  if (cached) return cached;
  const endpoint = await getEndpoint();
  // Public reads (/balance, /get_utxos, /transaction) need no token, so a
  // /enroll failure must NOT block them. Enrol best-effort; on failure the
  // client is read-only and is NOT cached, so the next call retries
  // enrolment rather than being stranded keyless on the submit path.
  let apiKey: string | undefined;
  try {
    apiKey = await getInstallToken(endpoint);
  } catch {
    apiKey = undefined;
  }
  const client = new rpc.RpcClient({
    endpoint,
    apiKey,
    // Native HTTP on-device → bypasses the WebView CORS layer that
    // otherwise 403s every hub call from the https://localhost origin.
    // On web this resolves to the platform fetch (unchanged behaviour).
    fetch: httpFetch,
    timeoutMs: 15_000,
  });
  if (apiKey) cached = client;
  return client;
}

export function resetRpc(): void {
  cached = null;
}

/** Best-effort balance for the wallet management screen. Returns null
 *  on any RPC error so the UI shows a dash rather than blocking. */
export async function fetchBalanceFtc(address: string): Promise<{
  ftc: number; utxoCount: number;
} | null> {
  try {
    const client = await getRpc();
    const b = await client.getBalance(address);
    return { ftc: b.balance_ftc, utxoCount: b.utxo_count };
  } catch {
    return null;
  }
}
