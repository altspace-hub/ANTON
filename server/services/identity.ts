/**
 * identity.ts
 * Shared identity utilities for ANTON's universal identity layer.
 * Wraps community-crypto.ts and adds challenge-response auth functions.
 * Pure crypto — no database dependency.
 */

import { createHash, randomBytes, generateKeyPairSync, sign, verify, createPublicKey } from 'crypto';

// ── Re-exports from community-crypto ─────────────────────────────────────────
export { generateContactHash, isValidContactHash } from './community-crypto.js';

// ── Keypair generation ───────────────────────────────────────────────────────

/**
 * Derive an ANTON contact hash from an Ed25519 public key (DER-encoded hex).
 * Uses spec-compliant algorithm: SHA-256 → modulo into unambiguous charset → ANTON-XXXX-XXXX-XXXX-XXXX.
 */
export function deriveContactHashFromPublicKey(publicKeyHex: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars — no 0/O/1/I
  const hashBuffer = createHash('sha256').update(Buffer.from(publicKeyHex, 'hex')).digest();
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let c = 0; c < 4; c++) {
      const byte = hashBuffer[s * 4 + c];
      segment += chars[byte % chars.length];
    }
    segments.push(segment);
  }
  return `ANTON-${segments.join('-')}`;
}

/**
 * Validate that a hex string represents a valid Ed25519 public key (SPKI DER format).
 * Returns true if the key can be imported, false otherwise.
 */
export function isValidEd25519PublicKey(publicKeyHex: string): boolean {
  if (!/^[0-9a-fA-F]{88}$/.test(publicKeyHex)) return false; // Ed25519 SPKI DER = 44 bytes = 88 hex
  try {
    createPublicKey({ key: Buffer.from(publicKeyHex, 'hex'), format: 'der', type: 'spki' });
    return true;
  } catch {
    return false;
  }
}

/** Generate a new Ed25519 keypair with derived contact hash. */
export function generateAppKeypair(): { publicKeyHex: string; privateKeyPem: string; contactHash: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const contactHash = deriveContactHashFromPublicKey(publicKeyHex);
  return { publicKeyHex, privateKeyPem, contactHash };
}

// ── Challenge-response auth ──────────────────────────────────────────────────

/** Generate a 32-byte random hex nonce for auth challenges. */
export function createAuthNonce(): string {
  return randomBytes(32).toString('hex');
}

/** Verify an Ed25519 signature over a nonce. */
export function verifySignedNonce(nonce: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const pubDer = Buffer.from(publicKeyHex, 'hex');
    return verify(
      null,
      Buffer.from(nonce, 'utf8'),
      { key: pubDer, format: 'der', type: 'spki' },
      Buffer.from(signatureHex, 'hex')
    );
  } catch {
    return false;
  }
}

// ── Token generation ─────────────────────────────────────────────────────────

/** Generate a 16-char alphanumeric invitation token (unambiguous charset, ~80 bits entropy). */
export function generateInvitationToken(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars — no 0/O/1/I
  const bytes = randomBytes(16);
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += charset[bytes[i] % charset.length];
  }
  return token;
}

/** Generate a 64-byte random hex session token. */
export function generateSessionToken(): string {
  return randomBytes(64).toString('hex');
}

/** Hash a session token for storage (SHA-256). Raw token is never stored. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
