/**
 * pg-date-type.test.ts — a DATE column comes back as the day it is.
 *
 * node-postgres's default turns a DATE into a Date at local midnight. Three
 * things broke on it (2026-09-23):
 *   - fc-budget-service compared `state.last_daily_reset !== today` — a Date
 *     against a string, always unequal — so the FutureChain daily spend and
 *     transaction limits reset on every check and never blocked;
 *   - JSON printed a DATE as the previous day east of UTC
 *     ("2027-03-30T22:00:00.000Z" for 2027-03-31) — the Risk Atlas showed it,
 *     and the path card saved it back a day early;
 *   - a date <input> given that timestamp (Grow's expected close, the
 *     humanitarian donor exit) showed empty.
 * The unit test for the budget passed throughout: its mock returned the date
 * as text, which is what the code assumed — not what PostgreSQL delivered. So
 * this runs against PostgreSQL, through the adapter the server uses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

d('a DATE through the PostgreSQL adapter', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
  });
  afterAll(async () => { await db.close(); });

  it('is the YYYY-MM-DD text, whatever the time zone', async () => {
    const row = await db.get<{ d: unknown }>(`SELECT DATE '2027-03-31' AS d`);
    expect(row?.d).toBe('2027-03-31');
  });

  it('compares equal to the day the code writes — the budget reset check', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.get<{ last_daily_reset: unknown }>(`SELECT CAST(? AS DATE) AS last_daily_reset`, today);
    // fc-budget-service: `if (state.last_daily_reset !== today) reset()`
    expect(row?.last_daily_reset === today).toBe(true);
  });

  it('leaves timestamps alone', async () => {
    const row = await db.get<{ t: unknown }>(`SELECT TIMESTAMPTZ '2027-03-31T12:00:00Z' AS t`);
    expect(row?.t).toBeInstanceOf(Date);
  });
});
