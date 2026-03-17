// ── Database Abstraction Layer ────────────────────────────────────────────────
// Provides a unified async interface over SQLite (better-sqlite3) and PostgreSQL (pg).
// SQLite remains the default. PostgreSQL activates when DATABASE_URL is set.

export type Dialect = 'sqlite' | 'postgresql';

/** Mirrors better-sqlite3's RunResult */
export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * Minimal async database interface implemented by both adapters.
 *
 * Design notes:
 * - SQLite adapter wraps the synchronous better-sqlite3 calls in resolved promises.
 * - PostgreSQL adapter performs real async pg.Pool queries with automatic SQL translation.
 * - Params are always a flat array of positional values (? for SQLite, auto-converted to $1..$N for PG).
 */
export interface DatabaseAdapter {
  /** Which engine is behind this adapter */
  readonly dialect: Dialect;

  /** Execute a single-row SELECT. Returns the first row or undefined. */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;

  /** Execute a multi-row SELECT. Returns an array of rows. */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;

  /** Execute an INSERT / UPDATE / DELETE. Returns changes + lastInsertRowid. */
  run(sql: string, ...params: unknown[]): Promise<RunResult>;

  /** Execute raw SQL (DDL, multi-statement scripts, etc.). */
  exec(sql: string): Promise<void>;

  /**
   * Run a function inside a transaction.
   * The callback receives the same adapter (SQLite) or a transaction-scoped adapter (PG).
   * If the callback throws, the transaction is rolled back.
   */
  transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T>;

  /** Gracefully close the database / pool. */
  close(): Promise<void>;
}
