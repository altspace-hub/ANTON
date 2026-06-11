/**
 * workflow-llm-step-model.test.ts — Wave 4.5:
 * the headless executor honors a per-step `config.model` on llm steps and
 * falls back to the provider-routed utility model when none is set.
 * (The interactive surfaces — WorkflowBuilder model selector + WorkflowsPage
 * runClaudeStep — write/read the same `config.model` field.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const callChatMock = vi.fn(async (_opts: { model: string }) => ({ text: 'mock-response' }));
const getRoutedUtilityModelMock = vi.fn(async () => 'utility-routed-model');

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: (opts: { model: string }) => callChatMock(opts),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: () => getRoutedUtilityModelMock(),
}));
vi.mock('../../server/routes/workflows.js', () => ({
  resolveTemplate: (template: string, _context: Record<string, unknown>): string => template,
}));
vi.mock('../../server/services/connection-manager.js', () => ({
  createConnectionManager: vi.fn(async () => {
    throw new Error('connection-manager not used in this test');
  }),
}));

import { executeScheduledWorkflow } from '../../server/services/workflow-executor.js';

function workflowWithLlmStep(model?: string) {
  return {
    id: 'wf-llm-test',
    label: 'LLM Model Test',
    shortLabel: 'LLM',
    icon: 'ClipboardList',
    description: '',
    category: 'custom',
    estimatedTime: '',
    tags: [],
    steps: [
      {
        id: 'step-llm', label: 'Analyse', description: '', type: 'llm',
        config: {
          prompt: 'nonexistent-prompt-name',
          userMessage: 'Summarise the situation.',
          outputVariable: 'analysis',
          ...(model ? { model } : {}),
        },
      },
    ],
  };
}

function makeFakeDb(definition: unknown): DatabaseAdapter {
  const runs = new Map<string, Record<string, unknown>>();
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      if (sql.includes('FROM workflow_schedules')) {
        return { workflow_definition: JSON.stringify(definition) } as T;
      }
      if (sql.includes('FROM workflow_runs')) return runs.get(String(params[0])) as T | undefined;
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO workflow_runs')) {
        runs.set(String(params[0]), { id: params[0], status: params[3] });
      } else if (sql.includes('UPDATE workflow_runs SET status = ?')) {
        const [status, , id] = params;
        const row = runs.get(String(id));
        if (row) row.status = status;
      }
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return db;
}

describe('per-step model on llm steps (Wave 4.5)', () => {
  beforeEach(() => {
    callChatMock.mockClear();
    getRoutedUtilityModelMock.mockClear();
  });

  it('honors config.model when set on the step', async () => {
    const db = makeFakeDb(workflowWithLlmStep('mistral-small-latest'));
    const result = await executeScheduledWorkflow(db, 'wf-llm-test', 1);

    expect(result.success).toBe(true);
    expect(result.stepsCompleted).toBe(1);
    expect(callChatMock).toHaveBeenCalledTimes(1);
    expect(callChatMock.mock.calls[0][0].model).toBe('mistral-small-latest');
    expect(getRoutedUtilityModelMock).not.toHaveBeenCalled();
  });

  it('falls back to the routed utility model when no per-step model is set', async () => {
    const db = makeFakeDb(workflowWithLlmStep());
    const result = await executeScheduledWorkflow(db, 'wf-llm-test', 1);

    expect(result.success).toBe(true);
    expect(callChatMock).toHaveBeenCalledTimes(1);
    expect(callChatMock.mock.calls[0][0].model).toBe('utility-routed-model');
    expect(getRoutedUtilityModelMock).toHaveBeenCalledTimes(1);
  });
});
