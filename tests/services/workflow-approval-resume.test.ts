/**
 * workflow-approval-resume.test.ts — Wave 4.1 (B7 fix, engine 3):
 * a scheduled run that hits an approval gate parks with a REAL
 * awaiting_approval representation (status + awaiting_step + context columns,
 * migration 230 — no longer JSON stuffed into error_message), and
 * POST /api/workflows/runs/:id/approve resumes the executor loop at the step
 * after the gate with the stored context. Reject is terminal.
 *
 * Uses a fake DatabaseAdapter; the heavy route module (only needed for
 * resolveTemplate) and connection-manager are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

// workflow-executor imports resolveTemplate from the (heavy) routes module —
// mock it with an equivalent implementation so the test stays light.
vi.mock('../../server/routes/workflows.js', () => ({
  resolveTemplate: (template: string, context: Record<string, unknown>): string =>
    template.replace(/\{\{([^}]+)\}\}/g, (_match: string, path: string) => {
      const value = path.trim().split('.').reduce<unknown>((obj, key) => {
        if (obj === null || obj === undefined) return undefined;
        if (typeof obj === 'object') return (obj as Record<string, unknown>)[key];
        return undefined;
      }, context);
      return value !== undefined && value !== null ? String(value) : _match;
    }),
}));
vi.mock('../../server/services/connection-manager.js', () => ({
  createConnectionManager: vi.fn(async () => {
    throw new Error('connection-manager not used in this test');
  }),
}));

import {
  executeScheduledWorkflow, resumeApprovedRun, rejectRun,
} from '../../server/services/workflow-executor.js';

// Workflow: transform → approval gate → decision gate (reads context written
// BEFORE the gate — proves the stored context is restored on resume) →
// transform. If the context were lost, the decision gate would skip to the
// final step (different completed/skipped counters).
const WORKFLOW_DEFINITION = {
  id: 'wf-approval-test',
  label: 'Approval Test Workflow',
  shortLabel: 'Approval',
  icon: 'ClipboardList',
  description: '',
  category: 'custom',
  estimatedTime: '',
  tags: [],
  steps: [
    {
      id: 'step-greet', label: 'Write greeting', description: '', type: 'transform',
      config: {
        fieldMappings: [{ sourcePath: 'hello', destinationField: 'message' }],
        outputVariable: 'greeting',
      },
    },
    { id: 'step-gate', label: 'Manager approval', description: '', type: 'approval', config: {} },
    {
      id: 'step-check', label: 'Verify context', description: '', type: 'decision_gate',
      config: {
        decisionCondition: { leftOperand: '{{greeting.message}}', operator: '==', rightOperand: 'hello' },
        onFalseSkipToStepId: 'step-final',
      },
    },
    {
      id: 'step-extra', label: 'Only runs when context survived', description: '', type: 'transform',
      config: { fieldMappings: [{ sourcePath: 'extra', destinationField: 'value' }], outputVariable: 'extra' },
    },
    {
      id: 'step-final', label: 'Final step', description: '', type: 'transform',
      config: { fieldMappings: [{ sourcePath: 'done', destinationField: 'value' }], outputVariable: 'final' },
    },
  ],
};

// ── Fake adapter: in-memory workflow_runs + workflow_schedules ──────────

type RunRow = Record<string, unknown>;

function makeFakeDb(runs: Map<string, RunRow>): DatabaseAdapter {
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM workflow_schedules')) {
        // schedule 1 carries the definition (stored at creation time)
        if (params[0] === 1) {
          return { workflow_definition: JSON.stringify(WORKFLOW_DEFINITION) } as T;
        }
        return undefined;
      }
      if (sql.includes('FROM workflow_definitions')) return undefined;
      if (sql.includes('FROM workflow_runs')) {
        return runs.get(String(params[0])) as T | undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO workflow_runs')) {
        // recordRun: (id, workflow_id, trigger_source, status, error_message)
        const [id, workflow_id, trigger_source, status, error_message] = params;
        runs.set(String(id), {
          id, workflow_id, trigger_source, status,
          error_message: error_message ?? null,
          awaiting_step: null, awaiting_step_label: null, context: null,
          steps_completed: null, steps_skipped: null,
          approval_decision: null, approval_decided_at: null, completed_at: null,
        });
      } else if (sql.includes("status = 'awaiting_approval'") && sql.includes('awaiting_step')) {
        // parkRunForApproval
        const [awaiting_step, awaiting_step_label, context, steps_completed, steps_skipped, error_message, id] = params;
        const row = runs.get(String(id));
        if (row) Object.assign(row, {
          status: 'awaiting_approval', awaiting_step, awaiting_step_label,
          context, steps_completed, steps_skipped, error_message,
        });
      } else if (sql.includes("approval_decision = 'approved'")) {
        const id = params[params.length - 1];
        const row = runs.get(String(id));
        if (row) Object.assign(row, {
          status: 'running', approval_decision: 'approved',
          approval_decided_at: new Date().toISOString(), error_message: null,
        });
      } else if (sql.includes("approval_decision = 'rejected'")) {
        const [error_message, id] = params;
        const row = runs.get(String(id));
        if (row) Object.assign(row, {
          status: 'rejected', approval_decision: 'rejected',
          approval_decided_at: new Date().toISOString(),
          completed_at: new Date().toISOString(), error_message,
        });
      } else if (sql.includes('UPDATE workflow_runs SET status = ?')) {
        // updateRun: (status, error_message, id)
        const [status, error_message, id] = params;
        const row = runs.get(String(id));
        if (row) Object.assign(row, { status, error_message: error_message ?? null });
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return db;
}

describe('workflow approval gate park + resume (Wave 4.1, engine 3)', () => {
  let runs: Map<string, RunRow>;
  let db: DatabaseAdapter;

  beforeEach(() => {
    runs = new Map();
    db = makeFakeDb(runs);
  });

  it('parks at the approval gate with real columns (status, awaiting_step, context)', async () => {
    const result = await executeScheduledWorkflow(db, 'wf-approval-test', 1);

    expect(result.success).toBe(true);
    expect(result.awaitingApproval).toBe(true);
    expect(result.stepsCompleted).toBe(1); // the transform before the gate

    const row = runs.get(result.runId);
    expect(row?.status).toBe('awaiting_approval');
    expect(row?.awaiting_step).toBe(1);
    expect(row?.awaiting_step_label).toBe('Manager approval');
    // Context stored as real JSON in its own column — NOT inside error_message
    const context = JSON.parse(String(row?.context)) as Record<string, unknown>;
    expect(context.greeting).toEqual({ message: 'hello' });
    expect(String(row?.error_message)).toContain('awaiting approval');
    expect(() => JSON.parse(String(row?.error_message))).toThrow(); // human note, not a JSON stash
  });

  it('approve resumes from the step AFTER the gate with the stored context', async () => {
    const parked = await executeScheduledWorkflow(db, 'wf-approval-test', 1);
    const resumed = await resumeApprovedRun(db, parked.runId);

    expect(resumed.success).toBe(true);
    expect(resumed.awaitingApproval).toBeUndefined();
    // Context restored → decision gate is TRUE → step-extra AND step-final
    // both run: 1 (pre-park) + 3 (gate, extra, final) completed, 0 skipped.
    // A lost context would skip step-extra (3 completed, 1 skipped).
    expect(resumed.stepsCompleted).toBe(4);
    expect(resumed.stepsSkipped).toBe(0);

    const row = runs.get(parked.runId);
    expect(row?.status).toBe('completed');
    expect(row?.approval_decision).toBe('approved');
  });

  it('reject is terminal: status=rejected and the run cannot be resumed', async () => {
    const parked = await executeScheduledWorkflow(db, 'wf-approval-test', 1);
    await rejectRun(db, parked.runId, 'Numbers look wrong');

    const row = runs.get(parked.runId);
    expect(row?.status).toBe('rejected');
    expect(row?.approval_decision).toBe('rejected');
    expect(String(row?.error_message)).toContain('Numbers look wrong');

    await expect(resumeApprovedRun(db, parked.runId)).rejects.toThrow(/not awaiting approval/);
  });

  it('approve on an unknown or non-parked run throws clearly (route → 404 / 409)', async () => {
    await expect(resumeApprovedRun(db, 'no-such-run')).rejects.toThrow(/not found/i);

    const parked = await executeScheduledWorkflow(db, 'wf-approval-test', 1);
    await resumeApprovedRun(db, parked.runId); // completes the run
    await expect(resumeApprovedRun(db, parked.runId)).rejects.toThrow(/not awaiting approval/);
    await expect(rejectRun(db, parked.runId)).rejects.toThrow(/not awaiting approval/);
  });
});
