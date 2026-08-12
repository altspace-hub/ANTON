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
import {
  computeDeliveryDigest, deliverySigningString, computeShipmentDigest, shipmentSigningString,
  type FulfilmentRecord,
} from './fulfilment-core.js';
import { verifyMessage } from './agreement-crypto.js';
import { buyerPubkeyOf, sellerPubkeyOf } from './agreement-core.js';
import type { AgreementStore } from './agreement-store.js';
import type { AgreementIdentity } from './agreement-identity.js';
import type { EscrowStore } from './escrow-store.js';
import type { FulfilmentStore } from './fulfilment-store.js';
import type { Agreement } from './agreement-core.js';

/** Floor for the auto-release window — see openEscrow. */
export const MIN_AUTO_RELEASE_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_FUND_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days to fund
export const DEFAULT_DISPUTE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days to resolve

const MICRO_RE = /^\d{1,30}$/;
// Escrow opens on an AGREED (not yet settled) agreement — escrow IS the
// settlement path, so an already-settled deal must not be double-settled (H1).
const FULFILLABLE = new Set<string>(['agreed']);

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
    if (!MICRO_RE.test(a.amountMicroFtc) || a.amountMicroFtc === '0') throw new Error('agreement has no escrowable amount'); // M3
    const buyerPubkey = buyerPubkeyOf(a);
    const sellerPubkey = sellerPubkeyOf(a);
    if (!buyerPubkey || !sellerPubkey) throw new Error('agreement is missing a party pubkey (not fully agreed?)');
    const existing = await this.store.get(agreementId);
    if (existing) return existing; // idempotent open

    // openEscrow is LLM-callable and ungated, and every address below is taken
    // verbatim from the caller. Immutability-after-open (which does hold) is
    // worth nothing if the values fixed at open are attacker-chosen, so sanity
    // must be enforced HERE or nowhere.
    const me = await this.identity.pubkey();
    if (me !== buyerPubkey && me !== input.arbiterPubkey) {
      // Kills role inversion: a seller who proposes with sellerRole:'acceptor'
      // makes buyerPubkeyOf(a) resolve to THEIR key on the victim's instance.
      // The victim is then neither buyer nor arbiter, so their own instance
      // refuses to open — before any address is fixed. Allowing the arbiter
      // preserves the each-instance-syncs-the-open model the tests rely on.
      throw new Error('only the buyer or the named arbiter may open this escrow');
    }
    if (input.arbiterPubkey === sellerPubkey || input.arbiterPubkey === buyerPubkey) {
      // A seller who is also the arbiter decides their own dispute, which is the
      // entire trust assumption escrow rests on.
      throw new Error('the arbiter must be a third party, not the buyer or the seller');
    }
    if (input.escrowAddress === input.releaseTo) {
      // Funding an address that is also the release target is a direct payment
      // wearing escrow's name — the fund leg alone pays the seller.
      throw new Error('escrowAddress must differ from releaseTo — that is a direct payment, not escrow');
    }
    if (input.autoReleaseMs !== undefined && input.autoReleaseMs < MIN_AUTO_RELEASE_MS) {
      // releaseAllowed() permits an auto-release on a SELLER-SIGNED 'shipped'
      // record alone. escrow-core promises "never on seller self-attestation
      // alone"; with autoReleaseMs:1 that is precisely what it becomes.
      throw new Error(`autoReleaseMs must be at least ${MIN_AUTO_RELEASE_MS}ms (24h) — a shorter window is seller self-release`);
    }
    const createdAt = this.now();
    const record: EscrowRecord = {
      agreementId, proposalHash: a.proposalHash,
      escrowAddress: input.escrowAddress, releaseTo: input.releaseTo, refundTo: input.refundTo,
      arbiterPubkey: input.arbiterPubkey, escrowMode: input.escrowMode ?? 'notary',
      amountMicroFtc: a.amountMicroFtc, sellerRole: a.sellerRole, buyerPubkey, sellerPubkey, status: 'requested',
      fundDeadline: createdAt + (input.fundDeadlineMs ?? DEFAULT_FUND_DEADLINE_MS),
      createdAt,
      // Store CONFIG durations; markFunded resolves them to absolute deadlines.
      // Auto-release stays OFF unless an explicit autoReleaseMs was given (H2).
      ...(input.autoReleaseMs !== undefined ? { autoReleaseMs: input.autoReleaseMs } : {}),
      ...(input.disputeWindowMs !== undefined ? { disputeWindowMs: input.disputeWindowMs } : {}),
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
      // Auto-release is OPT-IN: resolve it ONLY when autoReleaseMs was configured.
      ...(r.autoReleaseMs !== undefined ? { autoReleaseAt: fundedAt + r.autoReleaseMs } : {}),
      // The dispute window always has a backstop (default-to-buyer is reachable).
      disputeWindowEndsAt: fundedAt + (r.disputeWindowMs ?? DEFAULT_DISPUTE_WINDOW_MS),
    };
    await this.store.put(next);
    return next;
  }

  // ── RELEASE / REFUND (arbiter) ───────────────────────────────────────────

  /** Build the RELEASE leg (arbiter → seller). Allowed when the deterministic
   *  policy holds (delivery confirmed / auto-release window) OR the arbiter
   *  overrides a dispute with 'release'. Flips to release_pending (one-shot). */
  async buildRelease(agreementId: string, opts: { arbiterOverride?: 'release' } = {}): Promise<EscrowInstruction> {
    const me = await this.identity.pubkey();
    // C1: the arbiter-check, the signature-verified policy, and the flip to
    // release_pending all run ATOMICALLY in the store mutex — two concurrent
    // builds can't both pass (the second sees release_pending and throws).
    const updated = await this.store.compareAndSwap(agreementId, async (r) => {
      this.arbiterGuard(r, me);
      const f = await this.trustedFulfilment(r, await this.fulfilment.get(agreementId));
      const overridden = r.status === 'disputed' && opts.arbiterOverride === 'release';
      const policy = releaseAllowed(r, f, this.now());
      if (!policy.ok && !overridden) throw new Error(`release not allowed: ${policy.reason}`);
      return { ...r, status: 'release_pending' };
    });
    return buildReleaseInstruction(updated!);
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
    const me = await this.identity.pubkey();
    const updated = await this.store.compareAndSwap(agreementId, async (r) => {
      this.arbiterGuard(r, me);
      const f = await this.trustedFulfilment(r, await this.fulfilment.get(agreementId));
      const overridden = r.status === 'disputed' && opts.arbiterOverride === 'refund';
      const policy = refundAllowed(r, f, this.now());
      if (!policy.ok && !overridden) throw new Error(`refund not allowed: ${policy.reason}`);
      return { ...r, status: 'refund_pending' };
    });
    return buildRefundInstruction(updated!);
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

  /** Only the arbiter (the E keyholder named at open time) may build release/
   *  refund, and only from a non-pending/non-terminal state. Runs INSIDE the
   *  compareAndSwap mutator (asserts so the record narrows). */
  private arbiterGuard(r: EscrowRecord | null, me: string): asserts r is EscrowRecord {
    if (!r) throw new Error('no escrow for this agreement');
    if (isEscrowTerminal(r.status) || r.status === 'release_pending' || r.status === 'refund_pending') {
      throw new Error(`escrow is ${r.status} — no further release/refund`);
    }
    if (me !== r.arbiterPubkey) throw new Error('only the arbiter may release or refund this escrow');
  }

  /** C2: a delivery/shipment proof may authorize a RELEASE of real funds ONLY if
   *  its Ed25519 SIGNATURE verifies against the escrow's known buyer/seller key —
   *  never trust the sibling fulfilment store's status alone. Returns the record
   *  only when genuinely authenticated + bound to this proposalHash, else null. */
  private async trustedFulfilment(r: EscrowRecord, f: FulfilmentRecord | null): Promise<FulfilmentRecord | null> {
    if (!f || f.proposalHash !== r.proposalHash) return null;
    if (f.status === 'delivered') {
      if (f.confirmerPubkey !== r.buyerPubkey || !f.confirmerSig || f.confirmedAt === undefined) return null;
      const digest = computeDeliveryDigest({ agreementId: r.agreementId, proposalHash: r.proposalHash, confirmedAt: f.confirmedAt });
      return (await verifyMessage(deliverySigningString(digest), f.confirmerSig, f.confirmerPubkey)) ? f : null;
    }
    if (f.status === 'shipped') {
      if (f.shipperPubkey !== r.sellerPubkey || !f.shipperSig || f.shippedAt === undefined || !f.carrier) return null;
      const digest = computeShipmentDigest({
        agreementId: r.agreementId, proposalHash: r.proposalHash, carrier: f.carrier,
        ...(f.tracking !== undefined ? { tracking: f.tracking } : {}),
        ...(f.eta !== undefined ? { eta: f.eta } : {}),
        shippedAt: f.shippedAt,
      });
      return (await verifyMessage(shipmentSigningString(digest), f.shipperSig, f.shipperPubkey)) ? f : null;
    }
    return null;
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
