/**
 * proposals.ts — in-memory proposal store with TTLs.
 *
 * The agent calls `proposePayment` and gets back a proposal_id. The
 * proposal sits in this store in state `pending` until the modal
 * returns Approve / Reject, OR the TTL expires. The agent polls
 * `getProposal` to discover the outcome.
 *
 * In-memory by design — proposals are session-scoped and short-lived;
 * a crash/restart that loses them is no worse than the agent timing
 * out and re-proposing. Audit-log writes are a separate concern
 * (handled in main.ts when a proposal transitions to a terminal state).
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §6.2, §7
 */
import { randomBytes } from 'node:crypto';
import type { PaymentProposal, ProposalState } from '../shared/ipc-types.js';

/** Min modal lifetime — the user gets at least this much time to react. */
export const MIN_PROPOSAL_TTL_MS = 10 * 1000;
/** Max modal lifetime — agent cannot ask for arbitrarily-long pre-approval. */
export const MAX_PROPOSAL_TTL_MS = 5 * 60 * 1000;
/** Default modal lifetime if the agent doesn't specify. */
export const DEFAULT_PROPOSAL_TTL_MS = 60 * 1000;

/** Inputs from the agent when proposing a payment. */
export interface ProposeArgs {
  to: string;
  amountFtc: number;
  reference?: string;
  agentNote?: string;
  /** Agent-requested modal lifetime in ms — clamped to
   *  [MIN_PROPOSAL_TTL_MS, MAX_PROPOSAL_TTL_MS]. */
  ttlMs?: number;
}

/** Optional hard spend limits. Enforced at propose() time, in CODE — the agent
 *  cannot exceed them and the human modal never even opens for an over-cap ask.
 *  Both default to undefined (no cap) so existing callers are unaffected. */
export interface SpendLimits {
  /** Reject any single proposal whose amount exceeds this many FTC. */
  maxPerPaymentFtc?: number;
  /** Reject a proposal when (FTC sent-or-in-flight in the trailing 24h + this
   *  amount) would exceed this many FTC. A rolling daily ceiling that counts
   *  in-flight (pending/approved) value too, so a burst of concurrent proposals
   *  can't be approved past the ceiling. */
  maxDailyFtc?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class ProposalStore {
  private byId = new Map<string, PaymentProposal>();

  /** `nowFn` is injectable so tests can advance virtual time without
   *  Date.now monkeypatching. `limits` are optional hard spend caps. */
  constructor(
    private readonly nowFn: () => number = Date.now,
    private readonly limits: SpendLimits = {},
  ) {}

  /** FTC sent OR in-flight (pending/approved) in the trailing 24h — the basis
   *  for the daily cap. Counting in-flight value (not just `sent`) is what makes
   *  the ceiling hold under concurrency: N proposals each individually under the
   *  cap can't be approved past it, because each later propose() already sees the
   *  earlier ones' value reserved. Value is released automatically when a
   *  proposal reaches a terminal non-sent state (rejected/expired/cancelled). */
  private committedLast24h(): number {
    const since = this.nowFn() - DAY_MS;
    let spent = 0;
    for (const p of this.byId.values()) {
      const counts = p.state === 'sent' || p.state === 'pending' || p.state === 'approved';
      if (counts && p.createdAt >= since) spent += p.amountFtc;
    }
    return spent;
  }

  /** Create a new pending proposal. Throws on validation errors —
   *  the server layer translates to JSON-RPC error codes. */
  propose(agentName: string, args: ProposeArgs): PaymentProposal {
    if (!args.to || typeof args.to !== 'string' || !args.to.startsWith('fc_')) {
      throw new ProposalValidationError('to must be an fc_ address');
    }
    if (typeof args.amountFtc !== 'number' || !Number.isFinite(args.amountFtc)
        || args.amountFtc <= 0) {
      throw new ProposalValidationError('amountFtc must be a positive number');
    }
    if (args.reference !== undefined && typeof args.reference !== 'string') {
      throw new ProposalValidationError('reference must be a string if provided');
    }
    if (args.agentNote !== undefined && typeof args.agentNote !== 'string') {
      throw new ProposalValidationError('agentNote must be a string if provided');
    }
    if (args.agentNote && args.agentNote.length > 280) {
      throw new ProposalValidationError(
        'agentNote must be <= 280 chars (would not fit the modal cleanly)',
      );
    }

    // Hard spend caps — enforced BEFORE the proposal is created, so an over-cap
    // ask never reaches the human modal. Code-computed; the agent cannot bypass.
    if (this.limits.maxPerPaymentFtc !== undefined && args.amountFtc > this.limits.maxPerPaymentFtc) {
      throw new ProposalValidationError(
        `amount ${args.amountFtc} FTC exceeds the per-payment cap of ${this.limits.maxPerPaymentFtc} FTC`,
      );
    }
    if (this.limits.maxDailyFtc !== undefined) {
      const spent = this.committedLast24h();
      if (spent + args.amountFtc > this.limits.maxDailyFtc) {
        throw new ProposalValidationError(
          `this payment (${args.amountFtc} FTC) would exceed the 24h cap of ${this.limits.maxDailyFtc} FTC `
          + `(${spent.toFixed(4)} FTC already sent or in-flight in the last 24h)`,
        );
      }
    }

    const ttl = clampTtl(args.ttlMs);
    const now = this.nowFn();
    const id = newProposalId();
    const proposal: PaymentProposal = {
      id,
      to: args.to,
      amountFtc: args.amountFtc,
      ...(args.reference !== undefined ? { reference: args.reference } : {}),
      ...(args.agentNote !== undefined ? { agentNote: args.agentNote } : {}),
      agentName,
      createdAt: now,
      expiresAt: now + ttl,
      state: 'pending',
    };
    this.byId.set(id, proposal);
    return proposal;
  }

  /** Get a proposal, applying lazy expiry — if `pending` past its
   *  `expiresAt`, transition it to `expired` first. */
  get(id: string): PaymentProposal | undefined {
    const p = this.byId.get(id);
    if (!p) return undefined;
    if (p.state === 'pending' && this.nowFn() >= p.expiresAt) {
      p.state = 'expired';
      p.rejectReason = 'expired';
    }
    return p;
  }

  /** Transition a proposal to `approved`. Returns the updated proposal
   *  or `undefined` if not found / not in `pending`. Callers (server)
   *  should then submit the tx and `markSent`. */
  approve(id: string): PaymentProposal | undefined {
    const p = this.byId.get(id);
    if (!p || p.state !== 'pending') return undefined;
    if (this.nowFn() >= p.expiresAt) {
      p.state = 'expired';
      p.rejectReason = 'expired';
      return p;
    }
    p.state = 'approved';
    return p;
  }

  /** Transition to `rejected`. Idempotent — re-rejecting a rejected
   *  proposal is a no-op. */
  reject(id: string, reason: string): PaymentProposal | undefined {
    const p = this.byId.get(id);
    if (!p) return undefined;
    if (p.state === 'pending' || p.state === 'approved') {
      p.state = 'rejected';
      p.rejectReason = reason;
    }
    return p;
  }

  /** Transition to `cancelled` — called by the agent via cancelProposal.
   *  Only valid while pending. */
  cancel(id: string): PaymentProposal | undefined {
    const p = this.byId.get(id);
    if (!p || p.state !== 'pending') return undefined;
    p.state = 'cancelled';
    return p;
  }

  /** After a successful chain submission, attach the txId and flip
   *  to `sent`. No-op if the proposal isn't currently `approved`
   *  (returns the unchanged proposal so callers can distinguish
   *  "not found" — undefined — from "state mismatch" — proposal but
   *  unchanged). */
  markSent(id: string, txId: string): PaymentProposal | undefined {
    const p = this.byId.get(id);
    if (!p) return undefined;
    if (p.state !== 'approved') return p; // no-op, return unchanged
    p.state = 'sent';
    p.txId = txId;
    return p;
  }

  /** Remove finalised proposals older than `cutoffAgeMs`. Called by
   *  a janitor in main.ts on a long interval. Keeps the map small. */
  reap(cutoffAgeMs: number): number {
    const now = this.nowFn();
    let n = 0;
    for (const [id, p] of this.byId.entries()) {
      const terminal: ProposalState[] = ['sent', 'rejected', 'expired', 'cancelled'];
      if (terminal.includes(p.state) && now - p.createdAt > cutoffAgeMs) {
        this.byId.delete(id);
        n += 1;
      }
    }
    return n;
  }

  /** Test helper — get the raw count of proposals in the store. */
  size(): number {
    return this.byId.size;
  }
}

export class ProposalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalValidationError';
  }
}

function clampTtl(req: number | undefined): number {
  if (req === undefined || !Number.isFinite(req)) return DEFAULT_PROPOSAL_TTL_MS;
  if (req < MIN_PROPOSAL_TTL_MS) return MIN_PROPOSAL_TTL_MS;
  if (req > MAX_PROPOSAL_TTL_MS) return MAX_PROPOSAL_TTL_MS;
  return req;
}

function newProposalId(): string {
  // 16 random bytes → 22-char base64url, prefixed for human-readability
  // when an agent logs it.
  return 'p_' + randomBytes(16).toString('base64url');
}
