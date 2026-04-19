/**
 * portal-crypto.ts — Ed25519 + base64url helpers for Portals.
 *
 * Bridges ANTON's internal hex-DER public-key storage (per identity.ts)
 * with the registry wire format (base64url unpadded SPKI DER per Registry
 * Protocol Reference §4.2).
 *
 * Reuses node:crypto via the same pattern as identity.ts /
 * app-enrollment-service.ts. Do NOT introduce @noble/ed25519 here — keeping
 * one Ed25519 surface in the codebase prevents drift bugs.
 *
 * Spec refs:
 *   - ANTON_Portals_Registry_Protocol_Reference.md §4 (envelope), §6 (signing)
 *   - investigation/portals-investigation.md §A
 */

import { sign, verify } from 'crypto';

import { canonicalizeBytes } from '../services/registry-protocol/canonical-json.js';

// ── Public-key wire-format conversions ──────────────────────────────────────

/**
 * Convert an internal hex-encoded SPKI DER Ed25519 public key (88 hex chars,
 * the format identity.ts produces) to the base64url unpadded wire format the
 * registry expects.
 */
export function publicKeyHexToWire(publicKeyHex: string): string {
  if (!/^[0-9a-fA-F]{88}$/.test(publicKeyHex)) {
    throw new Error('publicKeyHexToWire: expected 88-char hex SPKI DER');
  }
  return base64urlEncode(Buffer.from(publicKeyHex, 'hex'));
}

/**
 * Reverse: wire-format public key → internal hex storage form.
 */
export function publicKeyWireToHex(publicKeyWire: string): string {
  const buf = base64urlDecode(publicKeyWire);
  if (buf.length !== 44) {
    throw new Error(`publicKeyWireToHex: expected 44-byte SPKI DER, got ${buf.length}`);
  }
  return buf.toString('hex');
}

// ── Base64url (RFC 4648 §5, no padding) ─────────────────────────────────────

export function base64urlEncode(buf: Buffer | Uint8Array): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(s: string): Buffer {
  // Restore padding for Buffer.from('base64').
  const pad = (4 - (s.length % 4)) % 4;
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return Buffer.from(padded, 'base64');
}

// ── Sign / verify over canonical JSON ───────────────────────────────────────

/**
 * Sign a value: canonicalise (RFC 8785) → Ed25519 sign with PKCS#8 PEM
 * private key → return base64url unpadded signature.
 *
 * `value` is the FULL envelope (including all metadata + payload), exactly as
 * it will travel on the wire. The signature binds every field.
 */
export function signCanonical(value: unknown, privateKeyPem: string): string {
  const bytes = canonicalizeBytes(value);
  const sigBuf = sign(null, Buffer.from(bytes), privateKeyPem);
  return base64urlEncode(sigBuf);
}

/**
 * Verify a signature: canonicalise the value the same way, decode the
 * base64url signature, verify against the SPKI-DER public key (hex form on
 * disk; this helper accepts either hex or wire format).
 */
export function verifyCanonical(
  value: unknown,
  signatureBase64Url: string,
  publicKey: string,
): boolean {
  try {
    const bytes = canonicalizeBytes(value);
    const sigBuf = base64urlDecode(signatureBase64Url);
    const pubDer = publicKey.length === 88 && /^[0-9a-fA-F]+$/.test(publicKey)
      ? Buffer.from(publicKey, 'hex')
      : base64urlDecode(publicKey);
    return verify(null, Buffer.from(bytes), { key: pubDer, format: 'der', type: 'spki' }, sigBuf);
  } catch {
    return false;
  }
}

// ── Misc ────────────────────────────────────────────────────────────────────

/**
 * SHA-256 fingerprint of a public key, as hex. Used in capability descriptor
 * envelopes (signingKeyFingerprint per Capability Schema §13.2).
 */
export async function publicKeyFingerprint(publicKeyHex: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest('hex');
}
