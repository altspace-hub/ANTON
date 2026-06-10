/**
 * mission-executor-conditional.test.ts — Wave-3 3A.3 + 3A.4.
 *
 * computeConditionalSkips: a false conditional used to skip only its DIRECT
 * dependents — grandchildren whose only path ran through the false branch
 * still executed (because getReadyTasks treats 'skipped' deps as met).
 * These tests lock the transitive walk: diamond shapes, chains, and the
 * independent-dependency survivor rule.
 *
 * evaluateConditional + approvalReasonForTask: the deterministic gates that
 * decide whether work runs at all (3A.4 security floor).
 */
import { describe, it, expect } from 'vitest';
import {
  computeConditionalSkips,
  evaluateConditional,
  approvalReasonForTask,
} from '../../../server/services/missions/mission-executor.js';
import type { Mission, MissionTask, TaskStatus, TaskType } from '../../../server/services/missions/types.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function t(id: string, status: TaskStatus = 'queued'): { id: string; status: TaskStatus } {
  return { id, status };
}

function edge(taskId: string, dependsOn: string, type = 'blocking'): { task_id: string; depends_on_task_id: string; dependency_type: string } {
  return { task_id: taskId, depends_on_task_id: dependsOn, dependency_type: type };
}

function fullTask(partial: Partial<MissionTask> & { id: string }): MissionTask {
  return {
    mission_id: 'm_test',
    parent_task_id: null,
    title: partial.id,
    description: null,
    task_type: 'llm' as TaskType,
    status: 'completed' as TaskStatus,
    priority: 0,
    module_id: null,
    area_id: null,
    module_config: {},
    provider: null,
    model: null,
    model_tier: null,
    estimated_tokens: null,
    actual_tokens_consumed: 0,
    estimated_duration_seconds: null,
    actual_duration_seconds: null,
    output_summary: null,
    output_full: 'output',
    quality_score: null,
    confidence_score: null,
    atoms_produced: 0,
    retry_count: 0,
    max_retries: 3,
    last_error: null,
    sort_order: 0,
    created_at: '2026-06-10T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    ...partial,
  };
}

function mission(partial: Partial<Mission>): Mission {
  return {
    id: 'm_test',
    title: 'Test',
    objective: 'obj',
    context: null,
    success_criteria: 'done',
    autonomy_level: 'briefing',
    status: 'active',
    priority: 'normal',
    token_budget_max: 100_000,
    token_budget_consumed: 0,
    time_budget_max_seconds: 0,
    time_active_max_seconds: 0,
    time_active_consumed_seconds: 0,
    financial_budget_max: 0,
    financial_budget_consumed: 0,
    data_scope: {},
    notification_preferences: {},
    model_strategy: {
      planning_model: 'auto', execution_model: 'auto', utility_model: 'auto',
      provider_preference: 'any', fallback_enabled: true, cost_optimise: false,
    },
    template_id: null,
    created_by: 'u1',
    created_at: '2026-06-10T00:00:00.000Z',
    updated_at: '2026-06-10T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    deadline: null,
    mission_summary: null,
    mission_summary_updated_at: null,
    ...partial,
  };
}

// ── computeConditionalSkips ─────────────────────────────────────────────────

describe('computeConditionalSkips (transitive skip)', () => {
  it('chain: every grandchild whose only path runs through the false branch is skipped', () => {
    // cond → b → d → e
    const tasks = [t('cond', 'completed'), t('b'), t('d'), t('e')];
    const deps = [edge('b', 'cond'), edge('d', 'b'), edge('e', 'd')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b', 'd', 'e']);
  });

  it('diamond: a join whose every parent is on the false branch is skipped', () => {
    // cond → b1, b2; b1 + b2 → d
    const tasks = [t('cond', 'completed'), t('b1'), t('b2'), t('d')];
    const deps = [edge('b1', 'cond'), edge('b2', 'cond'), edge('d', 'b1'), edge('d', 'b2')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b1', 'b2', 'd']);
  });

  it('independent-dep survivor: a join with one path outside the false branch survives', () => {
    // cond → b → d; e → d (e is an independent, still-satisfiable task)
    const tasks = [t('cond', 'completed'), t('b'), t('e'), t('d'), t('f')];
    const deps = [edge('b', 'cond'), edge('d', 'b'), edge('d', 'e'), edge('f', 'd')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b']);
  });

  it('survivor via completed dependency: a completed dep is an independent satisfied path', () => {
    const tasks = [t('cond', 'completed'), t('b'), t('done', 'completed'), t('d')];
    const deps = [edge('b', 'cond'), edge('d', 'b'), edge('d', 'done')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b']);
  });

  it('previously-skipped deps count as doomed: mixed old/new skips propagate', () => {
    // earlier conditional already skipped 'old'; cond → b; b + old → d
    const tasks = [t('cond', 'completed'), t('b'), t('old', 'skipped'), t('d')];
    const deps = [edge('b', 'cond'), edge('d', 'b'), edge('d', 'old')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b', 'd']);
  });

  it('direct dependents are skipped even when they have an independent dependency (false branch must not run)', () => {
    const tasks = [t('cond', 'completed'), t('b'), t('e', 'completed')];
    const deps = [edge('b', 'cond'), edge('b', 'e')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b']);
  });

  it('only queued/blocked tasks are candidates — completed/active/failed are never retro-skipped', () => {
    const tasks = [t('cond', 'completed'), t('b', 'completed'), t('c', 'active'), t('d', 'failed'), t('e', 'blocked')];
    const deps = [edge('b', 'cond'), edge('c', 'cond'), edge('d', 'cond'), edge('e', 'cond')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['e']);
  });

  it('informational edges do not gate readiness and do not propagate skips', () => {
    const tasks = [t('cond', 'completed'), t('b'), t('d')];
    const deps = [edge('b', 'cond'), edge('d', 'b', 'informational')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b']);
  });

  it('a failed dep on the join is not doomed — the task stays blocked rather than skipped', () => {
    const tasks = [t('cond', 'completed'), t('b'), t('bad', 'failed'), t('d')];
    const deps = [edge('b', 'cond'), edge('d', 'b'), edge('d', 'bad')];
    expect(computeConditionalSkips('cond', tasks, deps)).toEqual(['b']);
  });

  it('no dependents → nothing to skip', () => {
    expect(computeConditionalSkips('cond', [t('cond', 'completed'), t('x')], [])).toEqual([]);
  });
});

// ── evaluateConditional ─────────────────────────────────────────────────────

describe('evaluateConditional', () => {
  function reader(tasks: MissionTask[]): { getTask(id: string): Promise<MissionTask | null> } {
    return { getTask: async (id) => tasks.find(x => x.id === id) ?? null };
  }

  it('no predicate is vacuously true (the branch runs)', async () => {
    const v = await evaluateConditional(undefined, 'm_test', reader([]));
    expect(v.outcome).toBe(true);
  });

  it('always_true / always_false', async () => {
    expect((await evaluateConditional({ kind: 'always_true' }, 'm', reader([]))).outcome).toBe(true);
    expect((await evaluateConditional({ kind: 'always_false' }, 'm', reader([]))).outcome).toBe(false);
  });

  it('task_output_contains: case-insensitive by default, case-sensitive opt-in, expect inversion', async () => {
    const tasks = [fullTask({ id: 't1', output_full: 'Risk level: HIGH' })];
    expect((await evaluateConditional(
      { kind: 'task_output_contains', task_id: 't1', substring: 'high' }, 'm', reader(tasks),
    )).outcome).toBe(true);
    expect((await evaluateConditional(
      { kind: 'task_output_contains', task_id: 't1', substring: 'high', case_sensitive: true }, 'm', reader(tasks),
    )).outcome).toBe(false);
    expect((await evaluateConditional(
      { kind: 'task_output_contains', task_id: 't1', substring: 'high', expect: false }, 'm', reader(tasks),
    )).outcome).toBe(false);
  });

  it('task_output_contains: a missing referenced task is FALSE (fail closed), never an error', async () => {
    const v = await evaluateConditional(
      { kind: 'task_output_contains', task_id: 'nope', substring: 'x' }, 'm', reader([]),
    );
    expect(v.outcome).toBe(false);
    expect(v.reason).toContain('not found');
  });

  it('task_output_nonempty: whitespace-only output is empty; expect=false inverts', async () => {
    const empty = [fullTask({ id: 't1', output_full: '   \n ', output_summary: null })];
    expect((await evaluateConditional(
      { kind: 'task_output_nonempty', task_id: 't1' }, 'm', reader(empty),
    )).outcome).toBe(false);
    expect((await evaluateConditional(
      { kind: 'task_output_nonempty', task_id: 't1', expect: false }, 'm', reader(empty),
    )).outcome).toBe(true);
  });
});

// ── approvalReasonForTask (autonomy gate — 3A.4) ────────────────────────────

describe('approvalReasonForTask (autonomy gate)', () => {
  const apiTask = (cfg: Record<string, unknown>) => fullTask({ id: 'a1', task_type: 'api_call', status: 'queued', module_config: cfg });

  it('full_autonomy never gates action tasks', () => {
    expect(approvalReasonForTask(mission({ autonomy_level: 'full_autonomy' }), apiTask({ method: 'POST', url: 'https://x' }))).toBeNull();
  });

  it('non-action task types are never gated', () => {
    const llm = fullTask({ id: 'l1', task_type: 'llm', status: 'queued' });
    expect(approvalReasonForTask(mission({ autonomy_level: 'check_in' }), llm)).toBeNull();
  });

  it('check_in gates EVERY action task, even a GET', () => {
    expect(approvalReasonForTask(mission({ autonomy_level: 'check_in' }), apiTask({ method: 'GET', url: 'https://x' }))).toMatch(/check_in/);
  });

  it('briefing gates state-changing api_calls but lets GET/HEAD reads run', () => {
    const m = mission({ autonomy_level: 'briefing' });
    expect(approvalReasonForTask(m, apiTask({ method: 'POST', url: 'https://x' }))).toMatch(/state-changing/);
    expect(approvalReasonForTask(m, apiTask({ method: 'delete', url: 'https://x' }))).toMatch(/state-changing/);
    expect(approvalReasonForTask(m, apiTask({ method: 'GET', url: 'https://x' }))).toBeNull();
    expect(approvalReasonForTask(m, apiTask({ url: 'https://x' }))).toBeNull(); // default GET
  });

  it('briefing gates external database queries and credentialed browser workflows', () => {
    const m = mission({ autonomy_level: 'briefing' });
    const dbTask = fullTask({ id: 'd1', task_type: 'database_query', status: 'queued', module_config: { target: 'external', query: 'SELECT 1' } });
    const dbLocal = fullTask({ id: 'd2', task_type: 'database_query', status: 'queued', module_config: { query: 'SELECT 1' } });
    const browserAuthed = fullTask({ id: 'b1', task_type: 'browser', status: 'queued', module_config: { service_id: 's', workflow_id: 'w', auth_credential_id: 'cred_1' } });
    const browserAnon = fullTask({ id: 'b2', task_type: 'browser', status: 'queued', module_config: { service_id: 's', workflow_id: 'w' } });
    expect(approvalReasonForTask(m, dbTask)).toMatch(/external/);
    expect(approvalReasonForTask(m, dbLocal)).toBeNull();
    expect(approvalReasonForTask(m, browserAuthed)).toMatch(/authenticated/);
    expect(approvalReasonForTask(m, browserAnon)).toBeNull();
  });

  it('a granted approval flag suppresses the gate (re-queue after human approval)', () => {
    const m = mission({ autonomy_level: 'check_in' });
    expect(approvalReasonForTask(m, apiTask({ method: 'POST', url: 'https://x', approval_granted: true }))).toBeNull();
    // Only the literal true unlocks — truthy strings do not.
    expect(approvalReasonForTask(m, apiTask({ method: 'POST', url: 'https://x', approval_granted: 'yes' }))).not.toBeNull();
  });
});
