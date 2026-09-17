/**
 * mission-task-feeds-memory.test.ts — Wave 4b: a completed mission task
 * feeds memory through the ledger.
 *
 * recordTaskOutput in mission-state.ts is the one place a task's output is
 * finalised (every executor — LLM, browser, api_call, database_query —
 * passes through it), and until now it stored nothing for the learning
 * pipeline. Against a fake adapter that answers the module's own statement
 * by identity (TASK_MEMORY_SQL) and a mocked output-store:
 *
 *   - a completed task with ≥ 200 chars of output stores one row:
 *     workflowId mission:<missionId>, stepType 'mission_task', the task's
 *     module id (or 'mission'), the mission title and creator;
 *   - a short output, a control marker (parallel_group / conditional) and
 *     a task that no longer exists store nothing;
 *   - a failing store never fails the task write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { StoreOutputParams } from '../../server/services/output-store.js';

const storeOutputMock = vi.fn(async (_params: StoreOutputParams) => 'out_m');
vi.mock('../../server/services/output-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/output-store.js')>();
  return {
    ...actual,
    createOutputStore: async () => ({ storeOutput: (p: StoreOutputParams) => storeOutputMock(p) }),
  };
});

import { createMissionState, TASK_MEMORY_SQL } from '../../server/services/missions/mission-state.js';
import { MIN_LEARNABLE_CHARS } from '../../server/services/output-store.js';

const LONG_OUTPUT = 'Research summary: three EU AML supervisors published guidance on beneficial-ownership verification in Q3; the 25%-or-more threshold applies from July 2027, and two of the three expect obliged entities to re-verify existing customers within 18 months of the application date.';

interface TaskRow {
  title: string; module_id: string | null; area_id: string | null; mission_id: string;
  sort_order: number | string | null; mission_title: string; created_by: string;
}

interface Fake { db: DatabaseAdapter; runs: Array<{ sql: string; args: unknown[] }> }

function makeDb(taskRow: TaskRow | undefined): Fake {
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    get: async (sql: string, ...args: unknown[]) => {
      if (sql === TASK_MEMORY_SQL) {
        expect(args).toEqual(['task-1']);
        return taskRow;
      }
      return undefined;
    },
    all: async () => [],
    run: async (sql: string, ...args: unknown[]) => {
      runs.push({ sql, args });
      return { changes: 1, lastInsertRowid: 0 };
    },
    exec: async () => undefined,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db as unknown as DatabaseAdapter),
    close: async () => undefined,
  };
  return { db: db as unknown as DatabaseAdapter, runs };
}

const TASK: TaskRow = {
  title: 'Survey supervisory guidance', module_id: 'regulatory-research', area_id: 'fcp', mission_id: 'm-1',
  sort_order: 3, mission_title: 'AMLR readiness', created_by: 'u-9',
};

function output(overrides: Partial<Parameters<ReturnType<typeof createMissionState>['recordTaskOutput']>[1]> = {}) {
  return {
    full: LONG_OUTPUT, summary: 'Three supervisors published guidance.',
    provider: 'anthropic', model: 'sdk:claude-opus-5', tier: 'execution',
    tokens: 1200, durationSeconds: 8,
    ...overrides,
  };
}

beforeEach(() => {
  storeOutputMock.mockClear();
  storeOutputMock.mockResolvedValue('out_m');
});

describe('recordTaskOutput feeds memory', () => {
  it('stores the completed task output keyed on the mission', async () => {
    const { db, runs } = makeDb(TASK);
    await createMissionState(db).recordTaskOutput('task-1', output());

    // The task write comes first and still marks it completed.
    expect(runs[0].sql).toContain("status = 'completed'");
    expect(runs[0].args[0]).toBe(LONG_OUTPUT);
    expect(runs[0].args[runs[0].args.length - 1]).toBe('task-1');

    expect(storeOutputMock).toHaveBeenCalledTimes(1);
    expect(storeOutputMock.mock.calls[0][0]).toEqual({
      executionId: 'm-1',
      workflowId: 'mission:m-1',
      stepIndex: 3,
      stepType: 'mission_task',
      areaId: 'fcp',
      moduleId: 'regulatory-research',
      outputData: { text: LONG_OUTPUT },
      workflowName: 'Mission: AMLR readiness',
      stepName: 'Survey supervisory guidance',
      userId: 'u-9',
    });
  });

  it("falls back to moduleId 'mission' and no area when the task has neither", async () => {
    const { db } = makeDb({ ...TASK, module_id: null, area_id: null, sort_order: '0' });
    await createMissionState(db).recordTaskOutput('task-1', output());
    expect(storeOutputMock.mock.calls[0][0]).toMatchObject({ moduleId: 'mission', stepIndex: 0 });
    expect(storeOutputMock.mock.calls[0][0].areaId).toBeUndefined();
  });

  it('stores nothing for an output too short to learn from', async () => {
    const { db, runs } = makeDb(TASK);
    await createMissionState(db).recordTaskOutput('task-1', output({ full: 'x'.repeat(MIN_LEARNABLE_CHARS - 1) }));
    expect(runs).toHaveLength(1);
    expect(storeOutputMock).not.toHaveBeenCalled();
  });

  it('stores nothing for a control marker (parallel_group / conditional)', async () => {
    const { db } = makeDb(TASK);
    await createMissionState(db).recordTaskOutput('task-1', output({ provider: 'control', model: 'control', tier: 'utility', full: JSON.stringify({ predicate: 'p'.repeat(300), outcome: true }) }));
    expect(storeOutputMock).not.toHaveBeenCalled();
  });

  it('stores nothing when the task row is gone, and does not throw', async () => {
    const { db } = makeDb(undefined);
    await expect(createMissionState(db).recordTaskOutput('task-1', output())).resolves.toBeUndefined();
    expect(storeOutputMock).not.toHaveBeenCalled();
  });

  it('a failing store never fails the task write', async () => {
    storeOutputMock.mockRejectedValueOnce(new Error('ledger unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { db, runs } = makeDb(TASK);
      await expect(createMissionState(db).recordTaskOutput('task-1', output())).resolves.toBeUndefined();
      expect(runs[0].sql).toContain("status = 'completed'");
      expect(storeOutputMock).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('memory feed failed'), 'task-1', 'ledger unavailable');
    } finally {
      warn.mockRestore();
    }
  });
});
