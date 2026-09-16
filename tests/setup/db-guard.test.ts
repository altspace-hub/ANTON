/**
 * db-guard.test.ts — three things about tests/setup/db-guard.ts:
 *
 *   1. The decision table, as pure function calls (no environment mutation).
 *   2. That the decision made in globalSetup (main process) is the environment
 *      this worker actually sees — vitest builds each worker's env from
 *      process.env after globalSetup ran, and this proves it rather than
 *      assuming it.
 *   3. That no test file under tests/ finds a database on its own by parsing
 *      .env or loading dotenv. The guard is only a guard if nothing goes
 *      around it.
 */
import { describe, it, expect, inject } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { decide, dbNameOf, parseDotEnv, SKIP_REASON, FORBIDDEN_DB_NAMES } from './db-guard';

const noDotEnv = (): string | undefined => undefined;
const LIVE = 'postgresql://anton:secret@localhost:5432/anton';
const TEST_DB = 'postgresql://anton:secret@localhost:5432/anton_test';

describe('db-guard decision table', () => {
  it('protects the live database when nothing opts in — even if the shell exported DATABASE_URL', () => {
    const d = decide({ DATABASE_URL: LIVE }, noDotEnv);
    expect(d.mode).toBe('protected');
    expect(d.databaseUrl).toBeUndefined();
    expect(d.databaseName).toBeNull();
    expect(d.skipReason).toBe(SKIP_REASON);
    expect(d.message).toContain('ANTON_TEST_DATABASE_URL');
  });

  it('does not read DATABASE_URL out of .env in the protected path', () => {
    const d = decide({}, (name) => (name === 'DATABASE_URL' ? LIVE : undefined));
    expect(d.mode).toBe('protected');
    expect(d.databaseUrl).toBeUndefined();
  });

  it('exports ANTON_TEST_DATABASE_URL as DATABASE_URL', () => {
    const d = decide({ ANTON_TEST_DATABASE_URL: TEST_DB, DATABASE_URL: LIVE }, noDotEnv);
    expect(d.mode).toBe('test-db');
    expect(d.databaseUrl).toBe(TEST_DB);
    expect(d.databaseName).toBe('anton_test');
    expect(d.skipReason).toBeNull();
  });

  it('finds ANTON_TEST_DATABASE_URL in .env when the shell did not export it', () => {
    const d = decide({}, (name) => (name === 'ANTON_TEST_DATABASE_URL' ? TEST_DB : undefined));
    expect(d.mode).toBe('test-db');
    expect(d.databaseUrl).toBe(TEST_DB);
  });

  it('refuses a test database called anton / postgres / template0 / template1', () => {
    for (const name of FORBIDDEN_DB_NAMES) {
      const url = `postgresql://anton:secret@localhost:5432/${name}`;
      expect(() => decide({ ANTON_TEST_DATABASE_URL: url }, noDotEnv)).toThrow(/refusing/);
    }
    expect(() => decide({ ANTON_TEST_DATABASE_URL: 'not a url' }, noDotEnv)).toThrow(/refusing/);
  });

  it('ANTON_TEST_DATABASE_URL wins over CI and the escape hatch', () => {
    const d = decide({ ANTON_TEST_DATABASE_URL: TEST_DB, CI: 'true', ALLOW_LIVE_DB_TESTS: '1', DATABASE_URL: LIVE }, noDotEnv);
    expect(d.mode).toBe('test-db');
    expect(d.databaseUrl).toBe(TEST_DB);
  });

  it("leaves CI alone, even though CI's service database is also called anton", () => {
    const d = decide({ CI: 'true', DATABASE_URL: LIVE }, noDotEnv);
    expect(d.mode).toBe('ci');
    expect(d.databaseUrl).toBe(LIVE);
    expect(d.databaseName).toBe('anton');
    expect(d.skipReason).toBeNull();
  });

  it('CI without DATABASE_URL skips with a reason and never consults .env', () => {
    const d = decide({ CI: '1' }, (name) => (name === 'DATABASE_URL' ? LIVE : undefined));
    expect(d.mode).toBe('ci');
    expect(d.databaseUrl).toBeUndefined();
    expect(d.skipReason).toMatch(/CI/);
  });

  it('CI=false / CI=0 / CI="" are not CI', () => {
    for (const ci of ['false', '0', '']) {
      expect(decide({ CI: ci, DATABASE_URL: LIVE }, noDotEnv).mode).toBe('protected');
    }
  });

  it('ALLOW_LIVE_DB_TESTS=1 keeps DATABASE_URL and warns', () => {
    const d = decide({ ALLOW_LIVE_DB_TESTS: '1', DATABASE_URL: LIVE }, noDotEnv);
    expect(d.mode).toBe('live-allowed');
    expect(d.databaseUrl).toBe(LIVE);
    expect(d.skipReason).toBeNull();
    expect(d.message).toMatch(/WARNING/);
    expect(d.message).toContain("'anton'");
  });

  it('ALLOW_LIVE_DB_TESTS=1 falls back to .env for DATABASE_URL — and only then', () => {
    const fromDotEnv = (name: string) => (name === 'DATABASE_URL' ? LIVE : undefined);
    expect(decide({ ALLOW_LIVE_DB_TESTS: '1' }, fromDotEnv).databaseUrl).toBe(LIVE);
    const none = decide({ ALLOW_LIVE_DB_TESTS: '1' }, noDotEnv);
    expect(none.databaseUrl).toBeUndefined();
    expect(none.skipReason).toMatch(/no DATABASE_URL/);
  });

  it('only the literal "1" opens the escape hatch', () => {
    expect(decide({ ALLOW_LIVE_DB_TESTS: 'true', DATABASE_URL: LIVE }, noDotEnv).mode).toBe('protected');
    expect(decide({ ALLOW_LIVE_DB_TESTS: 'yes', DATABASE_URL: LIVE }, noDotEnv).mode).toBe('protected');
  });

  it('parses .env lines the way the app does (comments, quotes, CRLF)', () => {
    const m = parseDotEnv('# c\r\nA=1\r\nB="two words"\r\nC=\'x\'\r\nEMPTY=\r\nnoequals\r\n  D = spaced \r\n');
    expect(m.get('A')).toBe('1');
    expect(m.get('B')).toBe('two words');
    expect(m.get('C')).toBe('x');
    expect(m.has('EMPTY')).toBe(false);
    expect(m.get('D')).toBe('spaced');
  });

  it('dbNameOf decodes the path and tolerates garbage', () => {
    expect(dbNameOf('postgresql://u:p@h:5432/anton%5Ftest')).toBe('anton_test');
    expect(dbNameOf('garbage')).toBe('');
  });
});

describe('the globalSetup decision reaches this worker', () => {
  it('process.env here matches what tests/setup/db-guard.ts provided', () => {
    const ctx = inject('antonDbGuard');
    expect(ctx).toBeDefined();
    expect(['test-db', 'ci', 'live-allowed', 'protected']).toContain(ctx.mode);

    const url = process.env.DATABASE_URL;
    if (ctx.databaseName === null) {
      expect(url).toBeUndefined();
    } else {
      expect(url).toBeDefined();
      expect(dbNameOf(url!)).toBe(ctx.databaseName);
    }

    if (ctx.skipReason) expect(process.env.ANTON_DB_TESTS_SKIPPED).toBe(ctx.skipReason);
    else expect(process.env.ANTON_DB_TESTS_SKIPPED).toBeUndefined();

    if (ctx.mode === 'protected') {
      expect(url).toBeUndefined();
      expect(process.env.ANTON_DB_TESTS_SKIPPED).toBe(SKIP_REASON);
    }
    if (ctx.mode === 'test-db') {
      expect(FORBIDDEN_DB_NAMES.has(ctx.databaseName ?? '')).toBe(false);
    }
  });
});

describe('no test finds a database on its own', () => {
  const TESTS_DIR = join(process.cwd(), 'tests');

  /** Files allowed to read .env: this guard, the two cluster-level provisioners, operator scripts. */
  const ALLOWED = new Set([
    'setup/db-guard.ts',
    'setup/db-guard.test.ts',
    'helpers/markets-test-db.ts',
    'a2a/two-instance-harness.ts',
  ]);
  // The repo .env reached through a repo-root anchor, or any single-line
  // readFileSync of a '.env' path. A test that WRITES a fake .env into a temp
  // dir (join(dir, '.env')) is not a database lookup and is not flagged.
  const READS_DOTENV = /(?:join|resolve)\((?:process\.cwd\(\)|__dirname|repoRoot\(\))[^\n]*['"]\.env['"]|readFileSync\([^\n]*['"]\.env['"]/;
  const LOADS_DOTENV = /['"]dotenv(?:\/config)?['"]/;

  // TypeScript only: that is what vitest collects (tests/**/*.test.ts) and what
  // those files can import. The .cjs/.js under tests/device are adb/Playwright
  // operator scripts and never run inside vitest.
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs, out);
      else if (/\.(ts|mts|cts)$/.test(entry)) out.push(abs);
    }
    return out;
  }

  it('no file under tests/ parses .env or loads dotenv, except the sanctioned provisioners', () => {
    const offenders: string[] = [];
    for (const abs of walk(TESTS_DIR)) {
      const rel = relative(TESTS_DIR, abs).replace(/\\/g, '/');
      if (ALLOWED.has(rel) || rel.startsWith('manual/')) continue;
      const text = readFileSync(abs, 'utf8');
      if (READS_DOTENV.test(text) || LOADS_DOTENV.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
