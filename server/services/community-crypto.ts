/**
 * community-crypto.ts
 * Utility functions for Community tab E2E identity generation.
 * Uses Web Crypto API compatible patterns for the server side.
 * Note: Actual E2E encryption happens client-side; this generates helper data.
 */

import { createHash, randomBytes, verify, createPublicKey } from 'crypto';

/** Generate a canonical ANTON contact hash from a random seed */
export function generateContactHash(): string {
  const raw = randomBytes(16).toString('hex').toUpperCase();
  // Format: ANTON-XXXX-XXXX-XXXX-XXXX
  return `ANTON-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/** Hash a contact hash for storage/lookup without exposing the original */
export function hashContactId(contactHash: string): string {
  return createHash('sha256').update(contactHash).digest('hex').slice(0, 32);
}

/** Validate ANTON contact hash format */
export function isValidContactHash(hash: string): boolean {
  return /^ANTON-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(hash);
}

/** Generate a conversation ID from two contact hashes (deterministic, symmetric) */
export function getConversationId(hashA: string, hashB: string): string {
  const sorted = [hashA, hashB].sort().join(':');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 32);
}

/**
 * Canonical-JSON of an AAP envelope (sig-stripped + version-bumped) for
 * sign / verify. Mirrors the canonicaliser in registry-protocol/canonical-json.ts
 * but inline here to avoid an extra dep for the AAP transport.
 *
 * The signature covers: { v, type, id, ts, from, nonce, payload } —
 * everything except `sig` itself. Keys serialised in this exact order.
 */
function canonicaliseEnvelope(env: Record<string, unknown>): string {
  const ordered = {
    v: env.v,
    type: env.type,
    id: env.id,
    ts: env.ts,
    from: env.from,
    nonce: env.nonce,
    payload: env.payload,
  };
  return JSON.stringify(ordered);
}

/**
 * Verify an Ed25519 signature on an AAP envelope.
 *
 *   - `envelope` — full envelope object (the `sig` field is ignored).
 *   - `sigBase64Url` — the signature in base64url encoding (as carried in `sig`).
 *   - `pubkeyBase64Url` — the issuer's public key in base64url encoding (as
 *     carried in HELLO.payload.pubkey or resolved via connected_users).
 *
 * Returns true iff the signature verifies. Returns false on any error
 * (malformed key, malformed signature, mismatch). Never throws.
 *
 * Used by `aap-transport-server.ts` HELLO handling and by any future
 * BUNDLE-validation path. Defined per ANTON_Improvement_and_Investigation_Brief.md
 * §E.2 follow-up (replaces the placeholder verify).
 */
export function verifyEnvelopeSignature(
  envelope: Record<string, unknown>,
  sigBase64Url: string,
  pubkeyBase64Url: string,
): boolean {
  try {
    const canonical = Buffer.from(canonicaliseEnvelope(envelope), 'utf-8');
    const sig = Buffer.from(sigBase64Url, 'base64url');
    const rawPubkey = Buffer.from(pubkeyBase64Url, 'base64url');

    // Node's KeyObject for Ed25519 expects DER-wrapped raw key. Build it
    // by prepending the standard 12-byte Ed25519 SubjectPublicKeyInfo prefix.
    const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
    if (rawPubkey.length !== 32) return false;
    const spki = Buffer.concat([ED25519_SPKI_PREFIX, rawPubkey]);
    const keyObject = createPublicKey({ key: spki, format: 'der', type: 'spki' });

    return verify(null, canonical, keyObject, sig);
  } catch {
    return false;
  }
}

/**
 * Confirm that the contact hash declared in `from` is consistent with the
 * pubkey carried in HELLO. Prevents a peer from claiming a hash they don't own.
 *
 * The contact hash is `ANTON-XXXX-XXXX-XXXX-XXXX` over hex of the SHA-256
 * of the pubkey bytes — see `identity.ts:13–24` for the canonical builder.
 * This helper recomputes and compares.
 */
export function contactHashMatchesPubkey(contactHash: string, pubkeyBase64Url: string): boolean {
  try {
    const rawPubkey = Buffer.from(pubkeyBase64Url, 'base64url');
    if (rawPubkey.length !== 32) return false;
    const digest = createHash('sha256').update(rawPubkey).digest('hex').toUpperCase();
    const expected = `ANTON-${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}`;
    return expected === contactHash;
  } catch {
    return false;
  }
}
