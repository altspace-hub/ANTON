/**
 * wallet.test.ts — Phase 0.1 conformance suite.
 *
 * Loads the JSON vectors emitted by
 *   futurechain/src/bin/generate_conformance_vectors.rs
 * and asserts byte-equality for every field of every derivation:
 *   • BIP-39 mnemonic → 64-byte seed (PBKDF2-HMAC-SHA512, empty passphrase)
 *   • HD derivation   → 32-byte Ed25519 secret key
 *   • Secret key      → 32-byte public key (Ed25519)
 *   • Public key      → fc_ address (Base58(0x46 ‖ SHA-256(pub)[0:20] ‖ dSHA-256[0:4]))
 *   • Sign(message)   → 64-byte signature (Ed25519 RFC 8032)
 *
 * If any field diverges, the Phase-1 "byte-exact or fail" requirement is
 * violated → Phase 1 deliverable doesn't ship.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  addressFromPublicKey,
  hdDeriveKey,
  seedPhraseFromMnemonic,
  sign,
  verify,
  walletFromPrivateKey,
  walletFromSeedPhrase,
  generateSeedPhrase,
  createWallet,
} from './index.js';

// ───────────────────────────────────────────────────────────────────────
// Load the vectors file (emitted by the Rust binary)
// ───────────────────────────────────────────────────────────────────────

interface Derivation {
  account: number;
  index: number;
  priv_key_hex: string;
  pub_key_hex: string;
  address: string;
  signature_hex: string;
}
interface VectorEntry {
  name: string;
  mnemonic_24: string;
  seed_hex: string;
  test_message_utf8: string;
  derivations: Derivation[];
}
interface VectorsFile {
  schema_version: number;
  generated_by: string;
  purpose: string;
  warning: string;
  vectors: VectorEntry[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const VECTORS_PATH = resolve(HERE, '../../test-vectors/conformance.v1.json');

const file: VectorsFile = JSON.parse(readFileSync(VECTORS_PATH, 'utf8'));
// v1 = wallet-only vectors. v2 = wallet + tx-signing vectors (Phase 1 pacs008
// module). Both are wallet-test-compatible; pacs008.test.ts requires v2.
if (file.schema_version < 1 || file.schema_version > 2) {
  throw new Error(`vectors schema_version ${file.schema_version} unsupported — regenerate`);
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hex length ${hex.length} not even`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

const TEST_MESSAGE = new TextEncoder().encode(
  'futurechain-sdk-phase-0.1-conformance-test-message-v1',
);

// ───────────────────────────────────────────────────────────────────────
// Conformance suite — one describe per vector × one it per derivation
// ───────────────────────────────────────────────────────────────────────

for (const v of file.vectors) {
  describe(`Phase 0.1 conformance — ${v.name}`, () => {
    it('mnemonic parses + produces the canonical 64-byte BIP-39 seed', () => {
      const phrase = seedPhraseFromMnemonic(v.mnemonic_24);
      expect(phrase.seed.length).toBe(64);
      expect(bytesToHex(phrase.seed)).toBe(v.seed_hex);
    });

    it('test_message_utf8 matches the canonical sign target', () => {
      expect(v.test_message_utf8).toBe(
        'futurechain-sdk-phase-0.1-conformance-test-message-v1',
      );
    });

    for (const d of v.derivations) {
      describe(`derivation account=${d.account} index=${d.index}`, () => {
        it('HD derives the canonical 32-byte Ed25519 secret', () => {
          const phrase = seedPhraseFromMnemonic(v.mnemonic_24);
          const priv = hdDeriveKey(phrase.seed, d.account, d.index);
          expect(priv.length).toBe(32);
          expect(bytesToHex(priv)).toBe(d.priv_key_hex);
        });

        it('secret → public matches the canonical pubkey', () => {
          const priv = hexToBytes(d.priv_key_hex);
          const w = walletFromPrivateKey(priv);
          expect(w.publicKey.length).toBe(32);
          expect(bytesToHex(w.publicKey)).toBe(d.pub_key_hex);
        });

        it('public key → fc_ address matches the canonical', () => {
          const pub = hexToBytes(d.pub_key_hex);
          expect(addressFromPublicKey(pub)).toBe(d.address);
        });

        it('walletFromSeedPhrase round-trips to the canonical address', () => {
          const phrase = seedPhraseFromMnemonic(v.mnemonic_24);
          const w = walletFromSeedPhrase(phrase, d.account, d.index);
          expect(bytesToHex(w.privateKey)).toBe(d.priv_key_hex);
          expect(bytesToHex(w.publicKey)).toBe(d.pub_key_hex);
          expect(w.address).toBe(d.address);
        });

        it('sign(test_message) produces the canonical 64-byte signature', () => {
          const priv = hexToBytes(d.priv_key_hex);
          const w = walletFromPrivateKey(priv);
          const sig = sign(w, TEST_MESSAGE);
          expect(sig.length).toBe(64);
          expect(bytesToHex(sig)).toBe(d.signature_hex);
        });

        it('verify(sig, message, pub) round-trips', () => {
          const sig = hexToBytes(d.signature_hex);
          const pub = hexToBytes(d.pub_key_hex);
          expect(verify(sig, TEST_MESSAGE, pub)).toBe(true);
          // Negative — mutated message must not verify.
          const tampered = new Uint8Array(TEST_MESSAGE);
          tampered[0] ^= 0xff;
          expect(verify(sig, tampered, pub)).toBe(false);
        });
      });
    }
  });
}

// ───────────────────────────────────────────────────────────────────────
// Smoke tests — properties that don't depend on the vectors
// ───────────────────────────────────────────────────────────────────────

describe('wallet — smoke tests', () => {
  it('createWallet produces a usable mnemonic + wallet', () => {
    const { wallet, mnemonic } = createWallet();
    expect(mnemonic.split(/\s+/).length).toBe(24);
    expect(wallet.privateKey.length).toBe(32);
    expect(wallet.publicKey.length).toBe(32);
    expect(wallet.address.startsWith('fc_')).toBe(true);

    // The signature for an arbitrary message must verify against the wallet's pubkey.
    const msg = new TextEncoder().encode('smoke-test-' + Math.random());
    const sig = sign(wallet, msg);
    expect(verify(sig, msg, wallet.publicKey)).toBe(true);
  });

  it('generateSeedPhrase / walletFromSeedPhrase produce a stable wallet', () => {
    const phrase = generateSeedPhrase();
    const w1 = walletFromSeedPhrase(phrase, 0, 0);
    const w2 = walletFromSeedPhrase(phrase, 0, 0);
    expect(w1.address).toBe(w2.address);
    expect(bytesToHex(w1.publicKey)).toBe(bytesToHex(w2.publicKey));
  });

  it('addressFromPublicKey rejects a wrong-length input', () => {
    expect(() => addressFromPublicKey(new Uint8Array(31))).toThrow(/expected 32-byte/);
    expect(() => addressFromPublicKey(new Uint8Array(33))).toThrow(/expected 32-byte/);
  });

  it('hdDeriveKey rejects out-of-range account/index', () => {
    const seed = new Uint8Array(64);
    expect(() => hdDeriveKey(seed, -1, 0)).toThrow(/account/);
    expect(() => hdDeriveKey(seed, 0xffff_ffff + 1, 0)).toThrow(/account/);
    expect(() => hdDeriveKey(seed, 0, -1)).toThrow(/index/);
  });

  it('seedPhraseFromMnemonic rejects an invalid checksum', () => {
    // Replace the last word — checksum will fail.
    const bad =
      'abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon abandon abandon abandon abandon abandon abandon abandon ' +
      'abandon abandon abandon abandon abandon abandon abandon abandon';
    expect(() => seedPhraseFromMnemonic(bad)).toThrow(/invalid BIP-39/);
  });

  it('verify rejects a signature of wrong length', () => {
    expect(verify(new Uint8Array(63), new Uint8Array(1), new Uint8Array(32))).toBe(false);
    expect(verify(new Uint8Array(65), new Uint8Array(1), new Uint8Array(32))).toBe(false);
  });
});
