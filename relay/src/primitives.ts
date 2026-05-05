/**
 * primitives.ts — wrapper around the audited @noble crypto packages.
 *
 * Single source of every cryptographic primitive used in the relay. No DIY
 * math; everything is delegated to one of:
 *   - @noble/curves/ed25519   (Ed25519 verify, Edwards→Montgomery conversion)
 *   - @noble/hashes/sha2      (SHA-256)
 *   - @noble/hashes/blake2b   (BLAKE2b — used by Noise IK in Phases 3+)
 *
 * Spec references:
 *   §1.1  primitive table
 *   §3.2  HELLO_INSTANCE proof_sig + binding_sig verification
 *   §1.5  instance_id derivation
 *   §4.4  Ed25519 → X25519 conversion (matches libsodium crypto_sign_ed25519_pk_to_curve25519)
 */

import { ed25519, edwardsToMontgomeryPub } from '@noble/curves/ed25519.js';
import { sha256 as sha256Noble } from '@noble/hashes/sha2.js';
import { blake2b as blake2bNoble } from '@noble/hashes/blake2b.js';

/** SHA-256 of arbitrary bytes. */
export function sha256(bytes: Uint8Array): Uint8Array {
  return sha256Noble(bytes);
}

/** BLAKE2b-256 — used by Noise IK as the hash function. */
export function blake2b256(bytes: Uint8Array): Uint8Array {
  return blake2bNoble(bytes, { dkLen: 32 });
}

/**
 * Spec §1.5 — `instance_id = sha256(instance_X25519_static_pubkey)[0..16)`.
 * Returns 16 bytes.
 */
export function deriveInstanceId(x25519PubKey: Uint8Array): Uint8Array {
  if (x25519PubKey.length !== 32) {
    throw new Error(`X25519 pubkey must be 32 bytes, got ${x25519PubKey.length}`);
  }
  const h = sha256(x25519PubKey);
  return h.slice(0, 16);
}

/**
 * Spec §4.4 — Ed25519 pubkey → X25519 pubkey, matching libsodium's
 * `crypto_sign_ed25519_pk_to_curve25519` byte-for-byte. Implementation
 * delegated to @noble/curves's audited Edwards→Montgomery birational map.
 *
 * Returns 32 bytes (X25519 pubkey).
 */
export function ed25519PkToCurve25519(edPub: Uint8Array): Uint8Array {
  if (edPub.length !== 32) {
    throw new Error(`Ed25519 pubkey must be 32 bytes, got ${edPub.length}`);
  }
  // edwardsToMontgomeryPub takes a hex string OR Uint8Array; returns Uint8Array.
  return edwardsToMontgomeryPub(edPub);
}

/**
 * Verify an Ed25519 signature. Returns true iff the signature is valid for
 * the given message + pubkey. Never throws — invalid inputs return false.
 *
 * Used for:
 *   - HELLO_INSTANCE proof_sig (§3.2 step 5)
 *   - HELLO_INSTANCE binding_sig (§3.2 step 2)
 *   - Rotation advisory signature (§7.1)
 */
export function ed25519Verify(
  signature: Uint8Array,
  message: Uint8Array,
  pubKey: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, message, pubKey);
  } catch {
    return false;
  }
}

/**
 * Generate an Ed25519 keypair. Used by tests + tooling, never by the relay
 * itself (the relay verifies signatures, it doesn't sign anything outside
 * its own self-presentation in TLS termination).
 */
export function ed25519GenerateKeypair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/** Sign with Ed25519. Used by tests + tooling. */
export function ed25519Sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

// ── Hex codec — convenient for spec-formatted strings + test vectors ────

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hex string odd length: ${hex.length}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const b = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(b)) throw new Error(`invalid hex at offset ${i}`);
    out[i / 2] = b;
  }
  return out;
}

/** Constant-time byte-array equality. Used wherever a comparison feeds a
 *  security decision (e.g. instance_id match in §3.2). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
