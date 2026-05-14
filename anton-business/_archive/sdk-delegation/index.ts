/**
 * delegation/ — Settlement delegation: encode, sign, verify.
 *
 * Implements ADR-005. See docs/adr/ADR-005-delegation-envelope.md for
 * the canonical envelope spec.
 *
 * Three things to keep byte-stable for cross-language parity:
 *   1. Domain tag (DELEGATION_DOMAIN constant).
 *   2. Canonical JSON serialisation (canonicalise function below).
 *   3. Recoverable secp256k1 signature layout: 64 bytes (r||s) + 1
 *      byte recovery id.
 *
 * Hashing: @noble/curves' secp256k1 uses SHA-256 as its prehash by
 * default, which matches ADR-005's choice. We pass the raw input bytes
 * to sign() / recoverPublicKey() and let the library hash — no explicit
 * sha256() call needed. This keeps the two sides easy to align.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { addressFromPublicKey } from '../wallet/index.js';

/** Domain separation tag per ADR-005. The `v1` suffix is the envelope
 *  version, NOT the payload schema version. */
export const DELEGATION_DOMAIN = 'anton-business:settlement-delegation:v1';

export interface SettlementDelegation {
  merchantId: string;
  walletAddress: string;
  safelloReceivingAddress: string;
  maxPerDayMicroFtc: bigint;
  validUntil: number;
  nonce: string;
}

export interface SignedDelegation {
  schemaVersion: 'v1';
  payload: SettlementDelegation;
  /** 0x-prefixed hex of the 65-byte recoverable signature (r||s||recId). */
  signature: string;
}

export type DelegationError =
  | { kind: 'schema_unknown'; got: string }
  | { kind: 'malformed_signature'; reason: string }
  | { kind: 'malformed_payload'; field: string; reason: string }
  | { kind: 'signer_mismatch'; expected: string; recovered: string }
  | { kind: 'expired'; validUntil: number; now: number };

// ── Canonical JSON ────────────────────────────────────────────────────

function canonicalise(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonical JSON: non-finite number ${value}`);
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    throw new Error('canonical JSON: bigint must be string-converted by caller');
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalise).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalise(obj[k]));
    return '{' + parts.join(',') + '}';
  }
  throw new Error(`canonical JSON: unsupported type ${typeof value}`);
}

// ── Hash input ───────────────────────────────────────────────────────

const enc = new TextEncoder();

/** Build the bytes that get hashed: domain || 0x0a || canonical_json(payload).
 *  The secp256k1 sign/verify path applies SHA-256 to this internally. */
export function buildHashInput(payload: SettlementDelegation): Uint8Array {
  const wire: Record<string, unknown> = {
    maxPerDayMicroFtc: payload.maxPerDayMicroFtc.toString(),
    merchantId: payload.merchantId,
    nonce: payload.nonce,
    safelloReceivingAddress: payload.safelloReceivingAddress,
    validUntil: payload.validUntil,
    walletAddress: payload.walletAddress,
  };
  const body = enc.encode(canonicalise(wire));
  const domain = enc.encode(DELEGATION_DOMAIN);
  const out = new Uint8Array(domain.length + 1 + body.length);
  out.set(domain, 0);
  out[domain.length] = 0x0a;
  out.set(body, domain.length + 1);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const byte of b) s += byte.toString(16).padStart(2, '0');
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error('hex string has odd length');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex at position ${i * 2}`);
    out[i] = byte;
  }
  return out;
}

// ── Sign + verify ─────────────────────────────────────────────────────

/** Sign a SettlementDelegation. Returns the full wire envelope.
 *  Private key must be a 32-byte secp256k1 scalar. */
export function sign(payload: SettlementDelegation, privateKey: Uint8Array): SignedDelegation {
  if (privateKey.length !== 32) {
    throw new Error('private key must be 32 bytes');
  }
  // Hash explicitly (prehash: false) rather than rely on the library's
  // default prehash behaviour, which has surprised us once already.
  // ADR-005 specifies SHA-256 so we always reach for it directly.
  const msgHash = sha256(buildHashInput(payload));
  const sig = secp256k1.sign(msgHash, privateKey, { prehash: false });
  if (sig.recovery === undefined || sig.recovery === null) {
    throw new Error('signature missing recovery id');
  }
  // Build r||s||recId ourselves rather than rely on toBytes('recovered'),
  // which puts recovery FIRST (Bitcoin-style header byte). The Ethereum-
  // style layout (recId LAST) is what we documented in ADR-005.
  const compact = sig.toBytes('compact'); // 64 bytes r||s
  const sigBytes = new Uint8Array(65);
  sigBytes.set(compact, 0);
  sigBytes[64] = sig.recovery;
  return {
    schemaVersion: 'v1',
    payload,
    signature: '0x' + bytesToHex(sigBytes),
  };
}

/** Recover the signer's FutureChain address from a SignedDelegation.
 *  Does NOT validate expiry/nonce — those are policy decisions for the
 *  backend to make against its DB. */
export function recoverSigner(envelope: SignedDelegation): { address: string } | DelegationError {
  if (envelope.schemaVersion !== 'v1') {
    return { kind: 'schema_unknown', got: envelope.schemaVersion };
  }
  let sigBytes: Uint8Array;
  try {
    sigBytes = hexToBytes(envelope.signature);
  } catch (err) {
    return { kind: 'malformed_signature', reason: (err as Error).message };
  }
  if (sigBytes.length !== 65) {
    return { kind: 'malformed_signature', reason: `expected 65 bytes, got ${sigBytes.length}` };
  }
  const recId = sigBytes[64]!;
  if (recId !== 0 && recId !== 1) {
    return { kind: 'malformed_signature', reason: `invalid recovery id ${recId}` };
  }

  let msgHash: Uint8Array;
  try {
    // `sign()` prehashes with SHA-256 by default for secp256k1, but
    // `Signature.recoverPublicKey()` takes an already-hashed message.
    // We compute the hash explicitly here so the two sides line up.
    msgHash = sha256(buildHashInput(envelope.payload));
  } catch (err) {
    return { kind: 'malformed_payload', field: 'payload', reason: (err as Error).message };
  }

  let pubBytes: Uint8Array;
  try {
    const compact = sigBytes.slice(0, 64);
    const sig = secp256k1.Signature.fromBytes(compact, 'compact').addRecoveryBit(recId);
    pubBytes = sig.recoverPublicKey(msgHash).toBytes(false); // 65 bytes uncompressed
  } catch (err) {
    return { kind: 'malformed_signature', reason: (err as Error).message };
  }

  return { address: addressFromPublicKey(pubBytes) };
}

/** Verify the signature recovers to `payload.walletAddress`. Does NOT
 *  check expiry/nonce. */
export function verifySignature(envelope: SignedDelegation): true | DelegationError {
  const r = recoverSigner(envelope);
  if ('kind' in r) return r;
  if (r.address !== envelope.payload.walletAddress) {
    return {
      kind: 'signer_mismatch',
      expected: envelope.payload.walletAddress,
      recovered: r.address,
    };
  }
  return true;
}
