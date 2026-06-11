/**
 * credential-vault.ts
 * Secure encryption/decryption of sensitive connection credentials.
 * Uses AES-256-GCM for encryption at rest.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';

// Get encryption key — resolution order:
//   1. ENCRYPTION_KEY env var (64-char hex) — preferred for team/production deployments
//   2. Per-installation key file at data/.vault-key — auto-generated on first start
//
// The old hardcoded default seed has been removed. Every installation now gets a
// unique key, so a copy of the SQLite database alone is insufficient to decrypt
// stored credentials.
function getEncryptionKey(): Buffer {
  // Priority 1: explicit env var
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length !== 64) {
      throw new Error(
        '[credential-vault] ENCRYPTION_KEY must be a 64-character hex string. ' +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    return Buffer.from(envKey, 'hex');
  }

  // Priority 2: per-installation key file (./data/.vault-key by default).
  // The legacy DB_PATH env var is still honoured ONLY to locate an existing
  // .vault-key from older installs — changing this would orphan stored
  // credentials. ANTON's own database is PostgreSQL; DB_PATH is otherwise dead.
  const dbPath = process.env.DB_PATH ?? './data/workbench.sqlite';
  const keyFilePath = path.join(path.dirname(path.resolve(dbPath)), '.vault-key');

  if (fs.existsSync(keyFilePath)) {
    const keyHex = fs.readFileSync(keyFilePath, 'utf8').trim();
    return Buffer.from(keyHex, 'hex');
  }

  // First start: generate and persist a unique installation key
  const newKey = crypto.randomBytes(32);
  const newKeyHex = newKey.toString('hex');
  const keyDir = path.dirname(keyFilePath);
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }
  fs.writeFileSync(keyFilePath, newKeyHex, { mode: 0o600 });
  console.warn(
    '\n[credential-vault] Generated a new per-installation encryption key → ' + keyFilePath +
    '\n[credential-vault] To use a portable fixed key instead, set ENCRYPTION_KEY=' + newKeyHex + ' in .env' +
    '\n[credential-vault] Keep this file (or the env var) safe — losing it means losing access to stored credentials.\n'
  );
  return newKey;
}

const SECRET = getEncryptionKey();

/**
 * Encrypt a string value using AES-256-GCM.
 * Returns: "iv:authTag:encrypted" (all hex-encoded)
 */
export function encrypt(text: string): string {
  if (!text || typeof text !== 'string') return text;

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a string encrypted with encrypt().
 */
export function decrypt(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string') return encrypted;

  try {
    const [ivHex, authTagHex, encryptedHex] = encrypted.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) return encrypted; // Not encrypted format

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      SECRET,
      Buffer.from(ivHex, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final()
    ]).toString('utf8');
  } catch (err) {
    console.error('[credential-vault] Decryption failed:', err);
    return encrypted; // Return as-is if decryption fails
  }
}

/**
 * Automatically encrypt sensitive fields in a connection config.
 * Adds _encrypted flag for each encrypted field.
 */
export function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_FIELDS = [
    'password',
    'auth_value',
    'api_key',
    'token',
    'secret',
    'client_secret',
    'bearer_token',
  ];

  const result = { ...config };

  for (const key of SENSITIVE_FIELDS) {
    if (result[key] && typeof result[key] === 'string') {
      const original = result[key] as string;
      // Don't re-encrypt already encrypted values
      if (!original.match(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/)) {
        result[key] = encrypt(original);
        result[`${key}_encrypted`] = true;
      }
    }
  }

  return result;
}

/**
 * Decrypt sensitive fields in a connection config.
 * Removes _encrypted flags after decryption.
 */
export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (result[`${key}_encrypted`] && typeof value === 'string') {
      result[key] = decrypt(value);
      delete result[`${key}_encrypted`];
    }
  }

  return result;
}

/**
 * Generate a new random encryption key (for initial setup).
 * Returns a 64-character hex string.
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
