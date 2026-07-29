/**
 * brand-templates-latex.test.ts — migration 256 widens the type CHECK, for real.
 *
 * ── What went wrong before ──────────────────────────────────────────────────
 *
 * `brand_templates.type` was `CHECK (type IN ('docx','pptx'))`. That constraint
 * is declared in server/db/schema.postgresql.sql, which is re-run at every boot
 * with CREATE TABLE IF NOT EXISTS — so editing it THERE changes fresh installs
 * only and leaves every existing database on the old constraint. That is exactly
 * the two-populations divergence migration 204 produced (see
 * migration-schema-drift.test.ts). The widening therefore has to be a NEW
 * migration, and the first test below is what makes that a checked property
 * rather than a convention someone has to remember.
 *
 * ── Why this executes SQL ───────────────────────────────────────────────────
 *
 * Reading the migration file and asserting it contains the word 'latex' proves
 * the word is in the file. It does not prove the DO block finds the constraint
 * (it is auto-named, so the migration looks it up by column), that dropping and
 * re-adding succeeds, that the new constraint actually admits 'latex' and still
 * refuses everything else, or that re-running the migration is safe.
 *
 * Everything happens inside a transaction that is ROLLED BACK, so the developer
 * database this may be pointed at is left untouched. Skips cleanly with no
 * DATABASE_URL, exactly like migration-schema-drift.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'server/db/migrations-pg');
const MIGRATION_ID = '256_brand_templates_latex';
const MIGRATION_SQL = readFileSync(join(MIGRATIONS_DIR, `${MIGRATION_ID}.sql`), 'utf8');

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();

describe('the widening is a new migration, not an edit to an old one', () => {
  it('no migration that could already have been applied mentions brand_templates', () => {
    // An edit to an applied migration reaches fresh installs and NOBODY ELSE —
    // the runner keys off the migration id, not the file contents.
    const earlier = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql') && f < `${MIGRATION_ID}.sql`)
      .filter(f => /brand_templates/i.test(readFileSync(join(MIGRATIONS_DIR, f), 'utf8')));
    expect(earlier).toEqual([]);
  });

  it('leaves the baseline schema alone, since it cannot reach existing databases', () => {
    const schema = readFileSync(join(process.cwd(), 'server/db/schema.postgresql.sql'), 'utf8');
    const table = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS brand_templates'));
    expect(table.slice(0, table.indexOf(');'))).toContain("CHECK (type IN ('docx','pptx'))");
  });

  it('drops the old constraint by COLUMN, not by a hard-coded name', () => {
    // The constraint is auto-named by whichever PostgreSQL created the table.
    // Looking it up through pg_attribute is what makes the migration work on an
    // install whose constraint is not called brand_templates_type_check.
    expect(MIGRATION_SQL).toMatch(/pg_attribute/);
    expect(MIGRATION_SQL).toMatch(/a\.attname\s*=\s*'type'/);
  });
});

const d = DATABASE_URL ? describe : describe.skip;

d('applied to a real PostgreSQL (in a rolled-back transaction)', () => {
  let client: import('pg').Client;

  /**
   * Put the table back into its pre-migration shape.
   *
   * Every test starts here rather than assuming the database it is pointed at.
   * Once this branch is merged and `db:migrate:pg` has run, the developer
   * database ALREADY allows 'latex' — and a control that reads "latex is
   * refused" would then fail for a reason that has nothing to do with the code.
   * Reproducing the precondition is what keeps the control honest on a database
   * in any state.
   */
  async function resetToPreMigrationState(): Promise<void> {
    await client.query(`
      DO $$
      DECLARE con_name TEXT;
      BEGIN
        FOR con_name IN
          SELECT DISTINCT c.conname FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
           WHERE c.conrelid = 'brand_templates'::regclass
             AND c.contype = 'c' AND a.attname = 'type'
        LOOP
          EXECUTE format('ALTER TABLE brand_templates DROP CONSTRAINT %I', con_name);
        END LOOP;
      END $$;
    `);
    await client.query(
      `ALTER TABLE brand_templates
         ADD CONSTRAINT brand_templates_type_check CHECK (type IN ('docx','pptx'))`,
    );
    await client.query('ALTER TABLE brand_templates DROP COLUMN IF EXISTS original_name');
  }

  /** Try an INSERT on a savepoint; report whether the constraint allowed it. */
  async function accepts(type: string): Promise<boolean> {
    await client.query('SAVEPOINT probe');
    try {
      await client.query(
        `INSERT INTO brand_templates (id, name, type, file_path, file_size)
         VALUES ($1, $2, $3, '/tmp/probe', 1)`,
        [`probe_${type}_${Date.now()}`, `probe ${type}`, type],
      );
      await client.query('ROLLBACK TO SAVEPOINT probe');
      return true;
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT probe');
      return false;
    }
  }

  async function typeCheckDefs(): Promise<string[]> {
    const { rows } = await client.query<{ def: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'brand_templates'::regclass
          AND c.contype = 'c' AND a.attname = 'type'`,
    );
    return rows.map(r => r.def);
  }

  async function hasOriginalName(): Promise<boolean> {
    const { rows } = await client.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'brand_templates' AND column_name = 'original_name'`,
    );
    return rows.length === 1 && rows[0].data_type === 'text';
  }

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL! });
    await client.connect();
    await client.query('BEGIN');
  });

  afterAll(async () => {
    // Nothing this test did is kept — not the constraint change, not the probes.
    await client?.query('ROLLBACK');
    await client?.end();
  });

  it('the precondition is real: latex is refused before the migration runs', async () => {
    await resetToPreMigrationState();
    expect(await accepts('docx')).toBe(true);
    expect(await accepts('latex')).toBe(false);
    expect(await hasOriginalName()).toBe(false);
  });

  it('accepts latex after the migration, and still refuses anything else', async () => {
    await resetToPreMigrationState();
    await client.query(MIGRATION_SQL);
    expect(await accepts('latex')).toBe(true);
    expect(await accepts('docx')).toBe(true);
    expect(await accepts('pptx')).toBe(true);
    expect(await accepts('exe')).toBe(false);
    expect(await accepts('')).toBe(false);
  });

  it('is idempotent — re-running it leaves exactly one type CHECK', async () => {
    await resetToPreMigrationState();
    await client.query(MIGRATION_SQL);
    await client.query(MIGRATION_SQL);
    const defs = await typeCheckDefs();
    expect(defs).toHaveLength(1);
    expect(defs[0]).toContain('latex');
    expect(await accepts('exe')).toBe(false);
  });

  it('finds the constraint even when it is not called brand_templates_type_check', async () => {
    // The DO block looks the constraint up through pg_attribute precisely so an
    // install whose constraint carries a different name is not left behind with
    // TWO conflicting CHECKs, one of which still refuses 'latex'.
    await resetToPreMigrationState();
    await client.query('ALTER TABLE brand_templates RENAME CONSTRAINT brand_templates_type_check TO legacy_type_ck');
    await client.query(MIGRATION_SQL);
    expect(await typeCheckDefs()).toHaveLength(1);
    expect(await accepts('latex')).toBe(true);
  });

  it('adds original_name, without which a bundled class file is unusable', async () => {
    await resetToPreMigrationState();
    await client.query(MIGRATION_SQL);
    expect(await hasOriginalName()).toBe(true);
  });
});
