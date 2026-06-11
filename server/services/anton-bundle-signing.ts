/**
 * anton-bundle-signing.ts — Ed25519 provenance for .anton bundles
 * (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2 item 2.4).
 *
 * Lifts the Evidence Pack signing pattern (server/services/evidence-pack/
 * signer.ts) into the generic .anton format as an OPT-IN export step:
 *
 *   canonical JSON (RFC 8785) of the manifest with the signature blanked
 *     → Ed25519 sign with the INSTANCE identity key
 *     → embed the signature block in manifest.json
 *
 * Identity choice: the per-instance Ed25519 keypair in `instance_identity`
 * (the same key the App Gateway uses for enrollment envelopes and Evidence
 * Pack finalisation signs with). It is lazily created on first use in EVERY
 * install — no user action required — unlike `community_identity`, which only
 * exists after the user activates the Community pillar. One instance = one
 * signer identity across evidence packs, app enrollment, and .anton bundles.
 * We reuse `getInstanceSigningKeypair` from evidence-pack/signer.ts rather
 * than maintaining a parallel keystore.
 *
 * What a valid signature proves — exactly this, no more:
 *   the MANIFEST (every field of it) has not been modified since it was
 *   signed by the holder of `signer_pubkey`. The PAYLOAD files are attested
 *   only transitively — and only when the manifest carries a
 *   `security.checksum` AND the validator recomputes it (F1: the dispatching
 *   validator now does this for every type it knows the recipe for; the
 *   verdict rides in `BundleProvenance.payload_attested`). A signed but
 *   checksum-less manifest does NOT attest payload integrity. A signature
 *   never vouches for content quality, safety, or the real-world identity
 *   behind the key.
 *
 * Canonicalisation: RFC 8785 (JCS) via registry-protocol/canonical-json.ts.
 * The signed payload is the WHOLE manifest with `signature.sig_base64` set to
 * '' (the evidence-pack blanking trick) — so `signed_at`, `signer_name` and
 * `signer_pubkey` are themselves covered by the signature, and tampering with
 * ANY manifest field (envelope, bespoke, legacy, or the signature block
 * itself) invalidates it.
 *
 * READ-OLD compatibility is sacred: signing is opt-in at export; unsigned
 * bundles (every .anton ever shipped) keep importing forever with
 * provenance `{ signed: false }` and no errors or warnings.
 */

import AdmZip from 'adm-zip';
import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { canonicalize } from './registry-protocol/canonical-json.js';
import { getInstanceSigningKeypair } from './evidence-pack/signer.js';

// ── Types ──────────────────────────────────────────────────────────────────

/** The signature block embedded in a signed manifest.json. */
export interface BundleSignatureBlock {
  alg: 'ed25519';
  /** Standard base64 Ed25519 signature over the canonical blanked manifest. */
  sig_base64: string;
  /** Signer's Ed25519 public key, DER SPKI hex (same encoding as instance_identity.pubkey). */
  signer_pubkey: string;
  /** Display name the signer claims (instance display_name). Covered by the signature. */
  signer_name?: string;
  /** ISO timestamp of signing. Covered by the signature. */
  signed_at: string;
}

/** Provenance verdict attached to validation results. */
export interface BundleProvenance {
  /** Manifest carries a recognised signature block. */
  signed: boolean;
  /** Signature verified against the embedded pubkey (false when unsigned). */
  valid: boolean;
  signer_pubkey?: string;
  signer_name?: string;
  signed_at?: string;
  /** TOFU: this instance has seen the signer pubkey on a previous valid bundle. */
  known: boolean;
  /** TOFU: the name pinned the first time this pubkey was seen (when it differs). */
  first_seen_name?: string;
  /**
   * F1 — payload binding verdict, set only for SIGNED bundles:
   * true  = the signature is valid AND the manifest's content checksum was
   *         recomputed over the payload files and matched — the signature
   *         covers the payload transitively.
   * false = the signature covers the MANIFEST ONLY (no content checksum, or
   *         this ANTON could not recompute it) — payload integrity is NOT
   *         attested by the signature.
   */
  payload_attested?: boolean;
}

export interface SignBundleResult {
  buffer: Buffer;
  signed: boolean;
  /** Why signing was skipped (buffer is the untouched original). */
  reason?: string;
  signer_pubkey?: string;
}

// ── Signature block helpers ────────────────────────────────────────────────

/**
 * Extract a Wave-2.4 signature block from a manifest, shape-guarded so foreign
 * `signature` fields (e.g. the evidence-pack string signature) are ignored.
 */
export function extractSignatureBlock(manifest: unknown): BundleSignatureBlock | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const sig = (manifest as Record<string, unknown>).signature;
  if (!sig || typeof sig !== 'object' || Array.isArray(sig)) return null;
  const s = sig as Record<string, unknown>;
  if (s.alg !== 'ed25519') return null;
  if (typeof s.sig_base64 !== 'string' || !s.sig_base64) return null;
  if (typeof s.signer_pubkey !== 'string' || !s.signer_pubkey) return null;
  if (typeof s.signed_at !== 'string' || !s.signed_at) return null;
  return {
    alg: 'ed25519',
    sig_base64: s.sig_base64,
    signer_pubkey: s.signer_pubkey,
    signed_at: s.signed_at,
    ...(typeof s.signer_name === 'string' && s.signer_name ? { signer_name: s.signer_name } : {}),
  };
}

/**
 * The exact bytes that get signed/verified: RFC 8785 canonical JSON of the
 * manifest with `signature.sig_base64` blanked to ''. All other signature
 * fields (alg, signer_pubkey, signer_name, signed_at) stay in the payload so
 * they are covered by the signature.
 */
function signedPayload(manifest: Record<string, unknown>, block: Record<string, unknown>): Buffer {
  const blanked = { ...manifest, signature: { ...block, sig_base64: '' } };
  return Buffer.from(canonicalize(blanked), 'utf-8');
}

// ── Signing (opt-in, export side) ──────────────────────────────────────────

/** Read the instance display name without creating anything. */
async function readDisplayName(db: DatabaseAdapter): Promise<string | undefined> {
  try {
    const row = await db.get<{ display_name: string | null }>(
      `SELECT display_name FROM instance_identity WHERE singleton = 'singleton'`,
    );
    return row?.display_name?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sign a parsed manifest object with the instance identity key. Returns a new
 * manifest object with the `signature` block embedded. Throws when the
 * instance identity is unavailable — callers that must degrade gracefully use
 * signAntonBundle instead.
 */
export async function signManifestObject(
  db: DatabaseAdapter,
  manifest: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { pubkeyHex, privkeyHex } = await getInstanceSigningKeypair(db);
  const signerName = await readDisplayName(db);

  const blockSansSig: Omit<BundleSignatureBlock, 'sig_base64'> = {
    alg: 'ed25519',
    signer_pubkey: pubkeyHex,
    signed_at: new Date().toISOString(),
    ...(signerName ? { signer_name: signerName } : {}),
  };

  const payload = signedPayload(manifest, blockSansSig);
  const keyObj = crypto.createPrivateKey({ key: Buffer.from(privkeyHex, 'hex'), format: 'der', type: 'pkcs8' });
  const sig = crypto.sign(null, payload, keyObj);

  const block: BundleSignatureBlock = { ...blockSansSig, sig_base64: sig.toString('base64') };
  return { ...manifest, signature: block };
}

/**
 * Generic post-build signing step: open a finished .anton ZIP, sign its
 * manifest.json, write it back. Works for EVERY bundle type the generic
 * bundler produces without touching the per-type bundlers.
 *
 * Never throws: any failure (no identity table, corrupt zip, manifest already
 * carrying a signature field) returns the ORIGINAL buffer with
 * `signed: false` and a reason — export always proceeds.
 */
export async function signAntonBundle(db: DatabaseAdapter, buffer: Buffer): Promise<SignBundleResult> {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('manifest.json');
    if (!entry) return { buffer, signed: false, reason: 'no manifest.json in bundle' };

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(entry.getData().toString('utf-8')) as Record<string, unknown>;
    } catch {
      return { buffer, signed: false, reason: 'manifest.json is not valid JSON' };
    }

    // Never overwrite an existing signature field — foreign dialects
    // (evidence packs) own their signature; re-signing is not our call.
    if ('signature' in manifest && manifest.signature != null) {
      return { buffer, signed: false, reason: 'manifest already carries a signature field' };
    }

    const signed = await signManifestObject(db, manifest);
    zip.updateFile(entry, Buffer.from(JSON.stringify(signed, null, 2), 'utf-8'));
    const block = signed.signature as BundleSignatureBlock;
    return { buffer: zip.toBuffer(), signed: true, signer_pubkey: block.signer_pubkey };
  } catch (err) {
    console.warn(
      `[anton-bundle-signing] Signing unavailable — exporting unsigned: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
    return { buffer, signed: false, reason: 'instance signing identity unavailable' };
  }
}

// ── Verification (import side) ─────────────────────────────────────────────

/**
 * Verify the embedded signature block against the embedded pubkey.
 * Pure function — no DB, no TOFU. Returns `{ signed: false }` for unsigned
 * manifests (including foreign `signature` shapes we don't recognise).
 */
export function verifyManifestSignature(
  manifest: Record<string, unknown>,
): { signed: boolean; valid: boolean; block?: BundleSignatureBlock } {
  const block = extractSignatureBlock(manifest);
  if (!block) return { signed: false, valid: false };

  try {
    // Reconstruct the blanked payload from the RAW signature object (not the
    // normalized block) so any extra fields a future writer adds to the
    // signature block remain part of the signed bytes.
    const rawBlock = manifest.signature as Record<string, unknown>;
    const payload = signedPayload(manifest, rawBlock);
    const pubKey = crypto.createPublicKey({
      key: Buffer.from(block.signer_pubkey, 'hex'),
      format: 'der',
      type: 'spki',
    });
    const valid = crypto.verify(null, payload, pubKey, Buffer.from(block.sig_base64, 'base64'));
    return { signed: true, valid, block };
  } catch {
    // Malformed key/signature material → signed but unverifiable = invalid.
    return { signed: true, valid: false, block };
  }
}

// ── TOFU signer registry ───────────────────────────────────────────────────

/**
 * Trust-on-first-use bookkeeping for a VALID signature: returns whether this
 * instance has seen the pubkey before, records first sight, bumps counters.
 * Failures (e.g. table missing on an un-migrated install, or the in-memory
 * fake adapters in tests) degrade to `{ known: false }` — never break
 * validation over bookkeeping.
 */
export async function recordAndCheckSigner(
  db: DatabaseAdapter,
  pubkey: string,
  signerName: string | undefined,
): Promise<{ known: boolean; firstSeenName?: string }> {
  try {
    const existing = await db.get<{ signer_name: string | null }>(
      'SELECT signer_name FROM bundle_signers WHERE pubkey = ?',
      pubkey,
    );
    const now = new Date().toISOString();
    if (existing) {
      await db.run(
        'UPDATE bundle_signers SET last_seen_at = ?, bundles_seen = bundles_seen + 1 WHERE pubkey = ?',
        now, pubkey,
      );
      return { known: true, firstSeenName: existing.signer_name ?? undefined };
    }
    await db.run(
      `INSERT INTO bundle_signers (pubkey, signer_name, first_seen_at, last_seen_at, bundles_seen)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT (pubkey) DO NOTHING`,
      pubkey, signerName ?? null, now, now,
    );
    return { known: false };
  } catch {
    return { known: false };
  }
}

// ── Identity status (for the export UI) ────────────────────────────────────

/**
 * Whether this instance can sign bundles, and as whom. Lazily creates the
 * instance identity on first call (same behaviour as evidence-pack
 * finalisation and app enrollment). `available: false` only when the
 * identity infrastructure itself is broken (e.g. table missing).
 */
export async function getSigningIdentityStatus(
  db: DatabaseAdapter,
): Promise<{ available: boolean; signer_pubkey?: string; signer_name?: string }> {
  try {
    const { pubkeyHex } = await getInstanceSigningKeypair(db);
    const name = await readDisplayName(db);
    return { available: true, signer_pubkey: pubkeyHex, ...(name ? { signer_name: name } : {}) };
  } catch {
    return { available: false };
  }
}
