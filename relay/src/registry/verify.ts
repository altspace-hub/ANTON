/**
 * verify.ts — Ed25519 signature verification + contact-hash derivation.
 *
 * Two operations used by the submit endpoint:
 *
 *   verifyDescriptorSignature(descriptor, signatureB64Url, pubkeyHex)
 *     Re-canonicalises the descriptor (RFC 8785) and verifies the
 *     base64url-encoded Ed25519 signature against the supplied public
 *     key. Returns true on valid, false on any failure path (bad
 *     hex/base64, signature mismatch, malformed pubkey).
 *
 *   deriveContactHash(pubkeyHex)
 *     Produces the ANTON-XXXX-XXXX-XXXX-XXXX contact hash from a raw
 *     32-byte Ed25519 public key. Matches the derivation used by both
 *     the Comm App (src/comm/services/identity.ts) and ANTON Local —
 *     so the submitterContactHash field can be cross-checked against
 *     the signing key in a single verify step.
 */

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { canonicalize } from './canonical.js';

// One-time wire-up: @noble/ed25519 requires a sync sha512 to satisfy
// its synchronous APIs. We register the @noble/hashes implementation.
ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

/** Same charset the Comm App + ANTON Local use to format contact hashes. */
const UNAMBIGUOUS_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function base64UrlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return null;
  // Convert URL-safe to standard base64 + restore padding.
  const padLen = (4 - (s.length % 4)) % 4;
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  try {
    const bin = Buffer.from(padded, 'base64');
    return new Uint8Array(bin);
  } catch {
    return null;
  }
}

/**
 * Derive ANTON-XXXX-XXXX-XXXX-XXXX from a raw 32-byte Ed25519 pubkey
 * hex string. Must match src/comm/services/identity.ts `deriveContactHash`.
 */
export function deriveContactHash(pubkeyHex: string): string | null {
  const bytes = hexToBytes(pubkeyHex);
  if (!bytes || bytes.length !== 32) return null;
  const hash = sha256(bytes);
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let c = 0; c < 4; c++) {
      const byte = hash[s * 4 + c]!; // hash is 32 bytes; indices 0-15 are in range
      segment += UNAMBIGUOUS_CHARSET[byte % UNAMBIGUOUS_CHARSET.length];
    }
    segments.push(segment);
  }
  return `ANTON-${segments.join('-')}`;
}

/**
 * Verify the descriptor signature. Returns true iff:
 *   - pubkeyHex decodes to 32 bytes
 *   - signatureB64Url decodes to 64 bytes
 *   - signature is valid over canonicalize(descriptor) under pubkey
 *
 * Throws are caught and converted to false so callers don't need to
 * branch on five different error types.
 */
export async function verifyDescriptorSignature(
  descriptor: unknown,
  signatureB64Url: string,
  pubkeyHex: string,
): Promise<boolean> {
  try {
    const pub = hexToBytes(pubkeyHex);
    if (!pub || pub.length !== 32) return false;
    const sig = base64UrlToBytes(signatureB64Url);
    if (!sig || sig.length !== 64) return false;
    const canonical = canonicalize(descriptor);
    const msg = new TextEncoder().encode(canonical);
    return await ed25519.verifyAsync(sig, msg, pub);
  } catch {
    return false;
  }
}
