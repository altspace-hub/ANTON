/**
 * migration-schema-drift.test.ts — every table a migration claims to create must exist.
 *
 * ── The failure this catches ───────────────────────────────────────────────
 *
 * `204_school_inline_migrations_consolidation.sql` applied to existing databases on
 * 2026-04-26. Its `CREATE TABLE IF NOT EXISTS student_class_enrollments` was added to the
 * SAME FILE on 2026-06-21, 56 days later.
 *
 * The runner keys off the migration ID, not the file contents — correctly, because
 * re-running arbitrary SQL against a live database is far more dangerous than skipping
 * it. So the repair reached fresh installs and NOBODY ELSE. Two populations of database
 * silently diverged, and `schema_migrations` reported 0 pending on both.
 *
 * The SEN-override route then wrote to a table that was not there, on every install older
 * than the edit. Nothing surfaced it: the route returned before anyone checked.
 *
 * ── Why a test rather than a rule ──────────────────────────────────────────
 *
 * "Never edit an applied migration" is the rule, and it is written in the header of
 * migration 254. But a rule is only as good as the reviewer who remembers it, and the
 * original edit was made by someone actively FIXING migrations — precisely the person
 * least likely to think they were breaking one. This compares intent against reality
 * instead, so the divergence is caught by machinery.
 *
 * Skips cleanly without a database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();
const MIGRATIONS_DIR = join(process.cwd(), 'server/db/migrations-pg');

/**
 * Tables a migration declares, as `schema.table`.
 *
 * Two traps this deliberately handles, both of which produced false positives when the
 * audit was first run by hand:
 *
 *  - `missions.missions` is SCHEMA-qualified. Checking only `public` reported the entire
 *    missions pillar as missing when all 28 of its tables were present.
 *  - `CREATE TABLE x_jsonb` in the markets migrations is temporary rename scaffolding —
 *    the column is created, copied into, and renamed away in the same statement block.
 *    Those are not tables, so the table-level regex does not see them; noted here because
 *    the equivalent COLUMN check is not safe to write naively for exactly that reason.
 */
function declaredTables(): Map<string, string> {
  const found = new Map<string, string>();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?(?:\."?([a-z_][a-z0-9_]*)"?)?/gis;

  for (const file of readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()) {
    // Strip comments AND anything inside a DO $$ ... $$ block: those are conditional by
    // construction (`IF EXISTS (...) THEN`), so a CREATE inside one is not an
    // unconditional claim that the table will exist.
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      .replace(/--[^\n]*/g, '')
      .replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, '');

    for (const m of sql.matchAll(re)) {
      const qualified = m[2] ? `${m[1].toLowerCase()}.${m[2].toLowerCase()}` : `public.${m[1].toLowerCase()}`;
      if (!found.has(qualified)) found.set(qualified, file);
    }
  }
  return found;
}

describe('migration files parse into real table names', () => {
  it('finds a substantial number of declared tables', () => {
    // Guards the regex itself: if it silently stopped matching, every assertion below
    // would pass vacuously over an empty set.
    expect(declaredTables().size).toBeGreaterThan(100);
  });

  it('resolves schema-qualified names rather than assuming public', () => {
    const t = declaredTables();
    expect([...t.keys()].some(k => k.startsWith('missions.'))).toBe(true);
  });

  it('includes the table whose absence prompted this test', () => {
    expect(declaredTables().has('public.student_class_enrollments')).toBe(true);
  });
});

const d = DATABASE_URL ? describe : describe.skip;

d('the live schema matches what the migrations declare', () => {
  let client: import('pg').Client;
  let present: Set<string>;

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL! });
    await client.connect();
    const r = await client.query(
      `SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`,
    );
    present = new Set(r.rows.map(x => `${x.table_schema.toLowerCase()}.${x.table_name.toLowerCase()}`));
  });
  afterAll(async () => { await client?.end(); });

  it('every declared table exists', () => {
    const missing = [...declaredTables()]
      .filter(([t]) => !present.has(t))
      .map(([t, file]) => `${t} (declared by ${file})`);

    // A failure here almost always means a migration was EDITED after being applied.
    // The fix is a NEW migration re-declaring the object — never an edit to the old one,
    // which by definition cannot reach the databases that already skipped it.
    expect(missing, `tables declared by a migration but absent from the database:\n  ${missing.join('\n  ')}`)
      .toEqual([]);
  });

  it('reports no pending migrations, so "0 pending" cannot stand in for "in sync"', async () => {
    // Both halves matter. schema_migrations said 0 pending while a declared table was
    // missing — which is exactly how the drift stayed invisible for two months.
    const applied = new Set(
      (await client.query('SELECT id FROM schema_migrations')).rows.map(r => r.id),
    );
    const pending = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => f.replace(/\.sql$/, ''))
      .filter(id => !applied.has(id));
    expect(pending).toEqual([]);
  });
});
