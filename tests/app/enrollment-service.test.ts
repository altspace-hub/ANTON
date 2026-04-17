// Tests for the server-side enrollment service.
// Covers the deterministic helpers + the signature payload contract.

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { enrollmentSignaturePayload } from '../../server/services/app-enrollment-service';

describe('enrollmentSignaturePayload', () => {
  it('joins token, nonce, pubkey with dots', () => {
    expect(enrollmentSignaturePayload('tok', 'non', 'pub')).toBe('tok.non.pub');
  });

  it('round-trips with Ed25519 signing', () => {
    // Generate a keypair, sign the payload, verify.
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex');
    const payload = enrollmentSignaturePayload('TOK-12345', 'NONCE-abcdef', pubHex);
    const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), privateKey);
    const ok = crypto.verify(null, Buffer.from(payload, 'utf8'), publicKey, sig);
    expect(ok).toBe(true);
  });

  it('payload tampering breaks verification', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const sig = crypto.sign(null, Buffer.from('a.b.c', 'utf8'), privateKey);
    const tampered = crypto.verify(null, Buffer.from('a.b.d', 'utf8'), publicKey, sig);
    expect(tampered).toBe(false);
  });

  it('signature with a different key fails verification', () => {
    const a = crypto.generateKeyPairSync('ed25519');
    const b = crypto.generateKeyPairSync('ed25519');
    const sig = crypto.sign(null, Buffer.from('msg', 'utf8'), a.privateKey);
    expect(crypto.verify(null, Buffer.from('msg', 'utf8'), b.publicKey, sig)).toBe(false);
  });
});
