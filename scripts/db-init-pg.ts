/**
 * scripts/db-init-pg.ts — initialise a fresh PostgreSQL database.
 *
 * Invoked by `pnpm run db:init:pg`. Loads .env automatically. Cross-platform.
 */

import 'dotenv/config';
import { initPostgresDatabase } from '../server/db/init-postgresql.js';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set. Add it to .env or your environment.');
    process.exit(1);
  }
  await initPostgresDatabase(process.env.DATABASE_URL);
  console.log('PostgreSQL initialized');
  process.exit(0);
}

main().catch((err) => {
  console.error('Init failed:', err);
  process.exit(1);
});
