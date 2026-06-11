// ── Unified Database Initialization ──────────────────────────────────────────
// ANTON runs on PostgreSQL ONLY. DATABASE_URL is REQUIRED.
//
// The legacy SQLite boot path (init.ts + adapters/sqlite-*) is intentionally
// left in the tree for now but is UNREACHABLE from the real server boot: this
// function throws if DATABASE_URL is absent rather than falling back to SQLite.
// Full removal of the SQLite code is a recommended separate cleanup pass.

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
