// ── PostgreSQL Adapter ────────────────────────────────────────────────────────
// Wraps pg.Pool behind the async DatabaseAdapter interface.
// Includes a 3-stage SQL auto-translation pipeline for common SQLite → PG patterns.

import pg from 'pg';
import type { DatabaseAdapter, RunResult } from '../database.js';

const { Pool } = pg;

// ── SQL Translation Pipeline ─────────────────────────────────────────────────

/**
 * Mask single-quoted string literals before applying token translations, then
 * restore them afterwards. Prevents naive `\bREAL\b → DOUBLE PRECISION` (and
 * every other word-boundary swap below) from corrupting string contents like
 * "real-world" or "datetime contexts" inside seed INSERTs or UPDATE values.
 *
 * Handles SQL's escaped-quote convention (`''` inside a string).
 *
 * Limitation: dollar-quoted blocks ($$...$$) are NOT masked — they're handled
 * by their own DO/EXECUTE layer in PG and rarely contain SQLite-specific
 * tokens. If you add a translation that could fire inside a $$-block, mask
 * those too.
 */
function maskAndRestoreStrings<T>(sql: string, fn: (masked: string) => T): T {
  const literals: string[] = [];
  // Match a single-quoted string with SQL-escaped quotes ('' inside).
  const masked = sql.replace(/'(?:[^']|'')*'/g, (m) => {
    literals.push(m);
    return `STR${literals.length - 1}`;
  });
  const out = fn(masked);
  if (typeof out === 'string') {
    return out.replace(/STR(\d+)/g, (_m, i) => literals[Number(i)]) as unknown as T;
  }
  return out;
}

/**
 * Stage 1: Translate SQLite-specific SQL syntax to PostgreSQL equivalents.
 * Handles the ~90% of queries that follow predictable patterns.
 *
 * Two passes (see translateSqlImpl):
 *   1. Function/syntax translations (datetime, strftime, json_extract, …) run on
 *      the RAW sql — they MUST see string-literal arguments like 'now' / '%Y-%W'.
 *   2. Bare keyword/type translations (REAL → DOUBLE PRECISION, …) run with string
 *      literals masked, so the word inside a string's CONTENTS is never rewritten
 *      (caught a real bug where "real" in a curriculum seed string became
 *      "DOUBLE PRECISION"). Masking the whole thing — as a previous version did —
 *      silently broke pass 1, since the translators could no longer see their
 *      string arguments.
 */
export function translateSql(sql: string): string {
  return translateSqlImpl(sql);
}

function translateSqlImpl(sql: string): string {
  let out = sql;

  // datetime('now') or datetime("now") → NOW()
  out = out.replace(/datetime\(\s*['"]now['"]\s*\)/gi, 'NOW()');

  // datetime('now', '-N days') or datetime("now", '-N days') → NOW() - INTERVAL 'N days'
  out = out.replace(
    /datetime\(\s*['"]now['"]\s*,\s*'(-?\d+)\s+(day|hour|minute|second|month|year)s?'\s*\)/gi,
    (_m, n, unit) => `NOW() - INTERVAL '${Math.abs(Number(n))} ${unit}s'`,
  );

  // CURRENT_TIMESTAMP (already valid in PG, but ensure no parentheses issues)
  // No change needed — CURRENT_TIMESTAMP is valid in both.

  // INSERT OR IGNORE INTO → INSERT INTO ... ON CONFLICT DO NOTHING
  out = out.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  // We'll append ON CONFLICT DO NOTHING at the end of INSERT statements that had OR IGNORE.
  // NB: test `out` (already rewritten to INSERT INTO), not `sql` — `sql` still reads
  // "INSERT OR IGNORE INTO", which /INSERT\s+INTO/ never matches.
  if (/INSERT\s+INTO/i.test(out) && /OR\s+IGNORE/i.test(sql)) {
    // Only add if not already present
    if (!/ON\s+CONFLICT/i.test(out)) {
      // Insert before any RETURNING clause or at end
      const returningMatch = out.match(/\s+RETURNING\s+/i);
      if (returningMatch && returningMatch.index !== undefined) {
        out = out.slice(0, returningMatch.index) + ' ON CONFLICT DO NOTHING' + out.slice(returningMatch.index);
      } else {
        out = out.trimEnd() + ' ON CONFLICT DO NOTHING';
      }
    }
  }

  // INSERT OR REPLACE INTO table (col1, col2, ...) VALUES (...)
  // → INSERT INTO table (col1, col2, ...) VALUES (...) ON CONFLICT (col1) DO UPDATE SET col2=EXCLUDED.col2, ...
  // Assumes first listed column is the primary/unique key.
  const replaceMatch = out.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (replaceMatch) {
    const cols = replaceMatch[2].split(',').map(c => c.trim());
    const conflictCol = cols[0];
    const updateCols = cols.slice(1);
    const updateSet = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ');
    out = out.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, 'INSERT INTO');
    // Append ON CONFLICT before any trailing semicolon/RETURNING
    const returningIdx = out.search(/\s+RETURNING\s+/i);
    const onConflict = ` ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSet}`;
    if (returningIdx !== -1) {
      out = out.slice(0, returningIdx) + onConflict + out.slice(returningIdx);
    } else {
      out = out.trimEnd() + onConflict;
    }
  }

  // strftime('%Y-%m-%d', column) → TO_CHAR(column, 'YYYY-MM-DD')
  out = out.replace(
    /strftime\(\s*'%Y-%m-%d'\s*,\s*([^)]+)\)/gi,
    (_m, col) => `TO_CHAR(${col.trim()}, 'YYYY-MM-DD')`,
  );

  // strftime('%Y-%m', column) → TO_CHAR(column, 'YYYY-MM')
  out = out.replace(
    /strftime\(\s*'%Y-%m'\s*,\s*([^)]+)\)/gi,
    (_m, col) => `TO_CHAR(${col.trim()}, 'YYYY-MM')`,
  );

  // strftime('%Y', column) → TO_CHAR(column, 'YYYY')
  out = out.replace(
    /strftime\(\s*'%Y'\s*,\s*([^)]+)\)/gi,
    (_m, col) => `TO_CHAR(${col.trim()}, 'YYYY')`,
  );

  // strftime('%Y-%W', column) → TO_CHAR(column, 'IYYY-IW')
  out = out.replace(
    /strftime\(\s*'%Y-%W'\s*,\s*([^)]+)\)/gi,
    (_m, col) => `TO_CHAR(${col.trim()}, 'IYYY-IW')`,
  );

  // strftime('%H', column) → TO_CHAR(column, 'HH24')
  out = out.replace(
    /strftime\(\s*'%H'\s*,\s*([^)]+)\)/gi,
    (_m, col) => `TO_CHAR(${col.trim()}, 'HH24')`,
  );

  // strftime('%w', column) → EXTRACT(DOW FROM column)
  out = out.replace(
    /strftime\(\s*'%w'\s*,\s*([^)]+)\)/gi,
    (_m, col) => `EXTRACT(DOW FROM ${col.trim()})`,
  );

  // json_extract(col, '$.key') → col->>'key'
  out = out.replace(
    /json_extract\(\s*([^,]+)\s*,\s*'\$\.([^']+)'\s*\)/gi,
    (_m, col, key) => `${col.trim()}->>'${key}'`,
  );

  // json_group_array(...) → json_agg(...)
  out = out.replace(/json_group_array\(/gi, 'json_agg(');

  // json_group_object(key, value) → json_object_agg(key, value)
  out = out.replace(/json_group_object\(/gi, 'json_object_agg(');

  // group_concat(DISTINCT col, sep) → STRING_AGG(DISTINCT col, sep)
  // group_concat(DISTINCT col) → STRING_AGG(DISTINCT col, ',')
  out = out.replace(
    /group_concat\(\s*DISTINCT\s+([^,)]+)\s*,\s*([^)]+)\s*\)/gi,
    (_m, col, sep) => `STRING_AGG(DISTINCT ${col.trim()}, ${sep.trim()})`,
  );
  out = out.replace(
    /group_concat\(\s*DISTINCT\s+([^)]+)\s*\)/gi,
    (_m, col) => `STRING_AGG(DISTINCT ${col.trim()}, ',')`,
  );
  // group_concat(col, sep) → STRING_AGG(col, sep)
  // group_concat(col) → STRING_AGG(col, ',')
  out = out.replace(
    /group_concat\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/gi,
    (_m, col, sep) => `STRING_AGG(${col.trim()}, ${sep.trim()})`,
  );
  out = out.replace(
    /group_concat\(\s*([^)]+)\s*\)/gi,
    (_m, col) => `STRING_AGG(${col.trim()}, ',')`,
  );

  // ── Bare keyword/type translations ──────────────────────────────────────
  // These match a whole word, so the same word inside a string literal's
  // CONTENTS (e.g. "real" in seed text) would be corrupted. Mask string
  // literals first so only SQL keywords — never string contents — are rewritten.
  out = maskAndRestoreStrings(out, (masked) => {
    let k = masked;
    // AUTOINCREMENT → (handled in schema, but strip from runtime DDL if present)
    k = k.replace(/\bAUTOINCREMENT\b/gi, '');
    // DATETIME type → TIMESTAMPTZ (for inline DDL in routes).
    // Only as a type, not the function call datetime('now').
    k = k.replace(/\bDATETIME\b(?!\s*\()/gi, 'TIMESTAMPTZ');
    // REAL type → DOUBLE PRECISION
    k = k.replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
    // IFNULL → COALESCE (IFNULL is not standard SQL in PG)
    k = k.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
    return k;
  });

  // julianday(expr) → EXTRACT(EPOCH FROM (expr)::timestamptz) / 86400.0
  // julianday('now') → EXTRACT(EPOCH FROM NOW()) / 86400.0
  out = out.replace(
    /julianday\(\s*'now'\s*\)/gi,
    '(EXTRACT(EPOCH FROM NOW()) / 86400.0)',
  );
  out = out.replace(
    /julianday\(\s*([^)]+)\s*\)/gi,
    (_m, col) => `(EXTRACT(EPOCH FROM (${col.trim()})::timestamptz) / 86400.0)`,
  );

  // typeof(x) = 'text' → (not directly translatable, rare in queries)
  // Leave as-is — handled case-by-case if it appears.

  // GLOB → not used in this codebase (LIKE is used instead)

  // Boolean: SQLite uses 0/1, PG also supports 0/1 for INTEGER columns, so no change needed.

  return out;
}

/**
 * Stage 2: Convert positional placeholders from ? to $1, $2, $3, ...
 */
export function convertPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// ── Adapter Implementation ───────────────────────────────────────────────────

export interface PostgresAdapterOptions {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = 'postgresql' as const;
  private pool: pg.Pool;

  constructor(opts: PostgresAdapterOptions) {
    this.pool = new Pool({
      connectionString: opts.connectionString,
      max: opts.maxConnections ?? parseInt(process.env.PG_POOL_MAX || '20', 10),
      idleTimeoutMillis: opts.idleTimeoutMs ?? parseInt(process.env.PG_POOL_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: opts.connectionTimeoutMs ?? parseInt(process.env.PG_CONNECTION_TIMEOUT || '5000', 10),
    });
  }

  /** Expose the underlying pg.Pool for PG-specific features (e.g. LISTEN/NOTIFY) */
  getPool(): pg.Pool {
    return this.pool;
  }

  /** Prepare SQL: translate + convert placeholders */
  private prepareSql(sql: string): string {
    return convertPlaceholders(translateSql(sql));
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const pgSql = this.prepareSql(sql);
    const result = await this.pool.query(pgSql, flat as unknown[]);
    return (result.rows[0] as T) ?? undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const pgSql = this.prepareSql(sql);
    const result = await this.pool.query(pgSql, flat as unknown[]);
    return result.rows as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    let pgSql = this.prepareSql(sql);

    // Auto-add RETURNING * for INSERT statements that don't already have it
    // so we can extract lastInsertRowid
    const isInsert = /^\s*INSERT\s/i.test(pgSql);
    const hasReturning = /\bRETURNING\b/i.test(pgSql);
    if (isInsert && !hasReturning) {
      pgSql = pgSql.trimEnd().replace(/;?\s*$/, '') + ' RETURNING *';
    }

    const result = await this.pool.query(pgSql, flat as unknown[]);

    let lastInsertRowid: number | bigint = 0;
    if (isInsert && result.rows.length > 0) {
      const row = result.rows[0] as Record<string, unknown>;
      // Try common PK column names
      lastInsertRowid = (row.id as number | bigint) ?? 0;
    }

    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid,
    };
  }

  async exec(sql: string): Promise<void> {
    // exec() runs raw SQL — no placeholder conversion, but still translate syntax
    const pgSql = translateSql(sql);
    await this.pool.query(pgSql);
  }

  async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txAdapter = new PgClientAdapter(client);
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ── Transaction-scoped adapter (uses a single pg.PoolClient) ─────────────────

class PgClientAdapter implements DatabaseAdapter {
  readonly dialect = 'postgresql' as const;
  private client: pg.PoolClient;

  constructor(client: pg.PoolClient) {
    this.client = client;
  }

  private prepareSql(sql: string): string {
    return convertPlaceholders(translateSql(sql));
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const result = await this.client.query(this.prepareSql(sql), flat as unknown[]);
    return (result.rows[0] as T) ?? undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const result = await this.client.query(this.prepareSql(sql), flat as unknown[]);
    return result.rows as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    let pgSql = this.prepareSql(sql);

    const isInsert = /^\s*INSERT\s/i.test(pgSql);
    const hasReturning = /\bRETURNING\b/i.test(pgSql);
    if (isInsert && !hasReturning) {
      pgSql = pgSql.trimEnd().replace(/;?\s*$/, '') + ' RETURNING *';
    }

    const result = await this.client.query(pgSql, flat as unknown[]);

    let lastInsertRowid: number | bigint = 0;
    if (isInsert && result.rows.length > 0) {
      const row = result.rows[0] as Record<string, unknown>;
      lastInsertRowid = (row.id as number | bigint) ?? 0;
    }

    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(translateSql(sql));
  }

  async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> {
    // Nested transactions use SAVEPOINTs
    const sp = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.client.query(`SAVEPOINT ${sp}`);
    try {
      const result = await fn(this);
      await this.client.query(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (err) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw err;
    }
  }

  async close(): Promise<void> {
    // No-op — client is released by the parent transaction
  }
}
