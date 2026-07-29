/**
 * sql-template-literals.test.ts — a template literal has no comment syntax.
 *
 * On 2026-07-28 I moved an explanatory comment into a `db.run(\`...\`)` template literal
 * while fixing something else. A template literal is a STRING: those `//` lines became
 * part of the SQL, and `POST /api/coding/projects` — Studio's create-project endpoint —
 * returned 500 for every user from that moment until 2026-07-29.
 *
 * Two things let it survive:
 *
 *   1. The comment LOOKS outside. It is indented to the same level as the surrounding
 *      code and reads perfectly naturally; only the position of the closing backtick
 *      gives it away.
 *   2. The test I wrote to pin that very change asserted
 *        `SRC.slice(...).toContain('user_id')`
 *      on the source TEXT. Syntactically invalid SQL contains the string 'user_id' just
 *      as happily as valid SQL does, so it passed throughout. That is the exact class of
 *      vacuous test this codebase keeps producing: an assertion about the shape of the
 *      source, standing in for one about behaviour.
 *
 * This guard is static and cheap so it runs everywhere, including without a database.
 * The DB-backed companion below proves the specific statement actually parses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

interface Offender { file: string; line: number; snippet: string }

/** Template literals handed to a db call that contain a `//` comment line. */
function offenders(): Offender[] {
  const found: Offender[] = [];
  for (const file of walk(join(process.cwd(), 'server'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/db\.(?:run|get|all|exec)\s*(?:<[^>]*>)?\s*\(\s*`([^`]*)`/g)) {
      const body = m[1];
      if (!/^\s*\/\//m.test(body)) continue;
      if (!/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(body)) continue;
      found.push({
        file: file.replace(process.cwd(), '.'),
        line: src.slice(0, m.index).split('\n').length,
        snippet: (body.match(/^\s*\/\/.*$/m) ?? [''])[0].trim().slice(0, 70),
      });
    }
  }
  return found;
}

describe('no SQL template literal contains a // comment', () => {
  it('scans a real number of server files', () => {
    // Without this, a broken walk() or regex would make the assertion below pass over
    // nothing — the same failure mode the file exists to catch.
    expect(walk(join(process.cwd(), 'server')).length).toBeGreaterThan(200);
  });

  it('finds SQL template literals at all', () => {
    // Likewise: prove the matcher sees db.run(`...`) calls, so a zero result means
    // "none offend" rather than "the regex stopped working".
    const src = readFileSync(join(process.cwd(), 'server/routes/coding-large.ts'), 'utf8');
    expect([...src.matchAll(/db\.(?:run|get|all|exec)\s*(?:<[^>]*>)?\s*\(\s*`([^`]*)`/g)].length)
      .toBeGreaterThan(5);
  });

  it('reports none', () => {
    const bad = offenders();
    expect(
      bad,
      `a template literal is a string — move these comments outside the backticks:\n  ${
        bad.map((o) => `${o.file}:${o.line}  ${o.snippet}`).join('\n  ')}`,
    ).toEqual([]);
  });
});

// ── Does the statement actually parse? ───────────────────────────────────────
const DATABASE_URL = (() => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
})();
const d = DATABASE_URL ? describe : describe.skip;

d('the create-project INSERT parses against PostgreSQL', () => {
  let client: import('pg').Client;

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL! });
    await client.connect();
  });
  afterAll(async () => { await client?.end(); });

  /** PREPARE inside a rolled-back transaction: parses without writing anything. */
  async function parses(sql: string): Promise<string | null> {
    await client.query('BEGIN');
    try { await client.query(`PREPARE probe_stmt AS ${sql}`); return null; }
    catch (e) { return (e as Error).message.split('\n')[0]; }
    finally { await client.query('ROLLBACK'); }
  }

  it('the SQL lifted from the source is valid', async () => {
    // Extracted from the file rather than retyped, so this cannot drift from what runs.
    const src = readFileSync(join(process.cwd(), 'server/routes/coding-large.ts'), 'utf8');
    const m = /db\.run\(`([^`]*INSERT INTO projects[^`]*)`/.exec(src);
    expect(m, 'INSERT INTO projects not found').toBeTruthy();
    const sql = m![1].replace(/\?/g, () => '$1').replace(/\$1/g, (() => {
      let n = 0; return () => `$${++n}`;
    })());
    expect(await parses(sql)).toBeNull();
  });

  it('...and the broken form genuinely does not parse', async () => {
    // The negative control inside the test: proves the check above can fail, and that
    // PostgreSQL really does reject a `//` line rather than tolerating it.
    const broken = `INSERT INTO projects (id, name, status) VALUES ($1, $2, 'active')
      // a comment that ended up inside the template literal`;
    expect(await parses(broken)).toMatch(/syntax error/i);
  });
});
