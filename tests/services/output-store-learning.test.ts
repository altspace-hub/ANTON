/**
 * output-store-learning.test.ts — the learning ledger (Wave 4).
 *
 * workflow_outputs.learning_status must tell the truth about what the
 * pipeline did: pending → summarised → learned, or skipped / failed with the
 * reason. Against a fake adapter that answers the module's own statements by
 * identity (LEARNING_SQL) — no database, no engine:
 *
 *   - the happy path writes the summary, then the atoms, then 'learned' +
 *     learned_at, bumping learning_attempts once;
 *   - a short output is 'skipped' with 'too short' and costs no LLM call;
 *   - a 'learned' row is left alone (no bump, no call);
 *   - a summariser failure lands in 'failed' + learning_error and never throws;
 *   - an extractor failure keeps the summary and lands in 'failed';
 *   - an existing summary is reused; an output that already has atoms is
 *     marked learned without a second extraction;
 *   - the sweep runs rows oldest-first, stops the pass on "SDK engine busy"
 *     and carries on past any other failure;
 *   - the sweep timer never overlaps passes and honours MEMORY_SWEEP_DISABLED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const callChatMock = vi.fn();
const extractAtomsMock = vi.fn();

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (...args: unknown[]) => callChatMock(...args),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'fake-utility-model',
}));
vi.mock('../../server/services/atom-extractor.js', () => ({
  createAtomExtractor: async () => ({ extractAtoms: (id: string) => extractAtomsMock(id) }),
}));

import {
  LEARNING_SQL,
  MIN_LEARNABLE_CHARS,
  LEARNING_ERROR_MAX_CHARS,
  learnableText,
  isEngineBusyError,
  runLearningForOutput,
  sweepUnlearnedOutputs,
  type LearningStatus,
} from '../../server/services/output-store.js';
import { startMemorySweep, MEMORY_SWEEP_DISABLED_ENV } from '../../server/services/memory-sweep.js';

const LONG_TEXT = 'The client, Nordea Bank, must complete its business-wide risk assessment under AMLR Article 16 before the December board meeting; the sanctions screening gap identified in the Q3 audit remains open and the MLRO has escalated it to the risk committee.';
const BUSY = 'SDK engine busy — background work is capped at 1 of 2 concurrent runs so interactive requests always keep a slot. It will retry on the next pass.';

interface Row {
  id: string;
  output_data: string;
  output_summary: string | null;
  learning_status: LearningStatus;
  learning_attempts: number;
  learning_error: string | null;
  learned_at: string | null;
  created_at: string;
}

interface FakeState {
  rows: Map<string, Row>;
  /** Outputs that already have knowledge_atoms rows. */
  withAtoms: Set<string>;
  /** Status writes in order, per output. */
  transitions: string[];
  unlearnedParams: unknown[] | null;
  /** When set, the sweep's SELECT resolves only after this promise. */
  holdUnlearned: Promise<void> | null;
}

function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id, output_data: JSON.stringify(LONG_TEXT), output_summary: null, learning_status: 'pending',
    learning_attempts: 0, learning_error: null, learned_at: null, created_at: '2026-09-16T10:00:00Z', ...over,
  };
}

function makeFakeDb(rows: Row[]): { db: DatabaseAdapter; state: FakeState } {
  const state: FakeState = {
    rows: new Map(rows.map((r) => [r.id, r])), withAtoms: new Set(), transitions: [], unlearnedParams: null, holdUnlearned: null,
  };
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql === LEARNING_SQL.load) {
        const r = state.rows.get(String(params[0]));
        if (!r) return undefined;
        const { id, output_data, output_summary, learning_status, learning_attempts } = r;
        return { id, output_data, output_summary, learning_status, learning_attempts } as T;
      }
      if (sql === LEARNING_SQL.hasAtoms) {
        return state.withAtoms.has(String(params[0])) ? ({ ok: 1 } as T) : undefined;
      }
      throw new Error(`fake db: unexpected get(): ${sql.slice(0, 80)}`);
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql === LEARNING_SQL.unlearned) {
        state.unlearnedParams = params;
        if (state.holdUnlearned) await state.holdUnlearned;
        const [maxAttempts] = params as [number, number, number];
        const limit = params[2] as number;
        return [...state.rows.values()]
          .filter((r) => ['pending', 'summarised', 'failed'].includes(r.learning_status) && r.learning_attempts < maxAttempts)
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
          .slice(0, limit)
          .map((r) => ({ id: r.id }) as T);
      }
      throw new Error(`fake db: unexpected all(): ${sql.slice(0, 80)}`);
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      const id = String(params[params.length - 1]);
      const r = state.rows.get(id);
      if (!r) throw new Error(`fake db: run() on unknown row ${id}`);
      if (sql === LEARNING_SQL.bumpAttempts) { r.learning_attempts += 1; }
      else if (sql === LEARNING_SQL.markSkipped) { r.learning_status = 'skipped'; r.learning_error = String(params[0]); state.transitions.push(`${id}:skipped`); }
      else if (sql === LEARNING_SQL.markSummarised) { r.output_summary = String(params[0]); r.learning_status = 'summarised'; r.learning_error = null; state.transitions.push(`${id}:summarised`); }
      else if (sql === LEARNING_SQL.markLearned) { r.learning_status = 'learned'; r.learned_at = 'NOW'; r.learning_error = null; state.transitions.push(`${id}:learned`); }
      else if (sql === LEARNING_SQL.markFailed) { r.learning_status = 'failed'; r.learning_error = String(params[0]); state.transitions.push(`${id}:failed`); }
      else throw new Error(`fake db: unexpected run(): ${sql.slice(0, 80)}`);
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter;
  return { db, state };
}

beforeEach(() => {
  callChatMock.mockReset();
  extractAtomsMock.mockReset();
  callChatMock.mockResolvedValue({ text: '  Nordea must finish its BWRA before the December board.  ' });
  extractAtomsMock.mockResolvedValue({ inserted: 3, duplicates: 1, dropped: 0, entities: 4 });
});

describe('learnableText', () => {
  it('a stored JSON string is measured as itself, an object as its JSON, and non-JSON as-is', () => {
    expect(learnableText(JSON.stringify('hello'))).toBe('hello');
    expect(learnableText(JSON.stringify({ a: 1 }))).toBe('{"a":1}');
    expect(learnableText('not json')).toBe('not json');
  });
});

describe('runLearningForOutput — the ledger', () => {
  it('pending → summarised → learned, with the summary stored and attempts bumped once', async () => {
    const { db, state } = makeFakeDb([row('out-1')]);
    const result = await runLearningForOutput(db, 'out-1');

    expect(result).toEqual({ outputId: 'out-1', status: 'learned', atoms: { inserted: 3, duplicates: 1, dropped: 0, entities: 4 } });
    const r = state.rows.get('out-1')!;
    expect(r.learning_status).toBe('learned');
    expect(r.learned_at).toBe('NOW');
    expect(r.learning_attempts).toBe(1);
    expect(r.learning_error).toBeNull();
    expect(r.output_summary).toBe('Nordea must finish its BWRA before the December board.');
    expect(state.transitions).toEqual(['out-1:summarised', 'out-1:learned']);

    // The summary is background work on the utility model.
    expect(callChatMock).toHaveBeenCalledTimes(1);
    const call = callChatMock.mock.calls[0][0] as { model: string; background: boolean; maxTokens: number };
    expect(call.model).toBe('fake-utility-model');
    expect(call.background).toBe(true);
    expect(extractAtomsMock).toHaveBeenCalledWith('out-1');
  });

  it('a short output is skipped as "too short" — no LLM call, attempts still counted', async () => {
    const { db, state } = makeFakeDb([row('out-short', { output_data: JSON.stringify('x'.repeat(MIN_LEARNABLE_CHARS - 1)) })]);
    const result = await runLearningForOutput(db, 'out-short');
    expect(result).toEqual({ outputId: 'out-short', status: 'skipped', error: 'too short' });
    const r = state.rows.get('out-short')!;
    expect(r.learning_status).toBe('skipped');
    expect(r.learning_error).toBe('too short');
    expect(r.learning_attempts).toBe(1);
    expect(callChatMock).not.toHaveBeenCalled();
    expect(extractAtomsMock).not.toHaveBeenCalled();
  });

  it('an output exactly at the threshold is learned', async () => {
    const { db } = makeFakeDb([row('out-edge', { output_data: JSON.stringify('y'.repeat(MIN_LEARNABLE_CHARS)) })]);
    expect((await runLearningForOutput(db, 'out-edge')).status).toBe('learned');
  });

  it('a learned row is left alone: no attempt bump, no call', async () => {
    const { db, state } = makeFakeDb([row('out-done', { learning_status: 'learned', learning_attempts: 1, output_summary: 's' })]);
    const result = await runLearningForOutput(db, 'out-done');
    expect(result).toEqual({ outputId: 'out-done', status: 'learned', alreadyLearned: true });
    expect(state.rows.get('out-done')!.learning_attempts).toBe(1);
    expect(state.transitions).toEqual([]);
    expect(callChatMock).not.toHaveBeenCalled();
    expect(extractAtomsMock).not.toHaveBeenCalled();
  });

  it('a missing row reports missing and writes nothing', async () => {
    const { db, state } = makeFakeDb([]);
    expect(await runLearningForOutput(db, 'nope')).toEqual({ outputId: 'nope', status: 'missing', error: 'output not found' });
    expect(state.transitions).toEqual([]);
  });

  it('a summariser failure lands in failed + learning_error and does not throw', async () => {
    callChatMock.mockRejectedValue(new Error(BUSY));
    const { db, state } = makeFakeDb([row('out-1')]);
    const result = await runLearningForOutput(db, 'out-1');
    expect(result.status).toBe('failed');
    expect(result.error).toBe(BUSY);
    const r = state.rows.get('out-1')!;
    expect(r.learning_status).toBe('failed');
    expect(r.learning_error).toBe(BUSY);
    expect(r.output_summary).toBeNull();
    expect(r.learning_attempts).toBe(1);
    expect(extractAtomsMock).not.toHaveBeenCalled();
  });

  it('an extractor failure keeps the summary and lands in failed', async () => {
    extractAtomsMock.mockRejectedValue(new Error('atom insert failed for output out-1 (2 atom(s))'));
    const { db, state } = makeFakeDb([row('out-1')]);
    const result = await runLearningForOutput(db, 'out-1');
    expect(result.status).toBe('failed');
    const r = state.rows.get('out-1')!;
    expect(r.output_summary).toBe('Nordea must finish its BWRA before the December board.');
    expect(r.learning_status).toBe('failed');
    expect(r.learning_error).toMatch(/atom insert failed/);
    expect(state.transitions).toEqual(['out-1:summarised', 'out-1:failed']);
  });

  it('learning_error is a reason, not a dump — capped at 500 characters', async () => {
    callChatMock.mockRejectedValue(new Error('E'.repeat(2000)));
    const { db, state } = makeFakeDb([row('out-1')]);
    await runLearningForOutput(db, 'out-1');
    expect(state.rows.get('out-1')!.learning_error).toHaveLength(LEARNING_ERROR_MAX_CHARS);
  });

  it('a retry reuses an existing summary instead of paying for it again', async () => {
    const { db, state } = makeFakeDb([row('out-1', { learning_status: 'failed', learning_attempts: 2, output_summary: 'kept', learning_error: 'old' })]);
    const result = await runLearningForOutput(db, 'out-1');
    expect(result.status).toBe('learned');
    expect(callChatMock).not.toHaveBeenCalled();
    expect(extractAtomsMock).toHaveBeenCalledTimes(1);
    const r = state.rows.get('out-1')!;
    expect(r.output_summary).toBe('kept');
    expect(r.learning_attempts).toBe(3);
    expect(r.learning_error).toBeNull();
  });

  it('an output that already has atoms (a direct extractor caller) is marked learned without a second extraction', async () => {
    const { db, state } = makeFakeDb([row('out-direct')]);
    state.withAtoms.add('out-direct');
    const result = await runLearningForOutput(db, 'out-direct');
    expect(result).toEqual({ outputId: 'out-direct', status: 'learned' });
    expect(extractAtomsMock).not.toHaveBeenCalled();
    expect(state.rows.get('out-direct')!.output_summary).not.toBeNull();   // the summary was still worth writing
  });
});

describe('isEngineBusyError', () => {
  it('recognises the engine refusal and nothing else', () => {
    expect(isEngineBusyError(BUSY)).toBe(true);
    expect(isEngineBusyError('sdk engine busy')).toBe(true);
    expect(isEngineBusyError('rate limit')).toBe(false);
    expect(isEngineBusyError(undefined)).toBe(false);
  });
});

describe('sweepUnlearnedOutputs', () => {
  it('selects with the documented defaults (maxAttempts 5, older than 5 min, limit 10)', async () => {
    const { db, state } = makeFakeDb([]);
    expect(await sweepUnlearnedOutputs(db)).toEqual({ scanned: 0, learned: 0, failed: 0, stopped: false });
    expect(state.unlearnedParams).toEqual([5, 5, 10]);
    expect(LEARNING_SQL.unlearned).toMatch(/learning_status IN \('pending', 'summarised', 'failed'\)/);
    expect(LEARNING_SQL.unlearned).toMatch(/learning_attempts < \?/);
    expect(LEARNING_SQL.unlearned).toMatch(/ORDER BY created_at ASC/);
  });

  it('passes the caller\'s options through', async () => {
    const { db, state } = makeFakeDb([]);
    await sweepUnlearnedOutputs(db, { limit: 3, olderThanMinutes: 30, maxAttempts: 2 });
    expect(state.unlearnedParams).toEqual([2, 30, 3]);
  });

  it('runs oldest first and stops the pass on "SDK engine busy" — later rows untouched', async () => {
    const { db, state } = makeFakeDb([
      row('c', { created_at: '2026-09-16T12:00:00Z' }),
      row('a', { created_at: '2026-09-16T10:00:00Z' }),
      row('b', { created_at: '2026-09-16T11:00:00Z' }),
    ]);
    callChatMock.mockImplementation(async (cfg: { messages: Array<{ content: string }> }) => {
      // The second row's summary is refused by the engine.
      if (state.transitions.some((t) => t.startsWith('a:'))) throw new Error(BUSY);
      void cfg;
      return { text: 'summary' };
    });
    const result = await sweepUnlearnedOutputs(db, { limit: 10 });
    expect(result).toEqual({ scanned: 3, learned: 1, failed: 1, stopped: true });
    expect(state.rows.get('a')!.learning_status).toBe('learned');
    expect(state.rows.get('b')!.learning_status).toBe('failed');
    expect(state.rows.get('b')!.learning_error).toBe(BUSY);
    expect(state.rows.get('c')!.learning_status).toBe('pending');
    expect(state.rows.get('c')!.learning_attempts).toBe(0);
  });

  it('carries on past a failure that is not the engine being busy', async () => {
    const { db, state } = makeFakeDb([
      row('a', { created_at: '2026-09-16T10:00:00Z' }),
      row('b', { created_at: '2026-09-16T11:00:00Z' }),
    ]);
    callChatMock
      .mockRejectedValueOnce(new Error('upstream 529 overloaded'))
      .mockResolvedValueOnce({ text: 'summary' });
    const result = await sweepUnlearnedOutputs(db, { limit: 10 });
    expect(result).toEqual({ scanned: 2, learned: 1, failed: 1, stopped: false });
    expect(state.rows.get('a')!.learning_status).toBe('failed');
    expect(state.rows.get('b')!.learning_status).toBe('learned');
  });

  it('a skipped row counts as neither learned nor failed', async () => {
    const { db } = makeFakeDb([row('tiny', { output_data: JSON.stringify('short') })]);
    expect(await sweepUnlearnedOutputs(db)).toEqual({ scanned: 1, learned: 0, failed: 0, stopped: false });
  });

  it('a row that has failed maxAttempts times is no longer selected', async () => {
    const { db } = makeFakeDb([row('tired', { learning_status: 'failed', learning_attempts: 5 })]);
    expect((await sweepUnlearnedOutputs(db)).scanned).toBe(0);
    expect((await sweepUnlearnedOutputs(db, { maxAttempts: 6 })).scanned).toBe(1);
  });
});

describe('startMemorySweep', () => {
  const saved = process.env[MEMORY_SWEEP_DISABLED_ENV];
  afterEach(() => {
    if (saved === undefined) delete process.env[MEMORY_SWEEP_DISABLED_ENV];
    else process.env[MEMORY_SWEEP_DISABLED_ENV] = saved;
    vi.useRealTimers();
  });

  it('MEMORY_SWEEP_DISABLED=true registers nothing', () => {
    process.env[MEMORY_SWEEP_DISABLED_ENV] = 'true';
    const { db } = makeFakeDb([]);
    expect(startMemorySweep(db)).toBeNull();
  });

  it('passes never overlap: a second runOnce while one is in flight returns null', async () => {
    delete process.env[MEMORY_SWEEP_DISABLED_ENV];
    const { db, state } = makeFakeDb([]);
    let release!: () => void;
    state.holdUnlearned = new Promise<void>((resolve) => { release = resolve; });
    const handle = startMemorySweep(db, { intervalMs: 60_000, firstDelayMs: 60_000 });
    expect(handle).not.toBeNull();
    try {
      const first = handle!.runOnce();
      expect(handle!.running).toBe(true);
      expect(await handle!.runOnce()).toBeNull();
      release();
      expect(await first).toEqual({ scanned: 0, learned: 0, failed: 0, stopped: false });
      expect(handle!.running).toBe(false);
      // and once the pass is over, the next one runs
      state.holdUnlearned = null;
      expect(await handle!.runOnce()).not.toBeNull();
    } finally {
      handle!.stop();
    }
  });

  it('the first pass waits firstDelayMs and then the interval fires', async () => {
    delete process.env[MEMORY_SWEEP_DISABLED_ENV];
    vi.useFakeTimers();
    const { db, state } = makeFakeDb([]);
    const handle = startMemorySweep(db, { intervalMs: 1000, firstDelayMs: 100 });
    try {
      expect(state.unlearnedParams).toBeNull();
      await vi.advanceTimersByTimeAsync(100);
      expect(state.unlearnedParams).not.toBeNull();
      state.unlearnedParams = null;
      await vi.advanceTimersByTimeAsync(1000);
      expect(state.unlearnedParams).not.toBeNull();
    } finally {
      handle!.stop();
    }
  });
});
