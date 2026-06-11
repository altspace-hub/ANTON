/**
 * apprentice.test.ts — unit tests for apprentice progression arithmetic
 * (Core Experience Review 2026-06, bug B2).
 *
 * The promotion gates require quality_avg >= 7.0 / 8.0, so the running-mean
 * fold must actually work — and must NOT be poisoned by sessions whose
 * quality scoring was skipped or failed. quality_n (migration 221) counts
 * only the scored sessions and is the denominator of the mean.
 *
 * Uses an in-memory fake DatabaseAdapter (same pattern as
 * default-model-store.test.ts) that emulates exactly the SQL statements
 * apprentice.ts issues, so no Postgres is needed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createApprentice, type ApprenticeProfile } from '../../server/services/apprentice.js';

// ── In-memory fake adapter (apprentice_profiles only) ──────────────────────

type Row = ApprenticeProfile;

function makeFakeDb(): { db: DatabaseAdapter; rows: Map<string, Row> } {
  const rows = new Map<string, Row>(); // key = `${user_id}|${module_id}`
  const key = (u: unknown, m: unknown) => `${String(u)}|${String(m)}`;

  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM apprentice_profiles')) {
        return rows.get(key(params[0], params[1])) as T | undefined;
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM apprentice_profiles')) {
        return [...rows.values()].filter((r) => r.user_id === String(params[0])) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO apprentice_profiles')) {
        const [id, userId, moduleId, areaId, qualityAvg, qualityN, lastSession] = params;
        rows.set(key(userId, moduleId), {
          id: String(id),
          user_id: String(userId),
          module_id: String(moduleId),
          area_id: areaId === null ? null : String(areaId),
          stage: 'observer',
          sessions_completed: 1,
          quality_avg: qualityAvg === null ? null : Number(qualityAvg),
          quality_n: Number(qualityN),
          last_session: String(lastSession),
          promoted_to_guided: null,
          promoted_to_supervised: null,
          promoted_to_autonomous: null,
        });
        return { changes: 1, lastInsertRowid: 0 } as RunResult;
      }
      if (sql.includes('SET sessions_completed')) {
        const [newSessions, lastSession, userId, moduleId] = params;
        const row = rows.get(key(userId, moduleId));
        if (row) {
          row.sessions_completed = Number(newSessions);
          row.last_session = String(lastSession);
        }
        return { changes: row ? 1 : 0, lastInsertRowid: 0 } as RunResult;
      }
      if (sql.includes('SET quality_avg')) {
        // Emulates the atomic fold:
        //   quality_avg = (COALESCE(quality_avg,0)*COALESCE(quality_n,0) + ?) / (COALESCE(quality_n,0)+1)
        //   quality_n   = COALESCE(quality_n,0) + 1
        const [score, userId, moduleId] = params;
        const row = rows.get(key(userId, moduleId));
        if (row) {
          const n = row.quality_n ?? 0;
          row.quality_avg = ((row.quality_avg ?? 0) * n + Number(score)) / (n + 1);
          row.quality_n = n + 1;
        }
        return { changes: row ? 1 : 0, lastInsertRowid: 0 } as RunResult;
      }
      if (sql.includes('SET stage')) {
        const [stage, promotedAt, userId, moduleId] = params;
        const row = rows.get(key(userId, moduleId));
        if (row) {
          row.stage = stage as Row['stage'];
          if (stage === 'guided') row.promoted_to_guided = String(promotedAt);
          if (stage === 'supervised') row.promoted_to_supervised = String(promotedAt);
          if (stage === 'autonomous') row.promoted_to_autonomous = String(promotedAt);
        }
        return { changes: row ? 1 : 0, lastInsertRowid: 0 } as RunResult;
      }
      return { changes: 0, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, rows };
}

// ── Tests ───────────────────────────────────────────────────────────────────

const U = 'solo';
const M = 'sanctions-advisory';

let fake: ReturnType<typeof makeFakeDb>;
let apprentice: Awaited<ReturnType<typeof createApprentice>>;

beforeEach(async () => {
  fake = makeFakeDb();
  apprentice = await createApprentice(fake.db);
});

describe('apprentice quality average (B2)', () => {
  it('first scored session seeds quality_avg and quality_n', async () => {
    await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: 8.2 });
    const p = await apprentice.getProfile(U, M);
    expect(p?.sessions_completed).toBe(1);
    expect(p?.quality_avg).toBeCloseTo(8.2);
    expect(p?.quality_n).toBe(1);
  });

  it('first unscored session leaves quality_avg NULL with quality_n 0', async () => {
    await apprentice.recordSession({ userId: U, moduleId: M });
    const p = await apprentice.getProfile(U, M);
    expect(p?.sessions_completed).toBe(1);
    expect(p?.quality_avg).toBeNull();
    expect(p?.quality_n).toBe(0);
  });

  it('unscored sessions never dilute the average (skip the fold, not fold 0)', async () => {
    await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: 6 });
    await apprentice.recordSession({ userId: U, moduleId: M }); // scoring skipped/failed
    await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: 8 });
    const p = await apprentice.getProfile(U, M);
    expect(p?.sessions_completed).toBe(3);
    expect(p?.quality_n).toBe(2);
    expect(p?.quality_avg).toBeCloseTo(7.0); // (6+8)/2, NOT (6+0+8)/3
  });

  it('a score of 0 is a real (terrible) score, not "missing"', async () => {
    await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: 8 });
    await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: 0 });
    const p = await apprentice.getProfile(U, M);
    expect(p?.quality_n).toBe(2);
    expect(p?.quality_avg).toBeCloseTo(4.0);
  });

  it('promotes observer → guided on sessions alone, but guided → supervised requires quality_avg >= 7', async () => {
    // 8 unscored sessions: reaches guided (3 sessions) but NEVER supervised
    for (let i = 0; i < 8; i++) await apprentice.recordSession({ userId: U, moduleId: M });
    let p = await apprentice.getProfile(U, M);
    expect(p?.stage).toBe('guided');
    expect(p?.quality_avg).toBeNull();

    // One strong scored session lifts avg above 7 → next check promotes
    const result = await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: 9 });
    p = await apprentice.getProfile(U, M);
    expect(p?.quality_avg).toBeCloseTo(9);
    expect(p?.stage).toBe('supervised');
    expect(result?.promoted).toBe(true);
  });

  it('low average blocks supervised promotion even with enough sessions', async () => {
    for (let i = 0; i < 10; i++) await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: 5 });
    const p = await apprentice.getProfile(U, M);
    expect(p?.sessions_completed).toBe(10);
    expect(p?.quality_avg).toBeCloseTo(5);
    expect(p?.stage).toBe('guided'); // sessions gate passed, quality gate not
  });

  it('incremental mean matches the arithmetic mean of all folded scores', async () => {
    const scores = [4.1, 9.3, 7.7, 6.0, 8.8];
    for (const s of scores) await apprentice.recordSession({ userId: U, moduleId: M, qualityScore: s });
    const p = await apprentice.getProfile(U, M);
    const expected = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(p?.quality_avg).toBeCloseTo(expected, 10);
    expect(p?.quality_n).toBe(scores.length);
  });
});
