/**
 * delegation.test.ts — coverage for the SHA-256 + recoverable-secp256k1
 * settlement delegation envelope per ADR-005. The Rust counterpart in
 * apps/merchant-backend/src/services/delegation.rs must produce
 * bit-identical canonical bytes for the same payload.
 */
import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  buildHashInput,
  sign,
  recoverSigner,
  verifySignature,
  DELEGATION_DOMAIN,
  type SettlementDelegation,
  type SignedDelegation,
} from './index.js';
import { addressFromPublicKey } from '../wallet/index.js';

// Deterministic test wallet — fixed private key so fixture comparisons
// across runs are stable.
const TEST_PRIV = new Uint8Array(32);
for (let i = 0; i < 32; i++) TEST_PRIV[i] = i + 1; // 0x01..0x20

const TEST_PUB = secp256k1.getPublicKey(TEST_PRIV, false); // 65 bytes uncompressed
const TEST_ADDR = addressFromPublicKey(TEST_PUB);

function makePayload(over: Partial<SettlementDelegation> = {}): SettlementDelegation {
  return {
    merchantId: 'KTH00001',
    walletAddress: TEST_ADDR,
    safelloReceivingAddress: 'fc_safelloaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    maxPerDayMicroFtc: 1_000_000_000n,
    validUntil: 1_893_456_000,
    nonce: '550e8400-e29b-41d4-a716-446655440000',
    ...over,
  };
}

// ── buildHashInput byte-stability ────────────────────────────────────

describe('buildHashInput', () => {
  it('starts with the domain tag', () => {
    const out = buildHashInput(makePayload());
    const expected = new TextEncoder().encode(DELEGATION_DOMAIN);
    expect(out.slice(0, expected.length)).toEqual(expected);
  });

  it('has a 0x0a byte after the domain', () => {
    const out = buildHashInput(makePayload());
    const expected = new TextEncoder().encode(DELEGATION_DOMAIN);
    expect(out[expected.length]).toBe(0x0a);
  });

  it('produces identical bytes for identical payloads', () => {
    const a = buildHashInput(makePayload());
    const b = buildHashInput(makePayload());
    expect(a).toEqual(b);
  });

  it('canonical JSON is key-sorted (input order does not matter)', () => {
    // We exercise this by constructing the same payload via Object.assign
    // with differently-ordered base objects. JS preserves insertion order
    // in own-key enumeration, so this DOES check key sorting in the
    // canonicaliser, not just in the object.
    const reordered: SettlementDelegation = {
      validUntil: 1_893_456_000,
      nonce: '550e8400-e29b-41d4-a716-446655440000',
      walletAddress: TEST_ADDR,
      safelloReceivingAddress: 'fc_safelloaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      maxPerDayMicroFtc: 1_000_000_000n,
      merchantId: 'KTH00001',
    };
    const a = buildHashInput(makePayload());
    const b = buildHashInput(reordered);
    expect(a).toEqual(b);
  });

  it('encodes bigint maxPerDayMicroFtc as a JSON string', () => {
    const out = buildHashInput(makePayload({ maxPerDayMicroFtc: 1n }));
    const txt = new TextDecoder().decode(out);
    // After the domain + newline, the JSON body must contain
    // "maxPerDayMicroFtc":"1" — quoted, NOT bare 1.
    expect(txt).toContain('"maxPerDayMicroFtc":"1"');
    expect(txt).not.toContain('"maxPerDayMicroFtc":1,');
  });

  it('encodes number validUntil as a JSON number', () => {
    const out = buildHashInput(makePayload({ validUntil: 42 }));
    const txt = new TextDecoder().decode(out);
    expect(txt).toContain('"validUntil":42');
    expect(txt).not.toContain('"validUntil":"42"');
  });

  it('produces different bytes for different payloads', () => {
    const a = buildHashInput(makePayload({ nonce: 'a'.repeat(36) }));
    const b = buildHashInput(makePayload({ nonce: 'b'.repeat(36) }));
    expect(a).not.toEqual(b);
  });
});

// ── sign + verify roundtrip ──────────────────────────────────────────

describe('sign / recoverSigner / verifySignature', () => {
  it('signs a delegation and recovers the signer', () => {
    const env = sign(makePayload(), TEST_PRIV);
    expect(env.schemaVersion).toBe('v1');
    expect(env.signature).toMatch(/^0x[0-9a-f]{130}$/); // 65 bytes hex
    const r = recoverSigner(env);
    expect('address' in r).toBe(true);
    if (!('address' in r)) throw new Error('type narrow');
    expect(r.address).toBe(TEST_ADDR);
  });

  it('verifySignature returns true for a valid envelope', () => {
    const env = sign(makePayload(), TEST_PRIV);
    expect(verifySignature(env)).toBe(true);
  });

  it('verifySignature returns signer_mismatch when walletAddress is wrong', () => {
    const env = sign(makePayload(), TEST_PRIV);
    const tampered: SignedDelegation = {
      ...env,
      payload: { ...env.payload, walletAddress: 'fc_wrongaddress' },
    };
    const r = verifySignature(tampered);
    expect(r).toMatchObject({ kind: 'signer_mismatch', expected: 'fc_wrongaddress' });
  });

  it('verifySignature returns signer_mismatch when payload bytes are tampered (different signer recovered)', () => {
    const env = sign(makePayload(), TEST_PRIV);
    // Change a payload field that affects the hash — the recovered
    // signer will no longer match.
    const tampered: SignedDelegation = {
      ...env,
      payload: { ...env.payload, maxPerDayMicroFtc: 9_999_999_999n },
    };
    const r = verifySignature(tampered);
    expect(r).not.toBe(true);
    if (r === true) throw new Error('type narrow');
    expect(r.kind).toBe('signer_mismatch');
  });

  it('recoverSigner returns schema_unknown for non-v1', () => {
    const env = sign(makePayload(), TEST_PRIV);
    const r = recoverSigner({ ...env, schemaVersion: 'v999' as 'v1' });
    expect(r).toMatchObject({ kind: 'schema_unknown', got: 'v999' });
  });

  it('recoverSigner returns malformed_signature for bad hex', () => {
    const env = sign(makePayload(), TEST_PRIV);
    const r = recoverSigner({ ...env, signature: '0xnothex' });
    expect(r).toMatchObject({ kind: 'malformed_signature' });
  });

  it('recoverSigner returns malformed_signature for wrong-length signature', () => {
    const env = sign(makePayload(), TEST_PRIV);
    const r = recoverSigner({ ...env, signature: '0xab' });
    expect(r).toMatchObject({ kind: 'malformed_signature' });
  });

  it('recoverSigner returns malformed_signature for invalid recovery id', () => {
    const env = sign(makePayload(), TEST_PRIV);
    // Replace last hex byte (recovery id) with 0xff
    const sigNoPrefix = env.signature.slice(2);
    const bad = '0x' + sigNoPrefix.slice(0, -2) + 'ff';
    const r = recoverSigner({ ...env, signature: bad });
    expect(r).toMatchObject({ kind: 'malformed_signature' });
  });

  it('produces a different signature when payload changes', () => {
    const a = sign(makePayload(), TEST_PRIV);
    const b = sign(makePayload({ nonce: 'b'.repeat(36) }), TEST_PRIV);
    expect(a.signature).not.toBe(b.signature);
  });

  it('produces a different signature with a different key', () => {
    const otherPriv = new Uint8Array(32);
    for (let i = 0; i < 32; i++) otherPriv[i] = 0x80 - i;
    const a = sign(makePayload(), TEST_PRIV);
    const otherAddr = addressFromPublicKey(secp256k1.getPublicKey(otherPriv, false));
    const b = sign(makePayload({ walletAddress: otherAddr }), otherPriv);
    expect(a.signature).not.toBe(b.signature);
    // And b is verifiable against its own walletAddress.
    expect(verifySignature(b)).toBe(true);
  });
});

// ── addressFromPublicKey ──────────────────────────────────────────────

describe('addressFromPublicKey', () => {
  it('produces the same address for compressed and uncompressed inputs', () => {
    const compressed = secp256k1.getPublicKey(TEST_PRIV, true); // 33 bytes
    const uncompressed = secp256k1.getPublicKey(TEST_PRIV, false); // 65 bytes
    expect(addressFromPublicKey(compressed)).toBe(addressFromPublicKey(uncompressed));
  });

  it('always returns an fc_-prefixed 43-char string (3 + 40 hex chars)', () => {
    const addr = addressFromPublicKey(TEST_PUB);
    expect(addr).toMatch(/^fc_[0-9a-f]{40}$/);
  });

  it('throws on unexpected key length', () => {
    expect(() => addressFromPublicKey(new Uint8Array(10))).toThrow();
  });
});
