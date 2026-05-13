/**
 * delegation/ — Settlement delegation envelope: encode, sign, verify.
 *
 * Status: BLOCKED on ADR-005. The envelope format (EIP-712 vs domain-
 * separated SHA-256 vs PACS.008-as-envelope) is not yet decided.
 * Recommendation is Option 4 (custom domain-separated SHA-256). See
 * docs/adr/ADR-005-delegation-envelope.md.
 *
 * Once ADR-005 is closed, this module gets:
 *   1. encode(payload): Uint8Array — canonical bytes to sign
 *   2. sign(payload, wallet): Uint8Array — full signed envelope
 *   3. verify(envelope, expectedAddress): boolean
 * The Rust counterpart in apps/merchant-backend/src/services/delegation.rs
 * must produce bit-identical bytes for the same payload.
 */
import { NotImplementedError } from '../index.js';

export interface SettlementDelegation {
  merchantId: string;
  walletAddress: string;
  /** Pre-authorised receiving address — usually a Safello sub-account. */
  safelloReceivingAddress: string;
  /** Daily settlement cap in micro-FTC. */
  maxPerDayMicroFtc: bigint;
  /** Unix timestamp after which the delegation is invalid. Rotate every 90d. */
  validUntil: number;
  /** Unique per delegation; prevents replay. */
  nonce: string;
}

export interface SignedDelegation {
  payload: SettlementDelegation;
  signature: Uint8Array;
  /** Optional copy of the signer's address for debug/audit; the
   *  signature itself is the only source of truth. */
  signerAddress?: string;
}

export function encode(_payload: SettlementDelegation): Uint8Array {
  throw new NotImplementedError('delegation.encode()', 'ADR-005');
}

export function sign(
  _payload: SettlementDelegation,
  _privateKey: Uint8Array,
): SignedDelegation {
  throw new NotImplementedError('delegation.sign()', 'ADR-005');
}

export function verify(
  _envelope: SignedDelegation,
  _expectedSignerAddress: string,
): boolean {
  throw new NotImplementedError('delegation.verify()', 'ADR-005');
}
