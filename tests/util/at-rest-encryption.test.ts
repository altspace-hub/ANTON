/**
 * at-rest-encryption.test.ts — Phase B3 (per-wallet envelope) covers.
 *
 * Verifies:
 *   • encryptForContext / decryptForContext round-trip.
 *   • Different contexts produce DIFFERENT ciphertexts under the same
 *     plaintext + master (i.e. the PBKDF2 derivation actually disjoins
 *     wallets).
 *   • decryptForContext rejects (a) tampered ciphertext (auth tag) and
 *     (b) the wrong context (would derive a different key).
 *   • decryptVersioned routes v1 to legacy decryptBlob and v2 to
 *     decryptForContext.
 *   • Missing master env key → encrypt returns null, decrypt throws.
 *
 * Uses a fixed 32-byte master key set into INSTANCE_KEY_ENCRYPTION_KEY
 * before each test and cleared after.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  decryptBlob,
  decryptForContext,
  decryptVersioned,
  deriveContextKey,
  encryptBlob,
  encryptForContext,
  fcWalletContext,
} from '../../server/util/at-rest-encryption.js';

const KEY_HEX = 'a'.repeat(64); // 32 bytes of 0xaa
const OTHER_KEY_HEX = 'b'.repeat(64);

describe('at-rest-encryption — Phase B3 envelope', () => {
  beforeEach(() => {
    process.env['INSTANCE_KEY_ENCRYPTION_KEY'] = KEY_HEX;
  });
  afterEach(() => {
    delete process.env['INSTANCE_KEY_ENCRYPTION_KEY'];
  });

  it('round-trips encryptForContext / decryptForContext', () => {
    const ctx = fcWalletContext('fcw_test_1');
    const pt = Buffer.from('hello world', 'utf8');
    const e = encryptForContext(pt, ctx);
    expect(e).not.toBeNull();
    expect(e!.keyVersion).toBe(2);
    expect(e!.iv).toHaveLength(12);
    const back = decryptForContext(e!.encrypted, e!.iv, ctx);
    expect(back.toString('utf8')).toBe('hello world');
  });

  it('different contexts derive different keys', () => {
    const k1 = deriveContextKey(fcWalletContext('fcw_a'));
    const k2 = deriveContextKey(fcWalletContext('fcw_b'));
    expect(k1).not.toBeNull();
    expect(k2).not.toBeNull();
    expect(Buffer.compare(k1!, k2!)).not.toBe(0);
  });

  it('different contexts produce different ciphertexts for same plaintext', () => {
    const pt = Buffer.from('uniform secret', 'utf8');
    const a = encryptForContext(pt, fcWalletContext('fcw_a'))!;
    const b = encryptForContext(pt, fcWalletContext('fcw_b'))!;
    // Different IVs alone would already differ; this also verifies
    // that decrypting cross-wallet fails (next test).
    expect(Buffer.compare(a.encrypted, b.encrypted)).not.toBe(0);
  });

  it('decryptForContext rejects cross-wallet ciphertext', () => {
    const pt = Buffer.from('private to A', 'utf8');
    const a = encryptForContext(pt, fcWalletContext('fcw_a'))!;
    expect(() =>
      decryptForContext(a.encrypted, a.iv, fcWalletContext('fcw_b')),
    ).toThrow();
  });

  it('decryptForContext rejects tampered ciphertext', () => {
    const ctx = fcWalletContext('fcw_x');
    const pt = Buffer.from('do not tamper', 'utf8');
    const e = encryptForContext(pt, ctx)!;
    const tampered = Buffer.from(e.encrypted);
    tampered[0] ^= 0x01;
    expect(() => decryptForContext(tampered, e.iv, ctx)).toThrow();
  });

  it('decryptVersioned routes v1 → legacy decryptBlob', () => {
    // Legacy path: encryptBlob (no context derivation).
    const pt = Buffer.from('v1 ciphertext', 'utf8');
    const e = encryptBlob(pt)!;
    expect(e).not.toBeNull();
    const back = decryptVersioned(e.encrypted, e.iv, 1, fcWalletContext('fcw_irrelevant'));
    expect(back.toString('utf8')).toBe('v1 ciphertext');
  });

  it('decryptVersioned routes v2 → decryptForContext (context required)', () => {
    const ctx = fcWalletContext('fcw_y');
    const pt = Buffer.from('v2 ciphertext', 'utf8');
    const e = encryptForContext(pt, ctx)!;
    const back = decryptVersioned(e.encrypted, e.iv, 2, ctx);
    expect(back.toString('utf8')).toBe('v2 ciphertext');
    // Wrong context: should throw on v2.
    expect(() =>
      decryptVersioned(e.encrypted, e.iv, 2, fcWalletContext('fcw_OTHER')),
    ).toThrow();
  });

  it('different master keys can both produce v2 ciphertexts that survive their own round-trip', () => {
    const ctx = fcWalletContext('fcw_z');
    const pt = Buffer.from('per master key', 'utf8');
    const e1 = encryptForContext(pt, ctx)!;
    // Swap master key, decryption with new master MUST FAIL.
    process.env['INSTANCE_KEY_ENCRYPTION_KEY'] = OTHER_KEY_HEX;
    expect(() => decryptForContext(e1.encrypted, e1.iv, ctx)).toThrow();
    // Encrypt under the second master.
    const e2 = encryptForContext(pt, ctx)!;
    expect(decryptForContext(e2.encrypted, e2.iv, ctx).toString('utf8')).toBe('per master key');
    // And the first ciphertext is still recoverable under the first
    // master.
    process.env['INSTANCE_KEY_ENCRYPTION_KEY'] = KEY_HEX;
    expect(decryptForContext(e1.encrypted, e1.iv, ctx).toString('utf8')).toBe('per master key');
  });

  it('missing master key → encrypt returns null, decrypt throws', () => {
    delete process.env['INSTANCE_KEY_ENCRYPTION_KEY'];
    expect(encryptForContext(Buffer.from('x'), fcWalletContext('fcw_x'))).toBeNull();
    expect(() => decryptForContext(Buffer.alloc(17), Buffer.alloc(12), fcWalletContext('fcw_x'))).toThrow();
    // Legacy path also fails to encrypt with missing key.
    expect(encryptBlob(Buffer.from('x'))).toBeNull();
    expect(() => decryptBlob(Buffer.alloc(17), Buffer.alloc(12))).toThrow();
  });
});
