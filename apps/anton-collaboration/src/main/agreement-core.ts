/**
 * agreement-core.ts — the PURE, deterministic canonical layer of the two-party
 * signed Agreement, ported BYTE-IDENTICAL from src/comm/services/agreements.ts
 * (and its Pay/Business copies). This is the 4th copy the commerce-loop plan
 * calls for: the standalone buyer agent must produce a proposalHash + signature
 * that the seller's Comm/Pay/Business ANTON verifies, and vice versa.
 *
 * THE KEYSTONE is `canonicalFlat`: the ONE serialization that gets hashed and
 * signed. STRICTLY a FLAT Record<string,string> — never nested — because the
 * sibling canonicalizers (z-reports, receipts) sort TOP-LEVEL keys only; a
 * nested object would serialize in engine-dependent insertion order and silently
 * break cross-device / cross-app verification. Locked by a cross-app golden
 * vector test (same input → identical bytes → identical hash) shared with the
 * three app copies.
 *
 * No crypto here (sha256 only) — Ed25519 sign/verify lives in agreement-crypto.ts.
 * No storage here — the standalone store lives in agreement-store.ts.
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { pacs008 } from '@futurechain/sdk';

// ── Status lifecycle (identical to the Comm copy) ───────────────────────────

export type AgreementStatus =
  | 'draft'
  | 'proposed'
  | 'countered'
  | 'accepted'
  | 'accept_unconfirmed'
  | 'agreed'
  | 'settled'
  | 'declined'
  | 'withdrawn'
  | 'expired';

export const TERMINAL_STATUSES: readonly AgreementStatus[] = [
  'agreed', 'settled', 'declined', 'withdrawn', 'expired', 'accept_unconfirmed',
];

export function isTerminal(s: AgreementStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(s);
}

/** True when it's MY turn to act: an open proposal/counter I'm the current
 *  acceptor of, or an accept I couldn't deliver (needs re-send). Matches the
 *  Comm copy's isActionable. */
export function isActionable(a: { role: 'proposer' | 'acceptor'; status: AgreementStatus }): boolean {
  return (a.role === 'acceptor' && (a.status === 'proposed' || a.status === 'countered'))
    || a.status === 'accept_unconfirmed';
}

export type AgreementTrustTier = 'signed' | 'settlement';
export type ResponseVerb = 'accept' | 'counter' | 'decline';

/** Bump only when a FIELD MEANING changes. Rides in the digest map + wire. */
export const AGREEMENT_SCHEMA_V = 1;
/** Protocol cap on counter-offers (enforced in the protocol, not just the UI). */
export const MAX_COUNTERS = 6;

/** Which side of the CURRENT head is the SELLER (the party paid + who ships).
 *  Frame-relative to a head's proposer/acceptor (both parties compute the same
 *  for a given head); re-derived on each counter from the absolute seller key.
 *  Bound into the signed proposal digest (P8 role-binding) — OMITTED when absent
 *  so non-escrow proposals stay byte-identical to the Comm/Pay/Business copies. */
export type SellerRole = 'proposer' | 'acceptor';

export interface Agreement {
  id: string;
  schemaV: number;
  role: 'proposer' | 'acceptor';
  trustTier: AgreementTrustTier;
  counterpartyHash?: string;
  counterpartyAddress: string;
  decision: string;
  terms: string;
  amountMicroFtc: string;
  status: AgreementStatus;
  seq: number;
  parentProposalHash?: string;
  proposalHash: string;
  proposerPubkey: string;
  proposerSig: string;
  acceptorPubkey?: string;
  acceptorSig?: string;
  counterDecision?: string;
  counterTerms?: string;
  counterAmountMicroFtc?: string;
  linkedTxHash?: string;
  structured?: pacs008.AntonRemittance;
  createdAt: number;
  respondedAt?: number;
  respondBy?: number;
  nonce: string;
  /** P8 role-binding: which side of THIS head is the seller (signed into the
   *  proposal digest). Absent on legacy/non-escrow agreements. */
  sellerRole?: SellerRole;
}

/** The seller's absolute pubkey for a head (the party paid + who ships). Returns
 *  undefined when sellerRole isn't bound (legacy/non-escrow). */
export function sellerPubkeyOf(a: Pick<Agreement, 'sellerRole' | 'proposerPubkey' | 'acceptorPubkey'>): string | undefined {
  if (a.sellerRole === 'proposer') return a.proposerPubkey;
  if (a.sellerRole === 'acceptor') return a.acceptorPubkey;
  return undefined;
}

/** The buyer's absolute pubkey for a head (the party who pays + confirms). */
export function buyerPubkeyOf(a: Pick<Agreement, 'sellerRole' | 'proposerPubkey' | 'acceptorPubkey'>): string | undefined {
  if (a.sellerRole === 'proposer') return a.acceptorPubkey;
  if (a.sellerRole === 'acceptor') return a.proposerPubkey;
  return undefined;
}

// ── Canonicalization — LOCKED, byte-identical across all copies ─────────────

/** The ONLY hashed/signed serialization. STRICTLY FLAT: every value is a string,
 *  no nested objects. Sorts keys (matching z-reports canonicalize) so the bytes
 *  are reproducible across JS engines, devices, and every app copy. */
export function canonicalFlat(map: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k]!;
  return JSON.stringify(sorted);
}

const PROPOSAL_DOMAIN = 'anton-agreement-prop|v1|';
const RESPONSE_DOMAIN = 'anton-agreement-resp|v1|';

export interface ProposalDigestFields {
  agreementId: string;
  seq: number;
  decision: string;
  terms: string;
  amountMicroFtc: string;
  counterpartyAddress: string;
  createdAt: number;
  parentProposalHash?: string;
  /** P8 role-binding. OMITTED from the digest when absent → a non-escrow proposal
   *  serialises byte-identically to today (the cross-app golden lock is intact). */
  sellerRole?: SellerRole;
}

/** The flat map that the proposalHash is computed over. */
export function proposalDigestMap(f: ProposalDigestFields): Record<string, string> {
  return {
    agreementId: f.agreementId,
    schemaV: String(AGREEMENT_SCHEMA_V),
    kind: 'propose',
    seq: String(f.seq),
    decision: f.decision,
    terms: f.terms,
    amountMicroFtc: f.amountMicroFtc,
    counterpartyAddress: f.counterpartyAddress,
    createdAt: String(f.createdAt),
    parentProposalHash: f.parentProposalHash ?? '',
    // OMIT when absent — canonicalFlat sorts keys, so a sellerRole-less map is
    // byte-for-byte today's map (preserves GOLDEN_PROPOSAL_HASH + the 4-copy lock).
    ...(f.sellerRole !== undefined ? { sellerRole: f.sellerRole } : {}),
  };
}

/** sha256 hex of the domain-separated canonical proposal map. This IS the
 *  proposalHash — the bind key echoed on-chain (Pay/Business) and signed. */
export function computeProposalHash(f: ProposalDigestFields): string {
  return bytesToHex(sha256(utf8ToBytes(PROPOSAL_DOMAIN + canonicalFlat(proposalDigestMap(f)))));
}

export interface ResponseDigestFields {
  agreementId: string;
  proposalHash: string;
  verb: ResponseVerb;
  seq: number;
  counterDecision?: string;
  counterTerms?: string;
  counterAmountMicroFtc?: string;
  responderPubkey: string;
  nonce: string;
}

/** The flat map the acceptorSig is computed over. Counter fields are FLATTENED
 *  (counter_decision/terms/amount) and always present as keys for a stable shape. */
export function responseDigestMap(f: ResponseDigestFields): Record<string, string> {
  return {
    agreementId: f.agreementId,
    schemaV: String(AGREEMENT_SCHEMA_V),
    kind: 'respond',
    proposalHash: f.proposalHash,
    verb: f.verb,
    seq: String(f.seq),
    counter_decision: f.counterDecision ?? '',
    counter_terms: f.counterTerms ?? '',
    counter_amount: f.counterAmountMicroFtc ?? '',
    responderPubkey: f.responderPubkey,
    nonce: f.nonce,
  };
}

export function computeResponseDigest(f: ResponseDigestFields): string {
  return bytesToHex(sha256(utf8ToBytes(RESPONSE_DOMAIN + canonicalFlat(responseDigestMap(f)))));
}

// ── Ed25519 binding strings (the 'signed' trust tier) ───────────────────────

/** The exact string an Ed25519 signature is produced over for a proposal. */
export function proposalSigningString(proposalHash: string): string {
  return `anton-agreement-prop-sig|v1|${proposalHash}`;
}

/** The string a response signature is produced over. */
export function responseSigningString(responseDigest: string): string {
  return `anton-agreement-resp-sig|v1|${responseDigest}`;
}

/** The string the proposer signs to WITHDRAW an outstanding proposal. */
export function withdrawSigningString(proposalHash: string): string {
  return `anton-agreement-withdraw-sig|v1|${proposalHash}`;
}

/** True if head A wins over head B: higher seq, or equal seq with a
 *  lexicographically-larger proposalHash (the deterministic tiebreak that makes
 *  two SIMULTANEOUS counters converge on the same head on both sides). */
export function headBeats(a: { seq: number; hash: string }, b: { seq: number; hash: string }): boolean {
  if (a.seq !== b.seq) return a.seq > b.seq;
  return a.hash > b.hash;
}

// ── Wire payloads (cross the relay / agent boundary) ────────────────────────

export interface AgreementProposePayload {
  agreementId: string;
  schemaV: number;
  seq: number;
  decision: string;
  terms: string;
  amountMicroFtc: string;
  counterpartyAddress: string;
  createdAt: number;
  respondBy?: number;
  parentProposalHash?: string;
  proposalHash: string;
  proposerPubkey: string;
  proposerSig: string;
  structured?: pacs008.AntonRemittance;
  /** P8 role-binding — the receiver recomputes the hash WITH this, so a tampered
   *  sellerRole fails verifyProposalPayload. Absent on non-escrow proposals. */
  sellerRole?: SellerRole;
}

export interface AgreementRespondPayload {
  agreementId: string;
  proposalHash: string;
  verb: ResponseVerb;
  seq: number;
  responderPubkey: string;
  responderSig: string;
  nonce: string;
  counterDecision?: string;
  counterTerms?: string;
  counterAmountMicroFtc?: string;
  counterSeq?: number;
  counterCreatedAt?: number;
  counterProposalHash?: string;
  counterProposerSig?: string;
  /** P8 role-binding: the new head's frame-relative sellerRole (the absolute
   *  seller is invariant; this is recomputed per head). In the counter-head hash,
   *  so a seller-flipping counter is rejected by the recompute guard. */
  counterSellerRole?: SellerRole;
}

export interface AgreementWithdrawPayload {
  agreementId: string;
  proposalHash: string;
  withdrawerPubkey: string;
  withdrawSig: string;
}

export interface AgreementAckPayload {
  agreementId: string;
  proposalHash: string;
}
