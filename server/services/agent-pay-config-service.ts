/**
 * agent-pay-config-service.ts — where this instance finds the owner's
 * Agent-Pay standalone (the agent's FutureChain wallet running on their
 * computer).
 *
 * The ANTON Agent phone app reads the agent's wallet THROUGH this instance
 * (the phone never reaches localhost directly). The instance holds the
 * agent-pay `/pair` bearer; the phone authenticates with its app-session.
 * This module persists { url, bearer } in `app_settings` so the wiring
 * survives restarts and is readable at request time (no reboot needed).
 *
 * At-rest encryption: the bearer is AES-256-GCM encrypted via
 * server/util/at-rest-encryption.ts when INSTANCE_KEY_ENCRYPTION_KEY is set;
 * otherwise it is stored plaintext with a one-time warning (dev mode). The
 * URL is not secret and is stored in clear.
 *
 * SECURITY: never log or return the bearer — only the URL + a configured
 * boolean are surfaced to the operator UI.
 */

import type { DatabaseAdapter } from '../db/database.js';
import {
  encryptUtf8,
  decryptUtf8,
  warnPlaintextOnce,
} from '../util/at-rest-encryption.js';

const SETTING_KEY = 'agent_pay_config';

export interface AgentPayConfig {
  url: string;
  bearer: string;
}

interface StoredV1 {
  v: 1;
  url: string;
  /** base64(ciphertext ‖ 16-byte GCM tag) of the bearer — present when encrypted. */
  enc?: string;
  /** base64(12-byte IV) — present when encrypted. */
  iv?: string;
  /** Plaintext bearer fallback when INSTANCE_KEY_ENCRYPTION_KEY is unset. */
  plain?: string;
}

function normalizeUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid agent-pay URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('agent-pay URL must be http(s)');
  }
  return url;
}

/** Full config including the decrypted bearer — server-side use only. */
export async function getAgentPayConfig(db: DatabaseAdapter): Promise<AgentPayConfig | null> {
  const row = await db.get<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    SETTING_KEY,
  );
  if (!row) return null;
  try {
    const s = JSON.parse(row.value) as StoredV1;
    if (!s.url) return null;
    let bearer: string | undefined;
    if (s.enc && s.iv) {
      bearer = decryptUtf8(Buffer.from(s.enc, 'base64'), Buffer.from(s.iv, 'base64'));
    } else if (typeof s.plain === 'string') {
      bearer = s.plain;
    }
    if (!bearer) return null;
    return { url: s.url, bearer };
  } catch {
    // Decrypt fails when INSTANCE_KEY_ENCRYPTION_KEY changed/was removed.
    return null;
  }
}

/** URL + configured flag only — safe to surface to the operator (no bearer). */
export async function getAgentPayConfigPublic(
  db: DatabaseAdapter,
): Promise<{ configured: boolean; url: string | null }> {
  const row = await db.get<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    SETTING_KEY,
  );
  if (!row) return { configured: false, url: null };
  try {
    const s = JSON.parse(row.value) as StoredV1;
    return { configured: Boolean(s.url && (s.enc || s.plain)), url: s.url ?? null };
  } catch {
    return { configured: false, url: null };
  }
}

export async function setAgentPayConfig(db: DatabaseAdapter, cfg: AgentPayConfig): Promise<void> {
  const url = normalizeUrl(cfg.url);
  if (!cfg.bearer || cfg.bearer.length < 8) {
    throw new Error('Invalid agent-pay bearer');
  }

  let stored: StoredV1;
  const encrypted = encryptUtf8(cfg.bearer);
  if (encrypted) {
    stored = {
      v: 1,
      url,
      enc: encrypted.encrypted.toString('base64'),
      iv: encrypted.iv.toString('base64'),
    };
  } else {
    warnPlaintextOnce('agent-pay');
    stored = { v: 1, url, plain: cfg.bearer };
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    SETTING_KEY,
    JSON.stringify(stored),
  );
}

export async function clearAgentPayConfig(db: DatabaseAdapter): Promise<void> {
  await db.run('DELETE FROM app_settings WHERE key = ?', SETTING_KEY);
}
