/**
 * server.ts — JSON-RPC 2.0 server over HTTP.
 *
 * Methods (see ANTON_AGENT_PAY_SPEC.md §6.2):
 *   getStatus         — paired/wallet/balance summary
 *   getBalance        — current spendable balance
 *   listTransactions  — recent transactions
 *   proposePayment    — opens the modal; returns proposal_id
 *   getProposal       — polls a proposal's state
 *   cancelProposal    — agent-side cancel while still pending
 *
 * Auth + origin:
 *   - Bound to 127.0.0.1 only (enforced by the caller via host).
 *   - Every request requires Authorization: Bearer <session_token>
 *     resolved through PairingStore.
 *   - Every request requires an Origin header from the allowlist
 *     (DEFAULT_ALLOWED_ORIGINS) unless the bearer's pairing explicitly
 *     opts in to a different origin (future work).
 *
 * Errors per JSON-RPC 2.0 (-32600 invalid request, -32601 method
 * not found, -32602 invalid params, -32603 internal error). Custom
 * codes in the -32000 range for application errors (auth, validation,
 * etc — see ERR_* constants).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ModalDriver } from './modal.js';
import type { PairingStore } from './pairing.js';
import { PairingError } from './pairing.js';
import type { ProposalStore } from './proposals.js';
import { ProposalValidationError } from './proposals.js';
import type { ModalPayload } from '../shared/ipc-types.js';

/** Default origin allowlist — what local development + Claude Desktop
 *  + most MCP-aware tools send. Production builds may tighten this. */
export const DEFAULT_ALLOWED_ORIGINS: ReadonlyArray<string | RegExp> = [
  'null',
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  // Claude Desktop talks over stdio (MCP) not HTTP, so no Origin
  // is sent. We accept the absence of an Origin header explicitly
  // (handled in the request hook, not by listing 'null' here twice).
];

export const ERR_AUTH_MISSING = -32001;
export const ERR_AUTH_INVALID = -32002;
export const ERR_ORIGIN_FORBIDDEN = -32003;
export const ERR_VALIDATION = -32004;
export const ERR_NOT_FOUND = -32005;
export const ERR_WALLET_NOT_READY = -32006;

/** Anything Agent Pay's server layer needs from "the rest of the app"
 *  to answer JSON-RPC calls. Injected so tests can stub the chain
 *  without spinning up the SDK. */
export interface ServerDeps {
  pairings: PairingStore;
  proposals: ProposalStore;
  modal: ModalDriver;
  /** Returns the active wallet's status. Stubbable in tests; real impl
   *  delegates to @futurechain/sdk RpcClient. */
  walletStatus: () => Promise<WalletStatusSnapshot>;
  /** Submits a previously-approved payment to the chain. Returns the
   *  resulting tx_id. Called from the proposePayment handler after the
   *  modal returns Approve. The optional `passphrase` is the one the
   *  user typed in the modal (when the wallet is passphrase-protected);
   *  undefined means "no passphrase set, unlock plain". The implementation
   *  MUST drop the passphrase as soon as the unlock+sign cycle ends. */
  submitPayment: (req: {
    to: string;
    amountFtc: number;
    reference?: string;
    passphrase?: string;
  }) => Promise<{ txId: string; feeFtc: number }>;
  /** Returns recent transactions for the active wallet. */
  recentTransactions: (limit: number) => Promise<TransactionSummary[]>;
  /** Returns a counterparty label + past-interaction count for the
   *  modal's "Acme Corp coffee shop — seen 4×" hint. Null if no
   *  history. */
  counterpartyHint: (address: string) => Promise<CounterpartyHint | null>;
  /** Whether the active wallet has a passphrase set. Drives whether
   *  the modal prompts for it. */
  walletHasPassphrase: () => Promise<boolean>;
  /** Currently-running clock — injectable for deterministic tests. */
  now?: () => number;
}

export interface WalletStatusSnapshot {
  walletAddress: string;
  balanceFtc: number;
  lastSeenBlock: number;
}

export interface TransactionSummary {
  txId: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty: string;
  ts: number;
  confirmed: boolean;
}

export interface CounterpartyHint {
  label?: string;
  seenTimes: number;
}

// ── JSON-RPC param schemas ────────────────────────────────────────

const ProposePaymentParams = z.object({
  to: z.string(),
  amountFtc: z.number().positive(),
  reference: z.string().optional(),
  agentNote: z.string().max(280).optional(),
  ttlMs: z.number().int().positive().optional(),
});
const GetProposalParams = z.object({ proposalId: z.string() });
const CancelProposalParams = z.object({ proposalId: z.string() });
const ListTransactionsParams = z.object({
  limit: z.number().int().positive().max(200).optional(),
}).optional();

// ── Server factory ───────────────────────────────────────────────

export interface BuildServerOptions {
  /** Override origin allowlist (Phase-1 default suffices for MVP). */
  allowedOrigins?: ReadonlyArray<string | RegExp>;
  /** Disable origin check entirely. ONLY for tests. */
  bypassOriginCheck?: boolean;
}

export function buildServer(
  deps: ServerDeps, opts: BuildServerOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: false, disableRequestLogging: true });
  const now = deps.now ?? Date.now;
  const allowedOrigins = opts.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;

  // Single POST endpoint that speaks JSON-RPC.
  app.post('/rpc', async (req, reply) => {
    // ── 1. Origin check ─────────────────────────────────────────
    if (!opts.bypassOriginCheck) {
      const origin = req.headers.origin;
      // MCP stdio clients send no Origin — allow that explicitly.
      if (origin !== undefined) {
        const ok = allowedOrigins.some(rule =>
          typeof rule === 'string' ? rule === origin : rule.test(origin));
        if (!ok) {
          return reply.code(403).send(jsonRpcError(
            ERR_ORIGIN_FORBIDDEN, 'origin not allowed', null,
          ));
        }
      }
    }

    // ── 2. Parse JSON-RPC envelope ──────────────────────────────
    let envelope: unknown;
    try {
      envelope = req.body;
    } catch {
      return reply.code(400).send(jsonRpcError(-32700, 'parse error', null));
    }
    const parsed = JsonRpcRequest.safeParse(envelope);
    if (!parsed.success) {
      return reply.code(400).send(jsonRpcError(
        -32600, 'invalid request', null,
      ));
    }
    const { method, params, id } = parsed.data;

    // ── 3. Auth (every method requires a paired bearer) ─────────
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send(jsonRpcError(
        ERR_AUTH_MISSING, 'Authorization: Bearer required', id,
      ));
    }
    const bearer = auth.slice('Bearer '.length).trim();
    const agent = deps.pairings.resolveBearer(bearer);
    if (!agent) {
      return reply.code(401).send(jsonRpcError(
        ERR_AUTH_INVALID, 'invalid or expired session token', id,
      ));
    }

    // ── 4. Method dispatch ──────────────────────────────────────
    try {
      switch (method) {
        case 'getStatus': {
          const snap = await deps.walletStatus();
          return reply.send(jsonRpcResult(id, {
            paired: true,
            walletAddress: snap.walletAddress,
            balanceFtc: snap.balanceFtc,
            lastSeenBlock: snap.lastSeenBlock,
          }));
        }
        case 'getBalance': {
          const snap = await deps.walletStatus();
          return reply.send(jsonRpcResult(id, {
            balanceFtc: snap.balanceFtc,
          }));
        }
        case 'listTransactions': {
          const p = ListTransactionsParams.safeParse(params);
          if (!p.success) {
            return reply.send(jsonRpcError(
              ERR_VALIDATION, 'invalid params', id,
            ));
          }
          const txs = await deps.recentTransactions(p.data?.limit ?? 25);
          return reply.send(jsonRpcResult(id, txs));
        }
        case 'proposePayment': {
          const p = ProposePaymentParams.safeParse(params);
          if (!p.success) {
            return reply.send(jsonRpcError(
              ERR_VALIDATION, formatZodError(p.error), id,
            ));
          }
          let proposal;
          try {
            proposal = deps.proposals.propose(agent.name, p.data);
          } catch (e) {
            if (e instanceof ProposalValidationError) {
              return reply.send(jsonRpcError(ERR_VALIDATION, e.message, id));
            }
            throw e;
          }

          // Fire-and-forget the modal flow. The agent gets the
          // proposal_id immediately and polls getProposal for the
          // outcome. The modal runs concurrently in the main process.
          void runModalFlow(deps, agent.name, agent.pairedAt, proposal.id, now);

          return reply.send(jsonRpcResult(id, {
            proposalId: proposal.id,
            expiresAt: proposal.expiresAt,
          }));
        }
        case 'getProposal': {
          const p = GetProposalParams.safeParse(params);
          if (!p.success) {
            return reply.send(jsonRpcError(
              ERR_VALIDATION, 'invalid params', id,
            ));
          }
          const proposal = deps.proposals.get(p.data.proposalId);
          if (!proposal) {
            return reply.send(jsonRpcError(
              ERR_NOT_FOUND, 'unknown proposal', id,
            ));
          }
          return reply.send(jsonRpcResult(id, {
            state: proposal.state,
            txId: proposal.txId,
            rejectReason: proposal.rejectReason,
          }));
        }
        case 'cancelProposal': {
          const p = CancelProposalParams.safeParse(params);
          if (!p.success) {
            return reply.send(jsonRpcError(
              ERR_VALIDATION, 'invalid params', id,
            ));
          }
          const cancelled = deps.proposals.cancel(p.data.proposalId);
          if (!cancelled) {
            return reply.send(jsonRpcError(
              ERR_NOT_FOUND, 'proposal not pending or unknown', id,
            ));
          }
          return reply.send(jsonRpcResult(id, { state: 'cancelled' }));
        }
        default:
          return reply.send(jsonRpcError(
            -32601, `method not found: ${method}`, id,
          ));
      }
    } catch (e) {
      if (e instanceof PairingError) {
        return reply.send(jsonRpcError(ERR_AUTH_INVALID, e.message, id));
      }
      const msg = e instanceof Error ? e.message : String(e);
      return reply.send(jsonRpcError(-32603, `internal error: ${msg}`, id));
    }
  });

  // Pairing-code endpoints (NOT JSON-RPC — these are the bootstrap
  // path that issues the bearer used by /rpc).
  app.post('/pair', async (req, reply) => {
    const Body = z.object({
      name: z.string().min(1).max(64),
      code: z.string().length(6).regex(/^\d{6}$/),
      ttlMs: z.number().int().positive().optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: formatZodError(parsed.error) });
    }
    try {
      const args: { name: string; code: string; ttlMs?: number } = {
        name: parsed.data.name,
        code: parsed.data.code,
      };
      if (parsed.data.ttlMs !== undefined) args.ttlMs = parsed.data.ttlMs;
      const issued = deps.pairings.redeemCode(args);
      return reply.send({
        agentId: issued.agent.id,
        sessionToken: issued.sessionToken,
        expiresAt: issued.agent.expiresAt,
      });
    } catch (e) {
      if (e instanceof PairingError) {
        return reply.code(401).send({ error: e.message });
      }
      throw e;
    }
  });

  return app;
}

/** Run the modal + submit-on-approve flow for a freshly-proposed
 *  payment. Caller does NOT await this. Exported so the MCP transport
 *  (mcp.ts) reuses the EXACT same approve→submit→markSent path — the two
 *  transports must never diverge (a past divergence dropped the passphrase
 *  and the approve-race guard on the MCP side). MCP passes its own
 *  agentName + now() as agentPairedAt (→ "just now"). */
export async function runModalFlow(
  deps: ServerDeps, agentName: string, agentPairedAt: number,
  proposalId: string, now: () => number,
): Promise<void> {
  const proposal = deps.proposals.get(proposalId);
  if (!proposal || proposal.state !== 'pending') return;

  const snap = await deps.walletStatus();
  const hint = await deps.counterpartyHint(proposal.to);
  const hasPass = await deps.walletHasPassphrase();
  // Fee estimation is best-effort here — production impl can call
  // SDK's fee oracle if it has one; for MVP we surface a token "0.001"
  // and the actual fee comes from submitPayment.
  const estimatedFeeFtc = 0.001;

  const payload: ModalPayload = {
    proposalId,
    agentName,
    agentPairedAgo: humanAgo(now() - agentPairedAt),
    to: proposal.to,
    ...(hint?.label ? { toLabel: hint.label } : {}),
    ...(hint?.seenTimes !== undefined ? { toSeenTimes: hint.seenTimes } : {}),
    amountFtc: proposal.amountFtc,
    feeFtc: estimatedFeeFtc,
    ...(proposal.agentNote ? { agentNote: proposal.agentNote } : {}),
    balanceAfterFtc: snap.balanceFtc - proposal.amountFtc - estimatedFeeFtc,
    walletHasPassphrase: hasPass,
    expiresAtMs: proposal.expiresAt,
  };

  let decision;
  try {
    decision = await deps.modal.promptForDecision(payload);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    deps.proposals.reject(proposalId, `modal error: ${reason}`);
    return;
  }

  if (decision.kind === 'reject') {
    deps.proposals.reject(proposalId, decision.reason);
    return;
  }

  // Approved — flip state, but ONLY submit if the flip actually landed on
  // 'approved'. If the proposal was cancelled (agent cancelProposal) or expired
  // between the modal opening and the operator's approve, approve() returns
  // undefined / an 'expired' proposal — we MUST NOT broadcast a payment for it
  // (that would send real FTC while the record says cancelled/expired, and the
  // spend would be invisible to the 24h cap).
  const approved = deps.proposals.approve(proposalId);
  if (!approved || approved.state !== 'approved') return;
  try {
    const { txId } = await deps.submitPayment({
      to: proposal.to,
      amountFtc: proposal.amountFtc,
      ...(proposal.reference !== undefined
          ? { reference: proposal.reference }
          : {}),
      ...(decision.passphrase !== undefined
          ? { passphrase: decision.passphrase }
          : {}),
    });
    deps.proposals.markSent(proposalId, txId);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    // Submission failed AFTER user approval — rare but the agent
    // needs to know. Flip back to rejected with a clear reason.
    deps.proposals.reject(proposalId, `submit failed: ${reason}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

const JsonRpcRequest = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

function jsonRpcResult(id: string | number | null, result: unknown): object {
  return { jsonrpc: '2.0', id, result };
}
function jsonRpcError(
  code: number, message: string, id: string | number | null,
): object {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function formatZodError(e: z.ZodError): string {
  return e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
}

/** "14h ago", "3d ago", "just now" — kept simple, fits the modal. */
function humanAgo(ms: number): string {
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
