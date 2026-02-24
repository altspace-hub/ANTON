/**
 * postgresql-driver.ts
 * PostgreSQL database driver using pg.
 */

import type { DatabaseDriver, DbConfig, QueryResult } from './driver-interface.js';

const driver: DatabaseDriver = {
  name: 'postgresql',
  displayName: 'PostgreSQL',
  defaultPort: 5432,

  async test(config: DbConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const { default: pg } = await import('pg');
      const { Client } = pg;

      const client = new Client({
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: config.sslVerifyCert !== false } : false,
        connectionTimeoutMillis: (config.connectionTimeout || 10) * 1000,
      });

      await client.connect();
      await client.query('SELECT 1 AS test');
      await client.end();

      return { ok: true, message: `PostgreSQL connection successful: ${config.host}:${config.port || 5432}` };
    } catch (err: unknown) {
      const error = err as Error;
      return { ok: false, message: error.message };
    }
  },

  async query(config: DbConfig, sql: string, params?: unknown[]): Promise<QueryResult> {
    const { default: pg } = await import('pg');
    const { Client } = pg;

    const client = new Client({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: config.sslVerifyCert !== false } : false,
      connectionTimeoutMillis: (config.connectionTimeout || 10) * 1000,
    });

    await client.connect();

    try {
      const result = await client.query(sql, params as unknown[]);

      const fields = result.fields.map(f => ({
        name: f.name,
        type: f.dataTypeID.toString(),
      }));

      return {
        rows: result.rows as Array<Record<string, unknown>>,
        rowCount: result.rowCount || 0,
        fields,
      };
    } finally {
      await client.end();
    }
  },

  async createPool(config: DbConfig): Promise<unknown> {
    const { default: pg } = await import('pg');
    const { Pool } = pg;

    return new Pool({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: config.sslVerifyCert !== false } : false,
      connectionTimeoutMillis: (config.connectionTimeout || 10) * 1000,
      max: 10, // Max connections in pool
      idleTimeoutMillis: 30000,
    });
  },

  async closePool(pool: unknown): Promise<void> {
    const pgPool = pool as { end: () => Promise<void> };
    await pgPool.end();
  },
};

export default driver;
