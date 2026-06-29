/**
 * relay/agent-pay-client.ts — a thin, READ-ONLY loopback JSON-RPC client for the
 * separate ANTON-FutureChain Agent Pay gateway (127.0.0.1:49250). The collab
 * standalone uses it to proxy the agent's wallet *status* + *transactions* to the
 * paired phone over the relay (see wallet-router.ts).
 *
 * It calls ONLY the two read methods — getStatus / listTransactions. It NEVER
 * calls proposePayment: real FTC spends stay gated inside Agent Pay's own
 * non-bypassable human-approval flow. This client cannot move money.
 */
export interface AgentPayWalletStatus {
  walletAddress: string;
  balanceFtc: number;
  lastSeenBlock: number;
}

export interface AgentPayTx {
  txId: string;
  amount: number; // FTC (decimal)
  direction: 'in' | 'out';
  counterparty: string;
  ts: number;
  confirmed: boolean;
}

export interface AgentPayClientConfig {
  url: string; // e.g. http://127.0.0.1:49250/rpc
  bearer: string; // sk_… from agent-pay's /pair
  timeoutMs?: number;
}

/** The agent-pay process is down / unreachable (network error, timeout, non-2xx). */
export class AgentPayUnreachableError extends Error {
  constructor(message: string) { super(message); this.name = 'AgentPayUnreachableError'; }
}

/** Agent-pay returned a JSON-RPC error (e.g. -32002 bearer expired/invalid). */
export class AgentPayRpcError extends Error {
  constructor(message: string, readonly code: number) { super(message); this.name = 'AgentPayRpcError'; }
}

/** The read surface the wallet-router depends on — lets tests inject a fake. */
export interface AgentPayReader {
  getStatus(): Promise<AgentPayWalletStatus>;
  listTransactions(limit?: number): Promise<AgentPayTx[]>;
}

export class AgentPayClient implements AgentPayReader {
  private seq = 0;
  constructor(private readonly cfg: AgentPayClientConfig) {}

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.cfg.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.cfg.bearer}`,
          // agent-pay's origin allowlist accepts loopback; a local program sends one.
          origin: 'http://127.0.0.1',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++this.seq, method, params }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 8000),
      });
    } catch (e) {
      throw new AgentPayUnreachableError(`agent-pay unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) throw new AgentPayUnreachableError(`agent-pay HTTP ${res.status}`);
    let body: { result?: unknown; error?: { code?: number; message?: string } };
    try { body = (await res.json()) as typeof body; }
    catch { throw new AgentPayUnreachableError('agent-pay returned a non-JSON body'); }
    if (body.error) throw new AgentPayRpcError(body.error.message ?? 'agent-pay rpc error', body.error.code ?? -32603);
    return body.result as T;
  }

  async getStatus(): Promise<AgentPayWalletStatus> {
    const r = await this.call<{ walletAddress: string; balanceFtc: number; lastSeenBlock: number }>('getStatus', {});
    return { walletAddress: r.walletAddress, balanceFtc: r.balanceFtc, lastSeenBlock: r.lastSeenBlock };
  }

  async listTransactions(limit = 25): Promise<AgentPayTx[]> {
    const r = await this.call<AgentPayTx[]>('listTransactions', { limit });
    return Array.isArray(r) ? r : [];
  }
}
