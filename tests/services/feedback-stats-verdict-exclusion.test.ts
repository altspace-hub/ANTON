/**
 * feedback-stats-verdict-exclusion.test.ts — Finding #7
 * (run-pipeline adversarial review 2026-06).
 *
 * Migration 226 added a 1-click verdict lane to output_feedback whose rows carry
 * rating = NULL. getFeedbackStats (star-rating aggregator) selected by module_id
 * only, so those NULL-rating verdict rows inflated `count`, diluted avgRating, and
 * added a spurious "null" distribution key. The fix adds `AND rating IS NOT NULL`.
 *
 * Requires DATABASE_URL (env or .env) + migration 226; skips otherwise. No LLM.
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

describeOrSkip('getFeedbackStats excludes NULL-rating verdict rows (#7)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let ratchet: Awaited<ReturnType<typeof import('../../server/services/quality-ratchet.js').createQualityRatchet>>;

  // Unique module id so this test owns every output_feedback row it reads.
  const moduleId = `qr-verdict-test-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createQualityRatchet } = await import('../../server/services/quality-ratchet.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    ratchet = await createQualityRatchet(db);

    const insert = (rating: number | null, verdict: string | null) =>
      db.run(
        `INSERT INTO output_feedback (id, module_id, rating, verdict)
         VALUES (?, ?, ?, ?)`,
        `fb_${randomUUID().slice(0, 12)}`, moduleId, rating, verdict);

    // Two real star ratings: 4 and 2 → avg 3, count 2.
    await insert(4, null);
    await insert(2, null);
    // Two verdict-only rows (rating NULL) — must be excluded from the star stats.
    await insert(null, 'good');
    await insert(null, 'needs_work');
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM output_feedback WHERE module_id = ?', moduleId);
    } finally {
      await db.close();
    }
  });

  it('count, avgRating, and distribution reflect only rating rows (NULL verdict rows ignored)', async () => {
    const stats = await ratchet.getFeedbackStats(moduleId);
    // 2 star rows, not 4 — verdict rows excluded.
    expect(stats.count).toBe(2);
    // avg of {4, 2} = 3, not diluted by NULLs.
    expect(stats.avgRating).toBeCloseTo(3, 5);
    // distribution carries no spurious "null" key; only the rated buckets.
    expect(stats.distribution[4]).toBe(1);
    expect(stats.distribution[2]).toBe(1);
    expect(Object.prototype.hasOwnProperty.call(stats.distribution, 'null')).toBe(false);
    expect((stats.distribution as Record<string, number>)['null']).toBeUndefined();
  });

  it('a module with ONLY verdict rows reports zero star feedback (count 0, avg 0)', async () => {
    const verdictOnlyModule = `qr-verdict-only-${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO output_feedback (id, module_id, rating, verdict) VALUES (?, ?, NULL, 'good')`,
      `fb_${randomUUID().slice(0, 12)}`, verdictOnlyModule);
    try {
      const stats = await ratchet.getFeedbackStats(verdictOnlyModule);
      expect(stats.count).toBe(0);
      expect(stats.avgRating).toBe(0);
    } finally {
      await db.run('DELETE FROM output_feedback WHERE module_id = ?', verdictOnlyModule);
    }
  });
});
