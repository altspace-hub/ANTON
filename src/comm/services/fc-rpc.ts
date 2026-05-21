/**
 * fc-rpc.ts — Comm App: cached RpcClient for Bahnhof.
 *
 * Mirrors `src/pay/services/fc-rpc.ts`. Same endpoint, same enrollment-
 * issued bearer model (Phase F1+F2, May 20 2026). Comm's RPC needs are
 * narrower than pay's — today only `submitSignedTransaction` and
 * `getUtxos` are used by the send flow.
 */
import { rpc } from '@futurechain/sdk';
import { getInstallToken } from './enrollment';

const DEFAULT_ENDPOINT = 'https://rpc.futurechain.eu';

let cached: rpc.RpcClient | null = null;

export async function getRpc(): Promise<rpc.RpcClient> {
  if (cached) return cached;
  const apiKey = await getInstallToken(DEFAULT_ENDPOINT);
  cached = new rpc.RpcClient({
    endpoint: DEFAULT_ENDPOINT,
    apiKey,
    timeoutMs: 15_000,
  });
  return cached;
}

export function resetRpc(): void {
  cached = null;
}
