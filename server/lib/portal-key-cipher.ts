/**
 * portal-key-cipher.ts — at-rest encryption for portal private keys.
 *
 * Mirrors the AES-256-GCM scheme in app-enrollment-service.ts, but stores
 * the ciphertext + iv inline in the existing TEXT column with a versioned
 * envelope prefix. No schema migration required.
 *
 * Envelope formats:
 *   `enc:v1:<iv-base64>:<ciphertext-base64>`  — encrypted (with 16B GCM tag suffix)
 *   `<raw PEM>`                                — legacy plaintext (backwards-compat)
 *
 * On read, the prefix tells us which format. New writes always use
 * `enc:v1:` when INSTANCE_KEY_ENCRYPTION_KEY is set; otherwise we fall
 * back to plaintext + log the same one-time warning that
 * app-enrollment-service.ts uses.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { childLogger } from './logger.js';

const log = childLogger('portal-key-cipher');

const PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer | null {
  const k = process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  if (!k) return null;
  const buf = Buffer.from(k, 'hex');
  return buf.length === 32 ? buf : null;
}

let warnedNoEncKey = false;
function warnPlaintextOnce(): void {
  if (warnedNoEncKey) return;
  warnedNoEncKey = true;
  log.warn(
    'INSTANCE_KEY_ENCRYPTION_KEY is not set — portal private keys are stored in PLAINTEXT. ' +
    'Set the env var to a 32-byte hex string for production.',
  );
}

/**
 * Encrypt a PEM private key for storage. Returns the value to write into
 * `portals.private_key_pem`. When encryption is disabled (no env key),
 * returns the input verbatim and emits a one-time warning.
 */
export function encryptPortalKey(privateKeyPem: string): string {
  const key = getEncryptionKey();
  if (!key) {
    warnPlaintextOnce();
    return privateKeyPem;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(privateKeyPem, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([enc, tag]).toString('base64');
  return `${PREFIX}${iv.toString('base64')}:${blob}`;
}

/**
 * Decrypt the value read from `portals.private_key_pem`. Auto-detects
 * envelope format: returns the value as-is if it doesn't carry the prefix
 * (legacy plaintext rows from before this lands).
 */
export function decryptPortalKey(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 2) {
    throw new Error('decryptPortalKey: malformed envelope');
  }
  const iv = Buffer.from(parts[0], 'base64');
  const blob = Buffer.from(parts[1], 'base64');
  if (blob.length < 16) throw new Error('decryptPortalKey: ciphertext too short');
  const ciphertext = blob.subarray(0, blob.length - 16);
  const tag = blob.subarray(blob.length - 16);
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('decryptPortalKey: INSTANCE_KEY_ENCRYPTION_KEY missing — cannot decrypt');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}

/** True if the stored value uses the encrypted envelope. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
