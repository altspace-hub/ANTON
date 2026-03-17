// ── Unified Database Initialization ──────────────────────────────────────────
// Detects DATABASE_URL → PostgreSQL, otherwise → SQLite (default).

import type { DatabaseAdapter } from './database.js';
import { logger } from '../lib/logger.js';

export async function initDatabaseAdapter(): Promise<DatabaseAdapter> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.startsWith('postgres')) {
    logger.info('[db] DATABASE_URL detected — initializing PostgreSQL adapter');
    const { initPostgresDatabase } = await import('./init-postgresql.js');
    return initPostgresDatabase(databaseUrl);
  }

  // Default: SQLite
  logger.info('[db] Using SQLite (default) — set DATABASE_URL for PostgreSQL');
  const { initDatabase } = await import('./init.js');
  const { SqliteAdapter } = await import('./adapters/sqlite-adapter.js');
  const rawDb = initDatabase();
  return new SqliteAdapter(rawDb);
}
