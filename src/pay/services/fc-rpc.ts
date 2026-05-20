/**
 * fc-rpc.ts — single configured RpcClient for the Pay app, pointed at
 * the public FutureChain light-hub at https://rpc.futurechain.eu.
 *
 * The hub is behind Caddy with a 7-endpoint allowlist; the API key
 * gates `POST /submit_signed_transaction`. Read endpoints (`/balance`,
 * `/get_utxos`, `/transaction`, `/iso_received`, `/info`, `/health`)
 * are unauthenticated — the data is already public on-chain.
 *
 * The default endpoint + key live in the build; a future settings
 * screen will let advanced users point at their own node.
 */
import { rpc } from '@futurechain/sdk';

/** Production light-hub URL (Bahnhof, behind Caddy + LE). */
const DEFAULT_ENDPOINT = 'https://rpc.futurechain.eu';

/** Production API key — matches LIGHT_HUB_API_KEYS on Bahnhof.
 *  TODO(daniel): move to a runtime-fetched / settings-driven value
 *  before public release; embedding in the client is fine for the
 *  closed-test phase.
 *
 *  Rotated 2026-05-20 after a Caddy access-log audit found the prior
 *  token in 184+ log lines. Caddy now redacts X-Api-Key + Authorization
 *  on log write, and the SDK only sends this header on
 *  POST /submit_signed_transaction (see AUTH_REQUIRED_PATHS). */
const DEFAULT_API_KEY =
  '4fc4de103453fa356ead6bdf72f217dcf1720d427de1e4245d5709119433a941';

let cached: rpc.RpcClient | null = null;

/** The shared RpcClient for this app session. Cached after first call. */
export function getRpc(): rpc.RpcClient {
  if (cached) return cached;
  cached = new rpc.RpcClient({
    endpoint: DEFAULT_ENDPOINT,
    apiKey: DEFAULT_API_KEY,
    timeoutMs: 15_000,
  });
  return cached;
}

/** Reset the cached client — useful after a settings change once we
 *  wire a settings screen. Today only the tests need this. */
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
    const b = await getRpc().getBalance(address);
    return { ftc: b.balance_ftc, utxoCount: b.utxo_count };
  } catch {
    return null;
  }
}
