/**
 * apprentice-atomic-increment.test.ts — Finding #6
 * (run-pipeline adversarial review 2026-06).
 *
 * The apprentice session counter used JS read-modify-write
 * (newCount = sessions_completed + 1), which lost updates under concurrency, and
 * two simultaneous first-runs both hit INSERT ... ON CONFLICT DO NOTHING, dropping
 * a session. The fix is a single atomic upsert that increments in SQL and RETURNs
 * the post-increment row. This test runs that exact upsert concurrently and asserts
 * no lost updates. (Rerun-gating — reruns don't increment — is asserted at the
 * route level in rerun.test.ts via the rerunOf marker; here we lock the SQL shape.)
 *
 * Requires DATABASE_URL (env or .env) + migration 221 (quality_n); skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

// The exact upsert claude.ts runs per (non-rerun) module completion.
const UPSERT = `INSERT INTO apprentice_profiles (user_id, module_id, area_id, sessions_completed, last_session)
   VALUES (?, ?, ?, 1, ?)
   ON CONFLICT (user_id, module_id) DO UPDATE SET
     sessions_completed = apprentice_profiles.sessions_completed + 1,
     last_session = excluded.last_session
   RETURNING id, stage, sessions_completed, quality_avg, quality_n`;

describeOrSkip('apprentice atomic session increment (#6)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;

  const userId = `apprentice-test-${randomUUID().slice(0, 8)}`;
  const moduleId = 'gap-analysis';

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    await db.run('DELETE FROM apprentice_profiles WHERE user_id = ?', userId);
  }, 30_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM apprentice_profiles WHERE user_id = ?', userId);
    } finally {
      await db.close();
    }
  });

  it('RETURNs the post-increment count; the first run starts at 1', async () => {
    const row = await db.get(
      UPSERT, userId, moduleId, 'fcp', new Date().toISOString(),
    ) as { id: string; sessions_completed: number };
    expect(row).toBeDefined();
    expect(row.sessions_completed).toBe(1);
  });

  it('N concurrent runs increment to exactly N (no lost updates)', async () => {
    const concurrentUser = `${userId}-concurrent`;
    try {
      const N = 25;
      // Fire all N upserts in parallel — the pre-#6 read-modify-write would lose
      // updates here (and the first two DO-NOTHING inserts would drop a session).
      const results = await Promise.all(
        Array.from({ length: N }, () =>
          db.get<{ sessions_completed: number }>(UPSERT, concurrentUser, moduleId, 'fcp', new Date().toISOString())),
      ) as Array<{ sessions_completed: number }>;

      // Every call returned a distinct post-increment value 1..N (atomic counter).
      const counts = results.map((r) => r.sessions_completed).sort((a, b) => a - b);
      expect(counts).toEqual(Array.from({ length: N }, (_, i) => i + 1));

      // The persisted row reflects all N runs — none lost.
      const final = await db.get(
        'SELECT sessions_completed FROM apprentice_profiles WHERE user_id = ? AND module_id = ?',
        concurrentUser, moduleId,
      ) as { sessions_completed: number };
      expect(final.sessions_completed).toBe(N);

      // Still exactly one profile row (no duplicate inserts).
      const rows = await db.all(
        'SELECT id FROM apprentice_profiles WHERE user_id = ? AND module_id = ?',
        concurrentUser, moduleId,
      );
      expect(rows.length).toBe(1);
    } finally {
      await db.run('DELETE FROM apprentice_profiles WHERE user_id = ?', concurrentUser);
    }
  }, 30_000);
});
