/**
 * mssql-driver.ts
 * Microsoft SQL Server database driver using mssql.
 */

import type { DatabaseDriver, DbConfig, QueryResult } from './driver-interface.js';

const driver: DatabaseDriver = {
  name: 'mssql',
  displayName: 'Microsoft SQL Server',
  defaultPort: 1433,

  async test(config: DbConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const sql = await import('mssql');

      const pool = await sql.connect({
        server: config.host,
        port: config.port || 1433,
        database: config.database,
        user: config.username,
        password: config.password,
        options: {
          encrypt: config.ssl ?? false,
          trustServerCertificate: config.sslVerifyCert === false,
          connectTimeout: (config.connectionTimeout || 10) * 1000,
        },
      });

      await pool.request().query('SELECT 1 AS test');
      await pool.close();

      return { ok: true, message: `MSSQL connection successful: ${config.host}:${config.port || 1433}` };
    } catch (err: unknown) {
      const error = err as Error;
      return { ok: false, message: error.message };
    }
  },

  async query(config: DbConfig, sql: string, params?: unknown[]): Promise<QueryResult> {
    const mssql = await import('mssql');

    const pool = await mssql.connect({
      server: config.host,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        encrypt: config.ssl ?? false,
        trustServerCertificate: config.sslVerifyCert === false,
        connectTimeout: (config.connectionTimeout || 10) * 1000,
      },
    });

    try {
      const request = pool.request();

      // Bind parameters (@p1, @p2, etc.)
      if (params) {
        params.forEach((val, i) => {
          request.input(`p${i + 1}`, val);
        });
      }

      const result = await request.query(sql);

      const fields = result.recordset?.columns
        ? Object.values(result.recordset.columns).map((col: unknown) => {
            const column = col as { name: string; type: { name: string } };
            return { name: column.name, type: column.type.name };
          })
        : [];

      return {
        rows: (result.recordset || []) as Array<Record<string, unknown>>,
        rowCount: result.rowsAffected?.[0] || result.recordset?.length || 0,
        fields,
      };
    } finally {
      await pool.close();
    }
  },

  async createPool(config: DbConfig): Promise<unknown> {
    const mssql = await import('mssql');

    return await mssql.connect({
      server: config.host,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: {
        encrypt: config.ssl ?? false,
        trustServerCertificate: config.sslVerifyCert === false,
        connectTimeout: (config.connectionTimeout || 10) * 1000,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    });
  },

  async closePool(pool: unknown): Promise<void> {
    const mssqlPool = pool as { close: () => Promise<void> };
    await mssqlPool.close();
  },
};

export default driver;
