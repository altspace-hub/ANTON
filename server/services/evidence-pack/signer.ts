/**
 * signer.ts — Ed25519 signing for finalised evidence packs (Phase 2).
 *
 * The signing key is the same per-instance Ed25519 keypair the App Gateway
 * uses for enrollment envelopes (table: `instance_identity`). One keypair
 * per ANTON instance means a verifier can confirm "this pack was finalised
 * on this specific ANTON" — which is exactly the trust claim the spec wants
 * (see EVIDENCE_PACK_SPEC.md §9.1: "this pack's contents existed in this
 * exact form at the moment of finalisation, and were finalised by this
 * authenticated user", carried via the instance the user is authenticated
 * to).
 *
 * Per-user signing (where the keypair lives with the human, not the box)
 * is a Phase 4 deliverable. Phase 2 ships instance signing — already enough
 * to satisfy "verify without platform access" if the verifier has the
 * pubkey baked into the manifest, which it does.
 *
 * Key material at rest is AES-256-GCM encrypted via INSTANCE_KEY_ENCRYPTION_KEY,
 * matching the existing `app-enrollment-service.ts` envelope. We deliberately
 * read the same row rather than maintaining a parallel keystore.
 */

import { createCipheriv, createDecipheriv, generateKeyPairSync, sign as edSign } from 'node:crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('evidence-pack-signer');

let warned = false;
function warnPlaintextOnce(): void {
  if (warned) return;
  warned = true;
  log.warn(
    'INSTANCE_KEY_ENCRYPTION_KEY not set — evidence pack signing key stored in plaintext. '
    + 'Set a 32-byte hex key in production.',
  );
}

// ── Encryption (mirror of app-enrollment-service.ts so we don't have to ──
//    expose those private helpers; both write into the same table). ──────

function encKey(): Buffer | null {
  const hex = process.env.INSTANCE_KEY_ENCRYPTION_KEY?.trim();
  if (!hex || hex.length !== 64) return null;
  try { return Buffer.from(hex, 'hex'); } catch { return null; }
}

function encryptPrivkey(plaintextHex: string): { encrypted: Buffer; iv: Buffer } | null {
  const k = encKey();
  if (!k) return null;
  const iv = require('node:crypto').randomBytes(12) as Buffer;
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(plaintextHex, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([ct, tag]), iv };
}

function decryptPrivkey(encrypted: Buffer, iv: Buffer): string {
  const k = encKey();
  if (!k) throw new Error('INSTANCE_KEY_ENCRYPTION_KEY missing — cannot decrypt signing key');
  const tag = encrypted.subarray(encrypted.length - 16);
  const ct = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── Signing key access ─────────────────────────────────────────────────────

interface InstanceKeypair { pubkeyHex: string; privkeyHex: string }

interface InstanceIdentityRow {
  pubkey: string;
  privkey: string | null;
  privkey_encrypted: Buffer | null;
  privkey_iv: Buffer | null;
}

/**
 * Returns the instance Ed25519 signing keypair, lazily creating + persisting
 * one on first use. Idempotent across processes (uses ON CONFLICT NO-OP).
 */
export async function getInstanceSigningKeypair(db: DatabaseAdapter): Promise<InstanceKeypair> {
  const existing = await db.get<InstanceIdentityRow>(
    `SELECT pubkey, privkey, privkey_encrypted, privkey_iv
     FROM instance_identity WHERE singleton = 'singleton'`,
  );
  if (existing) {
    let privkeyHex: string;
    if (existing.privkey_encrypted && existing.privkey_iv) {
      privkeyHex = decryptPrivkey(Buffer.from(existing.privkey_encrypted), Buffer.from(existing.privkey_iv));
    } else if (existing.privkey) {
      privkeyHex = existing.privkey;
      warnPlaintextOnce();
    } else {
      throw new Error('instance_identity row is corrupt — no privkey material');
    }
    return { pubkeyHex: existing.pubkey, privkeyHex };
  }

  // First-use lazy creation. App Gateway also creates this row on first
  // enrollment; whichever subsystem hits it first wins, the other sees the
  // existing row on next call.
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubkeyHex = publicKey.export({ format: 'der', type: 'spki' }).toString('hex');
  const privkeyHex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex');
  const enc = encryptPrivkey(privkeyHex);
  if (!enc) warnPlaintextOnce();

  await db.run(
    `INSERT INTO instance_identity (singleton, pubkey, privkey, privkey_encrypted, privkey_iv, display_name, contact_hash)
     VALUES ('singleton', ?, ?, ?, ?, ?, ?)
     ON CONFLICT (singleton) DO NOTHING`,
    pubkeyHex,
    enc ? null : privkeyHex,
    enc?.encrypted ?? null,
    enc?.iv ?? null,
    process.env.APP_GATEWAY_INSTANCE_NAME || 'ANTON',
    null,
  );

  // If a concurrent caller raced us, re-read.
  const after = await db.get<InstanceIdentityRow>(
    `SELECT pubkey, privkey, privkey_encrypted, privkey_iv
     FROM instance_identity WHERE singleton = 'singleton'`,
  );
  if (!after) throw new Error('Failed to create instance_identity row');
  if (after.privkey_encrypted && after.privkey_iv) {
    return { pubkeyHex: after.pubkey, privkeyHex: decryptPrivkey(Buffer.from(after.privkey_encrypted), Buffer.from(after.privkey_iv)) };
  }
  return { pubkeyHex: after.pubkey, privkeyHex: after.privkey ?? privkeyHex };
}

/**
 * Sign the manifest hash and return the signature + the pubkey to embed
 * in the manifest. Signature is base64url-unpadded for portability.
 */
export async function signManifestHash(
  db: DatabaseAdapter,
  manifestHash: string,
): Promise<{ signature: string; publicKeyHex: string }> {
  const { pubkeyHex, privkeyHex } = await getInstanceSigningKeypair(db);
  // Reconstruct the PKCS8 DER private key from hex.
  const privKeyDer = Buffer.from(privkeyHex, 'hex');
  // Node's `sign(null, data, key)` with an Ed25519 KeyObject does the right
  // thing — Ed25519 doesn't take a hash algorithm parameter.
  const { createPrivateKey } = await import('node:crypto');
  const keyObj = createPrivateKey({ key: privKeyDer, format: 'der', type: 'pkcs8' });
  const sig = edSign(null, Buffer.from(manifestHash, 'utf8'), keyObj);
  // base64url, no padding
  const b64u = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { signature: 'ed25519:' + b64u, publicKeyHex: pubkeyHex };
}
