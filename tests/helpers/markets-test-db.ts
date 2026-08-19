/**
 * markets-test-db.ts — isolated-database provisioning for the Markets
 * closed-loop integration suite (Wave-3 item 3.7).
 *
 * SAFETY CONTRACT (load-bearing):
 *   • The suite must NEVER write to the dev 'anton' database — it is live
 *     user data. Every connection that performs writes (DDL, TRUNCATE) first
 *     asserts `current_database()` equals the expected isolated DB name and
 *     is not on the forbidden list below.
 *   • The connection to the configured DATABASE_URL (the dev DB) is used
 *     ONLY for cluster-level CREATE DATABASE / DROP DATABASE statements —
 *     never for table reads or writes.
 *
 * Isolation strategy (in order):
 *   1. MARKETS_TEST_DATABASE_URL env var, if set — an existing database the
 *      operator dedicates to this suite. Tables are created IF NOT EXISTS and
 *      truncated; the database itself is never dropped.
 *   2. Otherwise: derive credentials from DATABASE_URL (process.env, falling
 *      back to the repo .env file) and CREATE DATABASE anton_markets_test.
 *      The 'anton' role has CREATEDB on this machine, so this is the default
 *      path. The test DB is dropped again in afterAll.
 *   3. If neither works (no creds / no CREATEDB / PG down), provisioning
 *      reports a skip reason and the whole suite is skipped — it never falls
 *      back to the dev database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

export const MARKETS_TEST_DB_NAME = 'anton_markets_test';

/** Databases this helper refuses to run DDL/TRUNCATE against, ever. */
const FORBIDDEN_DB_NAMES = new Set(['anton', 'postgres', 'template0', 'template1']);

/** Every table the fixture owns — the TRUNCATE list between tests. */
export const FIXTURE_TABLES = [
  'market_prediction_feedback',
  'market_predictions',
  'market_theses',
  'market_price_normalized',
  'market_pattern_detections',
  'market_signal_weights',
  'market_symbol_weight_overrides',
  'market_signal_weight_adjustments',
  'workflow_runs',
  'market_confidence_calibration',
  'market_index_nav_history',
  'market_index_holdings',
  'market_indexes',
  'market_data_raw',
  'market_historical_prices',
  'market_prediction_attribution',
  'market_index_rebalances',
] as const;

export interface ProvisionResult {
  ok: boolean;
  /** Why the suite must skip (only when ok === false). */
  reason?: string;
  /** Connection string of the isolated test database (only when ok === true). */
  url?: string;
  /** Connection string used for CREATE/DROP DATABASE (cluster-admin work only). */
  adminUrl?: string;
  /** true when this run created the database and should drop it afterwards. */
  owned?: boolean;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function schemaPath(): string {
  return path.join(repoRoot(), 'tests', 'fixtures', 'markets-loop-schema.sql');
}

/** DATABASE_URL from the environment, else parsed out of the repo .env file. */
function readBaseDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envText = fs.readFileSync(path.join(repoRoot(), '.env'), 'utf8');
    const m = envText.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function dbNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

function withDbName(url: string, dbName: string): string {
  const u = new URL(url);
  u.pathname = `/${dbName}`;
  return u.toString();
}

/**
 * Hard gate before any write-capable work: the connection must actually be on
 * the expected isolated database, and that database must not be a forbidden
 * (live) one. Belt and braces against URL-construction mistakes.
 */
async function assertSafeTarget(client: pg.Client, expectedDb: string): Promise<void> {
  if (FORBIDDEN_DB_NAMES.has(expectedDb)) {
    throw new Error(`refusing to run test DDL against forbidden database '${expectedDb}'`);
  }
  const r = await client.query('SELECT current_database() AS db');
  const actual = String(r.rows[0]?.db ?? '');
  if (actual !== expectedDb || FORBIDDEN_DB_NAMES.has(actual)) {
    throw new Error(
      `connected to '${actual}' but expected isolated test DB '${expectedDb}' — aborting before any write`,
    );
  }
}

async function applySchema(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await assertSafeTarget(client, dbNameOf(url));
    const ddl = fs.readFileSync(schemaPath(), 'utf8');
    await client.query(ddl);
  } finally {
    await client.end();
  }
}

/** Empty all fixture tables (between tests / before handing back a reused DB). */
export async function truncateMarketsTables(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await assertSafeTarget(client, dbNameOf(url));
    await client.query(`TRUNCATE TABLE ${FIXTURE_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  } finally {
    await client.end();
  }
}

export async function provisionMarketsTestDb(): Promise<ProvisionResult> {
  // Path 1 — operator-provided dedicated database.
  const explicit = process.env.MARKETS_TEST_DATABASE_URL;
  if (explicit) {
    const name = dbNameOf(explicit);
    if (FORBIDDEN_DB_NAMES.has(name)) {
      return { ok: false, reason: `MARKETS_TEST_DATABASE_URL points at forbidden database '${name}'` };
    }
    try {
      await applySchema(explicit);
      await truncateMarketsTables(explicit);
      return { ok: true, url: explicit, owned: false };
    } catch (err) {
      return { ok: false, reason: `MARKETS_TEST_DATABASE_URL unusable: ${(err as Error).message}` };
    }
  }

  // Path 2 — create an isolated DB next to the configured one.
  const baseUrl = readBaseDatabaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      reason: 'no DATABASE_URL in env or .env, and MARKETS_TEST_DATABASE_URL not set',
    };
  }
  if (dbNameOf(baseUrl) === MARKETS_TEST_DB_NAME) {
    return { ok: false, reason: `DATABASE_URL already points at ${MARKETS_TEST_DB_NAME} — refusing to drop it` };
  }

  const admin = new Client({ connectionString: baseUrl });
  try {
    await admin.connect();
  } catch (err) {
    return { ok: false, reason: `cannot reach PostgreSQL: ${(err as Error).message}` };
  }
  try {
    // Cluster-level statements only — no table access on the dev DB.
    await admin.query(`DROP DATABASE IF EXISTS ${MARKETS_TEST_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${MARKETS_TEST_DB_NAME}`);
  } catch (err) {
    return {
      ok: false,
      reason: `cannot create ${MARKETS_TEST_DB_NAME} (role may lack CREATEDB): ${(err as Error).message}. ` +
        'Set MARKETS_TEST_DATABASE_URL to a dedicated test database to run this suite.',
    };
  } finally {
    await admin.end();
  }

  const url = withDbName(baseUrl, MARKETS_TEST_DB_NAME);
  try {
    await applySchema(url);
  } catch (err) {
    return { ok: false, reason: `fixture DDL failed: ${(err as Error).message}` };
  }
  return { ok: true, url, adminUrl: baseUrl, owned: true };
}

/** Drop the test DB we created; for a reused (MARKETS_TEST_DATABASE_URL) DB, just truncate. */
export async function teardownMarketsTestDb(p: ProvisionResult): Promise<void> {
  if (!p.ok || !p.url) return;
  if (!p.owned) {
    await truncateMarketsTables(p.url);
    return;
  }
  if (!p.adminUrl) return;
  const admin = new Client({ connectionString: p.adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${MARKETS_TEST_DB_NAME} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}
