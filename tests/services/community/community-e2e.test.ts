/**
 * community-e2e.test.ts — X25519 ECDH + AES-256-GCM round-trip tests
 * for the Community pillar's E2E layer.
 *
 * Pure crypto operations — no DB needed for the keypair / encrypt /
 * decrypt path.
 */

import { describe, it, expect } from 'vitest';
import {
  generateX25519Keypair,
  deriveSharedSecret,
  encryptMessage,
  decryptMessage,
} from '../../../server/services/community-e2e.js';

describe('generateX25519Keypair', () => {
  it('produces hex-encoded public + private keys', () => {
    const kp = generateX25519Keypair();
    expect(kp.publicKeyHex).toMatch(/^[0-9a-f]+$/);
    expect(kp.privateKeyHex).toMatch(/^[0-9a-f]+$/);
    expect(kp.publicKeyHex.length).toBeGreaterThan(0);
    expect(kp.privateKeyHex.length).toBeGreaterThan(0);
  });

  it('produces distinct keypairs each call', () => {
    const a = generateX25519Keypair();
    const b = generateX25519Keypair();
    expect(a.publicKeyHex).not.toBe(b.publicKeyHex);
    expect(a.privateKeyHex).not.toBe(b.privateKeyHex);
  });
});

describe('deriveSharedSecret', () => {
  it('two parties derive the same secret (DH commutativity)', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();

    const aliceShared = deriveSharedSecret(alice.privateKeyHex, bob.publicKeyHex);
    const bobShared = deriveSharedSecret(bob.privateKeyHex, alice.publicKeyHex);

    expect(aliceShared.toString('hex')).toBe(bobShared.toString('hex'));
  });

  it('different peers produce different shared secrets', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();
    const charlie = generateX25519Keypair();

    const ab = deriveSharedSecret(alice.privateKeyHex, bob.publicKeyHex);
    const ac = deriveSharedSecret(alice.privateKeyHex, charlie.publicKeyHex);

    expect(ab.toString('hex')).not.toBe(ac.toString('hex'));
  });
});

describe('encryptMessage / decryptMessage round-trip', () => {
  function newSecret(): Buffer {
    const a = generateX25519Keypair();
    const b = generateX25519Keypair();
    return deriveSharedSecret(a.privateKeyHex, b.publicKeyHex);
  }

  it('round-trips a simple message', () => {
    const secret = newSecret();
    const env = encryptMessage('hello world', secret);
    const decrypted = decryptMessage(env, secret);
    expect(decrypted).toBe('hello world');
  });

  it('produces fresh salt + iv per call (forward secrecy)', () => {
    const secret = newSecret();
    const a = encryptMessage('same message', secret);
    const b = encryptMessage('same message', secret);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('round-trips with AAD binding', () => {
    const secret = newSecret();
    const aad = 'sender:alice,recipient:bob,thread:42';
    const env = encryptMessage('confidential', secret, aad);
    expect(env.aadHash).toBeDefined();
    const decrypted = decryptMessage(env, secret, aad);
    expect(decrypted).toBe('confidential');
  });

  it('rejects decryption when AAD differs (auth tag failure)', () => {
    const secret = newSecret();
    const env = encryptMessage('message', secret, 'aad-original');
    expect(() => decryptMessage(env, secret, 'aad-tampered')).toThrow();
  });

  it('rejects decryption with wrong shared secret', () => {
    const sec1 = newSecret();
    const sec2 = newSecret();
    const env = encryptMessage('message', sec1);
    expect(() => decryptMessage(env, sec2)).toThrow();
  });

  it('round-trips empty string', () => {
    const secret = newSecret();
    const env = encryptMessage('', secret);
    expect(decryptMessage(env, secret)).toBe('');
  });

  it('round-trips multibyte unicode', () => {
    const secret = newSecret();
    const msg = 'こんにちは 🌍 — مرحبا — Привет';
    const env = encryptMessage(msg, secret);
    expect(decryptMessage(env, secret)).toBe(msg);
  });
});
