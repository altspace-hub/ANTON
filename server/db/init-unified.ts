/**
 * Database initializer — PostgreSQL only.
 *
 * Usage: pnpm run db:init
 *
 * Requires DATABASE_URL (postgresql://...). ANTON does not support SQLite
 * for its own database; the legacy SQLite boot path was removed.
 */

import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || !databaseUrl.startsWith('postgres')) {
    console.error(
      '[db:init] DATABASE_URL is required — ANTON runs on PostgreSQL only; SQLite is not ' +
        'supported. Set DATABASE_URL=postgresql://anton:anton@localhost:5432/anton ' +
        '(see CLAUDE.md Quick Start) and re-run `pnpm run db:init`.'
    );
    process.exit(1);
  }

  console.log('[db:init] DATABASE_URL detected — initializing PostgreSQL...');
  const { initPostgresDatabase } = await import('./init-postgresql.js');
  await initPostgresDatabase(databaseUrl);
  console.log('[db:init] PostgreSQL database initialized successfully.');

  process.exit(0);
}

main().catch((err) => {
  console.error('[db:init] FAILED:', err);
  process.exit(1);
});
