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
   */
  async function resolveSecret(id: string, missionId?: string, taskId?: string): Promise<string | null> {
    const row = await db.get<CredentialRow>(`SELECT * FROM missions.credential_vault WHERE id = ? AND is_active = TRUE`, id);
    if (!row) {
      await logAccess(id, 'read', { mission_id: missionId, task_id: taskId, success: false, error: 'Not found or inactive' });
      return null;
    }
    try {
      const secret = decrypt(row.encrypted_data);
      await db.run(
        `UPDATE missions.credential_vault SET last_used_at = NOW() WHERE id = ?`,
        id,
      );
      await logAccess(id, 'read', { mission_id: missionId, task_id: taskId, service: row.service_name });
      return secret;
    } catch (err) {
      await logAccess(id, 'read', { mission_id: missionId, task_id: taskId, success: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
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
