/**
 * query-column-drift.test.ts — the SQL a route or service runs must name columns
 * that exist.
 *
 * ── The failure this catches ───────────────────────────────────────────────
 *
 * Two queries shipped with column names the table never had:
 *
 *   - trails-aggregator-service.ts selected `signing_key_fingerprint, signed_at`
 *     from community_signed_trail_entries. Migration 080 created the table with
 *     `signer_hash, signer_public_key, created_at`. The SELECT threw, the catch
 *     returned [], and every signed delivery was missing from /audit-trail.
 *
 *   - human-oversight.ts filtered human_oversight_reviews on `reviewer_id`. The
 *     column is `user_id` (schema.postgresql.sql ~line 566). The per-session GET
 *     500'd on every call and the gate component swallowed it, so a recorded
 *     sign-off vanished on reload.
 *
 * Neither query is exercised by a unit test because both are behind a live
 * database, and neither surfaced at runtime because the callers caught the error.
 * migration-schema-drift.test.ts checks that declared TABLES exist; this file
 * checks that the COLUMNS the code actually asks for exist, by running the real
 * statements (exported from the modules under test) with `LIMIT 0`.
 *
 * ── Negative control ───────────────────────────────────────────────────────
 *
 * A probe that never fails proves nothing. The last block runs the original
 * broken statements (the two above plus the aggregator's workflow_run,
 * evidence_pack and renderer_artifact kinds, which had the same drift and were
 * found by the first sweep) through the same probe and requires PostgreSQL's
 * undefined_column error (SQLSTATE 42703). If that block ever passes green
 * without an error, the probe has stopped reaching the database.
 *
 * Read-only: every statement is a SELECT wrapped in `LIMIT 0`. Skips cleanly
 * with a reason when DATABASE_URL is absent or the database is unreachable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  SIGNED_DELIVERY_SQL,
  WORKFLOW_RUN_SQL,
  EVIDENCE_PACK_SQL,
  RENDERER_ARTIFACT_SQL,
} from '../../server/services/trails-aggregator-service.js';
import { OVERSIGHT_SQL } from '../../server/routes/human-oversight.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

function resolveDatabaseUrl(): string | undefined {
  // tests/setup/db-guard.ts (vitest globalSetup) decides what DATABASE_URL is for
  // this run; a test never reads .env to find a database.
  return resolveTestDatabaseUrl();
}
const DATABASE_URL = resolveDatabaseUrl();

/** Sentinel that matches no row; the probe must not depend on data being present. */
const PROBE = '__query_column_drift_probe__';

/** Wrap a statement so it is planned (columns resolved) but returns no rows. */
function limitZero(sql: string): string {
  return `SELECT * FROM (${sql}) AS drift_probe LIMIT 0`;
}

// ── The statements under test, built exactly as the code builds them ────────

const PROBES: Array<{ name: string; sql: string; params: unknown[] }> = [
  {
    name: 'trails-aggregator: signed trail entries (no filter)',
    sql: SIGNED_DELIVERY_SQL.entries(''),
    params: [],
  },
  {
    name: 'trails-aggregator: signed trail entries (from/to filter)',
    sql: SIGNED_DELIVERY_SQL.entries('WHERE created_at >= $1 AND created_at <= $2'),
    params: ['2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z'],
  },
  {
    name: 'trails-aggregator: latest verification per trail',
    sql: SIGNED_DELIVERY_SQL.latestVerificationPerTrail('$1, $2'),
    params: [PROBE, `${PROBE}-2`],
  },
  {
    name: 'trails-aggregator: workflow runs (no filter)',
    sql: WORKFLOW_RUN_SQL.runs(''),
    params: [],
  },
  {
    name: 'trails-aggregator: workflow runs (user + from/to filter)',
    sql: WORKFLOW_RUN_SQL.runs('WHERE user_id = $1 AND started_at >= $2 AND started_at <= $3'),
    params: [PROBE, '2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z'],
  },
  {
    name: 'trails-aggregator: evidence packs (no filter)',
    sql: EVIDENCE_PACK_SQL.packs(''),
    params: [],
  },
  {
    name: 'trails-aggregator: evidence packs (created_by + from/to filter)',
    sql: EVIDENCE_PACK_SQL.packs('WHERE created_by = $1 AND created_at >= $2 AND created_at <= $3'),
    params: [PROBE, '2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z'],
  },
  {
    name: 'trails-aggregator: rendered artifacts (no filter)',
    sql: RENDERER_ARTIFACT_SQL.artifacts(''),
    params: [],
  },
  {
    name: 'trails-aggregator: rendered artifacts (session + created_by + from/to filter)',
    sql: RENDERER_ARTIFACT_SQL.artifacts('WHERE session_id = $1 AND created_by = $2 AND created_at >= $3 AND created_at <= $4'),
    params: [PROBE, PROBE, '2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z'],
  },
  {
    name: 'human-oversight: latest review for a session',
    sql: OVERSIGHT_SQL.sessionReview,
    params: [PROBE, PROBE],
  },
  {
    name: 'human-oversight: review list (no filters)',
    ...OVERSIGHT_SQL.listReviews(PROBE, {}, 0),
  },
  {
    name: 'human-oversight: review list (session + module filters)',
    ...OVERSIGHT_SQL.listReviews(PROBE, { sessionId: PROBE, moduleId: PROBE }, 0),
  },
];

/** The statements as they were before the fix — the negative control. */
const BROKEN: Array<{ name: string; sql: string; params: unknown[] }> = [
  {
    name: 'signed trail entries selecting signing_key_fingerprint / signed_at',
    sql: `SELECT id, task_id, trail_id, entry_index, signing_key_fingerprint, signed_at
            FROM community_signed_trail_entries ORDER BY signed_at DESC LIMIT 200`,
    params: [],
  },
  {
    name: 'session review filtering on reviewer_id',
    sql: 'SELECT * FROM human_oversight_reviews WHERE session_id = ? AND reviewer_id = ? ORDER BY created_at DESC LIMIT 1',
    params: [PROBE, PROBE],
  },
  {
    name: 'workflow runs selecting finished_at / error',
    sql: 'SELECT id, workflow_id, status, started_at, finished_at, error FROM workflow_runs ORDER BY started_at DESC LIMIT 200',
    params: [],
  },
  {
    name: 'evidence packs selecting user_id / framework',
    sql: 'SELECT id, user_id, title, framework, status, created_at FROM evidence_packs ORDER BY created_at DESC LIMIT 200',
    params: [],
  },
  {
    name: 'rendered artifacts selecting artifact_type / uri / rendered_at',
    sql: 'SELECT id, session_id, renderer_id, artifact_type, uri, rendered_at FROM rendered_artifacts ORDER BY rendered_at DESC LIMIT 200',
    params: [],
  },
];

// ── Static guards (run without a database) ─────────────────────────────────

describe('the exported statements are the real ones', () => {
  // If a refactor left the exports pointing at an empty or unrelated string, the
  // database probes below would pass vacuously. Pin the table each one targets.
  it('signed-delivery SQL targets community_signed_trail_entries and community_trail_verifications', () => {
    expect(SIGNED_DELIVERY_SQL.entries('')).toMatch(/FROM\s+community_signed_trail_entries\b/);
    expect(SIGNED_DELIVERY_SQL.latestVerificationPerTrail('$1')).toMatch(/FROM\s+community_trail_verifications\b/);
  });

  it('the other three aggregator kinds target their tables', () => {
    expect(WORKFLOW_RUN_SQL.runs('')).toMatch(/FROM\s+workflow_runs\b/);
    expect(EVIDENCE_PACK_SQL.packs('')).toMatch(/FROM\s+evidence_packs\b/);
    expect(RENDERER_ARTIFACT_SQL.artifacts('')).toMatch(/FROM\s+rendered_artifacts\b/);
  });

  it('oversight SQL targets human_oversight_reviews and binds every filter positionally', () => {
    expect(OVERSIGHT_SQL.sessionReview).toMatch(/FROM\s+human_oversight_reviews\b/);
    const { sql, params } = OVERSIGHT_SQL.listReviews('u', { sessionId: 's', moduleId: 'm' }, 7);
    expect(sql).toMatch(/FROM\s+human_oversight_reviews\b/);
    expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
    expect(params).toEqual(['u', 's', 'm', 7]);
  });
});

// ── Live-schema probes ─────────────────────────────────────────────────────

const d = DATABASE_URL ? describe : describe.skip;

d('every column the fixed queries name exists in the live schema', () => {
  let db: DatabaseAdapter | undefined;
  /** Set when DATABASE_URL is present but the database cannot be reached. */
  let unavailable: string | undefined;

  beforeAll(async () => {
    try {
      const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
      // The production adapter, so `?` → `$n` conversion is exercised exactly as
      // the route runs it — a placeholder miscount fails here too.
      const adapter = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 2, connectionTimeoutMs: 3000 });
      await adapter.get('SELECT 1 AS ok');
      db = adapter;
    } catch (err) {
      unavailable = `DATABASE_URL is set but the database is unreachable: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
  afterAll(async () => { await db?.close(); });

  for (const probe of PROBES) {
    it(probe.name, async (ctx) => {
      if (!db) { ctx.skip(unavailable ?? 'no database'); return; }
      // A wrong column name rejects here with SQLSTATE 42703 (undefined_column).
      await expect(db.all(limitZero(probe.sql), ...probe.params)).resolves.toEqual([]);
    });
  }

  describe('negative control: the original broken statements are rejected by the same probe', () => {
    for (const broken of BROKEN) {
      it(broken.name, async (ctx) => {
        if (!db) { ctx.skip(unavailable ?? 'no database'); return; }
        const err: unknown = await db.all(limitZero(broken.sql), ...broken.params).then(() => undefined, (e: unknown) => e);
        expect(err, 'the probe accepted a statement naming a column that does not exist').toBeDefined();
        expect((err as { code?: string }).code, 'expected PostgreSQL undefined_column (42703)').toBe('42703');
      });
    }
  });
});
