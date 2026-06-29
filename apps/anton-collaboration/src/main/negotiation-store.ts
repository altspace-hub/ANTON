/**
 * negotiation-store.ts — in-memory lifecycle store for negotiation JOBS, the
 * analogue of agreement-proposals.ts. A `negotiate` call records a job here,
 * returns a jobId immediately, and the bounded loop runs fire-and-forget; the
 * agent polls getNegotiation for the transcript + terminal outcome.
 *
 * In-memory by design — a negotiation job is a short-lived working ticket. A
 * restart that loses it is no worse than the agent re-asking; any SIGNED
 * agreement that results is durable in the AgreementStore. A long-interval reap()
 * janitor drops old terminal jobs.
 */
import { randomBytes } from 'node:crypto';
import type { NegotiationGoal, NegotiationTurn } from './negotiation-brain.js';

export const MIN_TTL_MS = 10 * 1000;
export const MAX_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_TTL_MS = 90 * 1000;

export type NegotiationState =
  | 'pending' | 'running' | 'done' | 'rejected' | 'expired' | 'cancelled';

const TERMINAL: ReadonlySet<NegotiationState> = new Set(['done', 'rejected', 'expired', 'cancelled']);

/** The exact params proposeAgreement needs — handed to the AGENT, never auto-
 *  executed. Amount is guaranteed ≤ goal.maxAmountMicroFtc by the orchestrator. */
export interface PreparedProposal {
  counterpartyAddress: string;
  counterpartyHash?: string;
  decision: string;
  terms: string;
  amountMicroFtc: string;
  agentNote: string; // carries the negotiation rationale for the human
}

export type NegotiationOutcome =
  | { kind: 'propose_ready'; prepared: PreparedProposal; rationale: string }
  | { kind: 'walked_away'; rationale: string }
  | { kind: 'no_agreement'; reason: string };

export interface NegotiationJob {
  id: string;
  agentName: string;
  goal: NegotiationGoal;
  sellerAddress: string;
  state: NegotiationState;
  createdAt: number;
  expiresAt: number;
  round: number;
  transcript: NegotiationTurn[];
  outcome?: NegotiationOutcome;
  rejectReason?: string;
}

export class NegotiationStore {
  private byId = new Map<string, NegotiationJob>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private clampTtl(ttlMs?: number): number {
    if (ttlMs == null) return DEFAULT_TTL_MS;
    return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, ttlMs));
  }

  /** Lazy expiry on access: a non-terminal job past its deadline flips expired. */
  private touch(j: NegotiationJob): NegotiationJob {
    if (!TERMINAL.has(j.state) && this.now() >= j.expiresAt) {
      j.state = 'expired';
      j.rejectReason = 'expired';
    }
    return j;
  }

  create(agentName: string, goal: NegotiationGoal, sellerAddress: string, ttlMs?: number): NegotiationJob {
    const id = `neg_${randomBytes(12).toString('hex')}`;
    const createdAt = this.now();
    const job: NegotiationJob = {
      id, agentName, goal, sellerAddress, state: 'pending',
      createdAt, expiresAt: createdAt + this.clampTtl(ttlMs), round: 0, transcript: [],
    };
    this.byId.set(id, job);
    return job;
  }

  get(id: string): NegotiationJob | null {
    const j = this.byId.get(id);
    return j ? this.touch(j) : null;
  }

  /** Read-only snapshot of ALL negotiation jobs, lazily expiring any past their
   *  deadline. For the operator dashboard. Newest first. */
  list(): NegotiationJob[] {
    return [...this.byId.values()].map((j) => this.touch(j)).sort((x, y) => y.createdAt - x.createdAt);
  }

  /** pending → running. Returns the job only if the flip landed (still pending,
   *  not cancelled/expired). */
  markRunning(id: string): NegotiationJob | null {
    const j = this.byId.get(id);
    if (!j) return null;
    this.touch(j);
    if (j.state !== 'pending') return null;
    j.state = 'running';
    return j;
  }

  appendTurn(id: string, turn: NegotiationTurn): void {
    const j = this.byId.get(id);
    if (!j) return;
    j.transcript.push(turn);
    j.round = turn.round;
  }

  /** running → done, stamping the terminal outcome. */
  markDone(id: string, outcome: NegotiationOutcome): void {
    const j = this.byId.get(id);
    if (!j || j.state !== 'running') return;
    j.state = 'done';
    j.outcome = outcome;
  }

  reject(id: string, reason: string): void {
    const j = this.byId.get(id);
    if (!j) return;
    if (j.state === 'pending' || j.state === 'running') {
      j.state = 'rejected';
      j.rejectReason = reason;
    }
  }

  /** Agent-initiated cancel — only while still pending or running (the loop
   *  re-reads state each round and stops when it's no longer 'running'). */
  cancel(id: string): boolean {
    const j = this.byId.get(id);
    if (!j) return false;
    this.touch(j);
    if (j.state !== 'pending' && j.state !== 'running') return false;
    j.state = 'cancelled';
    return true;
  }

  /** Drop terminal jobs older than cutoffAgeMs. Returns how many were removed. */
  reap(cutoffAgeMs: number): number {
    const cut = this.now() - cutoffAgeMs;
    let removed = 0;
    for (const [id, j] of this.byId) {
      if (TERMINAL.has(this.touch(j).state) && j.createdAt < cut) {
        this.byId.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
