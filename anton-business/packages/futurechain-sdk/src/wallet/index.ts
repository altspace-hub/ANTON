/**
 * wallet/ — FutureChain wallet primitives (Ed25519 + SHA-256 + Base58).
 *
 * Status: IMPLEMENTED (Phase 1 — May 20 2026). Byte-exact against the
 * Rust canonical at `futurechain/src/secure_crypto.rs`:
 *   • SecurePrivateKey / SecurePublicKey  → Ed25519 (ed25519-dalek)
 *   • HDWallet::derive_key                → SHA-256(seed ‖ account_le4 ‖ index_le4)
 *   • SecurePublicKey::to_address         → 'fc_' + Base58(0x46 ‖ SHA-256(pub)[0:20] ‖ dSHA-256[0:4])
 *   • SeedPhrase::to_seed                 → BIP-39 PBKDF2-HMAC-SHA512 (24-word default)
 *
 * Conformance vectors live at `test-vectors/conformance.v1.json` (emitted by
 * `futurechain/src/bin/generate_conformance_vectors.rs`). `wallet.test.ts`
 * asserts byte-equality against every field of every vector.
 *
 * Phase 1 spec: docs/FUTURECHAIN_INTEGRATION_PLAN.md §5 Phase 1.
 *
 * IMPORTANT — the OLD stub here used secp256k1 + Keccak-256 (Ethereum
 * convention, placeholder format). That implementation is GONE. Anyone
 * importing it will get the new shapes.
 */
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { base58 } from '@scure/base';
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

/** A live wallet — privKey + pubKey + address. The private key is a raw
 *  32-byte Ed25519 secret; callers should treat it as sensitive material
 *  (don't log it, don't keep it in long-lived state without zeroising). */
export interface Wallet {
  readonly privateKey: Uint8Array;  // 32 bytes
  readonly publicKey: Uint8Array;   // 32 bytes
  readonly address: string;         // "fc_..."
}

/** A BIP-39 24-word seed phrase + the 64-byte derived seed. */
export interface SeedPhrase {
  readonly mnemonic: string;        // 24-word phrase, space-separated
  readonly seed: Uint8Array;        // 64 bytes (BIP-39 PBKDF2-HMAC-SHA512)
}

// ───────────────────────────────────────────────────────────────────────
// Address derivation — must match secure_crypto.rs:190-199
// ───────────────────────────────────────────────────────────────────────

/** FutureChain address layout (25 bytes total before Base58):
 *
 *     [0x46]                     1 byte   prefix ('F' for FutureChain)
 *     SHA-256(pubkey)[0..20]    20 bytes  truncated pubkey hash
 *     SHA-256(SHA-256(prev))[0..4] 4 bytes checksum
 *
 *  Base58-encoded (Bitcoin alphabet) and prefixed with the literal `fc_`.
 *  Produces a 35-character address like `fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs`.
 *
 *  Input: a 32-byte Ed25519 public key. Older callers that passed
 *  secp256k1 keys will get garbage — there is no compatibility shim. */
export function addressFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(
      `addressFromPublicKey: expected 32-byte Ed25519 public key, got ${publicKey.length} bytes`,
    );
  }
  const pubHash = sha256(publicKey);                  // 32 bytes
  const prefixed = new Uint8Array(1 + 20);
  prefixed[0] = 0x46;                                  // 'F'
  prefixed.set(pubHash.subarray(0, 20), 1);

  const checksum = sha256(sha256(prefixed));          // 32 bytes (double SHA-256)
  const fullPayload = new Uint8Array(prefixed.length + 4);
  fullPayload.set(prefixed, 0);
  fullPayload.set(checksum.subarray(0, 4), prefixed.length);

  return 'fc_' + base58.encode(fullPayload);
}

// ───────────────────────────────────────────────────────────────────────
// HD derivation — must match secure_crypto.rs:303-314
// ───────────────────────────────────────────────────────────────────────

/** FutureChain's non-standard HD derivation. NOT BIP-32.
 *
 *  Input:
 *    seed     64-byte BIP-39 seed (from `mnemonicToSeed`)
 *    account  u32 — typically 0 for the first account
 *    index    u32 — typically 0 for the first address in the account
 *
 *  Output: 32-byte Ed25519 secret key. The Rust side feeds this to
 *  `EdSigningKey::from_bytes` which uses these 32 bytes as the seed for
 *  the standard Ed25519 keygen (curve scalar derivation happens internally
 *  in ed25519-dalek). `@noble/curves/ed25519` does the same with
 *  `ed25519.getPublicKey(privKey)`. */
export function hdDeriveKey(
  seed: Uint8Array,
  account: number,
  index: number,
): Uint8Array {
  if (seed.length !== 64) {
    throw new Error(`hdDeriveKey: expected 64-byte BIP-39 seed, got ${seed.length}`);
  }
  if (!Number.isInteger(account) || account < 0 || account > 0xffff_ffff) {
    throw new Error(`hdDeriveKey: account must be a u32 (0..2^32-1), got ${account}`);
  }
  if (!Number.isInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new Error(`hdDeriveKey: index must be a u32 (0..2^32-1), got ${index}`);
  }
  const buf = new Uint8Array(seed.length + 8);
  buf.set(seed, 0);
  writeU32LE(buf, seed.length, account);
  writeU32LE(buf, seed.length + 4, index);
  return sha256(buf);                                  // 32 bytes — the Ed25519 seed
}

function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset]     =  value         & 0xff;
  buf[offset + 1] = (value >>> 8)  & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

// ───────────────────────────────────────────────────────────────────────
// BIP-39 mnemonic + seed
// ───────────────────────────────────────────────────────────────────────

/** Generate a fresh 24-word BIP-39 mnemonic (256 bits of entropy — the
 *  default in `secure_crypto.rs::SeedPhrase::generate`). */
export function generateSeedPhrase(): SeedPhrase {
  const mnemonic = generateMnemonic(englishWordlist, 256);
  const seed = mnemonicToSeedSync(mnemonic, '');       // empty passphrase, matches Rust default
  return { mnemonic, seed };
}

/** Reconstruct a SeedPhrase from a known 24-word (or 12-word) mnemonic.
 *  Throws if the mnemonic fails BIP-39 checksum validation. */
export function seedPhraseFromMnemonic(mnemonic: string, passphrase = ''): SeedPhrase {
  // Normalise: collapse internal whitespace, trim.
  const normalised = mnemonic.trim().split(/\s+/).join(' ');
  if (!validateMnemonic(normalised, englishWordlist)) {
    throw new Error('seedPhraseFromMnemonic: invalid BIP-39 mnemonic (failed checksum)');
  }
  const seed = mnemonicToSeedSync(normalised, passphrase);
  return { mnemonic: normalised, seed };
}

// ───────────────────────────────────────────────────────────────────────
// Wallet factories
// ───────────────────────────────────────────────────────────────────────

/** Build a Wallet directly from a 32-byte private key. */
export function walletFromPrivateKey(privateKey: Uint8Array): Wallet {
  if (privateKey.length !== 32) {
    throw new Error(
      `walletFromPrivateKey: expected 32-byte Ed25519 secret, got ${privateKey.length}`,
    );
  }
  const publicKey = ed25519.getPublicKey(privateKey);   // 32 bytes
  const address = addressFromPublicKey(publicKey);
  // Defensive copy so the caller's buffer can be zeroised without
  // affecting our Wallet view.
  return {
    privateKey: privateKey.slice(),
    publicKey,
    address,
  };
}

/** Build a Wallet by deriving (account, index) under a seed phrase. */
export function walletFromSeedPhrase(
  phrase: SeedPhrase,
  account = 0,
  index = 0,
): Wallet {
  const priv = hdDeriveKey(phrase.seed, account, index);
  return walletFromPrivateKey(priv);
}

/** Convenience: generate a fresh wallet + return the mnemonic so it can
 *  be shown to the user for backup. Account/index default to (0, 0). */
export function createWallet(): { wallet: Wallet; mnemonic: string } {
  const phrase = generateSeedPhrase();
  const wallet = walletFromSeedPhrase(phrase, 0, 0);
  return { wallet, mnemonic: phrase.mnemonic };
}

// ───────────────────────────────────────────────────────────────────────
// Signing
// ───────────────────────────────────────────────────────────────────────

/** Sign `message` with the wallet's private key. Returns a 64-byte
 *  Ed25519 signature (R ‖ S). */
export function sign(wallet: Wallet, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, wallet.privateKey);
}

/** Verify a 64-byte Ed25519 signature against a public key. */
export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64) return false;
  if (publicKey.length !== 32) return false;
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Re-exports for power users
// ───────────────────────────────────────────────────────────────────────

export { ed25519, sha256, base58 };
