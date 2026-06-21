/**
 * escrow-engine.ts — the P8 escrow state machine (custodial "notary" model).
 * Mirrors settlement.ts + fulfilment-engine.ts: build the leg instruction on one
 * side, record the broadcast tx, drive the off-chain state. It moves NO money —
 * each leg is a real human-gated Agent Pay payment; this just decides whether a
 * leg is allowed (deterministic policy) and records the result.
 *
 * Roles (enforced here): the BUYER opens + funds + may dispute; the ARBITER (the
 * E keyholder) builds release/refund. Recipients are immutable from open time, so
 * the worst a hostile arbiter can do is decide a dispute wrongly — never misdirect
 * funds. Default-to-buyer on ambiguity. One-shot lock: a record reaches at most
 * one of released / refunded (the double-spend guard) via status-gated transitions.
 */
import {
  buildFundInstruction, buildReleaseInstruction, buildRefundInstruction,
  releaseAllowed, refundAllowed,
  computeDisputeDigest, disputeSigningString, isEscrowTerminal,
  type EscrowRecord, type EscrowOpenInput, type EscrowInstruction, type DisputePayload, type EscrowStatus,
} from './escrow-core.js';
import { verifyMessage } from './agreement-crypto.js';
import { buyerPubkeyOf, sellerPubkeyOf } from './agreement-core.js';
import type { AgreementStore } from './agreement-store.js';
import type { AgreementIdentity } from './agreement-identity.js';
import type { EscrowStore } from './escrow-store.js';
import type { FulfilmentStore } from './fulfilment-store.js';
import type { Agreement } from './agreement-core.js';

export const DEFAULT_FUND_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days to fund
export const DEFAULT_AUTO_RELEASE_MS = 14 * 24 * 60 * 60 * 1000;  // 14 days after fund
export const DEFAULT_DISPUTE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days to resolve

const FULFILLABLE = new Set<string>(['agreed', 'settled']);

export interface EscrowEngineOpts { now?: () => number }

export class EscrowEngine {
  private readonly now: () => number;

  constructor(
    private readonly agreements: AgreementStore,
    private readonly identity: AgreementIdentity,
    private readonly store: EscrowStore,
    private readonly fulfilment: FulfilmentStore,
    opts: EscrowEngineOpts = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
  }

  /** Read with lazy expiry: an unfunded record past its funding deadline → expired. */
  async get(agreementId: string): Promise<EscrowRecord | null> {
    const r = await this.store.get(agreementId);
    if (r && r.status === 'requested' && r.fundDeadline !== undefined && this.now() >= r.fundDeadline) {
      const expired: EscrowRecord = { ...r, status: 'expired' };
      await this.store.put(expired);
      return expired;
    }
    return r;
  }

  list(): Promise<EscrowRecord[]> { return this.store.list(); }

  // ── OPEN (buyer) ─────────────────────────────────────────────────────────

  /** Opt an agreed/settled agreement into escrow (the human gate is at the
   *  server verb). Recipients are fixed here + immutable thereafter. Conservation:
   *  the escrowed amount == the agreement amount. */
  async openEscrow(agreementId: string, input: EscrowOpenInput): Promise<EscrowRecord> {
    const a = await this.requireFulfillable(agreementId);
    if (a.sellerRole === undefined) throw new Error('agreement has no sellerRole — role-binding is required for escrow');
    const buyerPubkey = buyerPubkeyOf(a);
    const sellerPubkey = sellerPubkeyOf(a);
    if (!buyerPubkey || !sellerPubkey) throw new Error('agreement is missing a party pubkey (not fully agreed?)');
    const existing = await this.store.get(agreementId);
    if (existing) return existing; // idempotent open
    const createdAt = this.now();
    const record: EscrowRecord = {
      agreementId, proposalHash: a.proposalHash,
      escrowAddress: input.escrowAddress, releaseTo: input.releaseTo, refundTo: input.refundTo,
      arbiterPubkey: input.arbiterPubkey, escrowMode: input.escrowMode ?? 'notary',
      amountMicroFtc: a.amountMicroFtc, sellerRole: a.sellerRole, buyerPubkey, sellerPubkey, status: 'requested',
      fundDeadline: createdAt + (input.fundDeadlineMs ?? DEFAULT_FUND_DEADLINE_MS),
      createdAt,
      // carried so markFunded can open the windows; recomputed there relative to funding.
      ...(input.autoReleaseMs !== undefined ? { autoReleaseAt: input.autoReleaseMs } : {}),
      ...(input.disputeWindowMs !== undefined ? { disputeWindowEndsAt: input.disputeWindowMs } : {}),
    };
    await this.store.put(record);
    return record;
  }

  /** The FUND instruction (buyer → E). Hand it to Agent Pay's proposePayment. */
  async getFundInstruction(agreementId: string): Promise<EscrowInstruction> {
    const r = await this.requireStatus(agreementId, 'requested');
    return buildFundInstruction(r);
  }

  /** Record the confirmed FUND tx (requested → funded); opens the windows. */
  async markFunded(agreementId: string, txHash: string): Promise<EscrowRecord | null> {
    const r = await this.store.get(agreementId);
    if (!r) return null;
    if (r.status !== 'requested') return r; // idempotent / already past funding (incl. expired)
    const fundedAt = this.now();
    const next: EscrowRecord = {
      ...r, status: 'funded', fundTxHash: txHash,
      autoReleaseAt: fundedAt + (r.autoReleaseAt ?? DEFAULT_AUTO_RELEASE_MS),
      disputeWindowEndsAt: fundedAt + (r.disputeWindowEndsAt ?? DEFAULT_DISPUTE_WINDOW_MS),
    };
    await this.store.put(next);
    return next;
  }

  // ── RELEASE / REFUND (arbiter) ───────────────────────────────────────────

  /** Build the RELEASE leg (arbiter → seller). Allowed when the deterministic
   *  policy holds (delivery confirmed / auto-release window) OR the arbiter
   *  overrides a dispute with 'release'. Flips to release_pending (one-shot). */
  async buildRelease(agreementId: string, opts: { arbiterOverride?: 'release' } = {}): Promise<EscrowInstruction> {
    const r = await this.requireArbiter(agreementId);
    const f = await this.fulfilment.get(agreementId);
    const policy = releaseAllowed(r, f, this.now());
    const overridden = r.status === 'disputed' && opts.arbiterOverride === 'release';
    if (!policy.ok && !overridden) throw new Error(`release not allowed: ${policy.reason}`);
    await this.store.put({ ...r, status: 'release_pending' });
    return buildReleaseInstruction(r);
  }

  async markReleased(agreementId: string, txHash: string): Promise<EscrowRecord | null> {
    const r = await this.store.get(agreementId);
    if (!r) return null;
    if (r.status === 'released') return r; // idempotent; first link wins
    if (r.status !== 'release_pending') return r; // one-shot: only from release_pending
    const next: EscrowRecord = { ...r, status: 'released', releaseTxHash: txHash };
    await this.store.put(next);
    // The RELEASE pays the seller → the agreement is settled on-chain.
    await this.driveSettled(agreementId, txHash);
    return next;
  }

  /** Build the REFUND leg (arbiter → buyer). Allowed by the deterministic policy
   *  OR an arbiter dispute override 'refund'. Flips to refund_pending (one-shot). */
  async buildRefund(agreementId: string, opts: { arbiterOverride?: 'refund' } = {}): Promise<EscrowInstruction> {
    const r = await this.requireArbiter(agreementId);
    const f = await this.fulfilment.get(agreementId);
    const policy = refundAllowed(r, f, this.now());
    const overridden = r.status === 'disputed' && opts.arbiterOverride === 'refund';
    if (!policy.ok && !overridden) throw new Error(`refund not allowed: ${policy.reason}`);
    await this.store.put({ ...r, status: 'refund_pending' });
    return buildRefundInstruction(r);
  }

  async markRefunded(agreementId: string, txHash: string): Promise<EscrowRecord | null> {
    const r = await this.store.get(agreementId);
    if (!r) return null;
    if (r.status === 'refunded') return r;
    if (r.status !== 'refund_pending') return r; // one-shot
    const next: EscrowRecord = { ...r, status: 'refunded', refundTxHash: txHash };
    await this.store.put(next);
    return next;
  }

  // ── DISPUTE (buyer-signed, ungated) ──────────────────────────────────────

  async raiseDispute(agreementId: string, reason: string): Promise<{ record: EscrowRecord; payload: DisputePayload }> {
    const r = await this.store.get(agreementId);
    if (!r) throw new Error(`no escrow for agreement ${agreementId}`);
    if (r.status !== 'funded') throw new Error(`escrow is ${r.status} — can only dispute a funded escrow`);
    const me = await this.identity.pubkey();
    if (r.buyerPubkey !== me) throw new Error('only the buyer may raise a dispute');
    const raisedAt = this.now();
    const digest = computeDisputeDigest({ agreementId, proposalHash: r.proposalHash, reason, raisedAt });
    const disputerSig = await this.identity.signString(disputeSigningString(digest));
    const next: EscrowRecord = { ...r, status: 'disputed', disputeReason: reason, disputeSig: disputerSig, disputerPubkey: me };
    await this.store.put(next);
    return { record: next, payload: { agreementId, proposalHash: r.proposalHash, reason, raisedAt, disputerPubkey: me, disputerSig } };
  }

  /** Apply an inbound signed dispute (the arbiter or seller side): the buyer's
   *  KEY (stamped on the escrow record at open time) + the signature are the
   *  authority — the arbiter is a third party with no counterpartyHash relation,
   *  so authentication is the buyer-key signature, not the relay sender. */
  async applyInboundDispute(p: DisputePayload): Promise<EscrowRecord | null> {
    const r = await this.store.get(p.agreementId);
    if (!r) return null;
    if (r.status !== 'funded') return r; // only a funded escrow becomes disputed
    if (p.proposalHash !== r.proposalHash) return null;
    if (p.disputerPubkey !== r.buyerPubkey) return null; // must be the buyer's key
    const digest = computeDisputeDigest({ agreementId: p.agreementId, proposalHash: p.proposalHash, reason: p.reason, raisedAt: p.raisedAt });
    if (!(await verifyMessage(disputeSigningString(digest), p.disputerSig, p.disputerPubkey))) return null;
    const next: EscrowRecord = { ...r, status: 'disputed', disputeReason: p.reason, disputeSig: p.disputerSig, disputerPubkey: p.disputerPubkey };
    await this.store.put(next);
    return next;
  }

  // ── RECONCILE (observe an inbound escrow leg on-chain) ───────────────────

  /** Drive the state machine off an observed escrow payment, switching on
   *  meta.escrow. The reconcile keys (agreementId + proposalHash) come from the
   *  remittance; txHash is the on-chain id. */
  async reconcile(input: { agreementId: string; leg: 'fund' | 'release' | 'refund'; txHash: string }): Promise<EscrowRecord | null> {
    if (input.leg === 'fund') return this.markFunded(input.agreementId, input.txHash);
    if (input.leg === 'release') return this.markReleased(input.agreementId, input.txHash);
    return this.markRefunded(input.agreementId, input.txHash);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async requireAgreement(agreementId: string): Promise<Agreement> {
    const a = await this.agreements.get(agreementId);
    if (!a) throw new Error(`agreement ${agreementId} not found`);
    return a;
  }

  private async requireFulfillable(agreementId: string): Promise<Agreement> {
    const a = await this.requireAgreement(agreementId);
    if (!FULFILLABLE.has(a.status)) throw new Error(`agreement is ${a.status} — escrow needs an agreed/settled agreement`);
    return a;
  }

  private async requireStatus(agreementId: string, status: EscrowStatus): Promise<EscrowRecord> {
    const r = await this.get(agreementId);
    if (!r) throw new Error(`no escrow for agreement ${agreementId}`);
    if (r.status !== status) throw new Error(`escrow is ${r.status}, expected ${status}`);
    return r;
  }

  /** Only the arbiter (the E keyholder named at open time) may build release/refund. */
  private async requireArbiter(agreementId: string): Promise<EscrowRecord> {
    const r = await this.store.get(agreementId);
    if (!r) throw new Error(`no escrow for agreement ${agreementId}`);
    if (isEscrowTerminal(r.status) || r.status === 'release_pending' || r.status === 'refund_pending') {
      throw new Error(`escrow is ${r.status} — no further release/refund`);
    }
    const me = await this.identity.pubkey();
    if (me !== r.arbiterPubkey) throw new Error('only the arbiter may release or refund this escrow');
    return r;
  }

  /** A successful release means the seller received the FTC → mark the agreement
   *  settled with the release tx (mirrors reconcileInboundSettlement's outcome). */
  private async driveSettled(agreementId: string, txHash: string): Promise<void> {
    const a = await this.agreements.get(agreementId);
    if (!a || a.status === 'settled') return;
    if (a.status !== 'agreed') return;
    await this.agreements.updateStatus(agreementId, { status: 'settled', linkedTxHash: txHash, respondedAt: this.now() });
  }
}
