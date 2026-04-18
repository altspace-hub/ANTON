#!/usr/bin/env node
/**
 * run-migration.cjs — apply a PG migration when psql isn't on PATH.
 *
 * Usage:
 *   node scripts/run-migration.cjs server/db/migrations-pg/132_app_mail.sql
 *
 * Reads DATABASE_URL from .env (same as server/index.ts) and applies
 * the SQL file as a single transaction. Idempotent if the migration
 * uses CREATE TABLE IF NOT EXISTS (most do).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/run-migration.cjs <path/to/migration.sql>');
    process.exit(1);
  }
  const sqlPath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  if (!fs.existsSync(sqlPath)) {
    console.error('Migration file not found:', sqlPath);
    process.exit(1);
  }
  const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) { console.error('DATABASE_URL not found in .env'); process.exit(1); }
  const DATABASE_URL = m[1].trim();
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`[migrate] Applying ${path.basename(sqlPath)} (${sql.length} chars)…`);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`[migrate] OK — ${path.basename(sqlPath)} applied.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[migrate] FAILED:`, err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
