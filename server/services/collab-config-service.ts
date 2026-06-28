/**
 * collab-config-service.ts — where this instance finds the owner's
 * anton-collaboration standalone (the agent's task inbox / commerce brain
 * running on their computer).
 *
 * Mirror of agent-pay-config-service.ts (the W1 wallet rail): the ANTON Agent
 * phone app posts tasks + polls the agent's replies THROUGH this instance. The
 * instance holds the collaboration `/pair` bearer; the phone authenticates with
 * its app-session. Persists { url, bearer } in `app_settings` (bearer
 * AES-256-GCM encrypted when INSTANCE_KEY_ENCRYPTION_KEY is set), survives
 * restarts, readable at request time (no reboot).
 *
 * SECURITY: never log or return the bearer — only the URL + configured boolean.
 */

import type { DatabaseAdapter } from '../db/database.js';
import {
  encryptUtf8,
  decryptUtf8,
  warnPlaintextOnce,
} from '../util/at-rest-encryption.js';

const SETTING_KEY = 'collab_config';

export interface CollabConfig {
  url: string;
  bearer: string;
}

interface StoredV1 {
  v: 1;
  url: string;
  enc?: string;
  iv?: string;
  plain?: string;
}

function normalizeUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid collaboration URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('collaboration URL must be http(s)');
  }
  return url;
}

export async function getCollabConfig(db: DatabaseAdapter): Promise<CollabConfig | null> {
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
    return null;
  }
}

export async function getCollabConfigPublic(
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

export async function setCollabConfig(db: DatabaseAdapter, cfg: CollabConfig): Promise<void> {
  const url = normalizeUrl(cfg.url);
  if (!cfg.bearer || cfg.bearer.length < 8) {
    throw new Error('Invalid collaboration bearer');
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
    warnPlaintextOnce('collab');
    stored = { v: 1, url, plain: cfg.bearer };
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    SETTING_KEY,
    JSON.stringify(stored),
  );
}

export async function clearCollabConfig(db: DatabaseAdapter): Promise<void> {
  await db.run('DELETE FROM app_settings WHERE key = ?', SETTING_KEY);
}
