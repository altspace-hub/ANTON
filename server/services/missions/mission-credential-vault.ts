// ── Missions — Credential Vault Service (Phase 2) ──────────────────────────
//
// Builds on the existing aes-256-gcm encrypt()/decrypt() helpers from
// server/services/credential-vault.ts. Adds per-credential rows in
// missions.credential_vault, OAuth token-refresh helpers, audit logging,
// and per-mission/per-template scoping.
//
// SECURITY: credentials NEVER touch the LLM. The LLM decides what to do;
// the execution layer (this service) handles auth. We log every read.

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { encrypt, decrypt } from '../credential-vault.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('mission-credential-vault');

export type CredentialType =
  | 'api_key'
  | 'oauth2'
  | 'username_password'
  | 'client_certificate'
  | 'cookie_jar'
  | 'bearer_token';

export type AccessType = 'read' | 'refresh' | 'rotate' | 'revoke' | 'create';

export interface StoredCredential {
  id: string;
  name: string;
  credential_type: CredentialType;
  service_name: string | null;
  allowed_mission_templates: string[];
  allowed_services: string[];
  oauth_token_url: string | null;
  oauth_expires_at: string | null;
  oauth_scopes: string | null;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  // Note: encrypted_data, oauth_refresh_token_encrypted are NEVER returned
  // to API consumers. Only resolveCredential() inside this service can
  // access them.
}

export interface CreateCredentialInput {
  name: string;
  credential_type: CredentialType;
  service_name?: string;
  /** The actual secret material (will be encrypted at rest) */
  secret: string;
  oauth_token_url?: string;
  oauth_refresh_token?: string;
  oauth_expires_at?: string;
  oauth_scopes?: string;
  allowed_mission_templates?: string[];
  allowed_services?: string[];
  expires_at?: string;
}

interface CredentialRow {
  id: string;
  name: string;
  credential_type: string;
  service_name: string | null;
  encrypted_data: string;
  encryption_key_id: string;
  allowed_mission_templates: unknown;
  allowed_services: unknown;
  oauth_token_url: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_expires_at: string | null;
  oauth_scopes: string | null;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

function asJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
}

function newCredId(): string {
  return `cred_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

// ── OAuth2 token refresh (Wave-3 3A.2) ──────────────────────────────────────
// refreshOauthToken() existed with zero callers — the Gmail pack died after
// ~1h when the access token expired. resolveSecret() now refreshes
// proactively when the stored expiry is within the skew window. The pure
// decision/parse/response helpers below are exported for unit tests; no
// token value is ever logged.

/** Refresh when the token expires within this window (covers clock skew + in-flight request time). */
export const OAUTH_REFRESH_SKEW_MS = 60_000;

export interface OauthRefreshDecisionInput {
  credential_type: string;
  oauth_token_url: string | null;
  oauth_expires_at: string | null;
  /** Whether an encrypted refresh token is stored. */
  has_refresh_token: boolean;
}

/**
 * True when a proactive refresh should be attempted before returning the
 * secret: oauth2 credential, refresh machinery present (token URL + refresh
 * token), and a parseable expiry within now+60s. A missing or unparseable
 * expiry returns false — we can't know the token is stale, and a failed API
 * call surfaces visibly downstream anyway.
 */
export function needsOauthRefresh(c: OauthRefreshDecisionInput, nowMs: number = Date.now()): boolean {
  if (c.credential_type !== 'oauth2') return false;
  if (!c.oauth_token_url || !c.has_refresh_token) return false;
  if (!c.oauth_expires_at) return false;
  const expiresMs = Date.parse(c.oauth_expires_at);
  if (!Number.isFinite(expiresMs)) return false;
  return expiresMs < nowMs + OAUTH_REFRESH_SKEW_MS;
}

export interface OauthSecretShape {
  access_token: string;
  client_id?: string;
  client_secret?: string;
  /** True when the stored secret was a JSON object (shape preserved on re-serialisation). */
  is_json: boolean;
  /** Other fields from a JSON-shaped secret, preserved verbatim. */
  extra: Record<string, unknown>;
}

/**
 * An oauth2 secret may be stored either as the raw access token string or
 * as a JSON object `{ "access_token": "…", "client_id": "…",
 * "client_secret": "…" }` (client fields are required by most token
 * endpoints — Google included — when refreshing).
 */
export function parseOauthSecret(secret: string): OauthSecretShape {
  const trimmed = secret.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.access_token === 'string' && obj.access_token) {
          const { access_token, client_id, client_secret, ...extra } = obj;
          return {
            access_token,
            client_id: typeof client_id === 'string' ? client_id : undefined,
            client_secret: typeof client_secret === 'string' ? client_secret : undefined,
            is_json: true,
            extra,
          };
        }
      }
    } catch { /* fall through — treat as raw token */ }
  }
  return { access_token: secret, is_json: false, extra: {} };
}

/** Re-serialise the secret with a new access token, preserving the original shape (raw string vs JSON with client fields). */
export function serialiseOauthSecret(shape: OauthSecretShape, newAccessToken: string): string {
  if (!shape.is_json) return newAccessToken;
  return JSON.stringify({
    ...shape.extra,
    ...(shape.client_id !== undefined ? { client_id: shape.client_id } : {}),
    ...(shape.client_secret !== undefined ? { client_secret: shape.client_secret } : {}),
    access_token: newAccessToken,
  });
}

export type OauthRefreshOutcome =
  | { ok: true; access_token: string; expires_at: string; refresh_token?: string }
  | { ok: false; reason: string };

/**
 * POST grant_type=refresh_token to the token endpoint (RFC 6749 §6,
 * form-encoded). client_id/client_secret are included when stored. Returns
 * the new access token + computed ISO expiry (expires_in defaults to 3600s
 * when the provider omits it) + the rotated refresh token when the provider
 * returns one. Never throws — failures come back as { ok: false, reason }
 * with NO token material in the reason.
 */
export async function requestOauthTokenRefresh(args: {
  tokenUrl: string;
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  timeoutMs?: number;
}): Promise<OauthRefreshOutcome> {
  const fetchFn = args.fetchImpl ?? fetch;
  const nowMs = args.nowMs ?? Date.now();
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: args.refreshToken });
  if (args.clientId) body.set('client_id', args.clientId);
  if (args.clientSecret) body.set('client_secret', args.clientSecret);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs ?? 15_000);
  let payload: unknown;
  let status: number;
  try {
    const res = await fetchFn(args.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: ctrl.signal,
    });
    status = res.status;
    try { payload = await res.json(); } catch { payload = null; }
  } catch (err) {
    return { ok: false, reason: `transport error: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }

  const obj = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? payload as Record<string, unknown>
    : {};
  if (status < 200 || status >= 300) {
    // OAuth error codes (e.g. invalid_grant) are safe to surface; token values are not.
    const code = typeof obj.error === 'string' ? ` (${obj.error})` : '';
    return { ok: false, reason: `HTTP ${status}${code}` };
  }
  if (typeof obj.access_token !== 'string' || !obj.access_token) {
    return { ok: false, reason: 'token endpoint returned no access_token' };
  }
  const expiresInSec = typeof obj.expires_in === 'number' && Number.isFinite(obj.expires_in) && obj.expires_in > 0
    ? obj.expires_in
    : 3600;
  return {
    ok: true,
    access_token: obj.access_token,
    expires_at: new Date(nowMs + expiresInSec * 1000).toISOString(),
    refresh_token: typeof obj.refresh_token === 'string' && obj.refresh_token ? obj.refresh_token : undefined,
  };
}

export function createCredentialVault(db: DatabaseAdapter) {

  async function createCredential(input: CreateCredentialInput, createdByUserId: string): Promise<StoredCredential> {
    if (!input.name?.trim()) throw new Error('Credential name is required');
    if (!input.secret) throw new Error('Credential secret is required');

    const id = newCredId();
    const encryptedData = encrypt(input.secret);
    const refreshEncrypted = input.oauth_refresh_token ? encrypt(input.oauth_refresh_token) : null;

    await db.run(
      `INSERT INTO missions.credential_vault
        (id, name, credential_type, service_name, encrypted_data,
         allowed_mission_templates, allowed_services,
         oauth_token_url, oauth_refresh_token_encrypted, oauth_expires_at, oauth_scopes,
         created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, input.name.trim(), input.credential_type, input.service_name ?? null, encryptedData,
      JSON.stringify(input.allowed_mission_templates ?? ['*']),
      JSON.stringify(input.allowed_services ?? ['*']),
      input.oauth_token_url ?? null, refreshEncrypted, input.oauth_expires_at ?? null, input.oauth_scopes ?? null,
      createdByUserId, input.expires_at ?? null,
    );

    await logAccess(id, 'create', { service: input.service_name });
    const stored = await getCredentialMeta(id);
    if (!stored) throw new Error('Credential disappeared after insert');
    return stored;
  }

  /**
   * Returns metadata only (no secret). Safe for API responses + audit.
   */
  async function getCredentialMeta(id: string): Promise<StoredCredential | null> {
    const row = await db.get<CredentialRow>(`SELECT * FROM missions.credential_vault WHERE id = ?`, id);
    if (!row) return null;
    return rowToMeta(row);
  }

  async function listCredentials(filter?: { service?: string; activeOnly?: boolean }): Promise<StoredCredential[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter?.service) { where.push('service_name = ?'); args.push(filter.service); }
    if (filter?.activeOnly !== false) { where.push('is_active = TRUE'); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.all<CredentialRow>(
      `SELECT * FROM missions.credential_vault ${whereSql} ORDER BY created_at DESC`,
      ...args,
    );
    return rows.map(rowToMeta);
  }

  /**
   * INTERNAL: resolve the actual decrypted secret. Logs every access.
   * Callers MUST ensure they're using this only in server-side execution
   * paths that don't surface the result to LLM prompts or to API responses.
   *
   * For oauth2 credentials the return value is the ACCESS TOKEN (extracted
   * from a JSON-shaped secret when one is stored) — that's what every
   * caller puts in `Authorization: Bearer`. When the stored expiry is
   * within OAUTH_REFRESH_SKEW_MS, the token is refreshed first (3A.2);
   * a refresh failure logs the credential id/name only and returns the
   * stale token so the downstream API call 401s visibly instead of the
   * mission dying silently inside the vault.
   */
  async function resolveSecret(id: string, missionId?: string, taskId?: string): Promise<string | null> {
    const row = await db.get<CredentialRow>(`SELECT * FROM missions.credential_vault WHERE id = ? AND is_active = TRUE`, id);
    if (!row) {
      await logAccess(id, 'read', { mission_id: missionId, task_id: taskId, success: false, error: 'Not found or inactive' });
      return null;
    }
    try {
      const secret = decrypt(row.encrypted_data);
      const refreshed = await maybeRefreshOauth(row, secret, missionId, taskId);
      await db.run(
        `UPDATE missions.credential_vault SET last_used_at = NOW() WHERE id = ?`,
        id,
      );
      await logAccess(id, 'read', { mission_id: missionId, task_id: taskId, service: row.service_name });
      if (refreshed !== null) return refreshed;
      return row.credential_type === 'oauth2' ? parseOauthSecret(secret).access_token : secret;
    } catch (err) {
      await logAccess(id, 'read', { mission_id: missionId, task_id: taskId, success: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /**
   * Proactive oauth2 refresh inside resolveSecret. Returns the fresh access
   * token when a refresh happened, or null when no refresh was needed OR
   * the refresh failed (caller falls back to the stale token). Never logs
   * token values — key name + id only.
   */
  async function maybeRefreshOauth(
    row: CredentialRow,
    secret: string,
    missionId?: string,
    taskId?: string,
  ): Promise<string | null> {
    const due = needsOauthRefresh({
      credential_type: row.credential_type,
      oauth_token_url: row.oauth_token_url,
      oauth_expires_at: row.oauth_expires_at,
      has_refresh_token: Boolean(row.oauth_refresh_token_encrypted),
    });
    if (!due) return null;
    try {
      const refreshToken = decrypt(row.oauth_refresh_token_encrypted as string);
      const shape = parseOauthSecret(secret);
      const outcome = await requestOauthTokenRefresh({
        tokenUrl: row.oauth_token_url as string,
        refreshToken,
        clientId: shape.client_id,
        clientSecret: shape.client_secret,
      });
      if (!outcome.ok) {
        log.warn({ credentialId: row.id, credentialName: row.name, reason: outcome.reason }, 'oauth_refresh_failed');
        await logAccess(row.id, 'refresh', { mission_id: missionId, task_id: taskId, service: row.service_name, success: false, error: outcome.reason });
        return null;
      }
      // Some providers rotate the refresh token on use — persist it when returned.
      await refreshOauthToken(
        row.id,
        serialiseOauthSecret(shape, outcome.access_token),
        outcome.expires_at,
        outcome.refresh_token,
      );
      log.info({ credentialId: row.id, credentialName: row.name }, 'oauth_refresh_ok');
      return outcome.access_token;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log.warn({ credentialId: row.id, credentialName: row.name, reason }, 'oauth_refresh_failed');
      await logAccess(row.id, 'refresh', { mission_id: missionId, task_id: taskId, service: row.service_name, success: false, error: reason }).catch(() => { /* best-effort */ });
      return null;
    }
  }

  /**
   * Rotate a credential — replace the secret with a new one, keeping the
   * same id (so missions referencing it don't break).
   */
  async function rotateCredential(id: string, newSecret: string): Promise<void> {
    const row = await db.get<{ id: string }>(`SELECT id FROM missions.credential_vault WHERE id = ?`, id);
    if (!row) throw new Error('Credential not found');
    await db.run(
      `UPDATE missions.credential_vault SET encrypted_data = ? WHERE id = ?`,
      encrypt(newSecret), id,
    );
    await logAccess(id, 'rotate');
  }

  async function revokeCredential(id: string): Promise<void> {
    await db.run(`UPDATE missions.credential_vault SET is_active = FALSE WHERE id = ?`, id);
    await logAccess(id, 'revoke');
  }

  async function refreshOauthToken(id: string, newAccessToken: string, newExpiresAt: string, newRefreshToken?: string): Promise<void> {
    if (newRefreshToken) {
      await db.run(
        `UPDATE missions.credential_vault SET encrypted_data = ?, oauth_refresh_token_encrypted = ?, oauth_expires_at = ? WHERE id = ?`,
        encrypt(newAccessToken), encrypt(newRefreshToken), newExpiresAt, id,
      );
    } else {
      await db.run(
        `UPDATE missions.credential_vault SET encrypted_data = ?, oauth_expires_at = ? WHERE id = ?`,
        encrypt(newAccessToken), newExpiresAt, id,
      );
    }
    await logAccess(id, 'refresh');
  }

  /**
   * Check whether a credential is allowed for a given mission template +
   * service. Wildcard '*' allows everything.
   */
  function isAllowed(cred: StoredCredential, templateId: string | null, service: string | null): boolean {
    const tplOK = cred.allowed_mission_templates.includes('*')
      || (templateId != null && cred.allowed_mission_templates.includes(templateId));
    const svcOK = cred.allowed_services.includes('*')
      || (service != null && cred.allowed_services.includes(service));
    return tplOK && svcOK;
  }

  // ── Audit ────────────────────────────────────────────────────────────────

  async function logAccess(credentialId: string, accessType: AccessType, details?: { mission_id?: string; task_id?: string; service?: string | null; success?: boolean; error?: string }): Promise<void> {
    const success = details?.success !== false;
    await db.run(
      `INSERT INTO missions.credential_access_log
        (credential_id, mission_id, task_id, access_type, service_accessed, success, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      credentialId, details?.mission_id ?? null, details?.task_id ?? null,
      accessType, details?.service ?? null, success, details?.error ?? null,
    );
  }

  async function listAccessLog(credentialId: string, limit = 100): Promise<Array<{ id: number; access_type: string; mission_id: string | null; task_id: string | null; service_accessed: string | null; success: boolean; error_message: string | null; timestamp: string }>> {
    return db.all(
      `SELECT id, access_type, mission_id, task_id, service_accessed, success, error_message, timestamp
       FROM missions.credential_access_log WHERE credential_id = ? ORDER BY timestamp DESC LIMIT ?`,
      credentialId, limit,
    );
  }

  return {
    createCredential, getCredentialMeta, listCredentials,
    resolveSecret, rotateCredential, revokeCredential, refreshOauthToken,
    isAllowed, listAccessLog,
  };
}

export type CredentialVault = ReturnType<typeof createCredentialVault>;

// ── Helpers ────────────────────────────────────────────────────────────────

function rowToMeta(row: CredentialRow): StoredCredential {
  return {
    id: row.id,
    name: row.name,
    credential_type: row.credential_type as CredentialType,
    service_name: row.service_name,
    allowed_mission_templates: asJson<string[]>(row.allowed_mission_templates, ['*']),
    allowed_services: asJson<string[]>(row.allowed_services, ['*']),
    oauth_token_url: row.oauth_token_url,
    oauth_expires_at: row.oauth_expires_at,
    oauth_scopes: row.oauth_scopes,
    created_by: row.created_by,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    is_active: !!row.is_active,
  };
}
