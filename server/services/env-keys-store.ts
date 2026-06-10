/**
 * env-keys-store.ts — persistence for provider API keys set via Settings UI.
 *
 * Before this module existed, POST /api/settings/set-env wrote keys to
 * process.env only — they vanished on restart (the #1 first-run blocker for
 * GitHub-clone installs: no way to set ANTHROPIC_API_KEY without editing
 * .env). Now every allowed key is written through to the `app_settings`
 * table and restored into process.env at boot, BEFORE any LLM client is
 * constructed.
 *
 * At-rest encryption: when INSTANCE_KEY_ENCRYPTION_KEY (32-byte hex) is set,
 * values are AES-256-GCM encrypted via server/util/at-rest-encryption.ts.
 * Without it, values are stored plaintext in app_settings and a one-time
 * warning is logged — at-rest encryption activates automatically for new
 * writes once the env key is set.
 *
 * Precedence: a key persisted via the Settings UI OVERRIDES the .env value
 * at boot (the UI write is the most recent deliberate intent). Clearing the
 * key in Settings deletes the persisted row; the .env value applies again
 * after the next restart.
 *
 * SECURITY: never log or return key VALUES — names and booleans only.
 */

import type { DatabaseAdapter } from '../db/database.js';
import {
  encryptUtf8,
  decryptUtf8,
  warnPlaintextOnce,
} from '../util/at-rest-encryption.js';

/** Single source of truth for which env vars may be set via the Settings
 *  endpoint AND restored from app_settings at boot. Restoring is allowlisted
 *  so stray DB rows can never inject arbitrary environment variables. */
export const PERSISTABLE_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'MISTRAL_API_KEY',
  'CUSTOM_MODEL_1_API_KEY',
  'CUSTOM_MODEL_2_API_KEY',
]);

const SETTING_PREFIX = 'env_key:';

interface StoredEnvKeyV1 {
  v: 1;
  /** base64(ciphertext ‖ 16-byte GCM tag) — present when encrypted. */
  enc?: string;
  /** base64(12-byte IV) — present when encrypted. */
  iv?: string;
  /** Plaintext fallback when INSTANCE_KEY_ENCRYPTION_KEY is unset. */
  plain?: string;
}

/**
 * Write-through persist a provider key. `value === null` deletes the row
 * (used when the user clears a key in Settings). Throws on unknown keys.
 */
export async function persistEnvKey(
  db: DatabaseAdapter,
  envVar: string,
  value: string | null,
): Promise<void> {
  if (!PERSISTABLE_ENV_KEYS.has(envVar)) {
    throw new Error(`'${envVar}' is not a persistable env key`);
  }
  const settingKey = `${SETTING_PREFIX}${envVar}`;
  if (value === null || value.length === 0) {
    await db.run('DELETE FROM app_settings WHERE key = ?', settingKey);
    return;
  }
  let stored: StoredEnvKeyV1;
  const encrypted = encryptUtf8(value);
  if (encrypted) {
    stored = {
      v: 1,
      enc: encrypted.encrypted.toString('base64'),
      iv: encrypted.iv.toString('base64'),
    };
  } else {
    // No INSTANCE_KEY_ENCRYPTION_KEY — store plaintext (dev mode) with a
    // one-time warning. Encryption activates for new saves once the env
    // key is set.
    warnPlaintextOnce('settings');
    stored = { v: 1, plain: value };
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    settingKey,
    JSON.stringify(stored),
  );
}

/**
 * Boot-time loader: restore all persisted keys into process.env. Must run
 * BEFORE any Anthropic/OpenAI/etc. client is constructed (claude-client's
 * getClient singleton, the quality-scoring instance in server/index.ts,
 * route factories). Returns the env-var NAMES restored (for logging —
 * never values).
 */
export async function loadPersistedEnvKeys(db: DatabaseAdapter): Promise<string[]> {
  const rows = await db.all<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings WHERE key LIKE ?',
    `${SETTING_PREFIX}%`,
  );
  const restored: string[] = [];
  for (const row of rows) {
    const envVar = row.key.slice(SETTING_PREFIX.length);
    if (!PERSISTABLE_ENV_KEYS.has(envVar)) continue; // allowlist — ignore stray rows
    try {
      const stored = JSON.parse(row.value) as StoredEnvKeyV1;
      let value: string | undefined;
      if (stored.enc && stored.iv) {
        value = decryptUtf8(
          Buffer.from(stored.enc, 'base64'),
          Buffer.from(stored.iv, 'base64'),
        );
      } else if (typeof stored.plain === 'string') {
        value = stored.plain;
      }
      if (value && value.length > 0) {
        process.env[envVar] = value;
        restored.push(envVar);
      }
    } catch (err) {
      // Decrypt fails when INSTANCE_KEY_ENCRYPTION_KEY changed or was
      // removed. Log the key NAME only — never the value or ciphertext.
      console.warn(
        `[settings] could not restore persisted key ${envVar}: ${err instanceof Error ? err.message : 'parse/decrypt error'}`,
      );
    }
  }
  return restored;
}
