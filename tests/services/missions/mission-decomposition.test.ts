/**
 * mission-decomposition.test.ts — Wave-2 2A.5 action-task schema.
 *
 * Locks normalizeGraph's task-type policy: passive types pass through,
 * unknown types coerce to 'llm', and action tasks (api_call / browser /
 * database_query) are accepted only when the instance has installed
 * capability — with their required module_config shapes validated loudly.
 * Plus the cycle detector used by the task insert/edit endpoints.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeGraph,
  validateActionTaskConfig,
  hasDependencyCycle,
  actionTasksAllowed,
} from '../../../server/services/missions/mission-decomposition.js';
import type { TaskGraphTemplate, TaskGraphNode, TaskType } from '../../../server/services/missions/types.js';

function node(partial: Partial<TaskGraphNode> & { local_id: string }): TaskGraphNode {
  return { title: partial.local_id, task_type: 'llm' as TaskType, ...partial };
}

describe('normalizeGraph — passive types', () => {
  it('passes through known passive types and fills defaults', () => {
    const graph: TaskGraphTemplate = {
      tasks: [
        node({ local_id: 't1', task_type: 'research' }),
        node({ local_id: 't2', task_type: 'checkpoint', depends_on: ['t1'] }),
      ],
    };
    const out = normalizeGraph(graph);
    expect(out.tasks).toHaveLength(2);
    expect(out.tasks[0].task_type).toBe('research');
    expect(out.tasks[1].task_type).toBe('checkpoint');
    expect(out.tasks[1].depends_on).toEqual(['t1']);
    expect(out.tasks[0].estimated_tokens).toBe(5000);
  });

  it("coerces unknown task types to 'llm' instead of persisting garbage", () => {
    const graph = { tasks: [node({ local_id: 't1', task_type: 'teleport' as TaskType })] };
    const out = normalizeGraph(graph);
    expect(out.tasks[0].task_type).toBe('llm');
  });

  it('strips dependencies referencing unknown ids and self-references', () => {
    const graph = { tasks: [node({ local_id: 't1', depends_on: ['t1', 'ghost'] })] };
    const out = normalizeGraph(graph);
    expect(out.tasks[0].depends_on).toEqual([]);
  });
});

describe('normalizeGraph — action tasks (api_call / browser / database_query)', () => {
  const apiCallTask = node({
    local_id: 'a1',
    task_type: 'api_call',
    module_config: { url: 'https://api.example.com/v1/items', method: 'GET' },
  });
  const browserTask = node({
    local_id: 'b1',
    task_type: 'browser',
    module_config: { service_id: 'gmail', workflow_id: 'send_message', params: { to: 'x@y.z' } },
  });

  it('rejects action tasks when no packs/credentials are installed', () => {
    expect(() => normalizeGraph({ tasks: [apiCallTask] }))
      .toThrow(/action task.*no Service Packs or credentials/i);
    expect(() => normalizeGraph({ tasks: [browserTask] }, { allowActionTasks: false }))
      .toThrow(/action task/i);
  });

  it('accepts well-formed action tasks when capability is installed', () => {
    const out = normalizeGraph({ tasks: [apiCallTask, browserTask] }, { allowActionTasks: true });
    expect(out.tasks[0].task_type).toBe('api_call');
    expect(out.tasks[1].task_type).toBe('browser');
  });

  it('rejects an api_call without module_config.url even when actions are allowed', () => {
    const bad = node({ local_id: 'a1', task_type: 'api_call', module_config: { method: 'POST' } });
    expect(() => normalizeGraph({ tasks: [bad] }, { allowActionTasks: true }))
      .toThrow(/requires module_config\.url/);
  });

  it('rejects a browser task missing workflow_id', () => {
    const bad = node({ local_id: 'b1', task_type: 'browser', module_config: { service_id: 'gmail' } });
    expect(() => normalizeGraph({ tasks: [bad] }, { allowActionTasks: true }))
      .toThrow(/requires module_config\.workflow_id/);
  });

  it('rejects a database_query without a query string', () => {
    const bad = node({ local_id: 'd1', task_type: 'database_query', module_config: {} });
    expect(() => normalizeGraph({ tasks: [bad] }, { allowActionTasks: true }))
      .toThrow(/requires module_config\.query/);
  });
});

describe('validateActionTaskConfig', () => {
  it('returns null for passive types regardless of config', () => {
    expect(validateActionTaskConfig('llm', undefined)).toBeNull();
    expect(validateActionTaskConfig('checkpoint', {})).toBeNull();
  });

  it('validates the per-type required fields', () => {
    expect(validateActionTaskConfig('api_call', { url: 'https://x.test' })).toBeNull();
    expect(validateActionTaskConfig('api_call', {})).toMatch(/url/);
    expect(validateActionTaskConfig('browser', { service_id: 's', workflow_id: 'w' })).toBeNull();
    expect(validateActionTaskConfig('browser', { service_id: 's' })).toMatch(/workflow_id/);
    expect(validateActionTaskConfig('database_query', { query: 'SELECT 1' })).toBeNull();
    expect(validateActionTaskConfig('database_query', { query: '   ' })).toMatch(/query/);
  });
});

describe('actionTasksAllowed', () => {
  it('false for undefined / empty capability context', () => {
    expect(actionTasksAllowed(undefined)).toBe(false);
    expect(actionTasksAllowed({ packs: [], credentials: [] })).toBe(false);
  });

  it('true when a pack or credential is installed', () => {
    expect(actionTasksAllowed({
      packs: [{ service_id: 'gmail', service_name: 'Gmail', interaction_type: 'api', workflows: [] }],
      credentials: [],
    })).toBe(true);
    expect(actionTasksAllowed({
      packs: [],
      credentials: [{ id: 'cred_1', name: 'Gmail OAuth', service_name: 'gmail', credential_type: 'oauth2' }],
    })).toBe(true);
  });
});

describe('hasDependencyCycle (task edit graph re-validation)', () => {
  it('accepts an acyclic graph', () => {
    expect(hasDependencyCycle([
      { task_id: 'b', depends_on_task_id: 'a' },
      { task_id: 'c', depends_on_task_id: 'b' },
      { task_id: 'c', depends_on_task_id: 'a' },
    ])).toBe(false);
  });

  it('detects a direct cycle', () => {
    expect(hasDependencyCycle([
      { task_id: 'a', depends_on_task_id: 'b' },
      { task_id: 'b', depends_on_task_id: 'a' },
    ])).toBe(true);
  });

  it('detects a transitive cycle', () => {
    expect(hasDependencyCycle([
      { task_id: 'b', depends_on_task_id: 'a' },
      { task_id: 'c', depends_on_task_id: 'b' },
      { task_id: 'a', depends_on_task_id: 'c' },
    ])).toBe(true);
  });

  it('handles an empty edge list', () => {
    expect(hasDependencyCycle([])).toBe(false);
  });
});
