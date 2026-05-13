/**
 * db.ts — Postgres connection for the relay's portal registry.
 *
 * The registry is OPTIONAL. If RELAY_REGISTRY_DATABASE_URL is unset,
 * createRegistryDb() returns null and the /v1/* routes refuse with 503.
 * Existing relay deployments that don't want to run a directory don't
 * need to provision Postgres.
 *
 * When the URL is set, we open a connection pool with a small max
 * (~20) — the registry endpoints are short-lived queries, no
 * long-running cursors. Production HA setups should run the registry's
 * pool behind PgBouncer for connection multiplexing across replicas.
 *
 * Schema is owned by the migrations runner (see ./migrate.ts); this
 * file just holds the pool handle + a small query helper.
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { pino, type Logger } from 'pino';

/** Public handle used by every registry route. */
export interface RegistryDb {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<QueryResult<T>>;
  /** Run a unit of work in a single transaction. Auto-rollback on throw. */
  withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  /** Close the pool. Called by RelayServer.stop(). */
  end(): Promise<void>;
  /** Connectivity probe — returns true if the pool can reach Postgres. */
  ping(): Promise<boolean>;
}

export interface RegistryDbConfig {
  /** Postgres connection URL. Falls back to RELAY_REGISTRY_DATABASE_URL env. */
  url?: string;
  /** Max connections in the pool. Default 20. */
  maxConnections?: number;
  /** Idle timeout (ms). Default 30s. */
  idleTimeoutMs?: number;
  /** Optional pino logger to inherit from. */
  logger?: Logger;
}

/**
 * Open a registry DB connection pool. Returns null when no URL is
 * configured — caller should treat that as "registry disabled".
 */
export function createRegistryDb(cfg: RegistryDbConfig = {}): RegistryDb | null {
  const url = cfg.url ?? process.env.RELAY_REGISTRY_DATABASE_URL;
  if (!url) return null;

  const log = (cfg.logger ?? pino({ name: 'relay-registry-db' }));

  const pool = new Pool({
    connectionString: url,
    max: cfg.maxConnections ?? 20,
    idleTimeoutMillis: cfg.idleTimeoutMs ?? 30_000,
    // No SSL coercion here — operators set it via the URL (`?sslmode=require`).
  });

  pool.on('error', (err) => {
    // Background client errors (e.g. idle-client disconnected). Not
    // attached to any in-flight query; just log and let the pool
    // re-acquire on next request.
    log.warn({ err: err.message }, 'pg pool background error');
  });

  return {
    async query(sql, params) {
      return pool.query(sql, params as unknown as unknown[]);
    },
    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* swallow */ }
        throw err;
      } finally {
        client.release();
      }
    },
    async end() {
      await pool.end();
    },
    async ping() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
  };
}
