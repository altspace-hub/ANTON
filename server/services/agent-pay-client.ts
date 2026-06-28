/**
 * agent-pay-client.ts — instance-side JSON-RPC client for the owner's
 * Agent-Pay standalone (apps/anton-agent-pay).
 *
 * The standalone is a loopback Fastify JSON-RPC server (POST /pair → bearer,
 * POST /rpc → getStatus / getBalance / listTransactions / proposePayment …).
 * This client is what the app-gateway uses to read the agent's wallet on the
 * phone's behalf.
 *
 * NOTE: deliberately a plain `fetch` — NOT server/services/url-fetcher.ts —
 * because url-fetcher blocks loopback/private IPs (SSRF guard), and agent-pay
 * runs on 127.0.0.1. The URL here is admin-configured (not user-supplied), so
 * there is no SSRF surface. Server-to-server requests send no Origin header,
 * which the standalone's origin allowlist explicitly permits.
 */

export interface AgentPayWalletStatus {
  paired: boolean;
  walletAddress: string;
  balanceFtc: number;
  lastSeenBlock: number | null;
}

export interface AgentPayTransaction {
  txId: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty: string;
  ts: number;
  confirmed: boolean;
  reference?: string;
  feeFtc?: number;
}

export class AgentPayError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'AgentPayError';
    this.code = code;
  }
}

const RPC_TIMEOUT_MS = 15_000;

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

async function rpc<T>(url: string, bearer: string, method: string, params: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base(url)}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? {} }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new AgentPayError(
      err instanceof Error && err.name === 'AbortError' ? 'agent-pay timed out' : 'agent-pay unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
  let body: { result?: T; error?: { code?: number; message?: string } };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new AgentPayError('agent-pay returned invalid JSON');
  }
  if (body.error) {
    throw new AgentPayError(body.error.message ?? 'agent-pay error', body.error.code);
  }
  return body.result as T;
}

/** getStatus → wallet address + balance + chain tip in one call. */
export async function getWalletStatus(cfg: { url: string; bearer: string }): Promise<AgentPayWalletStatus> {
  return rpc<AgentPayWalletStatus>(cfg.url, cfg.bearer, 'getStatus', {});
}

/** listTransactions → newest-first ledger (sent + best-effort received). */
export async function listTransactions(
  cfg: { url: string; bearer: string },
  limit = 25,
): Promise<AgentPayTransaction[]> {
  const n = Math.min(200, Math.max(1, Math.floor(limit) || 25));
  const txs = await rpc<AgentPayTransaction[]>(cfg.url, cfg.bearer, 'listTransactions', { limit: n });
  return Array.isArray(txs) ? txs : [];
}

/**
 * Headless pairing — exchange the 6-digit code the standalone prints on boot
 * (valid 60s) for a bearer. POST /pair is a plain REST endpoint (not JSON-RPC).
 * We request a long TTL so the bridge survives without re-pairing.
 */
export async function pairWithCode(
  url: string,
  name: string,
  code: string,
  ttlMs?: number,
): Promise<{ agentId: string; sessionToken: string; expiresAt: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base(url)}/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, ...(ttlMs ? { ttlMs } : {}) }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new AgentPayError(
      err instanceof Error && err.name === 'AbortError' ? 'agent-pay timed out' : 'agent-pay unreachable',
    );
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as
    | { agentId?: string; sessionToken?: string; expiresAt?: number; error?: { message?: string } | string }
    | null;
  if (!res.ok || !body || !body.sessionToken) {
    const msg =
      (body && typeof body.error === 'object' && body.error?.message) ||
      (body && typeof body.error === 'string' && body.error) ||
      `pairing failed (HTTP ${res.status})`;
    throw new AgentPayError(String(msg));
  }
  return { agentId: body.agentId ?? '', sessionToken: body.sessionToken, expiresAt: body.expiresAt ?? 0 };
}
