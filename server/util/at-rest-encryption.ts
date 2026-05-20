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

// ──────────────────────────────────────────────────────────────────────
// Phase B3 (May 20 2026) — per-wallet envelope encryption
// ──────────────────────────────────────────────────────────────────────
//
// The bare `encryptBlob` / `decryptBlob` above key AES-256-GCM directly
// off the master env key. That means a single master-key compromise
// decrypts every secret on the instance. The functions below derive a
// per-context key via PBKDF2 so the master never touches AES-GCM
// directly and the blast radius of a key leak is one context (e.g. one
// wallet row).
//
// On-disk shape is unchanged (ciphertext + IV blobs). The discriminator
// is the `key_version` column on the calling table:
//   • 1 = legacy direct-master encryption (decryptBlob path)
//   • 2 = derived per-context encryption (decryptForContext path)

/** PBKDF2 iteration count. NIST SP 800-132 recommends ≥10_000; 100_000
 *  is the OWASP 2023 baseline and matches what the app-enrollment flow
 *  uses for the user-password PBKDF. */
export const ENVELOPE_PBKDF2_ITERATIONS = 100_000;

/** Application-wide "purpose" tag mixed into the salt, so the same
 *  master + context bytes used in two different domains derive
 *  different keys. */
const ENVELOPE_SALT_PREFIX = 'anton:envelope:v2:';

/** Derive a per-context 32-byte AES key from the master env key via
 *  PBKDF2-HMAC-SHA-256. `context` is the row-identifying token mixed
 *  into the salt — for `fc_wallets` rows pass `"fc_wallets:" + wallet_id`.
 *  Returns null if the master env key is unset or wrong length. */
export function deriveContextKey(context: string): Buffer | null {
  const master = getEncryptionKey();
  if (!master) return null;
  const salt = crypto.createHash('sha256')
    .update(ENVELOPE_SALT_PREFIX + context, 'utf8')
    .digest();
  return crypto.pbkdf2Sync(
    master,
    salt,
    ENVELOPE_PBKDF2_ITERATIONS,
    32,
    'sha256',
  );
}

/** Encrypt under a derived per-context key (key_version=2 wire format).
 *  Returns the ciphertext+tag and IV exactly like `encryptBlob`, plus
 *  the envelope version it produced. Returns null if the master env
 *  key is unset. */
export function encryptForContext(
  plaintext: Buffer,
  context: string,
): { encrypted: Buffer; iv: Buffer; keyVersion: 2 } | null {
  const derived = deriveContextKey(context);
  if (!derived) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([ciphertext, tag]), iv, keyVersion: 2 };
}

/** Decrypt under a derived per-context key (key_version=2 path).
 *  Throws if the master env key is missing or the tag does not verify. */
export function decryptForContext(
  encrypted: Buffer,
  iv: Buffer,
  context: string,
): Buffer {
  const derived = deriveContextKey(context);
  if (!derived) {
    throw new Error(
      'at-rest-encryption.decryptForContext: INSTANCE_KEY_ENCRYPTION_KEY missing — cannot decrypt',
    );
  }
  if (encrypted.length < 17) {
    throw new Error(
      `at-rest-encryption.decryptForContext: blob too short (${encrypted.length} bytes < 17)`,
    );
  }
  const tag = encrypted.subarray(encrypted.length - 16);
  const ciphertext = encrypted.subarray(0, encrypted.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Version-aware decrypt: routes to the legacy direct-master path
 *  (v1 or unset) or the derived path (v2) by the row's `key_version`
 *  column value. `context` is required even for v1 calls so the call
 *  sites read uniformly, but it is ignored on the legacy path. */
export function decryptVersioned(
  encrypted: Buffer,
  iv: Buffer,
  keyVersion: number | null | undefined,
  context: string,
): Buffer {
  if ((keyVersion ?? 1) >= 2) {
    return decryptForContext(encrypted, iv, context);
  }
  return decryptBlob(encrypted, iv);
}

/** The salt-context string for `fc_wallets` rows. Centralised so the
 *  encrypt and decrypt sites never disagree. */
export function fcWalletContext(walletId: string): string {
  return `fc_wallets:${walletId}`;
}
