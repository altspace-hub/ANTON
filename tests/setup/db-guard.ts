/**
 * db-guard.ts — vitest globalSetup. Decides, once per run and before any test
 * file loads, which database DATABASE_URL names for the tests.
 *
 * Why: the DB-backed suites used to fall back to parsing the repo .env when
 * DATABASE_URL was unset, so every `pnpm test` on a developer machine ran
 * against the live `anton` database. Their afterAll cleanups leaked — 276 of
 * the 304 quality_scores rows on the dev database were test residue.
 *
 * Decision, in order:
 *   1. ANTON_TEST_DATABASE_URL set (process.env, else the repo .env) — it
 *      becomes DATABASE_URL for the run. Its database name must not be one of
 *      anton / postgres / template0 / template1; the run aborts otherwise.
 *   2. CI truthy — DATABASE_URL is left exactly as CI set it. The workflow's
 *      ephemeral postgres service is also called `anton`, so no name check.
 *   3. ALLOW_LIVE_DB_TESTS=1 — DATABASE_URL is kept (read from the repo .env
 *      when the shell did not export it) and a warning names the database.
 *      The suites will write to it.
 *   4. Otherwise — DATABASE_URL is removed from the environment and
 *      ANTON_DB_TESTS_SKIPPED carries the reason; the DB-backed suites skip.
 *
 * Tests read the outcome through tests/helpers/test-database-url.ts and never
 * parse .env themselves (tests/setup/db-guard.test.ts fails if one does). The
 * only other .env readers in the tree are the two provisioning helpers that use
 * the dev credentials for cluster-level CREATE DATABASE and nothing else
 * (tests/helpers/markets-test-db.ts, tests/a2a/two-instance-harness.ts), and
 * the operator-run scripts under tests/manual/.
 *
 * The decision is also published through project.provide('antonDbGuard') so
 * a test can prove the environment it sees is the one this file decided on.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

export type DbGuardMode = 'test-db' | 'ci' | 'live-allowed' | 'protected';

export interface DbGuardContext {
  mode: DbGuardMode;
  /** Database name DATABASE_URL points at for this run; null when it is unset. */
  databaseName: string | null;
  /** Value of ANTON_DB_TESTS_SKIPPED for this run; null when DB tests run. */
  skipReason: string | null;
}

export interface DbGuardDecision extends DbGuardContext {
  /** DATABASE_URL for the run; undefined means it is removed from the environment. */
  databaseUrl: string | undefined;
  /** The one line printed to the console. */
  message: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    antonDbGuard: DbGuardContext;
  }
}

/** Databases a test run must never be pointed at by ANTON_TEST_DATABASE_URL. */
export const FORBIDDEN_DB_NAMES: ReadonlySet<string> = new Set(['anton', 'postgres', 'template0', 'template1']);

export const SKIP_REASON = 'no ANTON_TEST_DATABASE_URL; live database protected';

export function dbNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

function isTruthyFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'false';
}

/**
 * Pure decision over an environment snapshot. `dotEnv` resolves a variable
 * from the repo .env (only consulted where the contract above says so).
 */
export function decide(
  env: Readonly<Record<string, string | undefined>>,
  dotEnv: (name: string) => string | undefined,
): DbGuardDecision {
  const explicit = env.ANTON_TEST_DATABASE_URL?.trim() || dotEnv('ANTON_TEST_DATABASE_URL');
  if (explicit) {
    const name = dbNameOf(explicit);
    if (!name || FORBIDDEN_DB_NAMES.has(name)) {
      throw new Error(
        `[db-guard] ANTON_TEST_DATABASE_URL names database '${name || '?'}' — refusing to run tests against it. ` +
        'Point it at a dedicated test database (see .env.example).',
      );
    }
    return {
      mode: 'test-db',
      databaseUrl: explicit,
      databaseName: name,
      skipReason: null,
      message: `[db-guard] DB-backed tests run against test database '${name}' (ANTON_TEST_DATABASE_URL).`,
    };
  }

  if (isTruthyFlag(env.CI)) {
    const url = env.DATABASE_URL?.trim() || undefined;
    const name = url ? dbNameOf(url) : null;
    return {
      mode: 'ci',
      databaseUrl: url,
      databaseName: name,
      skipReason: url ? null : 'CI without DATABASE_URL',
      message: url
        ? `[db-guard] CI: DATABASE_URL left as provided (database '${name}').`
        : '[db-guard] CI: DATABASE_URL is unset — DB-backed tests skip.',
    };
  }

  if (env.ALLOW_LIVE_DB_TESTS === '1') {
    const url = env.DATABASE_URL?.trim() || dotEnv('DATABASE_URL');
    if (!url) {
      return {
        mode: 'live-allowed',
        databaseUrl: undefined,
        databaseName: null,
        skipReason: 'ALLOW_LIVE_DB_TESTS=1 but no DATABASE_URL in the environment or .env',
        message: '[db-guard] ALLOW_LIVE_DB_TESTS=1 but no DATABASE_URL in the environment or .env — DB-backed tests skip.',
      };
    }
    const name = dbNameOf(url);
    return {
      mode: 'live-allowed',
      databaseUrl: url,
      databaseName: name,
      skipReason: null,
      message: `[db-guard] WARNING: ALLOW_LIVE_DB_TESTS=1 — DB-backed tests will WRITE to live database '${name}'.`,
    };
  }

  return {
    mode: 'protected',
    databaseUrl: undefined,
    databaseName: null,
    skipReason: SKIP_REASON,
    message:
      `[db-guard] DB-backed tests skipped: ${SKIP_REASON}. ` +
      'Set ANTON_TEST_DATABASE_URL to a dedicated test database (see .env.example), ' +
      'or ALLOW_LIVE_DB_TESTS=1 to run them against DATABASE_URL.',
  };
}

// ── Repo .env access (this file is the only test-tree reader of it besides the
//    two cluster-level provisioning helpers) ──────────────────────────────────

let dotEnvCache: Map<string, string> | null = null;

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function parseDotEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) out.set(key, value);
  }
  return out;
}

function readDotEnv(name: string): string | undefined {
  if (!dotEnvCache) {
    try {
      dotEnvCache = parseDotEnv(fs.readFileSync(path.join(repoRoot(), '.env'), 'utf8'));
    } catch {
      dotEnvCache = new Map();
    }
  }
  return dotEnvCache.get(name);
}

// ── globalSetup entry point ─────────────────────────────────────────────────

export default function setup(project: TestProject): void {
  const decision = decide(process.env, readDotEnv);

  if (decision.databaseUrl) process.env.DATABASE_URL = decision.databaseUrl;
  else delete process.env.DATABASE_URL;

  if (decision.skipReason) process.env.ANTON_DB_TESTS_SKIPPED = decision.skipReason;
  else delete process.env.ANTON_DB_TESTS_SKIPPED;

  (decision.mode === 'live-allowed' ? console.warn : console.log)(decision.message);

  project.provide('antonDbGuard', {
    mode: decision.mode,
    databaseName: decision.databaseName,
    skipReason: decision.skipReason,
  });
}
