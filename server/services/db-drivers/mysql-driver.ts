/**
 * mysql-driver.ts
 * MySQL / MariaDB database driver using mysql2.
 */

import type { DatabaseDriver, DbConfig, QueryResult } from './driver-interface.js';

const driver: DatabaseDriver = {
  name: 'mysql',
  displayName: 'MySQL / MariaDB',
  defaultPort: 3306,

  async test(config: DbConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const mysql = await import('mysql2/promise');

      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port || 3306,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: config.sslVerifyCert !== false } : undefined,
        connectTimeout: (config.connectionTimeout || 10) * 1000,
      });

      await connection.query('SELECT 1 AS test');
      await connection.end();

      return { ok: true, message: `MySQL connection successful: ${config.host}:${config.port || 3306}` };
    } catch (err: unknown) {
      const error = err as Error;
      return { ok: false, message: error.message };
    }
  },

  async query(config: DbConfig, sql: string, params?: unknown[]): Promise<QueryResult> {
    const mysql = await import('mysql2/promise');

    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: config.sslVerifyCert !== false } : undefined,
      connectTimeout: (config.connectionTimeout || 10) * 1000,
    });

    try {
      const [rows, fields] = await connection.query(sql, params);

      const rowsArray = Array.isArray(rows) ? rows : [];
      const fieldsArray = Array.isArray(fields) ? fields : [];

      return {
        rows: rowsArray as Array<Record<string, unknown>>,
        rowCount: rowsArray.length,
        fields: fieldsArray.map((f: unknown) => {
          const field = f as { name: string; type?: number };
          return {
            name: field.name,
            type: field.type?.toString() || 'unknown',
          };
        }),
      };
    } finally {
      await connection.end();
    }
  },

  async createPool(config: DbConfig): Promise<unknown> {
    const mysql = await import('mysql2/promise');

    return mysql.createPool({
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: config.sslVerifyCert !== false } : undefined,
      connectTimeout: (config.connectionTimeout || 10) * 1000,
      connectionLimit: 10,
      queueLimit: 0,
    });
  },

  async closePool(pool: unknown): Promise<void> {
    const mysqlPool = pool as { end: () => Promise<void> };
    await mysqlPool.end();
  },
};

export default driver;
