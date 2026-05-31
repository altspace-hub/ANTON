/**
 * fc-rpc.ts — Business App: read-side RpcClient for Bahnhof.
 *
 * The merchant doesn't sign transactions today — its only RPC need
 * is polling `/iso_received/<addr>` to confirm inbound payments. The
 * SDK's RpcClient handles that without a bearer token (read paths
 * are public), so we skip the enrollment dance that the Pay + Comm
 * apps need.
 *
 * Endpoint override (2026-05-21): users can point Business at a
 * custom hub (local FutureChain via adb reverse, a private deployment,
 * etc.) via Settings → RPC endpoint. Stored in secure-store so a
 * config change survives an app cache wipe in lock-step with the wallet.
 */
import { rpc } from '@futurechain/sdk';
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
  cached = new rpc.RpcClient({
    endpoint,
    // Native HTTP on-device → bypasses the WebView CORS 403 from the
    // https://localhost origin so balance reads + the /iso_received poll
    // work on a phone. On web this resolves to the platform fetch.
    fetch: httpFetch,
    timeoutMs: 15_000,
  });
  return cached;
}

export function resetRpc(): void {
  cached = null;
}

/** Best-effort balance for the wallet management screen. */
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
