/**
 * delegation/ — Settlement delegation: encode, sign, verify.
 *
 * Status: UNBLOCKED. ADR-005 closed 2026-05-14 with Option 4 (domain-
 * separated SHA-256 envelope, recoverable secp256k1 signature).
 *
 * The verifier in apps/merchant-backend/src/services/delegation.rs MUST
 * produce bit-identical canonical JSON for the same payload. Parity
 * test fixtures land in sprint 1 task 2 at
 * anton-business/tests/fixtures/delegation/.
 *
 * See docs/adr/ADR-005-delegation-envelope.md for the full envelope spec.
 */
import { NotImplementedError } from '../index.js';

/** Domain separation tag from ADR-005. Bumped to `v2` if the envelope
 *  format (NOT the payload schema) changes — see the ADR for the
 *  distinction. */
export const DELEGATION_DOMAIN = 'anton-business:settlement-delegation:v1';

/** The signed payload — spec §12.3. */
export interface SettlementDelegation {
  /** 8-char merchant ID per ADR-004 v1 allocation. */
  merchantId: string;
  /** Merchant's FutureChain address. The recovered signer MUST match. */
  walletAddress: string;
  /** Pre-authorised receiving address — usually a Safello sub-account. */
  safelloReceivingAddress: string;
  /** Daily settlement cap in micro-FTC. Set to 0n to revoke. */
  maxPerDayMicroFtc: bigint;
  /** Unix timestamp (seconds) after which the delegation is invalid.
   *  Spec §12.3: rotate every 90 days. */
  validUntil: number;
  /** Unique per delegation; replay-protection. UUIDv4 recommended. */
  nonce: string;
}

/** The wire envelope. `signature` is `0x`-prefixed hex of a 65-byte
 *  recoverable signature (64 bytes r||s plus 1 byte recovery id). */
export interface SignedDelegation {
  schemaVersion: 'v1';
  payload: SettlementDelegation;
  signature: string;
}

/** Errors from the verify path. */
export type DelegationError =
  | { kind: 'schema_unknown'; got: string }
  | { kind: 'malformed_signature'; reason: string }
  | { kind: 'malformed_payload'; field: string; reason: string }
  | { kind: 'signer_mismatch'; expected: string; recovered: string }
  | { kind: 'expired'; validUntil: number; now: number };

/** Build the bytes that get hashed. Exported for testing + parity
 *  fixture generation. Combines DELEGATION_DOMAIN, a 0x0a separator,
 *  and the canonical JSON of the payload. */
export function buildHashInput(_payload: SettlementDelegation): Uint8Array {
  throw new NotImplementedError('delegation.buildHashInput()');
}

/** Sign a SettlementDelegation. Returns the full wire envelope. The
 *  private key must be a 32-byte secp256k1 scalar. Caller is
 *  responsible for zeroing the key buffer after this returns. */
export function sign(
  _payload: SettlementDelegation,
  _privateKey: Uint8Array,
): SignedDelegation {
  throw new NotImplementedError('delegation.sign()');
}

/** Recover the signer's FutureChain address from a SignedDelegation.
 *  Does NOT check expiry or nonce-reuse — those are policy decisions
 *  the caller (merchant-backend) makes against its DB. */
export function recoverSigner(_envelope: SignedDelegation): { address: string } | DelegationError {
  throw new NotImplementedError('delegation.recoverSigner()');
}

/** Verify that `envelope` is a well-formed signature over its payload
 *  AND that the recovered signer matches `payload.walletAddress`.
 *  Returns true | DelegationError. Does NOT check expiry / nonce. */
export function verifySignature(_envelope: SignedDelegation): true | DelegationError {
  throw new NotImplementedError('delegation.verifySignature()');
}
