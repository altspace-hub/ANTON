/**
 * at-rest-encryption.ts — AES-256-GCM helper for secrets stored in the DB.
 *
 * Generalised from `app-enrollment-service.ts::encryptPrivkey` /
 * `decryptPrivkey` (Phase H fix H2). Used by:
 *   • `app-enrollment-service.ts` — instance Ed25519 identity privkey
 *   • `fc-wallet-service.ts`      — Phase 2: FutureChain wallet privkey
 *                                    and human-wallet mnemonic
 *
 * Key source: `process.env.INSTANCE_KEY_ENCRYPTION_KEY` — a 32-byte hex
 * string (64 hex chars). When unset, `encrypt*()` returns `null` so
 * callers can fall back to plaintext for dev mode (with a one-time
 * warning via `warnPlaintextOnce`). `decrypt*()` THROWS if the key is
 * missing — there is no "guess it" fallback.
 *
 * Wire format on disk: `[ciphertext ‖ 16-byte GCM tag]` in one blob
 * column, with the 12-byte IV in a sibling column. Same shape
 * `app-enrollment-service.ts` established for the instance privkey.
 */
import crypto from 'node:crypto';

let warnedNoKey = false;

/** Resolve the 32-byte AES key from the env var. Returns null if unset
 *  or if the value isn't exactly 32 bytes after hex-decoding. */
export function getEncryptionKey(): Buffer | null {
  const k = process.env['INSTANCE_KEY_ENCRYPTION_KEY'];
  if (!k) return null;
  let buf: Buffer;
  try { buf = Buffer.from(k, 'hex'); } catch { return null; }
  return buf.length === 32 ? buf : null;
}

/** Emit a one-time stderr warning that secrets are being stored
 *  plaintext. Idempotent — subsequent calls in the same process are
 *  no-ops. */
export function warnPlaintextOnce(component: string): void {
  if (warnedNoKey) return;
  warnedNoKey = true;
  console.warn(
    `[${component}] WARNING: INSTANCE_KEY_ENCRYPTION_KEY is not set — secret material is stored in PLAINTEXT. Set the env var to a 32-byte hex string for production.`,
  );
}

/** Encrypt arbitrary bytes under AES-256-GCM with a fresh random 12-byte
 *  IV. Returns `null` if the env key is missing (callers should then
 *  store plaintext + log via `warnPlaintextOnce`). */
export function encryptBlob(
  plaintext: Buffer,
): { encrypted: Buffer; iv: Buffer } | null {
  const key = getEncryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([ciphertext, tag]), iv };
}

/** Decrypt the (ciphertext ‖ 16-byte GCM tag) blob with the given IV.
 *  THROWS if the env key is missing or the tag does not verify. */
export function decryptBlob(encrypted: Buffer, iv: Buffer): Buffer {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      'at-rest-encryption.decryptBlob: INSTANCE_KEY_ENCRYPTION_KEY missing — cannot decrypt',
    );
  }
  if (encrypted.length < 17) {
    throw new Error(
      `at-rest-encryption.decryptBlob: blob too short (${encrypted.length} bytes < 17)`,
    );
  }
  const tag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Hex convenience: encrypt a hex string. Returns null if key is unset. */
export function encryptHex(
  plaintextHex: string,
): { encrypted: Buffer; iv: Buffer } | null {
  return encryptBlob(Buffer.from(plaintextHex, 'hex'));
}

/** Hex convenience: decrypt to a hex string. Throws if key is unset. */
export function decryptHex(encrypted: Buffer, iv: Buffer): string {
  return decryptBlob(encrypted, iv).toString('hex');
}

/** UTF-8 convenience: encrypt a string (e.g. mnemonic). */
export function encryptUtf8(
  plaintext: string,
): { encrypted: Buffer; iv: Buffer } | null {
  return encryptBlob(Buffer.from(plaintext, 'utf8'));
}

/** UTF-8 convenience: decrypt to a string. */
export function decryptUtf8(encrypted: Buffer, iv: Buffer): string {
  return decryptBlob(encrypted, iv).toString('utf8');
}
