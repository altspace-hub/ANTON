/**
 * migrate.ts — tiny migration runner for the relay's portal registry.
 *
 * Reads .sql files from the relay's `migrations/` directory in lexical
 * order, applies each one inside a transaction, and tracks applied
 * migrations in a `schema_migrations` table. Re-running is safe: already-
 * applied filenames are skipped.
 *
 * This deliberately doesn't depend on a heavyweight migration framework
 * (Flyway, Liquibase, etc.). The whole registry is one schema with
 * append-only forward migrations — a hundred lines of shell-equivalent
 * logic is enough.
 *
 * Usage:
 *   pnpm tsx src/registry/migrate.ts
 *
 * Or programmatically from a test fixture:
 *   import { runMigrations } from './registry/migrate.js';
 *   await runMigrations({ databaseUrl: 'postgres://...' });
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { pino, type Logger } from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Default migrations directory. Resolved relative to this source file. */
function defaultMigrationsDir(): string {
  // src/registry/migrate.ts → migrations/ at the package root.
  return resolve(__dirname, '..', '..', 'migrations');
}

export interface RunMigrationsOptions {
  /** Connection URL. Defaults to RELAY_REGISTRY_DATABASE_URL. */
  databaseUrl?: string;
  /** Override directory (tests). Default: relay/migrations/. */
  migrationsDir?: string;
  /** Logger to inherit. */
  logger?: Logger;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(opts: RunMigrationsOptions = {}): Promise<MigrationResult> {
  const url = opts.databaseUrl ?? process.env.RELAY_REGISTRY_DATABASE_URL;
  if (!url) {
    throw new Error(
      'No database URL configured. Set RELAY_REGISTRY_DATABASE_URL or pass databaseUrl.',
    );
  }
  const dir = opts.migrationsDir ?? defaultMigrationsDir();
  const log = opts.logger ?? pino({ name: 'relay-registry-migrate' });

  const pool = new Pool({ connectionString: url });
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // Bootstrap: schema_migrations table holds the audit of which
    // .sql files have run. Filename is the natural primary key.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        sha256      TEXT NOT NULL
      );
    `);

    const allFiles = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (allFiles.length === 0) {
      log.warn({ dir }, 'no migration files found');
      return { applied, skipped };
    }

    const appliedRows = await pool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const appliedSet = new Set(appliedRows.rows.map((r) => r.filename));

    for (const filename of allFiles) {
      if (appliedSet.has(filename)) {
        skipped.push(filename);
        continue;
      }
      const sql = readFileSync(join(dir, filename), 'utf-8');
      const sha = await sha256(sql);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, sha256) VALUES ($1, $2)',
          [filename, sha],
        );
        await client.query('COMMIT');
        applied.push(filename);
        log.info({ filename, sha: sha.slice(0, 12) }, 'migration applied');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log.error({ filename, err: (err as Error).message }, 'migration failed; rolled back');
        throw err;
      } finally {
        client.release();
      }
    }
    return { applied, skipped };
  } finally {
    await pool.end();
  }
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(s, 'utf-8').digest('hex');
}

// CLI entrypoint. `tsx src/registry/migrate.ts` runs all pending migrations.
const isCliEntrypoint = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isCliEntrypoint) {
  runMigrations()
    .then((res) => {
      // eslint-disable-next-line no-console
      console.log(
        `migrations: applied=${res.applied.length} skipped=${res.skipped.length}`,
      );
      if (res.applied.length > 0) {
        // eslint-disable-next-line no-console
        console.log('  applied:', res.applied.join(', '));
      }
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('migration failed:', err.message);
      process.exit(1);
    });
}
