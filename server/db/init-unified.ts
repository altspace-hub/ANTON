/**
 * Unified database initializer — auto-detects PostgreSQL vs SQLite.
 *
 * Usage: pnpm run db:init
 *
 * If DATABASE_URL is set and starts with "postgres", uses PostgreSQL.
 * Otherwise falls back to SQLite (legacy local mode).
 */

import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.startsWith('postgres')) {
    console.log('[db:init] DATABASE_URL detected — initializing PostgreSQL...');
    const { initPostgresDatabase } = await import('./init-postgresql.js');
    await initPostgresDatabase(databaseUrl);
    console.log('[db:init] PostgreSQL database initialized successfully.');
  } else {
    console.log('[db:init] No DATABASE_URL — initializing SQLite...');
    const { initDatabase } = await import('./init.js');
    initDatabase();
    console.log('[db:init] SQLite database initialized successfully.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[db:init] FAILED:', err);
  process.exit(1);
});
