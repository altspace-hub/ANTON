/**
 * rpc/ — FutureChain RPC HTTP client.
 *
 * Status: IMPLEMENTED (Phase 1 — May 20 2026). Real HTTP client against
 * the actual endpoints exposed by `futurechain/src/rpc/mod.rs`:
 *   • POST `/submit_signed_transaction` — submit a client-signed tx
 *   • GET  `/balance/{address}` — wallet balance (satoshi + FTC)
 *   • GET  `/get_utxos/{address}` — unspent outputs (for tx builder)
 *   • GET  `/transaction/{txid_or_uetr}` — fetch a specific tx
 *   • GET  `/info` — chain height, latest hash, treasury, storage
 *   • GET  `/iso_received/{address}` — ISO 20022 receive history
 *   • GET  `/health` — liveness probe
 *
 * Notes for Phase 0.5+ (May 2026):
 *   • `/submit_pacs008_batch` is REJECTED on non-Full/Archive nodes (light
 *     hubs refuse to gossip wallet passwords). The TS RpcClient targets
 *     `/submit_signed_transaction` only — clients sign locally with
 *     `@futurechain/sdk/wallet` + `@futurechain/sdk/pacs008.signTransaction`
 *     and POST the signed Transaction. On a light hub the server returns
 *     `{status: "queued", request_id, tx_id, originator_address}` (the
 *     P2P-forward "I accepted it, will broadcast" envelope); on a node
 *     with a local compliance gateway it returns
 *     `{status: "accepted"|"rejected", ...}` after Heimdall screening.
 */
import type { Transaction } from '../pacs008/index.js';

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface RpcConfig {
  /** Base URL of a FutureChain node, e.g. `http://127.0.0.1:8545` or
   *  `https://bahnhof.futurechain.eu`. Trailing slash optional. */
  endpoint: string;
  /** Optional API key — set as `X-API-Key` header on **auth-required**
   *  requests only (today: `POST /submit_signed_transaction`). Read
   *  endpoints are public and never carry the key, so it can't leak
   *  into a reverse-proxy access log on every `getBalance` /
   *  `getHealth` poll. See {@link AUTH_REQUIRED_PATHS}. */
  apiKey?: string;
  /** Optional device-attestation session-token provider — called
   *  before every auth-required request and the returned value (if
   *  any) is set as the `X-Attestation-Token` header. See
   *  PAY_DEVICE_ATTESTATION_SPEC.md.
   *
   *  Provider model rather than a static field so the client doesn't
   *  need to be recreated when the underlying 24-h session token
   *  rotates. Returning `null` from the provider sends no header (the
   *  request still goes; the gate then rejects with 401 +
   *  `WWW-Authenticate: attestation-required`, which the caller can
   *  use as a refresh signal). */
  attestationTokenProvider?: () => Promise<string | null>;
  /** Request timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Optional `fetch` override — useful for tests / non-browser
   *  environments without a global fetch. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export type TxStatus =
  | 'queued'      // P2P forward path (Phase 0.5 light hub)
  | 'accepted'    // local gateway processed + admitted to mempool
  | 'rejected'    // refused — see `reason`
  | 'pending';    // in mempool, not yet mined

export interface SubmitResult {
  status: TxStatus | string;
  /** Set on Phase 0.5 P2P forward — the request_id assigned for tracing. */
  request_id?: string;
  /** Echo of the tx id (UETR for PACS.008). */
  tx_id?: string;
  /** Originator wallet address extracted from the tx. */
  originator_address?: string;
  /** On rejection, a human-readable reason. */
  reason?: string;
  error?: string;
  hint?: string;
  /** On a server with a local gateway, the queued/screened tx envelope
   *  may carry additional fields (compliance_*). Surface them as `extra`. */
  [extra: string]: unknown;
}

export interface Utxo {
  tx_id: string;
  output_index: number;
  address: string;
  /** Amount in satoshi (1 FTC = 100_000_000 satoshi). */
  amount: number;
  block_height: number;
}

export interface BalanceResponse {
  address: string;
  /** Total spendable balance in satoshi (sum of UTXO amounts). */
  balance: number;
  /** Same value expressed in FTC (decimal). Server-provided convenience. */
  balance_ftc: number;
  utxo_count: number;
}

export interface InfoResponse {
  chain_height: number;
  latest_block_height: number;
  latest_block_hash: string;
  pending_transactions: number;
  storage_info: {
    node_type: string;
    iso_storage_enabled: boolean;
    iso_data_size_mb: number;
  };
  treasury: {
    mining_balance: number;
    fee_balance: number;
  };
  two_tier_storage: boolean;
  iso20022_support: string;
}

export interface HealthResponse {
  status: 'healthy' | string;
  compliance_gateway?: boolean;
  cors?: string;
  signing?: string;
  test_mode?: boolean;
  two_tier_storage?: boolean;
  version?: string;
}

/** A live network/server error wrapped with the request that caused it
 *  (URL + status). The RpcClient throws this for non-2xx HTTP responses;
 *  application-level errors (e.g. `{status: "rejected", error: "..."}`
 *  with a 200 OK) are returned as-is in the body — see `SubmitResult`. */
export class RpcError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly httpStatus: number,
    public readonly bodySnippet?: string,
  ) {
    super(`${message} (${url}, HTTP ${httpStatus})`);
    this.name = 'RpcError';
  }
}

// ───────────────────────────────────────────────────────────────────────
// Auth-required endpoint set
// ───────────────────────────────────────────────────────────────────────

/** The only endpoints on a Bahnhof-style public light hub that take
 *  `X-API-Key`. Every other path is public chain data; sending the key
 *  on those would leak it into the hub's reverse-proxy access log on
 *  every poll. Kept as an exported `Set` so future auth-required RPCs
 *  can opt in here in one place. */
export const AUTH_REQUIRED_PATHS: ReadonlySet<string> = new Set([
  '/submit_signed_transaction',
]);

/** `true` iff a request to (method, path) should carry `X-API-Key`. */
export function isAuthRequired(method: string, path: string): boolean {
  return method === 'POST' && AUTH_REQUIRED_PATHS.has(path);
}

// ───────────────────────────────────────────────────────────────────────
// Client
// ───────────────────────────────────────────────────────────────────────

export class RpcClient {
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: RpcConfig) {
    if (!config.endpoint) {
      throw new Error('RpcClient: config.endpoint is required');
    }
    this.base = config.endpoint.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 10_000;
    const f = config.fetch ?? (globalThis.fetch?.bind(globalThis) as typeof fetch | undefined);
    if (!f) {
      throw new Error(
        'RpcClient: no fetch available — pass `config.fetch` (Node <18 or restricted env)',
      );
    }
    this.fetchImpl = f;
  }

  /** POST a client-signed Transaction to `/submit_signed_transaction`. */
  async submitSignedTransaction(tx: Transaction): Promise<SubmitResult> {
    return this.post<SubmitResult>('/submit_signed_transaction', tx);
  }

  async getBalance(address: string): Promise<BalanceResponse> {
    return this.get<BalanceResponse>(`/balance/${encodeURIComponent(address)}`);
  }

  async getUtxos(address: string): Promise<Utxo[]> {
    return this.get<Utxo[]>(`/get_utxos/${encodeURIComponent(address)}`);
  }

  async getTransaction(idOrUetr: string): Promise<unknown> {
    return this.get<unknown>(`/transaction/${encodeURIComponent(idOrUetr)}`);
  }

  async getInfo(): Promise<InfoResponse> {
    return this.get<InfoResponse>('/info');
  }

  async getIsoReceived(address: string): Promise<unknown> {
    return this.get<unknown>(`/iso_received/${encodeURIComponent(address)}`);
  }

  async getHealth(): Promise<HealthResponse> {
    return this.get<HealthResponse>('/health');
  }

  // ───────────────────────────────────────────────────────────────────
  // Low-level
  // ───────────────────────────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.base + path;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.config.apiKey && isAuthRequired(method, path)) {
      headers['X-API-Key'] = this.config.apiKey;
    }
    if (this.config.attestationTokenProvider && isAuthRequired(method, path)) {
      const tok = await this.config.attestationTokenProvider();
      if (tok) headers['X-Attestation-Token'] = tok;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new RpcError(`fetch failed: ${msg}`, url, 0);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    if (!res.ok) {
      throw new RpcError(`HTTP ${res.status}`, url, res.status, text.slice(0, 500));
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new RpcError('response was not JSON', url, res.status, text.slice(0, 500));
    }
  }
}
