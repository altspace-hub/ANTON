/**
 * Database Migration Runner
 *
 * Runs all pending migrations in the migrations/ directory.
 * Migrations are SQL files that modify the database schema.
 */

import fs from 'fs-extra';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.DB_PATH || './data/workbench.sqlite';
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Ensure migrations directory exists
await fs.ensureDir(MIGRATIONS_DIR);

// Initialize database
const db = new Database(DB_PATH);

// Create migrations tracking table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  // Get list of migration files
  const files = await fs.readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort(); // Run in alphabetical order (001_, 002_, etc.)

  if (migrationFiles.length === 0) {
    console.log('✓ No migrations found.');
    return;
  }

  // Get already-applied migrations
  const applied = db.prepare('SELECT migration_name FROM schema_migrations').all() as Array<{ migration_name: string }>;
  const appliedSet = new Set(applied.map(r => r.migration_name));

  // Run pending migrations
  let appliedCount = 0;
  for (const file of migrationFiles) {
    if (appliedSet.has(file)) {
      console.log(`⊘ Skipping ${file} (already applied)`);
      continue;
    }

    console.log(`▶ Applying ${file}...`);

    try {
      const migrationPath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(migrationPath, 'utf-8');

      // Execute migration in a transaction
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (migration_name) VALUES (?)').run(file);
        db.exec('COMMIT;');
        console.log(`✓ Applied ${file}\n`);
        appliedCount++;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    } catch (err: any) {
      console.error(`✗ Failed to apply ${file}:`, err.message);
      throw err;
    }
  }

  if (appliedCount === 0) {
    console.log('✓ All migrations already applied.');
  } else {
    console.log(`\n✓ Successfully applied ${appliedCount} migration(s).`);
  }
}

// Run migrations
try {
  await runMigrations();
  db.close();
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  db.close();
  process.exit(1);
}
