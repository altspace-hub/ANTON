/**
 * handshake.test.ts — the mutual-handshake security core. Proves that a seller's
 * signed proof is only accepted when (a) it is signed by the PINNED key, (b) over
 * the FRESH issued nonce (anti-replay), and (c) the signature actually verifies.
 * Uses real Ed25519 keys + the production signCanonical/verifyCanonical.
 */
import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { DatabaseAdapter } from '../../../server/db/database.js';
import { signCanonical, verifyCanonical } from '../../../server/lib/portal-crypto.js';
import { recordHandshakeResult } from '../../../server/services/trusted-stores/trusted-seller-service.js';

function genKeypair(): { pubHex: string; privPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { pubHex: Buffer.from(publicKey).toString('hex'), privPem: privateKey as string };
}

function signedProof(pubHex: string, privPem: string, nonce: string) {
  const signedPayload = {
    kind: 'trust-handshake', nonce, buyerContactHash: 'buyer', portalAddress: 'shop.global.portal',
    ts: 1_700_000_000_000, signingPubkeyHex: pubHex,
  };
  return { signature: signCanonical(signedPayload, privPem), signedPayload, signingPubkeyHex: pubHex };
}

function fakeDb(pinnedPubHex: string, pinnedNonce: string | null): DatabaseAdapter {
  const now = new Date('2026-06-22T00:00:00Z').toISOString();
  const row = {
    id: 'r1', portal_address: 'shop.global.portal', display_title: 'Shop', contact_hash: null,
    signing_pubkey_hex: pinnedPubHex, signing_key_fingerprint: 'fp', status: 'pinned',
    verification_method: 'descriptor-tofu', descriptor_sig_verified: false,
    last_handshake_nonce: pinnedNonce, verified_at: null, last_checked_at: null,
    key_changed_at: null, previous_pubkey_hex: null, created_at: now, updated_at: now,
  };
  return {
    get: (async (sql: string) => (sql.includes('FROM trusted_sellers') ? row : undefined)) as DatabaseAdapter['get'],
    all: (async () => []) as DatabaseAdapter['all'],
    run: (async () => ({ changes: 1 })) as DatabaseAdapter['run'],
  } as unknown as DatabaseAdapter;
}

describe('mutual handshake — primitive crypto', () => {
  it('a valid proof verifies against the pinned key', () => {
    const k = genKeypair();
    const p = signedProof(k.pubHex, k.privPem, 'nonce1');
    expect(verifyCanonical(p.signedPayload, p.signature, k.pubHex)).toBe(true);
  });
  it('a tampered payload fails (signature binds every field)', () => {
    const k = genKeypair();
    const p = signedProof(k.pubHex, k.privPem, 'nonce1');
    const tampered = { ...p.signedPayload, nonce: 'EVIL' };
    expect(verifyCanonical(tampered, p.signature, k.pubHex)).toBe(false);
  });
  it('a different key fails', () => {
    const k = genKeypair(); const other = genKeypair();
    const p = signedProof(k.pubHex, k.privPem, 'nonce1');
    expect(verifyCanonical(p.signedPayload, p.signature, other.pubHex)).toBe(false);
  });
});

describe('recordHandshakeResult — composition (key + nonce + sig)', () => {
  it('accepts a proof signed by the pinned key over the issued nonce', async () => {
    const k = genKeypair();
    const proof = signedProof(k.pubHex, k.privPem, 'issued-nonce');
    const r = await recordHandshakeResult(fakeDb(k.pubHex, 'issued-nonce'), 'solo', 'shop.global.portal', proof);
    expect(r.verified).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects a REPLAY (old nonce ≠ the freshly issued one)', async () => {
    const k = genKeypair();
    const proof = signedProof(k.pubHex, k.privPem, 'OLD-nonce'); // validly signed, but stale
    const r = await recordHandshakeResult(fakeDb(k.pubHex, 'NEW-nonce'), 'solo', 'shop.global.portal', proof);
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('nonce-mismatch');
  });

  it('rejects a proof signed by a DIFFERENT key than the pin (key swap)', async () => {
    const pinned = genKeypair(); const attacker = genKeypair();
    const proof = signedProof(attacker.pubHex, attacker.privPem, 'issued-nonce');
    const r = await recordHandshakeResult(fakeDb(pinned.pubHex, 'issued-nonce'), 'solo', 'shop.global.portal', proof);
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('key-mismatch');
  });

  it('rejects a forged/mismatched signature (tampered signed field, key+nonce still match)', async () => {
    const k = genKeypair();
    const proof = signedProof(k.pubHex, k.privPem, 'issued-nonce');
    proof.signedPayload.ts = 1; // tamper a SIGNED field → the signature no longer matches the payload
    const r = await recordHandshakeResult(fakeDb(k.pubHex, 'issued-nonce'), 'solo', 'shop.global.portal', proof);
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('signature-invalid');
  });
});
