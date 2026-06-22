/**
 * trusted-seller-service.ts — Trusted Stores P0 (pin + mutual key verification).
 *
 * Free functions over a DatabaseAdapter (the project's service shape). All
 * owner-scoped. NO money / budgets / standing auth / Missions — P0 only answers
 * "who is this seller, is this their live key, do I trust them?".
 *
 * Two strengths of trust:
 *   - descriptor-tofu  : pinned from the locally-cached signed descriptor (the
 *                        relay verified it at submit; we anchor the key). status='pinned'.
 *   - mutual-handshake : the seller proved key control LIVE — the buyer sent a
 *                        fresh nonce over the portal invoke/inbox loop, the seller
 *                        signed it with the portal key, the buyer verified the
 *                        signature against the pinned key. status='trusted'. Strongest.
 *
 * Reuses (never reinvents): the descriptor cache, signCanonical/verifyCanonical,
 * verifyDescriptor, the homoglyph guard, decryptPortalKey.
 */
import { randomBytes } from 'node:crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import {
  publicKeyWireToHex, publicKeyFingerprint, signCanonical, verifyCanonical,
} from '../../lib/portal-crypto.js';
import { decryptPortalKey } from '../../lib/portal-key-cipher.js';
import { verifyDescriptor, type SignedDescriptorEnvelope } from '../capability-descriptor/signer.js';
import { createDescriptorCache } from '../registry-client/cache.js';
import { computeSkeleton } from '../registry-protocol/homoglyph.js';
import { checkPinLookAlike, type LookAlikeWarning } from './look-alike.js';

const log = childLogger('trusted-stores');

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrustedSeller {
  id: string;
  portalAddress: string;
  displayTitle: string | null;
  contactHash: string | null;
  signingPubkeyHex: string;
  signingKeyFingerprint: string;
  status: 'pending' | 'pinned' | 'trusted' | 'key_changed' | 'revoked';
  verificationMethod: string | null;
  descriptorSigVerified: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  keyChangedAt: string | null;
  previousPubkeyHex: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedSellerKey {
  portalAddress: string;
  signingPubkeyHex: string;
  signingKeyFingerprint: string;
  displayTitle?: string;
  contactHash?: string;
  originEndpoint?: string;
  /** The signed descriptor envelope (when a detached signature is cached). */
  envelope: SignedDescriptorEnvelope | null;
}

export interface DescriptorIntegrity {
  valid: boolean;
  reasons: string[];
}

/** The challenge the buyer sends to the seller (over the portal invoke loop). */
export interface HandshakeChallenge {
  kind: 'trust-handshake';
  nonce: string;
  buyerContactHash: string;
  portalAddress: string;
  ts: number;
}

/** What the seller returns (and signs) — verified by the buyer against the pin. */
export interface HandshakeProof {
  signature: string;
  signedPayload: Record<string, unknown>;
  signingPubkeyHex: string;
}

interface Row {
  id: string;
  portal_address: string;
  display_title: string | null;
  contact_hash: string | null;
  signing_pubkey_hex: string;
  signing_key_fingerprint: string;
  status: TrustedSeller['status'];
  verification_method: string | null;
  descriptor_sig_verified: boolean;
  last_handshake_nonce: string | null;
  verified_at: string | null;
  last_checked_at: string | null;
  key_changed_at: string | null;
  previous_pubkey_hex: string | null;
  created_at: string;
  updated_at: string;
}

function toModel(r: Row): TrustedSeller {
  return {
    id: r.id,
    portalAddress: r.portal_address,
    displayTitle: r.display_title,
    contactHash: r.contact_hash,
    signingPubkeyHex: r.signing_pubkey_hex,
    signingKeyFingerprint: r.signing_key_fingerprint,
    status: r.status,
    verificationMethod: r.verification_method,
    descriptorSigVerified: r.descriptor_sig_verified,
    verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
    lastCheckedAt: r.last_checked_at ? new Date(r.last_checked_at).toISOString() : null,
    keyChangedAt: r.key_changed_at ? new Date(r.key_changed_at).toISOString() : null,
    previousPubkeyHex: r.previous_pubkey_hex,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

// ── Resolve + integrity ────────────────────────────────────────────────────

/** Resolve a portal address to its signing key + descriptor, from the local
 *  descriptor cache (the ANTON-Local-native path; the relay resolve-by-address
 *  client is dormant). Returns null when the seller has never been seen here. */
export async function resolveSellerKey(
  db: DatabaseAdapter, portalAddress: string,
): Promise<ResolvedSellerKey | null> {
  const cached = await createDescriptorCache(db).get(portalAddress);
  if (!cached) return null;
  const portal = (cached.descriptor as { portal?: Record<string, unknown> }).portal ?? {};
  const wire = typeof portal.publicKey === 'string' ? portal.publicKey : undefined;
  if (!wire) return null;
  let signingPubkeyHex: string;
  try { signingPubkeyHex = publicKeyWireToHex(wire); }
  catch { return null; }
  const envelope: SignedDescriptorEnvelope | null = cached.signature
    ? {
        descriptor: cached.descriptor,
        signature: cached.signature,
        signatureAlgorithm: 'Ed25519',
        signingKeyFingerprint: cached.signingKeyFingerprint,
      }
    : null;
  return {
    portalAddress,
    signingPubkeyHex,
    signingKeyFingerprint: cached.signingKeyFingerprint,
    ...(typeof portal.displayTitle === 'string' ? { displayTitle: portal.displayTitle } : {}),
    ...(typeof portal.contactHash === 'string' ? { contactHash: portal.contactHash } : {}),
    ...(typeof portal.originEndpoint === 'string' ? { originEndpoint: portal.originEndpoint } : {}),
    envelope,
  };
}

/** Static descriptor-signature integrity (advisory). Honest gap: a portal
 *  discovered purely via the relay has no detached signature cached → unverifiable
 *  here; the LIVE mutual handshake is the stronger, signature-independent proof. */
export function verifyDescriptorIntegrity(resolved: ResolvedSellerKey): DescriptorIntegrity {
  if (!resolved.envelope) {
    return { valid: false, reasons: ['no-signature-cached'] };
  }
  return verifyDescriptor(resolved.envelope, { publicKey: resolved.signingPubkeyHex });
}

// ── CRUD ──────────────────────────────────────────────────────────────────

export async function listTrustedSellers(db: DatabaseAdapter, ownerId: string): Promise<TrustedSeller[]> {
  const rows = await db.all<Row>(
    `SELECT * FROM trusted_sellers WHERE owner_user_id = ? AND status <> 'revoked' ORDER BY created_at DESC`,
    ownerId,
  );
  return rows.map(toModel);
}

export async function getTrustedSeller(
  db: DatabaseAdapter, ownerId: string, portalAddress: string,
): Promise<TrustedSeller | null> {
  const r = await db.get<Row>(
    `SELECT * FROM trusted_sellers WHERE owner_user_id = ? AND portal_address = ?`,
    ownerId, portalAddress,
  );
  return r ? toModel(r) : null;
}

async function getRow(db: DatabaseAdapter, ownerId: string, portalAddress: string): Promise<Row | undefined> {
  return db.get<Row>(
    `SELECT * FROM trusted_sellers WHERE owner_user_id = ? AND portal_address = ?`,
    ownerId, portalAddress,
  );
}

/** Read-only preview shown in the pin wizard before any row is created. */
export async function previewSeller(
  db: DatabaseAdapter, ownerId: string, portalAddress: string,
): Promise<{ resolved: ResolvedSellerKey | null; integrity: DescriptorIntegrity | null; lookAlikeWarnings: LookAlikeWarning[] }> {
  const resolved = await resolveSellerKey(db, portalAddress);
  const integrity = resolved ? verifyDescriptorIntegrity(resolved) : null;
  const existing = (await listTrustedSellers(db, ownerId)).map((s) => ({
    portalAddress: s.portalAddress, nameSkeleton: computeSkeleton(s.portalAddress),
  }));
  return { resolved, integrity, lookAlikeWarnings: checkPinLookAlike(portalAddress, existing) };
}

/** Pin a seller (TOFU on the cached descriptor key). Idempotent; preserves a
 *  prior 'trusted' status when the key is unchanged. A changed key records the
 *  previous key (audit) and falls back to 'pinned' (never silently re-trusts). */
export async function pinSeller(
  db: DatabaseAdapter, ownerId: string, portalAddress: string,
): Promise<{ seller: TrustedSeller; lookAlikeWarnings: LookAlikeWarning[] }> {
  const resolved = await resolveSellerKey(db, portalAddress);
  if (!resolved) throw new Error('Seller could not be resolved — visit/discover the store first so its signed descriptor is cached.');
  const integrity = verifyDescriptorIntegrity(resolved);
  const skeleton = computeSkeleton(portalAddress);

  const existingPins = (await listTrustedSellers(db, ownerId))
    .filter((s) => s.portalAddress !== portalAddress)
    .map((s) => ({ portalAddress: s.portalAddress, nameSkeleton: computeSkeleton(s.portalAddress) }));
  const lookAlikeWarnings = checkPinLookAlike(portalAddress, existingPins);

  const existing = await getRow(db, ownerId, portalAddress);
  const keyChanged = !!existing && existing.signing_pubkey_hex !== resolved.signingPubkeyHex;

  if (!existing) {
    await db.run(
      `INSERT INTO trusted_sellers
         (owner_user_id, portal_address, display_title, contact_hash, signing_pubkey_hex,
          signing_key_fingerprint, name_skeleton, status, verification_method, descriptor_sig_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pinned', 'descriptor-tofu', ?)`,
      ownerId, portalAddress, resolved.displayTitle ?? null, resolved.contactHash ?? null,
      resolved.signingPubkeyHex, resolved.signingKeyFingerprint, skeleton, integrity.valid,
    );
  } else {
    // Keep 'trusted' only when the key is unchanged; a key change → audit + 'pinned'.
    const nextStatus = keyChanged ? 'pinned' : (existing.status === 'trusted' ? 'trusted' : 'pinned');
    await db.run(
      `UPDATE trusted_sellers SET
         display_title = ?, contact_hash = ?, signing_pubkey_hex = ?, signing_key_fingerprint = ?,
         name_skeleton = ?, status = ?, descriptor_sig_verified = ?,
         previous_pubkey_hex = CASE WHEN ? THEN signing_pubkey_hex ELSE previous_pubkey_hex END,
         key_changed_at = CASE WHEN ? THEN NOW() ELSE key_changed_at END,
         updated_at = NOW()
       WHERE owner_user_id = ? AND portal_address = ?`,
      resolved.displayTitle ?? null, resolved.contactHash ?? null, resolved.signingPubkeyHex,
      resolved.signingKeyFingerprint, skeleton, nextStatus, integrity.valid,
      keyChanged, keyChanged, ownerId, portalAddress,
    );
  }

  const seller = await getTrustedSeller(db, ownerId, portalAddress);
  if (!seller) throw new Error('pinSeller: row missing after upsert');
  return { seller, lookAlikeWarnings };
}

export async function removeTrustedSeller(
  db: DatabaseAdapter, ownerId: string, portalAddress: string,
): Promise<boolean> {
  const res = await db.run(
    `UPDATE trusted_sellers SET status = 'revoked', updated_at = NOW()
     WHERE owner_user_id = ? AND portal_address = ? AND status <> 'revoked'`,
    ownerId, portalAddress,
  );
  return (res.changes ?? 0) > 0;
}

// ── Key-rotation alert ─────────────────────────────────────────────────────

/** Re-resolve the seller and compare the live key to the pin. A changed key is a
 *  HARD alert (status='key_changed') — a different entity may have taken the name;
 *  never silently re-trusts. The user must deliberately re-pin to accept it. */
export async function reResolveAndCheckKey(
  db: DatabaseAdapter, ownerId: string, portalAddress: string,
): Promise<{ found: boolean; rotated: boolean; oldFingerprint?: string; newFingerprint?: string }> {
  const row = await getRow(db, ownerId, portalAddress);
  if (!row) return { found: false, rotated: false };
  const resolved = await resolveSellerKey(db, portalAddress);
  if (!resolved) {
    await db.run(`UPDATE trusted_sellers SET last_checked_at = NOW() WHERE id = ?`, row.id);
    return { found: true, rotated: false };
  }
  const rotated = resolved.signingKeyFingerprint !== row.signing_key_fingerprint;
  if (rotated) {
    await db.run(
      `UPDATE trusted_sellers SET status = 'key_changed', previous_pubkey_hex = signing_pubkey_hex,
         key_changed_at = NOW(), last_checked_at = NOW(), updated_at = NOW() WHERE id = ?`,
      row.id,
    );
    log.warn({ ownerId, portalAddress, old: row.signing_key_fingerprint, new: resolved.signingKeyFingerprint },
      'trusted seller signing key ROTATED — flagged key_changed');
  } else {
    await db.run(`UPDATE trusted_sellers SET last_checked_at = NOW() WHERE id = ?`, row.id);
  }
  return {
    found: true, rotated,
    oldFingerprint: row.signing_key_fingerprint, newFingerprint: resolved.signingKeyFingerprint,
  };
}

// ── Mutual handshake ───────────────────────────────────────────────────────

/** BUYER: ensure a row exists + mint a fresh nonce; return the challenge to send
 *  to the seller over the existing portal invoke loop. */
export async function issueHandshakeNonce(
  db: DatabaseAdapter, ownerId: string, portalAddress: string, buyerContactHash: string,
): Promise<{ challenge: HandshakeChallenge }> {
  // Ensure a pin row (TOFU) exists so we have a key to verify against.
  const existing = await getRow(db, ownerId, portalAddress);
  if (!existing) {
    await pinSeller(db, ownerId, portalAddress);
  }
  const nonce = randomBytes(32).toString('hex');
  await db.run(
    `UPDATE trusted_sellers SET last_handshake_nonce = ?, updated_at = NOW()
     WHERE owner_user_id = ? AND portal_address = ?`,
    nonce, ownerId, portalAddress,
  );
  return {
    challenge: { kind: 'trust-handshake', nonce, buyerContactHash, portalAddress, ts: Date.now() },
  };
}

/** BUYER: verify the seller's signed proof against the pinned key + the issued
 *  nonce. All three must hold: same key, fresh nonce (anti-replay), valid sig.
 *  On success → status='trusted'. On any failure → unchanged + reasons. */
export async function recordHandshakeResult(
  db: DatabaseAdapter, ownerId: string, portalAddress: string, proof: HandshakeProof,
): Promise<{ verified: boolean; reasons: string[]; seller: TrustedSeller | null }> {
  const row = await getRow(db, ownerId, portalAddress);
  if (!row) return { verified: false, reasons: ['not-pinned'], seller: null };
  const pinned = row.signing_pubkey_hex;
  const reasons: string[] = [];

  if (proof.signingPubkeyHex !== pinned) reasons.push('key-mismatch');
  const payloadKey = typeof proof.signedPayload.signingPubkeyHex === 'string' ? proof.signedPayload.signingPubkeyHex : '';
  if (payloadKey !== pinned) reasons.push('payload-key-mismatch');
  const payloadNonce = typeof proof.signedPayload.nonce === 'string' ? proof.signedPayload.nonce : '';
  if (!row.last_handshake_nonce || payloadNonce !== row.last_handshake_nonce) reasons.push('nonce-mismatch');
  if (!verifyCanonical(proof.signedPayload, proof.signature, pinned)) reasons.push('signature-invalid');

  if (reasons.length > 0) {
    return { verified: false, reasons, seller: toModel(row) };
  }

  await db.run(
    `UPDATE trusted_sellers SET status = 'trusted', verification_method = 'mutual-handshake',
       verified_at = NOW(), last_handshake_nonce = NULL, updated_at = NOW()
     WHERE owner_user_id = ? AND portal_address = ?`,
    ownerId, portalAddress,
  );
  const seller = await getTrustedSeller(db, ownerId, portalAddress);
  return { verified: true, reasons: [], seller };
}

/** SELLER: sign a buyer's handshake challenge with the OWNED portal's key. Called
 *  from the seller-side "Agree" route. Proves live control of the portal key. */
export async function signHandshakeChallenge(
  db: DatabaseAdapter, portalId: string, ownerUserId: string, challenge: HandshakeChallenge,
): Promise<HandshakeProof> {
  const portal = await db.get<{ public_key_hex: string; private_key_pem: string; name: string; namespace: string }>(
    `SELECT public_key_hex, private_key_pem, name, namespace FROM portals WHERE id = ?`,
    portalId,
  );
  if (!portal) throw new Error('portal not found');
  const signingPubkeyHex = portal.public_key_hex;
  const privPem = decryptPortalKey(portal.private_key_pem);
  const signedPayload: Record<string, unknown> = {
    kind: 'trust-handshake',
    nonce: challenge.nonce,
    buyerContactHash: challenge.buyerContactHash,
    portalAddress: challenge.portalAddress,
    ts: challenge.ts,
    signingPubkeyHex,
  };
  const signature = signCanonical(signedPayload, privPem);
  return { signature, signedPayload, signingPubkeyHex };
}

export { publicKeyFingerprint };
