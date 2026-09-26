/**
 * demo-mode-background.test.ts — a public demo neither learns from its
 * visitors nor runs unattended model work (public showcase, 2026-09-25).
 *
 *   - runLearningForOutput: in demo mode an output is marked 'skipped' with
 *     the demo reason and no summary call and no atom extraction happen —
 *     the same output outside demo mode is summarised and learned;
 *   - startMemorySweep registers nothing in demo mode even with
 *     MEMORY_SWEEP_DISABLED unset;
 *   - a missions-runner tick in demo mode reads no mission and advances none.
 *
 * No database: fakes answer the modules' own statements.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const callChatMock = vi.fn();
const extractAtomsMock = vi.fn();
const listMissionsMock = vi.fn();
const advanceBatchMock = vi.fn();

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
vi.mock('../../server/services/missions/mission-controller.js', () => ({
  createMissionController: () => ({
    state: { listMissions: (...args: unknown[]) => listMissionsMock(...args) },
    advanceBatch: (...args: unknown[]) => advanceBatchMock(...args),
  }),
}));

import { LEARNING_SQL, DEMO_MODE_SKIP_REASON, runLearningForOutput } from '../../server/services/output-store.js';
import { startMemorySweep } from '../../server/services/memory-sweep.js';
import { createMissionRunner } from '../../server/services/missions/mission-runner.js';

const LONG_TEXT = 'The board asked for a business-wide risk assessment of the payment services line before year end; the sanctions screening gap found in the third-quarter audit is still open and the MLRO has escalated it.';

function fakeDb() {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    dialect: 'postgresql',
    get: async (sql: string) => {
      if (sql === LEARNING_SQL.load) {
        return { id: 'out_1', output_data: JSON.stringify(LONG_TEXT), output_summary: null, learning_status: 'pending', learning_attempts: 0 };
      }
      return undefined;
    },
    all: async () => [],
    run: async (sql: string, ...params: unknown[]): Promise<RunResult> => {
      writes.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    exec: async () => {},
    transaction: async <T>(fn: (d: DatabaseAdapter) => Promise<T>) => fn(db as unknown as DatabaseAdapter),
    close: async () => {},
  };
  return { db: db as unknown as DatabaseAdapter, writes };
}

const savedDemo = process.env.DEMO_MODE;
const savedSweep = process.env.MEMORY_SWEEP_DISABLED;

beforeEach(() => {
  callChatMock.mockReset().mockResolvedValue({ text: 'A one-line summary.' });
  extractAtomsMock.mockReset().mockResolvedValue({ extracted: 2, stored: 2 });
  listMissionsMock.mockReset().mockResolvedValue([{ id: 'm1', status: 'active', created_at: '2026-09-01T00:00:00Z' }]);
  advanceBatchMock.mockReset().mockResolvedValue({ status: 'mission_active', results: [] });
  delete process.env.MEMORY_SWEEP_DISABLED;
});

afterEach(() => {
  if (savedDemo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = savedDemo;
  if (savedSweep === undefined) delete process.env.MEMORY_SWEEP_DISABLED; else process.env.MEMORY_SWEEP_DISABLED = savedSweep;
});

describe('no learning from visitors in demo mode', () => {
  it('marks the output skipped and makes no model call and no atom', async () => {
    process.env.DEMO_MODE = 'true';
    const { db, writes } = fakeDb();
    const r = await runLearningForOutput(db, 'out_1');
    expect(r).toEqual({ outputId: 'out_1', status: 'skipped', error: DEMO_MODE_SKIP_REASON });
    expect(callChatMock).not.toHaveBeenCalled();
    expect(extractAtomsMock).not.toHaveBeenCalled();
    expect(writes).toEqual([{ sql: LEARNING_SQL.markSkipped, params: [DEMO_MODE_SKIP_REASON, 'out_1'] }]);
  });

  it('learns from the same output outside demo mode (negative control)', async () => {
    delete process.env.DEMO_MODE;
    const { db, writes } = fakeDb();
    const r = await runLearningForOutput(db, 'out_1');
    expect(r.status).toBe('learned');
    expect(callChatMock).toHaveBeenCalledTimes(1);
    expect(extractAtomsMock).toHaveBeenCalledWith('out_1');
    expect(writes.map((w) => w.sql)).toContain(LEARNING_SQL.markLearned);
  });
});

describe('the memory sweep in demo mode', () => {
  it('registers nothing, even with MEMORY_SWEEP_DISABLED unset', () => {
    process.env.DEMO_MODE = 'true';
    const { db } = fakeDb();
    expect(startMemorySweep(db, { firstDelayMs: 60_000 })).toBeNull();
  });

  it('registers outside demo mode (negative control)', () => {
    delete process.env.DEMO_MODE;
    const { db } = fakeDb();
    const handle = startMemorySweep(db, { firstDelayMs: 60_000 });
    expect(handle).not.toBeNull();
    handle?.stop();
  });
});

describe('the missions runner in demo mode', () => {
  it('reads no mission and advances none', async () => {
    process.env.DEMO_MODE = 'true';
    const { db } = fakeDb();
    const result = await createMissionRunner(db).tick();
    expect(result).toEqual({ picked: 0, advanced: 0, completed: 0, paused: 0, failed: 0 });
    expect(listMissionsMock).not.toHaveBeenCalled();
    expect(advanceBatchMock).not.toHaveBeenCalled();
  });

  it('advances an active mission outside demo mode (negative control)', async () => {
    delete process.env.DEMO_MODE;
    const { db } = fakeDb();
    const result = await createMissionRunner(db).tick();
    expect(result.picked).toBe(1);
    expect(advanceBatchMock).toHaveBeenCalledWith('m1', expect.any(Number));
  });
});
