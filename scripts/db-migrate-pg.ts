/**
 * scripts/db-migrate-pg.ts — run pending PostgreSQL migrations.
 *
 * Invoked by `pnpm run db:migrate:pg`. Loads .env automatically (via
 * dotenv/config side-effect import). Cross-platform (no shell-specific
 * env-var passing).
 */

import 'dotenv/config';
import { initDatabaseAdapter } from '../server/db/init-database.js';
import { runMigrationsPg } from '../server/db/run-migrations-pg.js';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set. Add it to .env or your environment.');
    process.exit(1);
  }
  const db = await initDatabaseAdapter();
  await runMigrationsPg(db);
  console.log('PG migrations complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
