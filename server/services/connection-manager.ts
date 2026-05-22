/**
 * connection-manager.ts
 * CRUD for connections, connectivity testing, and audit logging.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { encryptConfig, decryptConfig } from './credential-vault.js';
import { getDriver } from './db-drivers/driver-registry.js';

export type ConnectionType = 'database' | 'api' | 'filesystem' | 'email' | 'script_library' | 'messaging';
export type ConnectionStatus = 'pending' | 'active' | 'disabled' | 'error';

export interface Connection {
  id: string;
  display_name: string;
  type: ConnectionType;
  config: Record<string, unknown>;
  permissions: string[];
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  status: ConnectionStatus;
  last_tested?: string;
  last_test_result?: string;
  created_at: string;
  updated_at: string;
}

export interface Script {
  id: string;
  display_name: string;
  description?: string;
  language: 'python' | 'bash' | 'r' | 'powershell' | 'node';
  script_path: string;
  parameters?: Record<string, unknown>;
  expected_outputs?: Record<string, unknown>;
  max_runtime_seconds: number;
  memory_limit_mb: number;
  sandbox: boolean;
  network_access: boolean;
  file_hash?: string;
  version: string;
  approved_by?: string;
  approved_at?: string;
  status: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  connection_id: string;
  execution_id?: string;
  action: string;
  details?: Record<string, unknown>;
  result_summary?: string;
  executed_at: string;
  executed_by: string;
}

interface RawConnectionRow {
  id: string;
  display_name: string;
  type: ConnectionType;
  config: string;
  permissions: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  status: ConnectionStatus;
  last_tested: string | null;
  last_test_result: string | null;
  created_at: string;
  updated_at: string;
}

interface RawScriptRow {
  id: string;
  display_name: string;
  description: string | null;
  language: Script['language'];
  script_path: string;
  parameters: string | null;
  expected_outputs: string | null;
  max_runtime_seconds: number;
  memory_limit_mb: number;
  sandbox: number;
  network_access: number;
  file_hash: string | null;
  version: string;
  approved_by: string | null;
  approved_at: string | null;
  status: string;
  created_at: string;
}

function parseConnection(row: RawConnectionRow): Connection {
  return {
    ...row,
    config: JSON.parse(row.config || '{}') as Record<string, unknown>,
    permissions: JSON.parse(row.permissions || '[]') as string[],
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    last_tested: row.last_tested ?? undefined,
    last_test_result: row.last_test_result ?? undefined,
  };
}

function parseScript(row: RawScriptRow): Script {
  return {
    ...row,
    parameters: row.parameters ? JSON.parse(row.parameters) as Record<string, unknown> : undefined,
    expected_outputs: row.expected_outputs ? JSON.parse(row.expected_outputs) as Record<string, unknown> : undefined,
    description: row.description ?? undefined,
    approved_by: row.approved_by ?? undefined,
    approved_at: row.approved_at ?? undefined,
    file_hash: row.file_hash ?? undefined,
    sandbox: row.sandbox === 1,
    network_access: row.network_access === 1,
  };
}

export async function createConnectionManager(db: DatabaseAdapter) {
  return {
    // ── Connections ────────────────────────────────────────────

    async list(userId: string, role: string): Promise<Connection[]> {
      let rows: RawConnectionRow[];
      if (role === 'admin') {
        rows = await db.all('SELECT * FROM connections ORDER BY created_at DESC') as RawConnectionRow[];
      } else {
        rows = await db.all(
          "SELECT * FROM connections WHERE status = 'active' ORDER BY created_at DESC"
        ) as RawConnectionRow[];
      }
      void userId;
      return rows.map(parseConnection);
    },

    async get(id: string): Promise<Connection | null> {
      const row = await db.get('SELECT * FROM connections WHERE id = ?', id) as RawConnectionRow | undefined;
      return row ? parseConnection(row) : null;
    },

    async create(
      data: {
        display_name: string;
        type: ConnectionType;
        config: Record<string, unknown>;
        permissions?: string[];
      },
      userId: string
    ): Promise<Connection> {
      const id = randomUUID();
      const now = new Date().toISOString();

      // Encrypt sensitive fields before storing
      const encryptedConfig = encryptConfig(data.config);

      await db.run(`
        INSERT INTO connections
          (id, display_name, type, config, permissions, created_by, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `, id,
        data.display_name,
        data.type,
        JSON.stringify(encryptedConfig),
        JSON.stringify(data.permissions ?? []),
        userId,
        now,
        now);
      return (await this.get(id))!;
    },

    async update(id: string, data: Partial<Pick<Connection, 'display_name' | 'config' | 'permissions' | 'status'>>): Promise<Connection | null> {
      const existing = await this.get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const display_name = data.display_name ?? existing.display_name;
      const config = JSON.stringify(data.config ?? existing.config);
      const permissions = JSON.stringify(data.permissions ?? existing.permissions);
      const status = data.status ?? existing.status;

      await db.run(`
        UPDATE connections
        SET display_name = ?, config = ?, permissions = ?, status = ?, updated_at = ?
        WHERE id = ?
      `, display_name, config, permissions, status, now, id);

      return this.get(id);
    },

    async approve(id: string, adminId: string): Promise<Connection | null> {
      const now = new Date().toISOString();
      await db.run(`
        UPDATE connections
        SET approved_by = ?, approved_at = ?, status = 'active', updated_at = ?
        WHERE id = ?
      `, adminId, now, now, id);
      return this.get(id);
    },

    async delete(id: string): Promise<void> {
      await db.run("UPDATE connections SET status = 'disabled', updated_at = ? WHERE id = ?", 
        new Date().toISOString(),
        id
      );
    },

    async test(id: string): Promise<{ ok: boolean; message: string }> {
      const conn = await this.get(id);
      if (!conn) return { ok: false, message: 'Connection not found' };

      let result: { ok: boolean; message: string };

      // Decrypt config before testing
      const cfg = decryptConfig(conn.config) as Record<string, unknown>;

      try {
        if (conn.type === 'database') {
          const driverName = (cfg.driver as string) || 'sqlite';
          try {
            const driver = await getDriver(driverName);
            result = await driver.test(cfg as Parameters<typeof driver.test>[0]);
          } catch (err) {
            const error = err as Error;
            result = { ok: false, message: `Driver error: ${error.message}` };
          }
        } else if (conn.type === 'api') {
          const baseUrl = cfg.base_url as string;
          if (!baseUrl) {
            result = { ok: false, message: 'base_url not configured' };
          } else {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(baseUrl, { method: 'HEAD', signal: controller.signal }).catch(() =>
              fetch(baseUrl, { signal: controller.signal })
            );
            clearTimeout(timeout);
            result = { ok: res.ok || res.status < 500, message: `HTTP ${res.status} ${res.statusText}` };
          }
        } else if (conn.type === 'filesystem') {
          const { default: fs } = await import('fs-extra');
          const basePath = cfg.base_path as string;
          if (!basePath) {
            result = { ok: false, message: 'base_path not configured' };
          } else {
            const exists = await fs.pathExists(basePath);
            result = exists
              ? { ok: true, message: `Folder accessible: ${basePath}` }
              : { ok: false, message: `Folder not found: ${basePath}` };
          }
        } else {
          result = { ok: true, message: 'Connection type checked (no live test available)' };
        }
      } catch (err) {
        result = { ok: false, message: err instanceof Error ? err.message : String(err) };
      }

      const now = new Date().toISOString();
      await db.run(
        'UPDATE connections SET last_tested = ?, last_test_result = ?, updated_at = ? WHERE id = ?'
      , now, result.message, now, id);

      return result;
    },

    /**
     * Fire-and-forget audit log entry. Returns synchronously (void) but
     * schedules an async DB INSERT. Audit log writes must never block the
     * caller and must never propagate failure to the user. Errors are
     * logged but swallowed.
     *
     * Audit-detectable: G.14 forgotten-await won't flag this because the
     * function is sync-typed.
     */
    logAction(
      connectionId: string,
      executionId: string | null,
      action: string,
      details: Record<string, unknown> | null,
      result: string | null,
      userId: string
    ): void {
      db.run(`
        INSERT INTO connection_audit_log
          (connection_id, execution_id, action, details, result_summary, executed_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        connectionId,
        executionId,
        action,
        details ? JSON.stringify(details) : null,
        result,
        userId
      ).catch((err) => {
        console.warn('[connection-manager] logAction failed (non-fatal):', err instanceof Error ? err.message : err);
      });
    },

    async getAuditLog(connectionId: string, limit = 50): Promise<AuditEntry[]> {
      return await db.all('SELECT * FROM connection_audit_log WHERE connection_id = ? ORDER BY executed_at DESC LIMIT ?'
      , connectionId, limit) as AuditEntry[];
    },

    // ── Scripts ────────────────────────────────────────────────

    async listScripts(): Promise<Script[]> {
      const rows = await db.all('SELECT * FROM connection_scripts ORDER BY display_name') as RawScriptRow[];
      return rows.map(parseScript);
    },

    async getScript(id: string): Promise<Script | null> {
      const row = await db.get('SELECT * FROM connection_scripts WHERE id = ?', id) as RawScriptRow | undefined;
      return row ? parseScript(row) : null;
    },

    async createScript(data: {
      display_name: string;
      description?: string;
      language: Script['language'];
      script_path: string;
      parameters?: Record<string, unknown>;
      expected_outputs?: Record<string, unknown>;
      max_runtime_seconds?: number;
      memory_limit_mb?: number;
      sandbox?: boolean;
      network_access?: boolean;
      file_hash?: string;
      version?: string;
      approved_by?: string;
    }): Promise<Script> {
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.run(`
        INSERT INTO scripts
          (id, display_name, description, language, script_path, parameters, expected_outputs,
           max_runtime_seconds, memory_limit_mb, sandbox, network_access, file_hash, version,
           approved_by, approved_at, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `, 
        id,
        data.display_name,
        data.description ?? null,
        data.language,
        data.script_path,
        data.parameters ? JSON.stringify(data.parameters) : null,
        data.expected_outputs ? JSON.stringify(data.expected_outputs) : null,
        data.max_runtime_seconds ?? 300,
        data.memory_limit_mb ?? 1024,
        data.sandbox !== false ? 1 : 0,
        data.network_access ? 1 : 0,
        data.file_hash ?? null,
        data.version ?? '1.0.0',
        data.approved_by ?? null,
        data.approved_by ? now : null,
        now
      );
      return (await this.getScript(id))!;
    },

    async updateScript(
      id: string,
      data: Partial<Pick<Script, 'display_name' | 'description' | 'parameters' | 'expected_outputs' | 'max_runtime_seconds' | 'memory_limit_mb' | 'version'>>
    ): Promise<Script | null> {
      const existing = await this.getScript(id);
      if (!existing) return null;
      await db.run(`
        UPDATE scripts SET
          display_name = ?,
          description = ?,
          parameters = ?,
          expected_outputs = ?,
          max_runtime_seconds = ?,
          memory_limit_mb = ?,
          version = ?
        WHERE id = ?
      `, 
        data.display_name ?? existing.display_name,
        data.description ?? existing.description ?? null,
        data.parameters ? JSON.stringify(data.parameters) : (existing.parameters ? JSON.stringify(existing.parameters) : null),
        data.expected_outputs ? JSON.stringify(data.expected_outputs) : (existing.expected_outputs ? JSON.stringify(existing.expected_outputs) : null),
        data.max_runtime_seconds ?? existing.max_runtime_seconds,
        data.memory_limit_mb ?? existing.memory_limit_mb,
        data.version ?? existing.version,
        id
      );
      return this.getScript(id);
    },

    async deleteScript(id: string): Promise<void> {
      await db.run("UPDATE scripts SET status = 'deleted' WHERE id = ?", id);
    },
  };
}

export type ConnectionManager = Awaited<ReturnType<typeof createConnectionManager>>;
