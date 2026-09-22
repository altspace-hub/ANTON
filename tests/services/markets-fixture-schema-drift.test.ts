/**
 * markets-fixture-schema-drift.test.ts
 *
 * tests/fixtures/markets-loop-schema.sql is a hand-maintained schema. The
 * markets integration suite builds its own database from it, which means that
 * suite can only ever prove the code agrees with the FIXTURE — never that the
 * fixture agrees with the database the product actually runs on.
 *
 * That gap shipped a real fault. The fixture declared a `key_insight` column on
 * market_why_chain_levels; no migration has ever created one. The why-chain
 * reaper was written to SELECT it, its test passed against the fixture, and in
 * production every sweep threw 42703 while nine chains sat 'in_progress'
 * indefinitely. A green suite and a broken feature, for the same reason: the
 * two schemas were never compared to each other.
 *
 * So this compares them. It reads the fixture's CREATE TABLE blocks and asserts
 * every column it declares exists in the real database — the one DATABASE_URL
 * points at, NOT the fixture-built test database, which would be circular.
 *
 * Direction matters. It flags columns the fixture has and the database does not
 * (fiction the tests can rely on), and deliberately ignores the reverse: a
 * database column absent from the fixture is just a table the markets tests do
 * not exercise, which is normal and not a fault.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'markets-loop-schema.sql');

/** table -> declared column names, from the fixture's CREATE TABLE blocks. */
export function parseFixtureTables(sql: string): Record<string, string[]> {
  const tables: Record<string, string[]> = {};
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const cols = m[2]
      .split('\n')
      .map(l => l.replace(/--.*$/, '').trim())
      .filter(l => l.length > 0)
      // table-level constraints are not columns
      .filter(l => !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(l))
      .map(l => l.split(/\s+/)[0]!.replace(/,$/, ''))
      .filter(c => /^\w+$/.test(c));
    tables[m[1]!] = cols;
  }
  return tables;
}

let client: pg.Client | null = null;
let skipReason = '';

/**
 * DATABASE_URL from the environment, else out of the repo .env — the same
 * fallback tests/helpers/markets-test-db.ts uses. Vitest does not load .env,
 * so reading only process.env made this skip on every run, which is a guard
 * that reports success while checking nothing.
 */
function readDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envText = fs.readFileSync(path.resolve(__dirname, '..', '..', '.env'), 'utf8');
    const m = envText.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

beforeAll(async () => {
  const url = readDatabaseUrl();
  if (!url) { skipReason = 'no DATABASE_URL in the environment or .env'; return; }
  try {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    client = c;
  } catch (e) {
    skipReason = `cannot reach the database: ${e instanceof Error ? e.message : e}`;
  }
}, 30_000);

afterAll(async () => { await client?.end(); });

describe('the markets test fixture describes the real database', () => {
  it('parses the fixture it is meant to be checking', () => {
    // A parser that finds nothing passes exactly as quietly as one that works.
    const tables = parseFixtureTables(fs.readFileSync(FIXTURE, 'utf8'));
    expect(Object.keys(tables).length).toBeGreaterThan(15);
    expect(tables['market_why_chain_levels']).toContain('answer');
  });

  it('declares no column the database does not have', async () => {
    if (!client) {
      console.log(`[fixture-drift] skipped — ${skipReason}`);
      return;
    }
    const tables = parseFixtureTables(fs.readFileSync(FIXTURE, 'utf8'));
    const drift: string[] = [];
    let compared = 0;

    for (const [table, cols] of Object.entries(tables)) {
      const r = await client.query<{ column_name: string }>(
        'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
        [table],
      );
      // A table absent from this database is not drift — it may simply not be
      // installed here. Only columns of tables that DO exist are compared.
      if (r.rows.length === 0) continue;
      compared++;
      const live = new Set(r.rows.map(x => x.column_name));
      for (const col of cols) {
        if (!live.has(col)) drift.push(`${table}.${col}`);
      }
    }

    expect(compared, 'no fixture table was found in the database — wrong DB?').toBeGreaterThan(10);
    expect(
      drift.join('\n'),
      'The fixture declares columns the database does not have. Tests written '
      + 'against them will pass and the same code will throw 42703 in production '
      + '(this is how the why-chain reaper shipped broken). Either add a '
      + 'migration or drop the column from the fixture.',
    ).toBe('');
  }, 60_000);
});
