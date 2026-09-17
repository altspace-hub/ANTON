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
  checkAndRecordSpendGate,
  getSpendGateThreshold,
  DEFAULT_UNRATED_PAUSE_THRESHOLD,
  SPEND_GATE_STATE_KEY,
  type SpendGateStateRecord,
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

// ── Skipped-cycle record ─────────────────────────────────────────────────────
//
// A heartbeat the gate skips writes no trail and no audit row; the persisted
// gate state is the one record it leaves. checkAndRecordSpendGate is called
// once per scheduled cycle, so paused_cycles counts the skipped cycles.

function makeStatefulDb(ratingsNewestFirst: () => Array<string | null>) {
  const settings = new Map<string, string>();
  const notifications: unknown[][] = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM app_settings')) {
        const value = settings.get(String(params[0]));
        return value === undefined ? undefined : ({ value } as T);
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM orchestrator_proposals')) {
        return ratingsNewestFirst().slice(0, Number(params[0] ?? 10)).map((r) => ({ human_rating: r })) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO app_settings')) settings.set(String(params[0]), String(params[1]));
      if (sql.includes('INSERT INTO notifications')) notifications.push(params);
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  const state = (): SpendGateStateRecord | undefined => {
    const raw = settings.get(SPEND_GATE_STATE_KEY);
    return raw ? JSON.parse(raw) as SpendGateStateRecord : undefined;
  };
  return { db, state, notifications };
}

describe('checkAndRecordSpendGate (skipped-cycle record)', () => {
  it('counts each skipped cycle while paused, keeps changed_at, and drops the counter on resume', async () => {
    let ratings: Array<string | null> = new Array(10).fill(null);
    const { db, state, notifications } = makeStatefulDb(() => ratings);

    // Cycle 1: the gate closes — a transition, so a notification, counter = 1.
    expect((await checkAndRecordSpendGate(db)).paused).toBe(true);
    const closed = state();
    expect(closed).toMatchObject({ paused: true, threshold: 10, paused_cycles: 1 });
    expect(typeof closed?.changed_at).toBe('string');
    expect(closed?.last_paused_cycle_at).toBe(closed?.changed_at);
    expect(notifications).toHaveLength(1);

    // Cycles 2 and 3: still paused — no transition, no notification, counter climbs.
    await checkAndRecordSpendGate(db);
    await checkAndRecordSpendGate(db);
    const stillClosed = state();
    expect(stillClosed).toMatchObject({ paused: true, paused_cycles: 3, changed_at: closed?.changed_at });
    expect(notifications).toHaveLength(1);

    // A rating inside the window reopens the gate; the counter is not carried over.
    ratings = ['relevant', ...new Array(9).fill(null)];
    expect((await checkAndRecordSpendGate(db)).paused).toBe(false);
    const open = state();
    expect(open?.paused).toBe(false);
    expect(open?.paused_cycles).toBeUndefined();
    expect(open?.last_paused_cycle_at).toBeUndefined();
    expect(open?.changed_at).not.toBe(closed?.changed_at);
  });

  it('a legacy state record without the counter starts counting from the next skipped cycle', async () => {
    const ratings: Array<string | null> = new Array(10).fill(null);
    const { db, state, notifications } = makeStatefulDb(() => ratings);
    await db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?)',
      SPEND_GATE_STATE_KEY,
      JSON.stringify({ paused: true, changed_at: '2026-06-11T10:30:00.251Z', threshold: 10 }),
    );

    await checkAndRecordSpendGate(db);
    expect(state()).toMatchObject({ paused: true, changed_at: '2026-06-11T10:30:00.251Z', paused_cycles: 1 });
    expect(notifications).toHaveLength(0);
  });
});
