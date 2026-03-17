// ── PostgreSQL Migration Runner ──────────────────────────────────────────────
// Runs PG-specific migrations from server/db/migrations-pg/ and generic
// cross-engine migrations from server/db/migrations/ (skipping SQLite-only ones).

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseAdapter } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Returns true if a SQL migration file contains SQLite-only syntax
 * that would fail on PostgreSQL.
 */
function isSqliteOnly(sql: string): boolean {
  // PRAGMA statements are SQLite-only
  if (/\bPRAGMA\b/i.test(sql)) return true;

  // FTS5 virtual tables are SQLite-only
  if (/\bUSING\s+fts5\b/i.test(sql)) return true;

  // AUTOINCREMENT as a keyword in CREATE TABLE is SQLite-specific
  // (PostgreSQL uses SERIAL / GENERATED ALWAYS AS IDENTITY)
  // Only flag if it's in a CREATE TABLE statement (not just mentioned in a comment)
  if (/CREATE\s+TABLE[\s\S]*?\bAUTOINCREMENT\b/i.test(sql)) return true;

  // sqlite_master is SQLite-only
  if (/\bsqlite_master\b/i.test(sql)) return true;

  // pragma_table_info is SQLite-only
  if (/\bpragma_table_info\b/i.test(sql)) return true;

  return false;
}

/**
 * Run all pending PostgreSQL migrations.
 *
 * Strategy:
 * 1. Ensure schema_migrations table exists.
 * 2. Collect already-applied migration IDs.
 * 3. Scan migrations-pg/ for PG-specific files (takes priority).
 * 4. Scan migrations/ for generic files, skipping SQLite-only ones and
 *    any whose numeric prefix has a PG-specific override.
 * 5. Execute each pending migration inside a transaction.
 */
export async function runMigrationsPg(db: DatabaseAdapter): Promise<void> {
  // Ensure schema_migrations table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Collect already-applied migrations
  const appliedRows = await db.all<{ id: string }>('SELECT id FROM schema_migrations');
  const applied = new Set(appliedRows.map(r => r.id));

  // Directories
  const pgMigrationsDir = path.join(__dirname, 'migrations-pg');
  const genericMigrationsDir = path.join(__dirname, 'migrations');

  // Collect PG-specific migration files
  const pgFiles: Array<{ id: string; filePath: string }> = [];
  const pgPrefixes = new Set<string>();

  if (fs.existsSync(pgMigrationsDir)) {
    const files = fs.readdirSync(pgMigrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const migId = file.replace(/\.sql$/, '');
      pgFiles.push({ id: migId, filePath: path.join(pgMigrationsDir, file) });

      // Extract numeric prefix (e.g., '039' from '039_knowledge_atoms_fts_pg')
      const prefixMatch = file.match(/^(\d+)/);
      if (prefixMatch) {
        pgPrefixes.add(prefixMatch[1]);
      }
    }
  }

  // Collect generic migration files (skip SQLite-only and PG-overridden)
  const genericFiles: Array<{ id: string; filePath: string }> = [];

  if (fs.existsSync(genericMigrationsDir)) {
    const files = fs.readdirSync(genericMigrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if this prefix has a PG-specific override
      const prefixMatch = file.match(/^(\d+)/);
      if (prefixMatch && pgPrefixes.has(prefixMatch[1])) {
        // PG-specific version takes priority — skip generic
        continue;
      }

      const filePath = path.join(genericMigrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      if (isSqliteOnly(sql)) {
        // Skip SQLite-only migrations
        continue;
      }

      const migId = file.replace(/\.sql$/, '');
      genericFiles.push({ id: migId, filePath });
    }
  }

  // Merge and sort all migration files by ID (lexicographic keeps numeric order)
  const allMigrations = [...pgFiles, ...genericFiles].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );

  // Execute pending migrations
  let appliedCount = 0;

  for (const { id, filePath } of allMigrations) {
    if (applied.has(id)) continue;

    try {
      const sql = fs.readFileSync(filePath, 'utf-8');

      await db.transaction(async (tx) => {
        await tx.exec(sql);
        await tx.run('INSERT INTO schema_migrations (id) VALUES (?)', id);
      });

      appliedCount++;
      console.log(`[pg-migrations] Applied: ${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[pg-migrations] FAILED: ${id} — ${msg}`);
      // Don't abort the whole run — log and continue
    }
  }

  if (appliedCount > 0) {
    console.log(`[pg-migrations] ${appliedCount} migration(s) applied`);
  } else {
    console.log('[pg-migrations] All migrations already applied');
  }
}
