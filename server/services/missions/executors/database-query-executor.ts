// ── database-query-executor.ts ──────────────────────────────────────────────
// Mission task type: 'database_query'. Runs a read-only SELECT against either
// the local ANTON PostgreSQL or an external database whose connection string
// lives in the mission credential vault. Closes audit gap #1B.
//
// Security model:
//   • SELECT-only. Any non-SELECT statement or semicolon-chained DDL/DML is
//     rejected before the query is sent to the driver.
//   • Connection string resolution is server-side via the credential vault —
//     the DSN never reaches an LLM prompt or the task output.
//   • Optional `allowed_tables` whitelist: if set, the query must reference at
//     least one of the listed table names (case-insensitive substring match
//     against the normalised query).
//   • Per-call timeout (default 15s, configurable up to 60s).
//   • Row cap (default 100, configurable up to 1000) — protects both the
//     downstream token budget and the caller's memory.
//   • Result cell cap (32KB per cell) — long TEXT/JSONB values are truncated.

import type { DatabaseAdapter } from '../../../db/database.js';
import type { Mission, MissionTask } from '../types.js';
import { childLogger } from '../../../lib/logger.js';
import { createCredentialVault } from '../mission-credential-vault.js';

const log = childLogger('mission-database-query');

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_ROW_LIMIT = 100;
const MAX_ROW_LIMIT = 1000;
const MAX_CELL_BYTES = 32 * 1024;

export interface DatabaseQueryConfig {
  /** SELECT statement. Parameterised with ? or $1 depending on driver. */
  query: string;
  /** Positional parameter values. Use this, never string-interpolate. */
  values?: unknown[];
  /**
   * 'local' runs against ANTON's own db (read-only).
   * 'external' requires auth_credential_id holding a Postgres connection string.
   */
  target?: 'local' | 'external';
  /** Required when target='external'. Credential secret = full DSN. */
  auth_credential_id?: string;
  /**
   * Optional substring allow-list for table names. If non-empty, the query
   * must mention at least one entry. Protects local-DB queries from being
   * redirected to tables the mission shouldn't see.
   */
  allowed_tables?: string[];
  row_limit?: number;
  timeout_ms?: number;
}

export interface DatabaseQueryResult {
  success: boolean;
  outputFull: string;
  outputSummary: string;
  durationMs: number;
  rowCount: number;
  errorReason?: string;
}

export async function executeDatabaseQuery(
  db: DatabaseAdapter,
  mission: Mission,
  task: MissionTask,
): Promise<DatabaseQueryResult> {
  const startedAt = Date.now();
  const config = task.module_config as unknown as DatabaseQueryConfig | undefined;
  if (!config?.query?.trim()) {
    return failure(startedAt, 'database_query task has no module_config.query');
  }

  // ── Query shape validation (SELECT-only, no chained statements) ─────────
  const queryCheck = validateSelectOnly(config.query);
  if (!queryCheck.ok) return failure(startedAt, queryCheck.reason);

  // ── allowed_tables gate ────────────────────────────────────────────────
  if (config.allowed_tables && config.allowed_tables.length > 0) {
    const upper = config.query.toUpperCase();
    const hit = config.allowed_tables.some((t) => upper.includes(t.toUpperCase()));
    if (!hit) {
      return failure(
        startedAt,
        `Query must reference one of allowed_tables: ${config.allowed_tables.join(', ')}`,
      );
    }
  }

  const target = config.target ?? 'local';
  const rowLimit = Math.min(config.row_limit ?? DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT);
  const timeoutMs = Math.min(config.timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const values = (config.values ?? []) as unknown[];

  try {
    if (target === 'external') {
      if (!config.auth_credential_id) {
        return failure(startedAt, 'target=external requires auth_credential_id');
      }
      const vault = createCredentialVault(db);
      const meta = await vault.getCredentialMeta(config.auth_credential_id);
      if (!meta || !meta.is_active) {
        return failure(startedAt, `Credential ${config.auth_credential_id} not found or inactive`);
      }
      if (!vault.isAllowed(meta, mission.template_id ?? null, null)) {
        return failure(
          startedAt,
          `Credential not authorised for mission template ${mission.template_id}`,
        );
      }
      const dsn = await vault.resolveSecret(config.auth_credential_id, mission.id, task.id);
      if (!dsn) {
        return failure(startedAt, `Credential ${config.auth_credential_id} could not be resolved`);
      }
      const rows = await runExternal(dsn, config.query, values, rowLimit, timeoutMs);
      return successResult(startedAt, rows, rowLimit, mission, task, 'external');
    }

    // target === 'local'
    const rows = await runLocal(db, config.query, values, rowLimit, timeoutMs);
    return successResult(startedAt, rows, rowLimit, mission, task, 'local');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(
      { missionId: mission.id, taskId: task.id, target, err: msg },
      'database_query_failed',
    );
    return failure(startedAt, `Query failed: ${msg}`);
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateSelectOnly(raw: string): { ok: true } | { ok: false; reason: string } {
  // Strip leading comments + whitespace so `/* hi */ SELECT …` still validates.
  const stripped = raw.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/)+/g, '').trim();
  const upper = stripped.toUpperCase();
  if (!(upper.startsWith('SELECT') || upper.startsWith('WITH'))) {
    return { ok: false, reason: 'Only SELECT (or WITH … SELECT) queries are allowed' };
  }
  // Block any chained DDL/DML via semicolons. Allow one optional trailing ';'.
  const inner = stripped.replace(/;\s*$/, '');
  if (/;/.test(inner)) {
    return { ok: false, reason: 'Chained statements are not allowed' };
  }
  // Block obvious write verbs anywhere in the query body (defence in depth —
  // catches "SELECT … ; DROP TABLE" style injection that slips past the
  // chained-statement check via driver-specific parsing quirks).
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|VACUUM|COPY)\b/i.test(inner)) {
    return { ok: false, reason: 'Query contains disallowed write/DDL verbs' };
  }
  return { ok: true };
}

// ── Runners ────────────────────────────────────────────────────────────────

async function runLocal(
  db: DatabaseAdapter,
  query: string,
  values: unknown[],
  rowLimit: number,
  timeoutMs: number,
): Promise<Record<string, unknown>[]> {
  const wrapped = wrapWithLimit(query, rowLimit);
  const rows = (await withTimeout(db.all(wrapped, ...values), timeoutMs)) as Record<string, unknown>[];
  return rows.slice(0, rowLimit);
}

async function runExternal(
  dsn: string,
  query: string,
  values: unknown[],
  rowLimit: number,
  timeoutMs: number,
): Promise<Record<string, unknown>[]> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dsn, connectionTimeoutMillis: Math.min(timeoutMs, 10_000) });
  await client.connect();
  try {
    // Use a read-only transaction so even a subtle write sneaking through the
    // validator is rejected by the server.
    await client.query('BEGIN READ ONLY');
    const res = await withTimeout(client.query(wrapWithLimit(query, rowLimit), values), timeoutMs);
    await client.query('COMMIT');
    return res.rows.slice(0, rowLimit) as Record<string, unknown>[];
  } finally {
    await client.end();
  }
}

function wrapWithLimit(query: string, rowLimit: number): string {
  // Don't wrap if the query already includes a LIMIT — respect the author's
  // intent. Otherwise append a hard cap.
  if (/\bLIMIT\s+\d+/i.test(query)) return query;
  const stripped = query.replace(/;\s*$/, '');
  return `${stripped} LIMIT ${rowLimit}`;
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Query timed out after ${timeoutMs}ms`)), timeoutMs);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Result packaging ───────────────────────────────────────────────────────

function successResult(
  startedAt: number,
  rows: Record<string, unknown>[],
  rowLimit: number,
  mission: Mission,
  task: MissionTask,
  target: 'local' | 'external',
): DatabaseQueryResult {
  const capped = rows.map(capRowCells);
  const outputFull = JSON.stringify(
    { target, row_count: capped.length, row_limit: rowLimit, rows: capped },
    null,
    2,
  );
  const outputSummary = `database_query ok — ${capped.length} row${capped.length === 1 ? '' : 's'} (target=${target})`;

  log.info(
    { missionId: mission.id, taskId: task.id, target, rows: capped.length, durationMs: Date.now() - startedAt },
    'database_query_ok',
  );

  return {
    success: true,
    outputFull,
    outputSummary,
    durationMs: Date.now() - startedAt,
    rowCount: capped.length,
  };
}

function capRowCells(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.length > MAX_CELL_BYTES) {
      out[k] = v.slice(0, MAX_CELL_BYTES) + `…[truncated ${v.length - MAX_CELL_BYTES} chars]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function failure(startedAt: number, reason: string): DatabaseQueryResult {
  return {
    success: false,
    outputFull: JSON.stringify({ error: reason }, null, 2),
    outputSummary: `database_query failed: ${reason}`,
    durationMs: Date.now() - startedAt,
    rowCount: 0,
    errorReason: reason,
  };
}
