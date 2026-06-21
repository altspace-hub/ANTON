/**
 * escrow-core.ts — the canonical layer for P8 ESCROW. FutureChain has NO native
 * escrow primitive (no script / locktime / multisig — verified against the SDK),
 * so v1 is an HONESTLY-LABELLED CUSTODIAL "notary" escrow: a third arbiter
 * instance holds an escrow address E; the buyer pays into E (FUND), and on a
 * role-checked delivery the arbiter pays E→seller (RELEASE) or E→buyer (REFUND).
 * Each leg is a real, human-gated Agent Pay payment distinguished only by the
 * remittance `meta.escrow`; THIS module is the off-chain signed state machine +
 * the deterministic release/refund POLICY. It moves no money itself.
 *
 * Custody trust: the arbiter is trusted to ACT, but `escrowAddress`/`releaseTo`/
 * `refundTo` are fixed at open time and immutable — so a release can only ever
 * pay the pre-agreed seller and a refund only the pre-agreed buyer. The arbiter
 * can decide WHO wins a dispute but never WHERE the money goes. This is "managed
 * escrow", NOT trustless (true trustlessness needs a chain-core change — Model B,
 * reserved via escrowMode).
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { canonicalFlat, type SellerRole } from './agreement-core.js';
import type { FulfilmentRecord } from './fulfilment-core.js';
import type { pacs008 } from '@futurechain/sdk';

export const ESCROW_SCHEMA_V = 1;
export type EscrowMode = 'notary'; // 'multisig' reserved for the chain-core v2

export type EscrowStatus =
  | 'requested'        // opted-in, awaiting buyer funding
  | 'funded'           // buyer→E confirmed; release/refund windows open
  | 'release_pending'  // arbiter is paying E→seller (one-shot lock vs refund)
  | 'released'         // TERMINAL — seller paid
  | 'refund_pending'   // arbiter is paying E→buyer
  | 'refunded'         // TERMINAL — buyer refunded
  | 'disputed'         // buyer raised a signed dispute; awaiting the arbiter
  | 'expired';         // TERMINAL — funding window passed unfunded (no funds moved)

export const ESCROW_TERMINAL: readonly EscrowStatus[] = ['released', 'refunded', 'expired'];
export function isEscrowTerminal(s: EscrowStatus): boolean {
  return (ESCROW_TERMINAL as readonly string[]).includes(s);
}

export interface EscrowOpenInput {
  /** The arbiter-held custodial address funds are paid INTO. Immutable. */
  escrowAddress: string;
  /** The seller's fc address — the ONLY address a release can ever pay. Immutable. */
  releaseTo: string;
  /** The buyer's fc address — the ONLY address a refund can ever pay. Immutable. */
  refundTo: string;
  /** The arbiter's identity pubkey (who may build release/refund). */
  arbiterPubkey: string;
  escrowMode?: EscrowMode;
  /** Funding deadline (ms); unfunded past it → expired. */
  fundDeadlineMs?: number;
  /** Auto-release window after funding (ms): a shipped-but-unconfirmed order may
   *  release to the seller once this elapses with no dispute (anti-griefing). */
  autoReleaseMs?: number;
  /** Dispute window after funding (ms): an unresolved dispute past it defaults to
   *  a buyer refund. */
  disputeWindowMs?: number;
}

export interface EscrowRecord {
  agreementId: string;
  proposalHash: string;
  escrowAddress: string;
  releaseTo: string;
  refundTo: string;
  arbiterPubkey: string;
  escrowMode: EscrowMode;
  amountMicroFtc: string; // = agreement.amountMicroFtc (conservation)
  sellerRole: SellerRole;
  /** Resolved at open time from the signed agreement, so the arbiter can verify a
   *  dispute / a delivery proof WITHOUT holding the full agreement. Immutable. */
  buyerPubkey: string;
  sellerPubkey: string;
  status: EscrowStatus;
  fundTxHash?: string;
  releaseTxHash?: string;
  refundTxHash?: string;
  fundDeadline?: number;
  autoReleaseAt?: number;
  disputeWindowEndsAt?: number;
  disputeReason?: string;
  disputeSig?: string;
  disputerPubkey?: string;
  createdAt: number;
}

/** The instruction an agent hands to Agent Pay's proposePayment to move an escrow
 *  leg. The SPEND opens Agent Pay's own human gate; this only describes it. */
export interface EscrowInstruction {
  leg: 'fund' | 'release' | 'refund';
  to: string;
  amountFtc: number;
  amountMicroFtc: string;
  remittance: pacs008.AntonRemittance;
}

// ── Dispute signing (buyer-signed; domain-separated; canonicalFlat-based) ─────

const DISPUTE_DOMAIN = 'anton-escrow-dispute|v1|';

export interface DisputeDigestFields {
  agreementId: string;
  proposalHash: string;
  reason: string;
  raisedAt: number;
}

export function disputeDigestMap(f: DisputeDigestFields): Record<string, string> {
  return {
    agreementId: f.agreementId,
    schemaV: String(ESCROW_SCHEMA_V),
    kind: 'dispute',
    proposalHash: f.proposalHash,
    reason: f.reason,
    raisedAt: String(f.raisedAt),
  };
}

export function computeDisputeDigest(f: DisputeDigestFields): string {
  return bytesToHex(sha256(utf8ToBytes(DISPUTE_DOMAIN + canonicalFlat(disputeDigestMap(f)))));
}

export function disputeSigningString(digest: string): string {
  return `anton-escrow-dispute-sig|v1|${digest}`;
}

export interface DisputePayload {
  agreementId: string;
  proposalHash: string;
  reason: string;
  raisedAt: number;
  disputerPubkey: string;
  disputerSig: string;
}

// ── Remittance builders (stamp meta.escrow so the payee can reconcile) ───────

function escrowRemittance(r: EscrowRecord, leg: 'fund' | 'release' | 'refund', extra: Record<string, string> = {}): pacs008.AntonRemittance {
  return {
    v: 1, kind: 'agreement', ref: r.agreementId,
    meta: { agreementId: r.agreementId, proposalHash: r.proposalHash, escrow: leg, escrowAddress: r.escrowAddress, ...extra },
  };
}

function microToFtc(micro: string): number { return Number(micro) / 1_000_000; }

/** Build the FUND leg (buyer → escrow address E). */
export function buildFundInstruction(r: EscrowRecord): EscrowInstruction {
  return {
    leg: 'fund', to: r.escrowAddress, amountMicroFtc: r.amountMicroFtc, amountFtc: microToFtc(r.amountMicroFtc),
    remittance: escrowRemittance(r, 'fund', { sellerRole: r.sellerRole }),
  };
}

/** Build the RELEASE leg (arbiter pays E → the pre-agreed seller). */
export function buildReleaseInstruction(r: EscrowRecord, deliveryDigest?: string): EscrowInstruction {
  return {
    leg: 'release', to: r.releaseTo, amountMicroFtc: r.amountMicroFtc, amountFtc: microToFtc(r.amountMicroFtc),
    remittance: escrowRemittance(r, 'release', deliveryDigest ? { deliveryDigest } : {}),
  };
}

/** Build the REFUND leg (arbiter pays E → the pre-agreed buyer). */
export function buildRefundInstruction(r: EscrowRecord, disputeRef?: string): EscrowInstruction {
  return {
    leg: 'refund', to: r.refundTo, amountMicroFtc: r.amountMicroFtc, amountFtc: microToFtc(r.amountMicroFtc),
    remittance: escrowRemittance(r, 'refund', disputeRef ? { disputeRef } : {}),
  };
}

// ── Deterministic release / refund POLICY (the arbiter checks before paying) ──

export interface PolicyResult { ok: boolean; reason: string }

/** RELEASE-to-seller is allowed when the BUYER confirmed delivery (a role-checked
 *  delivered FulfilmentRecord bound to this proposalHash), OR — anti-griefing —
 *  the order shipped and the auto-release window elapsed with no dispute. Never
 *  on seller self-attestation alone. */
export function releaseAllowed(r: EscrowRecord, f: FulfilmentRecord | null, now: number): PolicyResult {
  if (r.status !== 'funded') return { ok: false, reason: `escrow is ${r.status}, not funded` };
  if (f && f.proposalHash === r.proposalHash && f.status === 'delivered') {
    return { ok: true, reason: 'buyer confirmed delivery' };
  }
  if (r.autoReleaseAt !== undefined && now >= r.autoReleaseAt
    && f && f.proposalHash === r.proposalHash && f.status === 'shipped') {
    return { ok: true, reason: 'shipped + auto-release window elapsed, no dispute' };
  }
  return { ok: false, reason: 'no delivery proof and auto-release window not elapsed' };
}

/** REFUND-to-buyer is allowed when the seller never shipped and the funding
 *  deadline elapsed, OR a dispute is unresolved past its window (default-to-buyer). */
export function refundAllowed(r: EscrowRecord, f: FulfilmentRecord | null, now: number): PolicyResult {
  if (r.status !== 'funded' && r.status !== 'disputed') return { ok: false, reason: `escrow is ${r.status}` };
  if (r.fundDeadline !== undefined && now >= r.fundDeadline && (!f || f.status === 'awaiting')) {
    return { ok: true, reason: 'seller never shipped + funding deadline elapsed' };
  }
  if (r.status === 'disputed' && r.disputeWindowEndsAt !== undefined && now >= r.disputeWindowEndsAt) {
    return { ok: true, reason: 'dispute unresolved past window — default to buyer' };
  }
  return { ok: false, reason: 'no deterministic refund condition met' };
}
