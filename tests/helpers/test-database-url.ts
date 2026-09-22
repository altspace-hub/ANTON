/**
 * test-database-url.ts — the one way a test file finds its database.
 *
 * process.env.DATABASE_URL is whatever tests/setup/db-guard.ts (the vitest
 * globalSetup) decided for this run: the dedicated ANTON_TEST_DATABASE_URL,
 * CI's ephemeral service database, the live database only under
 * ALLOW_LIVE_DB_TESTS=1, or nothing — in which case the DB-backed suites skip
 * and ANTON_DB_TESTS_SKIPPED says why.
 *
 * A test never parses .env to find a database. tests/setup/db-guard.test.ts
 * fails the run if one does.
 */
export function resolveTestDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}
