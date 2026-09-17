/**
 * run-recovery.test.ts — a restart marks the runs it killed (Wave 5).
 *
 * Against a fake adapter (no database) and the real in-process step-job
 * registry:
 *   - rows still 'assessing' with no live job are marked; a row whose job is
 *     running in this process is left alone; one log line carries the count;
 *   - the 'interrupted' STATUS is written only when the status check
 *     constraint admits it (probed from pg_catalog) — otherwise interrupted_at
 *     alone, because the baseline constraint predates the state and a write
 *     that violates it would fail every boot;
 *   - a row already marked (interrupted_at set) is not counted twice;
 *   - lostRunJob turns either shape into { status: 'lost', interruptedAt }
 *     and answers null for every other status.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  markInterruptedRuns,
  interruptedStatusAllowed,
  lostRunJob,
  gapRunJobKey,
  INTERRUPTED_STATUS_PROBE_SQL,
  ORPHANED_RUNS_SQL,
} from '../../server/services/run-recovery.js';
import { startStepJob, resetStepJobsForTests } from '../../server/services/step-job-registry.js';

const BASELINE_CHECK = "CHECK ((status = ANY (ARRAY['draft'::text, 'assessing'::text, 'scoring'::text, 'synthesising'::text, 'complete'::text, 'paused'::text])))";
const RELAXED_CHECK = "CHECK ((status = ANY (ARRAY['draft'::text, 'assessing'::text, 'interrupted'::text, 'scoring'::text, 'synthesising'::text, 'complete'::text, 'paused'::text])))";

interface Row { id: string; status: string; interrupted_at: Date | null; updated_at?: Date }

function fakeDb(rows: Row[], constraintDef: string | null) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql === INTERRUPTED_STATUS_PROBE_SQL) return (constraintDef === null ? undefined : { def: constraintDef }) as T;
      return undefined;
    },
    async all<T>(sql: string): Promise<T[]> {
      // Evaluates the real predicate: assessing AND (never marked OR marked before the run's last start).
      if (sql === ORPHANED_RUNS_SQL) {
        return rows
          .filter((r) => r.status === 'assessing' && (r.interrupted_at === null || (r.updated_at !== undefined && r.interrupted_at < r.updated_at)))
          .map((r) => ({ id: r.id })) as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      writes.push({ sql, params });
      const row = rows.find((r) => r.id === params[0]);
      if (row && sql.startsWith('UPDATE gap_assessments')) {
        const now = new Date();
        row.interrupted_at = now;
        row.updated_at = now;
        if (sql.includes("status = 'interrupted'")) row.status = 'interrupted';
      }
      return { changes: row ? 1 : 0, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, writes };
}

let logSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetStepJobsForTests();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  logSpy.mockRestore();
  resetStepJobsForTests();
});

describe('markInterruptedRuns', () => {
  it('marks every assessing row with no live job, leaves other statuses alone, and logs one line with the count', async () => {
    const rows: Row[] = [
      { id: 'a1', status: 'assessing', interrupted_at: null },
      { id: 'a2', status: 'assessing', interrupted_at: null },
      { id: 's1', status: 'scoring', interrupted_at: null },
      { id: 'd1', status: 'draft', interrupted_at: null },
    ];
    const { db, writes } = fakeDb(rows, RELAXED_CHECK);
    const result = await markInterruptedRuns(db);
    expect(result).toEqual({ gapAssessments: 2 });
    expect(writes.map((w) => w.params[0])).toEqual(['a1', 'a2']);
    expect(rows.find((r) => r.id === 'a1')).toMatchObject({ status: 'interrupted' });
    expect(rows.find((r) => r.id === 'a1')!.interrupted_at).toBeInstanceOf(Date);
    expect(rows.find((r) => r.id === 's1')).toMatchObject({ status: 'scoring', interrupted_at: null });
    const lines = logSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[run-recovery]'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('2 gap assessment(s)');
  });

  it('writes interrupted_at alone when the status check constraint does not admit the interrupted state', async () => {
    const rows: Row[] = [{ id: 'a1', status: 'assessing', interrupted_at: null }];
    const { db, writes } = fakeDb(rows, BASELINE_CHECK);
    const result = await markInterruptedRuns(db);
    expect(result).toEqual({ gapAssessments: 1 });
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).not.toContain("status = 'interrupted'");
    expect(writes[0].sql).toContain('interrupted_at = NOW()');
    expect(rows[0].status).toBe('assessing');
    expect(rows[0].interrupted_at).toBeInstanceOf(Date);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[run-recovery]'));
    expect(line).toContain('interrupted_at only');
  });

  it('a row whose job is still running in this process is not touched', async () => {
    const rows: Row[] = [
      { id: 'live', status: 'assessing', interrupted_at: null },
      { id: 'dead', status: 'assessing', interrupted_at: null },
    ];
    const { db, writes } = fakeDb(rows, RELAXED_CHECK);
    let release: () => void = () => undefined;
    startStepJob(gapRunJobKey('live'), {}, () => new Promise<void>((resolve) => { release = resolve; }));
    const result = await markInterruptedRuns(db);
    expect(result).toEqual({ gapAssessments: 1 });
    expect(writes.map((w) => w.params[0])).toEqual(['dead']);
    expect(rows.find((r) => r.id === 'live')).toMatchObject({ status: 'assessing', interrupted_at: null });
    release();
  });

  it('a row already marked is not counted again, and no rows means no writes and no probe', async () => {
    const marked = new Date('2026-09-16T08:00:00Z');
    const rows: Row[] = [{ id: 'a1', status: 'assessing', interrupted_at: marked, updated_at: marked }];
    const { db, writes } = fakeDb(rows, BASELINE_CHECK);
    expect(await markInterruptedRuns(db)).toEqual({ gapAssessments: 0 });
    expect(writes).toHaveLength(0);
    const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[run-recovery]'));
    expect(line).toContain('0 gap assessment(s)');
    // Boot twice in a row: the second pass finds nothing new.
    const again = [{ id: 'a2', status: 'assessing', interrupted_at: null }] as Row[];
    const second = fakeDb(again, BASELINE_CHECK);
    expect(await markInterruptedRuns(second.db)).toEqual({ gapAssessments: 1 });
    expect(await markInterruptedRuns(second.db)).toEqual({ gapAssessments: 0 });
    expect(second.writes).toHaveLength(1);
  });

  it('a run restarted after an earlier interruption and interrupted again is re-marked with the new time', async () => {
    const firstMark = new Date('2026-09-16T08:00:00Z');
    const restartedAt = new Date('2026-09-16T09:00:00Z');   // the run route set assessing + updated_at, left interrupted_at
    const rows: Row[] = [{ id: 'a1', status: 'assessing', interrupted_at: firstMark, updated_at: restartedAt }];
    const { db, writes } = fakeDb(rows, BASELINE_CHECK);
    expect(await markInterruptedRuns(db)).toEqual({ gapAssessments: 1 });
    expect(writes).toHaveLength(1);
    expect(rows[0].interrupted_at!.getTime()).toBeGreaterThan(restartedAt.getTime());
  });

  it('an unreadable catalog falls back to the stricter shape rather than a failing write', async () => {
    const rows: Row[] = [{ id: 'a1', status: 'assessing', interrupted_at: null }];
    const { db, writes } = fakeDb(rows, RELAXED_CHECK);
    (db as { get: unknown }).get = async () => { throw new Error('permission denied for pg_constraint'); };
    expect(await markInterruptedRuns(db)).toEqual({ gapAssessments: 1 });
    expect(writes[0].sql).not.toContain("status = 'interrupted'");
  });
});

describe('interruptedStatusAllowed', () => {
  it('reads the constraint: baseline no, relaxed yes, absent yes', async () => {
    expect(await interruptedStatusAllowed(fakeDb([], BASELINE_CHECK).db)).toBe(false);
    expect(await interruptedStatusAllowed(fakeDb([], RELAXED_CHECK).db)).toBe(true);
    expect(await interruptedStatusAllowed(fakeDb([], null).db)).toBe(true);
  });
});

describe('lostRunJob', () => {
  it('answers lost for a row still marked mid-run, with the mark time when there is one', () => {
    expect(lostRunJob({ status: 'assessing', interrupted_at: null })).toEqual({ status: 'lost', interruptedAt: null });
    expect(lostRunJob({ status: 'assessing', interrupted_at: new Date('2026-09-17T06:30:00Z') })).toEqual({ status: 'lost', interruptedAt: '2026-09-17T06:30:00.000Z' });
    expect(lostRunJob({ status: 'interrupted', interrupted_at: '2026-09-17T06:30:00.000Z' })).toEqual({ status: 'lost', interruptedAt: '2026-09-17T06:30:00.000Z' });
  });

  it('answers null for every status that is not mid-run', () => {
    for (const status of ['draft', 'scoring', 'synthesising', 'complete', 'paused', undefined]) {
      expect(lostRunJob({ status, interrupted_at: new Date() })).toBeNull();
    }
  });
});
