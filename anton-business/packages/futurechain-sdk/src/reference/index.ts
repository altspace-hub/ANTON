/**
 * reference/ — PACS.008 remittance field encoder/decoder.
 *
 * Status: BLOCKED on ADR-004. The spec §11 format and the existing
 * fc-transaction-service.ts format are incompatible. See
 * docs/adr/ADR-004-reference-encoding.md for the open decision.
 *
 * This file declares the v1.0 target API. Once ADR-004 is closed, the
 * implementation lands here and gets paired test fixtures in Rust
 * (apps/merchant-backend/src/services/reference.rs).
 */
import { NotImplementedError } from '../index.js';

export type Purpose = 'RETAIL' | 'RESTAURANT' | 'EVENT' | 'SERVICE' | 'REFUND';

export interface ReferenceInput {
  /** Exactly 8 chars, alphanumeric. Allocation strategy TBD in ADR-004. */
  merchantId: string;
  /** Exactly 12 chars, alphanumeric, unique per merchant. */
  orderId: string;
  purpose: Purpose;
  itemCount?: number;
  vatMicroUnits?: bigint;
  discountMicroUnits?: bigint;
  /** Required when purpose === 'REFUND'. The UETR of the original tx. */
  refundOf?: string;
}

/** Encode into a remittance string ≤140 chars. Throws if validation
 *  fails or the result would exceed 140 chars. */
export function encode(_input: ReferenceInput): string {
  throw new NotImplementedError('reference.encode()', 'ADR-004');
}

/** Decode a remittance string back into the structured form. Returns
 *  null when the string isn't in a recognised format (e.g. it's a
 *  free-text remittance from an external sender). */
export function decode(_remittance: string): ReferenceInput | null {
  throw new NotImplementedError('reference.decode()', 'ADR-004');
}
