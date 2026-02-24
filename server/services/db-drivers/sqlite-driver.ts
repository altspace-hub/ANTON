/**
 * sqlite-driver.ts
 * SQLite database driver using better-sqlite3.
 */

import type { DatabaseDriver, DbConfig, QueryResult } from './driver-interface.js';

const driver: DatabaseDriver = {
  name: 'sqlite',
  displayName: 'SQLite',
  defaultPort: 0,

  async test(config: DbConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const { default: Database } = await import('better-sqlite3');
      const db = new Database(config.host, { readonly: true });
      db.prepare('SELECT 1 AS test').get();
      db.close();
      return { ok: true, message: `SQLite connection successful: ${config.host}` };
    } catch (err: unknown) {
      const error = err as Error;
      return { ok: false, message: error.message };
    }
  },

  async query(config: DbConfig, sql: string, params?: unknown[]): Promise<QueryResult> {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(config.host, { readonly: false });

    try {
      const stmt = db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();

      // Get column names from first row
      const fields = rows.length > 0
        ? Object.keys(rows[0] as Record<string, unknown>).map(name => ({ name, type: 'unknown' }))
        : [];

      return {
        rows: rows as Array<Record<string, unknown>>,
        rowCount: rows.length,
        fields,
      };
    } finally {
      db.close();
    }
  },
};

export default driver;
