// ── Unified Database Initialization ──────────────────────────────────────────
// ANTON runs on PostgreSQL ONLY. DATABASE_URL is REQUIRED.
//
// The legacy SQLite boot path (init.ts + adapters/sqlite-adapter.ts) has been
// removed from the tree. This function throws if DATABASE_URL is absent —
// there is no fallback. (SQLite remains available only as an EXTERNAL data
// connector via server/services/db-drivers/sqlite-driver.ts.)

import type { DatabaseAdapter } from './database.js';
import { logger } from '../lib/logger.js';

export async function initDatabaseAdapter(): Promise<DatabaseAdapter> {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.startsWith('postgres')) {
    logger.info('[db] DATABASE_URL detected — initializing PostgreSQL adapter');
    const { initPostgresDatabase } = await import('./init-postgresql.js');
    return initPostgresDatabase(databaseUrl);
  }

  // No silent SQLite fallback: ANTON is PostgreSQL-only.
  throw new Error(
    'DATABASE_URL is required — ANTON runs on PostgreSQL only; SQLite is not ' +
      'supported. Set DATABASE_URL=postgresql://anton:anton@localhost:5432/anton ' +
      '(see CLAUDE.md Quick Start) and run `pnpm run db:init` before starting the server.'
  );
}
