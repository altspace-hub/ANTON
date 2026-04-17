// ── Missions — Controller / Lifecycle Orchestration ────────────────────────
// Sits above mission-state, mission-decomposition, and mission-executor.
// Implements: create, brief (decompose), start, pause, resume, abort,
// complete, advance (run next ready task), human-checkpoint approval,
// budget enforcement.
//
// Phase 1 is sequential: one task at a time. Phase 2 will add parallel
// task groups and the wake/sleep scheduler.

import type { DatabaseAdapter } from '../../db/database.js';
import { createMissionState, newMissionId, newTaskId, newDecisionId } from './mission-state.js';
import { decomposeMission } from './mission-decomposition.js';
import { createMissionExecutor } from './mission-executor.js';
import {
  DEFAULT_DATA_SCOPE,
  DEFAULT_MODEL_STRATEGY,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type CreateMissionInput,
  type Mission,
  type MissionTask,
  type MissionTemplate,
  type TaskGraphTemplate,
  type BudgetStatus,
} from './types.js';

function nowIso(): string { return new Date().toISOString(); }

export interface AdvanceResult {
  status: 'task_completed' | 'mission_paused' | 'mission_completed' | 'task_failed' | 'no_ready_task';
  task?: MissionTask;
  reason?: string;
}

export function createMissionController(db: DatabaseAdapter) {
  const state = createMissionState(db);
  const executor = createMissionExecutor(db);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async function createMission(input: CreateMissionInput, createdByUserId: string): Promise<Mission> {
    if (!input.title?.trim()) throw new Error('Mission title is required');
    if (!input.objective?.trim()) throw new Error('Mission objective is required');
    if (!input.success_criteria?.trim()) throw new Error('Mission success criteria is required');

    // EU AI Act §11.2 — classify risk + enforce autonomy ceiling. Spec
    // mandates that high_risk missions cannot run at full_autonomy.
    const { classifyMissionRisk, validateAutonomyForRisk, saveRiskClassification } =
      await import('./mission-checkpoint.js');
    const assessment = classifyMissionRisk(input.objective, input.context ?? null);
    const requestedAutonomy = input.autonomy_level ?? 'check_in';
    const autonomyCheck = validateAutonomyForRisk(requestedAutonomy, assessment.classification);
    if (!autonomyCheck.ok) {
      throw new Error(`EU AI Act compliance: ${autonomyCheck.reason}`);
    }

    const id = newMissionId();
    const ts = nowIso();
    const mission: Mission = {
      id,
      title: input.title.trim(),
      objective: input.objective.trim(),
      context: input.context?.trim() || null,
      success_criteria: input.success_criteria.trim(),
      autonomy_level: requestedAutonomy,
      status: 'draft',
      priority: input.priority ?? 'normal',
      token_budget_max: input.budget?.token_budget_max ?? 5_000_000,
      token_budget_consumed: 0,
      time_budget_max_seconds: input.budget?.time_budget_max_seconds ?? 604_800,
      time_active_max_seconds: input.budget?.time_active_max_seconds ?? 86_400,
      time_active_consumed_seconds: 0,
      financial_budget_max: 0,
      financial_budget_consumed: 0,
      data_scope: { ...DEFAULT_DATA_SCOPE, ...(input.data_scope ?? {}) },
      notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(input.notification_preferences ?? {}) },
      model_strategy: { ...DEFAULT_MODEL_STRATEGY, ...(input.model_strategy ?? {}) },
      template_id: input.template_id ?? null,
      created_by: createdByUserId,
      created_at: ts,
      updated_at: ts,
      started_at: null,
      completed_at: null,
      deadline: input.deadline ?? null,
      mission_summary: null,
      mission_summary_updated_at: null,
    };

    await state.insertMission(mission);
    await saveRiskClassification(db, id, assessment);
    await state.logActivity(id, {
      activityType: 'mission_created',
      description: `Mission created: ${mission.title}`,
      details: { risk_classification: assessment.classification, ai_act_category: assessment.category },
    });
    return mission;
  }

  /**
   * Decompose the mission into a task graph and persist the tasks. Moves the
   * mission to `briefed` status. The human reviews the graph; calling
   * approvePlan() then transitions to `active`.
   *
   * For autonomy levels above check_in, the controller can auto-approve and
   * start the mission immediately (Phase 1: still requires explicit approval
   * for safety — auto-approve lands in Phase 2).
   */
  async function briefMission(missionId: string): Promise<{ mission: Mission; tasks: MissionTask[] }> {
    const mission = await state.getMission(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.status !== 'draft' && mission.status !== 'briefed') {
      throw new Error(`Cannot brief a mission in status '${mission.status}'`);
    }

    const template: MissionTemplate | undefined = mission.template_id
      ? (await state.getTemplate(mission.template_id)) ?? undefined
      : undefined;

    const result = await decomposeMission(mission, template);
    await persistTaskGraph(missionId, result.graph);
    await state.bumpTokenBudget(missionId, result.tokensUsed);
    await state.recordDecision({
      id: newDecisionId(),
      mission_id: missionId,
      task_id: null,
      timestamp: nowIso(),
      decision_type: 'plan_decomposition',
      description: `Generated proposed task graph (${result.graph.tasks.length} tasks) using ${result.model}.`,
      options_considered: [{ option: 'LLM-generated graph', reasoning: result.reasoning.slice(0, 600) }],
      selected_option: 'LLM-generated graph',
      confidence: 0.75,
      reasoning: result.reasoning,
      overridden_by_human: false,
      override_reasoning: null,
      compliance_check_passed: true,
    });
    await state.updateMissionStatus(missionId, 'briefed');
    await state.logActivity(missionId, {
      activityType: 'plan_decomposed',
      description: `Decomposed into ${result.graph.tasks.length} tasks (${result.tokensUsed.toLocaleString()} tokens)`,
      tokensConsumed: result.tokensUsed,
    });
    const updated = await state.getMission(missionId);
    const tasks = await state.listTasks(missionId);
    return { mission: updated!, tasks };
  }

  /**
   * Approve the proposed plan (briefed → active) and begin execution.
   * Called explicitly even at higher autonomy levels in Phase 1.
   */
  async function approvePlanAndStart(missionId: string): Promise<Mission> {
    const mission = await state.getMission(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.status !== 'briefed') {
      throw new Error(`Cannot approve a mission in status '${mission.status}' — it must be 'briefed'`);
    }
    await state.updateMissionStatus(missionId, 'active', { startedAt: nowIso() });
    await state.logActivity(missionId, {
      activityType: 'mission_started',
      description: 'Plan approved by human; mission moved to active.',
    });
    const updated = await state.getMission(missionId);
    return updated!;
  }

  async function pauseMission(missionId: string, reason: string): Promise<void> {
    const mission = await state.getMission(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.status !== 'active') throw new Error(`Cannot pause a mission in status '${mission.status}'`);
    await state.updateMissionStatus(missionId, 'paused');
    await state.logActivity(missionId, { activityType: 'mission_paused', description: reason });
  }

  async function resumeMission(missionId: string): Promise<void> {
    const mission = await state.getMission(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.status !== 'paused' && mission.status !== 'review') {
      throw new Error(`Cannot resume a mission in status '${mission.status}'`);
    }
    await state.updateMissionStatus(missionId, 'active');
    await state.logActivity(missionId, { activityType: 'mission_resumed' });
  }

  async function abortMission(missionId: string, reason: string): Promise<void> {
    const mission = await state.getMission(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.status === 'completed' || mission.status === 'aborted') {
      throw new Error(`Mission already ${mission.status}`);
    }
    await state.updateMissionStatus(missionId, 'aborted', { completedAt: nowIso() });
    await state.logActivity(missionId, { activityType: 'mission_aborted', description: reason });
  }

  /**
   * Approve a checkpoint task (review → active or completed). If this was
   * the final task, transitions the mission to completed.
   */
  async function approveCheckpoint(missionId: string, taskId: string, feedback?: string): Promise<void> {
    const task = await state.getTask(taskId);
    if (!task || task.mission_id !== missionId) throw new Error('Task not found');
    if (task.task_type !== 'checkpoint') throw new Error('Only checkpoint tasks can be approved');
    await state.updateTaskStatus(taskId, 'completed', { completedAt: nowIso() });
    await state.logActivity(missionId, {
      activityType: 'checkpoint_approved',
      description: feedback || 'Checkpoint approved',
      taskId,
    });
    // Resume the mission if it was paused at the checkpoint
    const mission = await state.getMission(missionId);
    if (mission?.status === 'review' || mission?.status === 'paused') {
      await state.updateMissionStatus(missionId, 'active');
      await state.logActivity(missionId, { activityType: 'mission_resumed', description: 'Resumed after checkpoint approval' });
    }
  }

  async function rejectCheckpoint(missionId: string, taskId: string, feedback: string): Promise<void> {
    const task = await state.getTask(taskId);
    if (!task || task.mission_id !== missionId) throw new Error('Task not found');
    if (task.task_type !== 'checkpoint') throw new Error('Only checkpoint tasks can be rejected');
    await state.updateTaskStatus(taskId, 'failed', { lastError: feedback, completedAt: nowIso() });
    await state.logActivity(missionId, {
      activityType: 'checkpoint_rejected',
      description: feedback,
      taskId,
    });
    // Mission stays paused for human follow-up
  }

  // ── Execution ────────────────────────────────────────────────────────────

  /**
   * Identify the next task whose dependencies are all completed and which is
   * still queued. Returns null if no task is ready (mission may be done or
   * blocked).
   */
  async function getNextReadyTask(missionId: string): Promise<MissionTask | null> {
    const tasks = await state.listTasks(missionId);
    const completedIds = new Set(tasks.filter(t => t.status === 'completed').map(t => t.id));
    const deps = await state.listDependencies(missionId);
    const queuedTasks = tasks
      .filter(t => t.status === 'queued')
      .sort((a, b) => a.sort_order - b.sort_order);

    for (const t of queuedTasks) {
      const myDeps = deps.filter(d => d.task_id === t.id && d.dependency_type === 'blocking');
      const allDepsMet = myDeps.every(d => completedIds.has(d.depends_on_task_id));
      if (allDepsMet) return t;
    }
    return null;
  }

  /**
   * Advance the mission by one task. Caller invokes this in a loop (or
   * background scheduler) until status changes from 'active'.
   */
  async function advance(missionId: string): Promise<AdvanceResult> {
    const mission = await state.getMission(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.status !== 'active') {
      return { status: 'no_ready_task', reason: `Mission is '${mission.status}', not 'active'` };
    }

    // Budget check
    const budget = computeBudgetStatus(mission);
    if (budget.tokens.exceeded) {
      await pauseMission(missionId, `Token budget exceeded (${budget.tokens.consumed.toLocaleString()} / ${budget.tokens.max.toLocaleString()})`);
      await state.logActivity(missionId, { activityType: 'budget_exceeded', description: 'Token budget reached' });
      return { status: 'mission_paused', reason: 'token_budget_exceeded' };
    }

    const task = await getNextReadyTask(missionId);
    if (!task) {
      // No ready task and not paused → mission is complete (or stuck)
      const tasks = await state.listTasks(missionId);
      const allDone = tasks.length > 0 && tasks.every(t => t.status === 'completed' || t.status === 'skipped' || t.status === 'failed');
      if (allDone) {
        await state.updateMissionStatus(missionId, 'completed', { completedAt: nowIso() });
        await state.logActivity(missionId, { activityType: 'mission_completed', description: 'All tasks completed' });
        return { status: 'mission_completed' };
      }
      return { status: 'no_ready_task' };
    }

    const result = await executor.executeTask(mission, task);
    if (result.pausedMission) {
      return { status: 'mission_paused', task, reason: result.reason };
    }
    if (!result.success) {
      return { status: 'task_failed', task, reason: result.reason };
    }
    return { status: 'task_completed', task };
  }

  // ── Budget ───────────────────────────────────────────────────────────────

  function computeBudgetStatus(mission: Mission): BudgetStatus {
    const tokenPct = mission.token_budget_max > 0 ? mission.token_budget_consumed / mission.token_budget_max : 0;
    const timePct = mission.time_active_max_seconds > 0 ? mission.time_active_consumed_seconds / mission.time_active_max_seconds : 0;
    const finPct = mission.financial_budget_max > 0 ? Number(mission.financial_budget_consumed) / Number(mission.financial_budget_max) : 0;
    return {
      tokens: {
        consumed: mission.token_budget_consumed, max: mission.token_budget_max,
        pct: tokenPct, warning: tokenPct >= 0.8, exceeded: tokenPct >= 1,
      },
      time: {
        consumed_seconds: mission.time_active_consumed_seconds, max_seconds: mission.time_active_max_seconds,
        pct: timePct, warning: timePct >= 0.8, exceeded: timePct >= 1,
      },
      financial: {
        consumed: Number(mission.financial_budget_consumed), max: Number(mission.financial_budget_max),
        pct: finPct, warning: finPct >= 0.8, exceeded: finPct >= 1,
      },
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function persistTaskGraph(missionId: string, graph: TaskGraphTemplate): Promise<void> {
    const ts = nowIso();
    // First pass: create tasks (without dependencies). Map local_id → real id.
    const idMap = new Map<string, string>();
    for (const node of graph.tasks) {
      const taskId = newTaskId();
      idMap.set(node.local_id, taskId);
      await state.insertTask({
        id: taskId,
        mission_id: missionId,
        parent_task_id: node.parent_local_id ? (idMap.get(node.parent_local_id) ?? null) : null,
        title: node.title,
        description: node.description ?? null,
        task_type: node.task_type,
        status: 'queued',
        priority: 0,
        module_id: node.module_id ?? null,
        area_id: node.area_id ?? null,
        module_config: { ...(node.module_config ?? {}), prompt: node.prompt, checkpoint_message: node.checkpoint_message },
        provider: null,
        model: null,
        model_tier: null,
        estimated_tokens: node.estimated_tokens ?? null,
        actual_tokens_consumed: 0,
        estimated_duration_seconds: node.estimated_duration_seconds ?? null,
        actual_duration_seconds: null,
        output_summary: null,
        output_full: null,
        quality_score: null,
        confidence_score: null,
        atoms_produced: 0,
        retry_count: 0,
        max_retries: 3,
        last_error: null,
        sort_order: node.sort_order ?? 0,
        created_at: ts,
        started_at: null,
        completed_at: null,
      });
    }
    // Second pass: dependencies
    for (const node of graph.tasks) {
      const taskId = idMap.get(node.local_id);
      if (!taskId) continue;
      for (const depLocalId of node.depends_on ?? []) {
        const depId = idMap.get(depLocalId);
        if (depId && depId !== taskId) {
          await state.insertDependency(taskId, depId, 'blocking');
        }
      }
    }
  }

  return {
    // lifecycle
    createMission,
    briefMission,
    approvePlanAndStart,
    pauseMission,
    resumeMission,
    abortMission,
    approveCheckpoint,
    rejectCheckpoint,
    // execution
    getNextReadyTask,
    advance,
    // budget
    computeBudgetStatus,
    // expose state for downstream services
    state,
  };
}

export type MissionController = ReturnType<typeof createMissionController>;
