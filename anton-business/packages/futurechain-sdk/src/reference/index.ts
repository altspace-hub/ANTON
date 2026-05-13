/**
 * reference/ — PACS.008 remittance field encoder/decoder.
 *
 * Status: UNBLOCKED. ADR-004 closed 2026-05-14 with Option 3 (versioned
 * envelope). v1 = merchant-bearing schema for ANTON Business. v2 =
 * existing P:N:G:T: schema used by the ANTON gateway. Free-text
 * remittances pass through as kind: 'unknown'.
 *
 * Implementation lands in sprint 1 task 2. This file declares the
 * public surface so dependent code can be written against it.
 *
 * See docs/adr/ADR-004-reference-encoding.md for the full grammar.
 */
import { NotImplementedError } from '../index.js';

// ── v1 — Merchant-bearing schema (ANTON Business) ────────────────────

export type V1Purpose = 'RETAIL' | 'RESTAURANT' | 'EVENT' | 'SERVICE' | 'REFUND';

export interface V1Fields {
  /** Exactly 8 chars, [A-Z0-9]. Allocated at /merchant/register. */
  merchantId: string;
  /** Exactly 12 chars, [A-Z0-9]. Unique per merchant. */
  orderId: string;
  purpose: V1Purpose;
  /** 0..999. Optional. */
  itemCount?: number;
  /** Decimal-string micro-FTC, 0..10^18-1. Optional. */
  vatMicroUnits?: bigint;
  /** Decimal-string micro-FTC, 0..10^18-1. Optional. */
  discountMicroUnits?: bigint;
  /** UETR of original transaction. REQUIRED iff purpose === 'REFUND'. */
  refundOf?: string;
}

// ── v2 — Operational schema (existing ANTON gateway) ────────────────

export interface V2Fields {
  /** ISO 20022 ExternalPurposeCode — 4 uppercase chars (e.g. 'OTHR', 'GDDS'). */
  purpose: string;
  /** Free-form, 1..32 chars [A-Za-z0-9_-]. */
  nature: string;
  /** Free-form, 1..32 chars [A-Za-z0-9_-]. */
  goal: string;
  /** Free-form, 1..32 chars [A-Za-z0-9_-]. Optional. */
  taskRef?: string;
}

// ── Decoder result envelope ──────────────────────────────────────────

export type DecodeResult =
  | { kind: 'v1'; fields: V1Fields }
  | { kind: 'v2'; fields: V2Fields }
  /** Legacy `P:OTHR N:.. G:..` without a `v2:` prefix. Treated as v2
   *  to keep in-flight ANTON instances working until they migrate. */
  | { kind: 'unversioned-v2'; fields: V2Fields }
  /** Free-text remittance from a third-party sender. Not an error —
   *  the reconciler matches on creditor address instead. */
  | { kind: 'unknown'; raw: string }
  /** Recognised version prefix but the body was malformed. */
  | { kind: 'invalid'; reason: string };

/** Maximum encoded length per FutureChain Phase 1. */
export const REMITTANCE_MAX_LEN = 140;

export class ReferenceTooLongError extends Error {
  constructor(public readonly attempted: number) {
    super(`Reference exceeds ${REMITTANCE_MAX_LEN} chars (got ${attempted})`);
    this.name = 'ReferenceTooLongError';
  }
}

export class ReferenceValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`Reference validation failed on ${field}: ${message}`);
    this.name = 'ReferenceValidationError';
  }
}

/** Encode v1 fields into a `v1:`-prefixed remittance string ≤140 chars.
 *  Throws ReferenceValidationError for any constraint violation and
 *  ReferenceTooLongError if the result would exceed 140 chars. */
export function encodeV1(_input: V1Fields): string {
  throw new NotImplementedError('reference.encodeV1()');
}

/** Decode any remittance string. Never throws — bad input becomes
 *  `{ kind: 'invalid', reason }`. Free-text becomes `{ kind: 'unknown' }`. */
export function decode(_remittance: string): DecodeResult {
  throw new NotImplementedError('reference.decode()');
}
