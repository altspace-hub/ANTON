/**
 * workflow-execution-store.test.ts — Wave 4.1 (B7 fix):
 * interactive workflow executions are serialized to PostgreSQL on every
 * state change and rehydrated after a restart (the in-memory Map used to be
 * the only home of a paused run).
 *
 * Tests the pure serialize/deserialize round-trip plus persist/load and the
 * combined pending-approvals view against a fake DatabaseAdapter.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  executionToRow, rowToExecution, persistExecution, loadExecution,
  recordClientRun, listPendingApprovals,
  decideExecutionAccess, decideRunAccess,
  type WorkflowExecution, type WorkflowExecutionRow,
} from '../../server/services/workflow-execution-store.js';
import type { WorkflowDefinition } from '../../src/lib/workflow-definitions.js';

const definition: WorkflowDefinition = {
  id: 'wf-1',
  label: 'AML Review Workflow',
  shortLabel: 'AML',
  icon: 'ClipboardList',
  description: 'test',
  category: 'assessment',
  estimatedTime: '5 min',
  tags: [],
  steps: [
    { id: 's1', label: 'Collect input', description: '', type: 'input', config: {} },
    { id: 's2', label: 'Checkpoint review', description: '', type: 'checkpoint', config: { checkpointMessage: 'Review before continuing' } },
    { id: 's3', label: 'Export', description: '', type: 'export', config: { exportFormat: 'docx' } },
  ],
};

function makeExecution(overrides: Partial<WorkflowExecution> = {}): WorkflowExecution {
  return {
    id: 'exec-123',
    workflowId: 'wf-1',
    workflowDefinition: definition,
    mode: 'guided',
    status: 'paused',
    currentStepIndex: 1,
    context: { input: { client: 'Acme' }, step_1: { status: 'input_collected' } },
    stepResults: [
      {
        stepId: 's1', stepIndex: 0, status: 'completed',
        startedAt: '2026-06-11T09:00:00.000Z', completedAt: '2026-06-11T09:00:01.000Z',
        output: { status: 'input_collected' },
      },
      {
        stepId: 's2', stepIndex: 1, status: 'running',
        startedAt: '2026-06-11T09:00:02.000Z',
      },
    ],
    startedAt: '2026-06-11T09:00:00.000Z',
    ...overrides,
  };
}

// ── Fake adapter: an in-memory workflow_executions/workflow_runs table ──

interface FakeStore {
  executions: Map<string, WorkflowExecutionRow>;
  runs: Array<Record<string, unknown>>;
}

/** Mirror of the store's per-non-admin ownership filter for execution rows. */
function ownsExec(r: WorkflowExecutionRow, uid: string | null): boolean {
  return uid !== null && (r.user_id === uid || r.created_by === uid);
}

function makeFakeDb(store: FakeStore): DatabaseAdapter {
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM workflow_executions')) {
        return store.executions.get(String(params[0])) as T | undefined;
      }
      if (sql.includes('FROM workflow_runs')) {
        return store.runs.find((r) => r.id === String(params[0])) as T | undefined;
      }
      return undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      if (sql.includes('FROM workflow_executions') && sql.includes("status = 'paused'")) {
        let rows = Array.from(store.executions.values())
          .filter((r) => r.status === 'paused' && r.workflow_definition !== null);
        if (sql.includes('user_id = ?')) {
          const uid = (params[0] ?? null) as string | null;
          rows = rows.filter((r) => ownsExec(r, uid));
        }
        return rows as T[];
      }
      if (sql.includes('FROM workflow_runs') && sql.includes("status = 'awaiting_approval'")) {
        let rows = store.runs.filter((r) => r.status === 'awaiting_approval');
        if (sql.includes('user_id = ?')) {
          const uid = (params[0] ?? null) as string | null;
          rows = rows.filter((r) => r.user_id === uid);
        }
        return rows as T[];
      }
      return [];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO workflow_executions')) {
        // Column order from the store's UPSERT_SQL
        const [id, workflow_id, workflow_name, status, mode, current_step,
          step_states, context, workflow_definition, error_message, session_id,
          user_id, created_by, started_at, completed_at] = params;
        store.executions.set(String(id), {
          id: String(id),
          workflow_id: String(workflow_id),
          workflow_name: String(workflow_name),
          status: String(status),
          mode: mode as string | null,
          current_step: current_step as number | null,
          // PG returns JSONB as parsed objects — simulate that
          step_states: step_states === null ? null : JSON.parse(String(step_states)),
          context: context === null ? null : JSON.parse(String(context)),
          workflow_definition: workflow_definition === null || workflow_definition === 'null'
            ? null
            : JSON.parse(String(workflow_definition)),
          error_message: error_message as string | null,
          session_id: session_id as string | null,
          user_id: (user_id ?? null) as string | null,
          created_by: (created_by ?? null) as string | null,
          started_at: String(started_at),
          completed_at: completed_at as string | null,
        });
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return db;
}

describe('workflow-execution-store (Wave 4.1)', () => {
  it('executionToRow → rowToExecution round-trips the full execution state', () => {
    const execution = makeExecution({ error: 'boom', sessionId: 'sess-9' });
    const row = executionToRow(execution);
    const back = rowToExecution(row);

    expect(back).toBeDefined();
    expect(back).toEqual(execution);
  });

  it('round-trips when PG returns JSONB columns as parsed objects (not strings)', () => {
    const execution = makeExecution();
    const row = executionToRow(execution);
    const pgStyleRow: WorkflowExecutionRow = {
      ...row,
      step_states: JSON.parse(String(row.step_states)),
      context: JSON.parse(String(row.context)),
      workflow_definition: JSON.parse(String(row.workflow_definition)),
      started_at: new Date(execution.startedAt), // PG returns timestamptz as Date
    };
    const back = rowToExecution(pgStyleRow);
    expect(back).toEqual(execution);
  });

  it('rowToExecution refuses rows without a stored definition (cannot re-enter the engine)', () => {
    const row = executionToRow(makeExecution());
    expect(rowToExecution({ ...row, workflow_definition: null })).toBeUndefined();
  });

  it('persistExecution + loadExecution survive a "restart" (Map wiped, DB intact)', async () => {
    const store: FakeStore = { executions: new Map(), runs: [] };
    const db = makeFakeDb(store);
    const execution = makeExecution();

    await persistExecution(db, execution);
    // "Restart": nothing in memory — load straight from the fake DB
    const rehydrated = await loadExecution(db, execution.id);

    expect(rehydrated).toEqual(execution);
    expect(rehydrated?.status).toBe('paused');
    expect(rehydrated?.currentStepIndex).toBe(1);
    expect(rehydrated?.workflowDefinition.steps).toHaveLength(3);
  });

  it('persistExecution upserts — a later state change overwrites the stored row', async () => {
    const store: FakeStore = { executions: new Map(), runs: [] };
    const db = makeFakeDb(store);
    const execution = makeExecution();

    await persistExecution(db, execution);
    execution.status = 'completed';
    execution.currentStepIndex = 3;
    execution.completedAt = '2026-06-11T09:05:00.000Z';
    await persistExecution(db, execution);

    const rehydrated = await loadExecution(db, execution.id);
    expect(rehydrated?.status).toBe('completed');
    expect(rehydrated?.completedAt).toBe('2026-06-11T09:05:00.000Z');
  });

  it('listPendingApprovals merges paused executions and awaiting_approval runs', async () => {
    const store: FakeStore = { executions: new Map(), runs: [] };
    const db = makeFakeDb(store);

    await persistExecution(db, makeExecution()); // paused at checkpoint step index 1
    await persistExecution(db, makeExecution({ id: 'exec-done', status: 'completed' }));
    store.runs.push({
      id: 'run-77', workflow_id: 'wf-sched', status: 'awaiting_approval',
      awaiting_step: 2, awaiting_step_label: 'Approve report', started_at: '2026-06-11T08:00:00.000Z',
    });
    store.runs.push({ id: 'run-ok', workflow_id: 'wf-sched', status: 'completed' });

    // Admin/solo sees every parked item (the route passes isAdmin for solo mode).
    const items = await listPendingApprovals(db, { isAdmin: true });
    expect(items).toHaveLength(2);

    const exec = items.find((i) => i.kind === 'execution');
    expect(exec?.id).toBe('exec-123');
    expect(exec?.workflowLabel).toBe('AML Review Workflow');
    expect(exec?.stepLabel).toBe('Checkpoint review'); // resolved from the stored definition

    const run = items.find((i) => i.kind === 'run');
    expect(run?.id).toBe('run-77');
    expect(run?.stepLabel).toBe('Approve report');
    expect(run?.mode).toBe('scheduled');
  });

  it('listPendingApprovals scopes a non-admin to executions they own + own runs', async () => {
    const store: FakeStore = { executions: new Map(), runs: [] };
    const db = makeFakeDb(store);

    // alice owns exec-123; bob owns exec-bob; a scheduled run is system-owned.
    await persistExecution(db, makeExecution({ userId: 'alice', createdBy: 'alice' }));
    await persistExecution(db, makeExecution({ id: 'exec-bob', userId: 'bob', createdBy: 'bob' }));
    store.runs.push({
      id: 'run-sys', workflow_id: 'wf-sched', status: 'awaiting_approval',
      awaiting_step: 1, awaiting_step_label: 'Approve', started_at: '2026-06-11T08:00:00.000Z',
      user_id: 'scheduler',
    });

    // Admin sees everything (2 execs + 1 run).
    const adminItems = await listPendingApprovals(db, { isAdmin: true });
    expect(adminItems).toHaveLength(3);

    // alice (non-admin) sees only her execution, not bob's, not the system run.
    const aliceItems = await listPendingApprovals(db, { userId: 'alice', isAdmin: false });
    expect(aliceItems.map((i) => i.id)).toEqual(['exec-123']);

    // bob sees only his.
    const bobItems = await listPendingApprovals(db, { userId: 'bob', isAdmin: false });
    expect(bobItems.map((i) => i.id)).toEqual(['exec-bob']);
  });

  it('decideExecutionAccess: owner allowed, non-owner forbidden, admin always, unknown not_found', async () => {
    const store: FakeStore = { executions: new Map(), runs: [] };
    const db = makeFakeDb(store);
    await persistExecution(db, makeExecution({ userId: 'alice', createdBy: 'alice' }));

    expect(await decideExecutionAccess(db, 'exec-123', { userId: 'alice', isAdmin: false })).toBe('allow');
    expect(await decideExecutionAccess(db, 'exec-123', { userId: 'bob', isAdmin: false })).toBe('forbidden');
    expect(await decideExecutionAccess(db, 'exec-123', { userId: 'bob', isAdmin: true })).toBe('allow');
    expect(await decideExecutionAccess(db, 'nope', { userId: 'alice', isAdmin: false })).toBe('not_found');

    // Legacy NULL-owner row → forbidden for non-admin, allowed for admin.
    await persistExecution(db, makeExecution({ id: 'exec-legacy' }));
    expect(await decideExecutionAccess(db, 'exec-legacy', { userId: 'alice', isAdmin: false })).toBe('forbidden');
    expect(await decideExecutionAccess(db, 'exec-legacy', { isAdmin: true })).toBe('allow');
  });

  it('decideRunAccess: admin always, owner allowed, others forbidden, unknown not_found', async () => {
    const store: FakeStore = { executions: new Map(), runs: [] };
    const db = makeFakeDb(store);
    store.runs.push({ id: 'run-1', status: 'awaiting_approval', user_id: 'scheduler' });
    store.runs.push({ id: 'run-2', status: 'awaiting_approval', user_id: 'alice' });

    expect(await decideRunAccess(db, 'run-1', { isAdmin: true })).toBe('allow');
    expect(await decideRunAccess(db, 'run-1', { userId: 'alice', isAdmin: false })).toBe('forbidden');
    expect(await decideRunAccess(db, 'run-2', { userId: 'alice', isAdmin: false })).toBe('allow');
    expect(await decideRunAccess(db, 'missing', { isAdmin: true })).toBe('not_found');
  });

  it('recordClientRun stores a summary row that is listed but never rehydrated', async () => {
    const store: FakeStore = { executions: new Map(), runs: [] };
    const db = makeFakeDb(store);

    await recordClientRun(db, {
      id: 'client-1', workflowId: 'wf-1', workflowLabel: 'AML Review Workflow',
      status: 'running', currentStepIndex: 1,
      stepStates: [{ stepId: 's1', status: 'done', output: 'hello' }],
      sessionId: 'sess-1',
    });

    const row = store.executions.get('client-1');
    expect(row?.mode).toBe('client');
    expect(row?.session_id).toBe('sess-1');
    expect(row?.workflow_definition).toBeNull();
    // No definition → cannot re-enter the server engine
    expect(await loadExecution(db, 'client-1')).toBeUndefined();
  });
});
