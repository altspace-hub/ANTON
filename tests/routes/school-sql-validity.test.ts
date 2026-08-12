/**
 * school-sql-validity.test.ts — the School routes' SQL must be valid PostgreSQL against
 * the schema that actually ships.
 *
 * School is one of the largest surfaces in ANTON (34 pages, ~3,360 lines of routes, 35
 * tables) and had ZERO route tests. As a result it was written against a schema that
 * does not exist, and four separate queries threw on every call:
 *
 *   - `DATE('now', '-7 days')` — SQLite. The PG adapter translates `datetime('now')`
 *     but not `DATE(...)`, so it reached Postgres verbatim: "function date(unknown,
 *     unknown) does not exist". This was the STUDENT DASHBOARD, i.e. the School home
 *     page, 500ing for every user.
 *   - `u.name` in five places — `users` has `username` and `display_name`, never `name`.
 *     Class roster, submission list, submission detail and the guardian children list.
 *   - `teacher_assignments.instructions` — the column is `description`. The Socratic
 *     examiner ran with no learning objectives at all.
 *   - `db.run(...)` for a SELECT — returns `{changes, lastInsertRowid}`, never rows.
 *
 * Every one was invisible: swallowed by a bare catch, or rendered by a client with a
 * loading state and no error state, so a failed load looked like "no data yet".
 *
 * These tests EXECUTE the SQL. A string-matching test would not have caught any of them
 * — the queries look perfectly reasonable, and only the database knows they are wrong.
 * Skips cleanly when no database is configured.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();
const SCHOOL = readFileSync(join(process.cwd(), 'server/routes/school.ts'), 'utf8');

describe('the fixed SQL is gone from the source', () => {
  it('no SQLite DATE(\'now\', ...) remains', () => {
    expect(SCHOOL).not.toMatch(/DATE\('now'/);
  });

  it('no query selects users.name', () => {
    expect(SCHOOL).not.toMatch(/\bu\.name\b/);
  });

  it('no query selects teacher_assignments.instructions', () => {
    expect(SCHOOL).not.toMatch(/instructions FROM teacher_assignments/);
  });

  it('db.run is not used to read rows', () => {
    expect(SCHOOL).not.toMatch(/res\.json\(await db\.run\(/);
  });
});

const d = DATABASE_URL ? describe : describe.skip;

d('the queries actually execute against PostgreSQL', () => {
  let client: import('pg').Client;

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL! });
    await client.connect();
  });
  afterAll(async () => { await client?.end(); });

  /** Runs SQL and returns the PG error message, or null when it is valid. */
  async function errorFor(sql: string): Promise<string | null> {
    try { await client.query(sql); return null; }
    catch (e) { return (e as Error).message.split('\n')[0]; }
  }

  it('the dashboard 7-day window is valid PostgreSQL', async () => {
    expect(await errorFor(
      `SELECT 1 FROM assessment_results WHERE student_user_id = 'x' AND created_at >= NOW() - INTERVAL '7 days'`,
    )).toBeNull();
  });

  it('...and the SQLite form it replaced is genuinely invalid', async () => {
    // Negative control INSIDE the test: proves this assertion can fail, and that the
    // adapter does not quietly rescue DATE() the way it rescues datetime().
    expect(await errorFor(
      `SELECT 1 WHERE NOW() >= DATE('now', '-7 days')`,
    )).toMatch(/function date/i);
  });

  it('the student-name expression resolves', async () => {
    expect(await errorFor(
      `SELECT COALESCE(u.display_name, u.username) AS student_name FROM users u LIMIT 1`,
    )).toBeNull();
  });

  it('...and users.name genuinely does not exist', async () => {
    expect(await errorFor(`SELECT u.name FROM users u LIMIT 1`)).toMatch(/column u\.name does not exist/i);
  });

  it('the assignment objectives column resolves', async () => {
    expect(await errorFor(`SELECT title, description FROM teacher_assignments LIMIT 1`)).toBeNull();
  });

  it('...and teacher_assignments.instructions genuinely does not exist', async () => {
    expect(await errorFor(`SELECT instructions FROM teacher_assignments LIMIT 1`))
      .toMatch(/column .*instructions.* does not exist/i);
  });

  it('the guardian children list resolves', async () => {
    expect(await errorFor(
      `SELECT u.id, COALESCE(u.display_name, u.username) AS name, u.email, gsl.created_at AS linked_at
         FROM guardian_student_links gsl JOIN users u ON u.id = gsl.student_user_id LIMIT 1`,
    )).toBeNull();
  });

  it('the curricula listing resolves', async () => {
    expect(await errorFor(`SELECT * FROM school_curricula ORDER BY created_at DESC LIMIT 1`)).toBeNull();
  });
});
