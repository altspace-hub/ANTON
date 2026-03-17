// ── SQLite Adapter ───────────────────────────────────────────────────────────
// Wraps synchronous better-sqlite3 behind the async DatabaseAdapter interface.

import type Database from 'better-sqlite3';
import type { DatabaseAdapter, RunResult } from '../database.js';

export class SqliteAdapter implements DatabaseAdapter {
  readonly dialect = 'sqlite' as const;
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Expose the raw better-sqlite3 handle for callers that still need it (e.g. init.ts). */
  get raw(): Database.Database {
    return this.db;
  }

  async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    try {
      return this.db.prepare(sql).get(...flat) as T | undefined;
    } catch (err: unknown) {
      // Forgive callers that pass INSERT/UPDATE/DELETE to .get() —
      // better-sqlite3 throws "This statement does not return data.  Use run() instead."
      if (err instanceof Error && /does not return data/i.test(err.message)) {
        this.db.prepare(sql).run(...flat);
        return undefined;
      }
      throw err;
    }
  }

  async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    try {
      return this.db.prepare(sql).all(...flat) as T[];
    } catch (err: unknown) {
      // Forgive callers that pass INSERT/UPDATE/DELETE to .all() —
      // better-sqlite3 throws "This statement does not return data.  Use run() instead."
      if (err instanceof Error && /does not return data/i.test(err.message)) {
        this.db.prepare(sql).run(...flat);
        return [];
      }
      throw err;
    }
  }

  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    try {
      const result = this.db.prepare(sql).run(...flat);
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
    } catch (err: unknown) {
      // Forgive callers that pass SELECT to .run() —
      // better-sqlite3 throws "This statement returns data.  Use get() or all() instead."
      if (err instanceof Error && /returns data/i.test(err.message)) {
        this.db.prepare(sql).get(...flat);
        return { changes: 0, lastInsertRowid: 0 };
      }
      throw err;
    }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> {
    // better-sqlite3 transactions are synchronous, but our callback is async.
    // We start a BEGIN/COMMIT manually so the async callback can await within.
    this.db.exec('BEGIN');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
