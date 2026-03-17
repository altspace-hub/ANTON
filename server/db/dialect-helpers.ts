// ── Dialect Helpers ──────────────────────────────────────────────────────────
// Provides `sql.*` functions for patterns the auto-translator cannot handle.
// Each helper returns a SQL fragment appropriate for the given dialect.

import type { Dialect } from './database.js';

// ── Date/Time Helpers ────────────────────────────────────────────────────────

/**
 * julianday(col) - julianday(col2) → days between two dates.
 * SQLite: julianday(a) - julianday(b)
 * PG:     EXTRACT(EPOCH FROM (a::timestamptz - b::timestamptz)) / 86400.0
 */
export function daysDiff(dialect: Dialect, colA: string, colB: string): string {
  if (dialect === 'sqlite') {
    return `(julianday(${colA}) - julianday(${colB}))`;
  }
  return `(EXTRACT(EPOCH FROM (${colA}::timestamptz - ${colB}::timestamptz)) / 86400.0)`;
}

/**
 * Days until a future date from now.
 * SQLite: julianday(col) - julianday('now')
 * PG:     EXTRACT(EPOCH FROM (col::timestamptz - NOW())) / 86400.0
 */
export function daysUntil(dialect: Dialect, col: string): string {
  if (dialect === 'sqlite') {
    return `(julianday(${col}) - julianday('now'))`;
  }
  return `(EXTRACT(EPOCH FROM (${col}::timestamptz - NOW())) / 86400.0)`;
}

/**
 * strftime with arbitrary format.
 * SQLite: strftime(fmt, col)
 * PG:     TO_CHAR(col, pgFmt)
 *
 * Common format mappings:
 *   %Y → YYYY, %m → MM, %d → DD, %H → HH24, %M → MI, %S → SS
 *   %Y-%m-%d → YYYY-MM-DD, %Y-%m → YYYY-MM, %Y-%W → IYYY-IW
 */
export function strftime(dialect: Dialect, sqliteFmt: string, col: string): string {
  if (dialect === 'sqlite') {
    return `strftime('${sqliteFmt}', ${col})`;
  }
  const pgFmt = sqliteFmtToPg(sqliteFmt);
  return `TO_CHAR(${col}, '${pgFmt}')`;
}

function sqliteFmtToPg(fmt: string): string {
  return fmt
    .replace(/%Y/g, 'YYYY')
    .replace(/%m/g, 'MM')
    .replace(/%d/g, 'DD')
    .replace(/%H/g, 'HH24')
    .replace(/%M/g, 'MI')
    .replace(/%S/g, 'SS')
    .replace(/%W/g, 'IW')
    .replace(/%w/g, 'D');
}

/**
 * Year-week grouping for analytics.
 * SQLite: strftime('%Y-%W', col)
 * PG:     TO_CHAR(col, 'IYYY-IW')
 */
export function yearWeek(dialect: Dialect, col: string): string {
  return strftime(dialect, '%Y-%W', col);
}

// ── Date Offset Helpers ──────────────────────────────────────────────────────

/**
 * Date offset as a SQL literal (e.g., "7 days ago").
 * SQLite: datetime('now', '-7 days')
 * PG:     NOW() - INTERVAL '7 days'
 */
export function dateOffsetLiteral(dialect: Dialect, offsetValue: number, unit: string): string {
  const absVal = Math.abs(offsetValue);
  const sign = offsetValue < 0 ? '+' : '-';
  if (dialect === 'sqlite') {
    const sqliteSign = offsetValue < 0 ? '+' : '-';
    return `datetime('now', '${sqliteSign}${absVal} ${unit}')`;
  }
  return `NOW() ${sign} INTERVAL '${absVal} ${unit}'`;
}

/**
 * Date offset using a parameter placeholder (for parameterized queries).
 * Returns SQL fragment + notes on how the param should be formatted.
 *
 * SQLite: datetime('now', ? || ' days')  — param is e.g. '-7'
 * PG:     NOW() + (? || ' days')::interval — param is e.g. '-7'
 */
export function dateOffsetParam(dialect: Dialect, unit: string): string {
  if (dialect === 'sqlite') {
    return `datetime('now', ? || ' ${unit}')`;
  }
  return `NOW() + (? || ' ${unit}')::interval`;
}

// ── String / Aggregation Helpers ─────────────────────────────────────────────

/**
 * group_concat equivalent.
 * SQLite: group_concat(col, sep)
 * PG:     STRING_AGG(col::text, sep)
 */
export function groupConcat(dialect: Dialect, col: string, separator = ','): string {
  if (dialect === 'sqlite') {
    return `group_concat(${col}, '${separator}')`;
  }
  return `STRING_AGG(${col}::text, '${separator}')`;
}

// ── Search / Comparison Helpers ──────────────────────────────────────────────

/**
 * Case-insensitive LIKE.
 * SQLite: LIKE is case-insensitive by default for ASCII.
 * PG:     Use ILIKE for case-insensitive matching.
 */
export function ilike(dialect: Dialect, col: string, paramPlaceholder = '?'): string {
  if (dialect === 'sqlite') {
    return `${col} LIKE ${paramPlaceholder}`;
  }
  return `${col} ILIKE ${paramPlaceholder}`;
}

// ── Schema Introspection Helpers ─────────────────────────────────────────────

/**
 * List all table names.
 * SQLite: SELECT name FROM sqlite_master WHERE type='table'
 * PG:     SELECT tablename FROM pg_tables WHERE schemaname='public'
 */
export function listTablesQuery(dialect: Dialect): string {
  if (dialect === 'sqlite') {
    return "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
  }
  return "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename";
}

/**
 * Check if a specific table exists.
 * SQLite: SELECT name FROM sqlite_master WHERE type='table' AND name=?
 * PG:     SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename=?
 */
export function tableExistsQuery(dialect: Dialect): string {
  if (dialect === 'sqlite') {
    return "SELECT name FROM sqlite_master WHERE type='table' AND name=?";
  }
  return "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' AND tablename=?";
}

/**
 * Check if a column exists on a table.
 * SQLite: SELECT COUNT(*) as c FROM pragma_table_info('tableName') WHERE name='colName'
 * PG:     SELECT COUNT(*) as c FROM information_schema.columns WHERE table_schema='public' AND table_name='tableName' AND column_name='colName'
 */
export function columnExistsQuery(dialect: Dialect, tableName: string, colName: string): string {
  if (dialect === 'sqlite') {
    return `SELECT COUNT(*) as c FROM pragma_table_info('${tableName}') WHERE name='${colName}'`;
  }
  return `SELECT COUNT(*) as c FROM information_schema.columns WHERE table_schema='public' AND table_name='${tableName}' AND column_name='${colName}'`;
}

// ── Full-Text Search Helpers ─────────────────────────────────────────────────

/**
 * FTS match clause for knowledge_atoms_fts.
 * SQLite: knowledge_atoms_fts MATCH ?
 * PG:     search_vector @@ plainto_tsquery('english', ?)
 */
export function ftsMatch(dialect: Dialect, searchParam = '?'): string {
  if (dialect === 'sqlite') {
    return `knowledge_atoms_fts MATCH ${searchParam}`;
  }
  return `search_vector @@ plainto_tsquery('english', ${searchParam})`;
}

/**
 * FTS rank/score expression.
 * SQLite: rank (built-in FTS5 rank)
 * PG:     ts_rank(search_vector, plainto_tsquery('english', ?))
 */
export function ftsRank(dialect: Dialect, searchParam = '?'): string {
  if (dialect === 'sqlite') {
    return 'rank';
  }
  return `ts_rank(search_vector, plainto_tsquery('english', ${searchParam}))`;
}

// ── Misc Helpers ─────────────────────────────────────────────────────────────

/**
 * Boolean literal. Both SQLite and PG accept 0/1 for INTEGER boolean columns.
 * This helper exists for documentation; no conversion needed.
 */
export function boolLiteral(_dialect: Dialect, value: boolean): number {
  return value ? 1 : 0;
}

/**
 * Random function.
 * SQLite: random()
 * PG:     random()  (both work, but SQLite random() returns a large integer, PG returns 0..1)
 */
export function randomOrder(dialect: Dialect): string {
  if (dialect === 'sqlite') {
    return 'random()';
  }
  return 'random()';
}

/**
 * Upsert helper — generates INSERT ... ON CONFLICT DO UPDATE for a single unique key.
 * The auto-translator handles INSERT OR IGNORE → ON CONFLICT DO NOTHING,
 * but INSERT OR REPLACE needs explicit column mapping.
 *
 * @param table    Table name
 * @param columns  All column names being inserted
 * @param conflictCol  The unique/PK column for conflict detection
 * @param updateCols   Columns to update on conflict (defaults to all non-conflict columns)
 */
export function upsert(
  dialect: Dialect,
  table: string,
  columns: string[],
  conflictCol: string,
  updateCols?: string[],
): string {
  const placeholders = columns.map(() => '?').join(', ');
  const colList = columns.join(', ');
  const toUpdate = updateCols ?? columns.filter((c) => c !== conflictCol);

  if (dialect === 'sqlite') {
    return `INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`;
  }

  const updateSet = toUpdate.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  return `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSet}`;
}
