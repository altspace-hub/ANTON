/**
 * database-adapter.ts
 * Execute SELECT queries against registered database connections.
 * Supports SQLite (via better-sqlite3) and placeholder stubs for postgres/mysql.
 */

import type { Connection } from '../services/connection-manager.js';
import type { ConnectionManager } from '../services/connection-manager.js';

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  columns: string[];
  executionTimeMs: number;
}

const DEFAULT_MAX_ROWS = 10000;

/**
 * Execute a read-only query against the given connection.
 * Only SELECT statements are allowed by default.
 */
export async function executeQuery(
  connection: Connection,
  manager: ConnectionManager,
  query: string,
  params: unknown[] = [],
  executedBy: string = 'system'
): Promise<QueryResult> {
  const cfg = connection.config as Record<string, unknown>;

  // Guard: only SELECT queries unless explicitly overridden via permissions
  const trimmedQuery = query.trim().toUpperCase();
  if (!trimmedQuery.startsWith('SELECT') && !connection.permissions.includes('write')) {
    throw new Error('Only SELECT queries are permitted on this connection. Add "write" permission to allow mutations.');
  }

  const maxRows = typeof cfg.max_rows_per_query === 'number' ? cfg.max_rows_per_query : DEFAULT_MAX_ROWS;
  const driver = (cfg.driver as string) || 'sqlite';

  const startMs = Date.now();
  let result: QueryResult;

  try {
    if (driver === 'sqlite') {
      const { default: BetterSQLite } = await import('better-sqlite3');
      const dbPath = (cfg.host as string) || (cfg.path as string);
      if (!dbPath) throw new Error('SQLite connection missing "host" (database file path)');

      const sqliteDb = new BetterSQLite(dbPath, { readonly: true });
      try {
        // Append LIMIT if not already present
        let finalQuery = query;
        if (!trimmedQuery.includes('LIMIT')) {
          finalQuery = `${query.trimEnd()} LIMIT ${maxRows}`;
        }

        const stmt = sqliteDb.prepare(finalQuery);
        const rows = stmt.all(...params) as Record<string, unknown>[];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        result = {
          rows: rows.slice(0, maxRows),
          rowCount: rows.length,
          columns,
          executionTimeMs: Date.now() - startMs,
        };
      } finally {
        sqliteDb.close();
      }
    } else if (driver === 'postgresql' || driver === 'postgres') {
      // Placeholder — requires 'pg' package
      throw new Error('PostgreSQL adapter not yet installed. Add the "pg" npm package and implement this driver.');
    } else if (driver === 'mysql') {
      // Placeholder — requires 'mysql2' package
      throw new Error('MySQL adapter not yet installed. Add the "mysql2" npm package and implement this driver.');
    } else {
      throw new Error(`Unsupported database driver: ${driver}`);
    }
  } catch (err) {
    manager.logAction(
      connection.id,
      null,
      'query_error',
      { query, driver, error: err instanceof Error ? err.message : String(err) },
      'FAILED',
      executedBy
    );
    throw err;
  }

  manager.logAction(
    connection.id,
    null,
    'query',
    { query, driver, rowCount: result.rowCount, executionTimeMs: result.executionTimeMs },
    `${result.rowCount} rows in ${result.executionTimeMs}ms`,
    executedBy
  );

  return result;
}
