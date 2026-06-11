/**
 * orchestrator-spend-gate.test.ts — Wave 3.6 spend gate pause/resume logic.
 *
 * The pure evaluator (evaluateSpendGate) plus the DB-backed checkSpendGate
 * with an in-memory fake adapter (same pattern as default-model-store.test.ts).
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  evaluateSpendGate,
  checkSpendGate,
  getSpendGateThreshold,
  DEFAULT_UNRATED_PAUSE_THRESHOLD,
} from '../../server/services/orchestrator-spend-gate.js';

// ── Pure evaluator ───────────────────────────────────────────────────────────

describe('evaluateSpendGate (pure)', () => {
  it('does not pause when there are no proposals at all', () => {
    const state = evaluateSpendGate([], 10);
    expect(state.paused).toBe(false);
    expect(state.threshold).toBe(10);
  });

  it('does not pause with fewer unrated proposals than the threshold', () => {
    const state = evaluateSpendGate([null, null, null], 10);
    expect(state.paused).toBe(false);
    expect(state.unratedStreak).toBe(3);
  });

  it('pauses when the last N proposals are ALL unrated', () => {
    const state = evaluateSpendGate(new Array(10).fill(null), 10);
    expect(state.paused).toBe(true);
    expect(state.reason).toContain('rate recent proposals to resume');
  });

  it('resumes (does not pause) once any proposal within the window is rated', () => {
    const ratings: Array<string | null> = new Array(10).fill(null);
    ratings[4] = 'relevant'; // a rating inside the last-10 window
    const state = evaluateSpendGate(ratings, 10);
    expect(state.paused).toBe(false);
    expect(state.unratedStreak).toBe(4);
  });

  it('a rating OUTSIDE the window does not prevent the pause', () => {
    // 10 unrated newest, then an old rated one — still paused
    const ratings: Array<string | null> = [...new Array(10).fill(null), 'good_catch'];
    const state = evaluateSpendGate(ratings, 10);
    expect(state.paused).toBe(true);
  });

  it('rating the newest proposal resumes immediately', () => {
    const ratings: Array<string | null> = ['relevant', ...new Array(9).fill(null)];
    const state = evaluateSpendGate(ratings, 10);
    expect(state.paused).toBe(false);
    expect(state.unratedStreak).toBe(0);
  });

  it('honours a custom threshold', () => {
    expect(evaluateSpendGate([null, null, null], 3).paused).toBe(true);
    expect(evaluateSpendGate([null, null], 3).paused).toBe(false);
  });

  it('treats empty-string ratings as unrated', () => {
    const state = evaluateSpendGate(['', '', ''], 3);
    expect(state.paused).toBe(true);
  });

  it('falls back to the default threshold on garbage input', () => {
    const state = evaluateSpendGate([null], Number.NaN);
    expect(state.threshold).toBe(DEFAULT_UNRATED_PAUSE_THRESHOLD);
  });
});

// ── DB-backed check with fake adapter ────────────────────────────────────────

function makeFakeDb(opts: {
  thresholdSetting?: string;
  proposalRatingsNewestFirst?: Array<string | null>;
}): DatabaseAdapter {
  const db: DatabaseAdapter = {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM app_settings') && params[0] === 'orchestrator_unrated_pause_threshold') {
        return opts.thresholdSetting !== undefined ? ({ value: opts.thresholdSetting } as T) : undefined;
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM orchestrator_proposals')) {
        const limit = Number(params[0] ?? 10);
        return (opts.proposalRatingsNewestFirst ?? [])
          .slice(0, limit)
          .map((r) => ({ human_rating: r })) as T[];
      }
      return [];
    },
    async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 } as RunResult; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return db;
}

describe('checkSpendGate (db-backed)', () => {
  it('uses the default threshold when the app_setting is absent', async () => {
    const db = makeFakeDb({ proposalRatingsNewestFirst: new Array(10).fill(null) });
    const state = await checkSpendGate(db);
    expect(state.threshold).toBe(DEFAULT_UNRATED_PAUSE_THRESHOLD);
    expect(state.paused).toBe(true);
  });

  it('reads the configurable threshold from app_settings', async () => {
    const db = makeFakeDb({ thresholdSetting: '5', proposalRatingsNewestFirst: new Array(5).fill(null) });
    expect(await getSpendGateThreshold(db)).toBe(5);
    const state = await checkSpendGate(db);
    expect(state.threshold).toBe(5);
    expect(state.paused).toBe(true);
  });

  it('clamps absurd thresholds and ignores non-numeric settings', async () => {
    expect(await getSpendGateThreshold(makeFakeDb({ thresholdSetting: '99999' }))).toBe(100);
    expect(await getSpendGateThreshold(makeFakeDb({ thresholdSetting: 'banana' }))).toBe(DEFAULT_UNRATED_PAUSE_THRESHOLD);
    expect(await getSpendGateThreshold(makeFakeDb({ thresholdSetting: '0' }))).toBe(DEFAULT_UNRATED_PAUSE_THRESHOLD);
  });

  it('does not pause when a recent proposal is rated', async () => {
    const ratings: Array<string | null> = new Array(10).fill(null);
    ratings[0] = 'good_catch';
    const db = makeFakeDb({ proposalRatingsNewestFirst: ratings });
    const state = await checkSpendGate(db);
    expect(state.paused).toBe(false);
  });

  it('never pauses when the proposals table is missing (fresh install)', async () => {
    const db = makeFakeDb({});
    (db as { all: unknown }).all = async () => { throw new Error('relation does not exist'); };
    const state = await checkSpendGate(db);
    expect(state.paused).toBe(false);
  });
});
