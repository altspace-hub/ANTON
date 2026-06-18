/**
 * agreement-proposals.ts — in-memory lifecycle store for PENDING human approvals
 * of committing agreement actions, the analogue of Agent Pay's proposals.ts.
 *
 * A committing verb (proposeAgreement / acceptAgreement / counterAgreement)
 * records a pending action here, returns a proposalId immediately, and runs the
 * approval modal fire-and-forget. The agent polls getAgreementProposal for the
 * outcome. On approve the engine action runs and the resulting agreementId +
 * signed payload are stamped onto the record.
 *
 * In-memory by design — these are short-lived approval tickets; a restart that
 * loses a pending ticket is no worse than the agent timing out and re-asking.
 * The SIGNED agreement itself is durable (AgreementStore); only the approval
 * ceremony is ephemeral.
 */
import { randomBytes } from 'node:crypto';
import type { ProposeInput, CounterInput } from './agreement-engine.js';

export const MIN_TTL_MS = 10 * 1000;
export const MAX_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_TTL_MS = 90 * 1000;

export type PendingAction =
  | { kind: 'propose'; input: ProposeInput }
  | { kind: 'accept'; agreementId: string }
  | { kind: 'counter'; agreementId: string; counter: CounterInput };

export type ApprovalState = 'pending' | 'approved' | 'done' | 'rejected' | 'expired' | 'cancelled';

export interface AgreementApproval {
  id: string;
  action: PendingAction;
  agentName: string;
  createdAt: number;
  expiresAt: number;
  state: ApprovalState;
  /** Set once the approved action ran: the resulting agreement id. */
  agreementId?: string;
  /** The signed wire payload to deliver to the counterparty (JSON), set on done. */
  payloadJson?: string;
  rejectReason?: string;
}

export class AgreementProposalStore {
  private byId = new Map<string, AgreementApproval>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private clampTtl(ttlMs?: number): number {
    if (ttlMs == null) return DEFAULT_TTL_MS;
    return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, ttlMs));
  }

  /** Expire a pending record whose deadline has passed (lazy, on access). */
  private touch(a: AgreementApproval): AgreementApproval {
    if (a.state === 'pending' && this.now() >= a.expiresAt) {
      a.state = 'expired';
      a.rejectReason = 'expired';
    }
    return a;
  }

  create(agentName: string, action: PendingAction, ttlMs?: number): AgreementApproval {
    const id = `apr_${randomBytes(12).toString('hex')}`;
    const createdAt = this.now();
    const rec: AgreementApproval = {
      id, action, agentName, createdAt, expiresAt: createdAt + this.clampTtl(ttlMs), state: 'pending',
    };
    this.byId.set(id, rec);
    return rec;
  }

  get(id: string): AgreementApproval | null {
    const a = this.byId.get(id);
    return a ? this.touch(a) : null;
  }

  /** Move pending → approved. Returns the record only if the flip landed (still
   *  pending + not expired/cancelled). The modal flow MUST check this before
   *  running the engine action — a cancel/expire between modal-open and approve
   *  must abort the action. */
  approve(id: string): AgreementApproval | null {
    const a = this.byId.get(id);
    if (!a) return null;
    this.touch(a);
    if (a.state !== 'pending') return null;
    a.state = 'approved';
    return a;
  }

  reject(id: string, reason: string): void {
    const a = this.byId.get(id);
    if (!a) return;
    if (a.state === 'pending' || a.state === 'approved') {
      a.state = 'rejected';
      a.rejectReason = reason;
    }
  }

  /** Stamp the engine result onto an approved record (terminal 'done'). */
  markDone(id: string, agreementId: string, payloadJson: string): void {
    const a = this.byId.get(id);
    if (!a || a.state !== 'approved') return;
    a.state = 'done';
    a.agreementId = agreementId;
    a.payloadJson = payloadJson;
  }

  /** Agent-initiated cancel — only while still pending. */
  cancel(id: string): boolean {
    const a = this.byId.get(id);
    if (!a) return false;
    this.touch(a);
    if (a.state !== 'pending') return false;
    a.state = 'cancelled';
    return true;
  }
}
