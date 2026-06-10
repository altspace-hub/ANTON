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
import { decomposeMission, buildActionCapabilityContext } from './mission-decomposition.js';
import {
  mergeTemplateParameterDefaults,
  appendTemplateParametersToContext,
} from './mission-template-parameters.js';
import { createMissionExecutor } from './mission-executor.js';
import { createMissionDelivery } from './mission-delivery.js';
import {
  resolveNotificationChannel,
  pickFinalSynthesis,
  hasCompletedNotificationTask,
} from './mission-notification.js';
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
  const delivery = createMissionDelivery(db);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async function createMission(input: CreateMissionInput, createdByUserId: string): Promise<Mission> {
    if (!input.title?.trim()) throw new Error('Mission title is required');
    if (!input.objective?.trim()) throw new Error('Mission objective is required');
    if (!input.success_criteria?.trim()) throw new Error('Mission success criteria is required');

    // 3A.1 — persist template_parameters into the mission context as a
    // machine-recoverable block (defaults filled from the template's
    // parameters_schema). decomposeMission later extracts the values and
    // substitutes ${param} placeholders deterministically.
    let context: string | null = input.context?.trim() || null;
    if (input.template_id && input.template_parameters && Object.keys(input.template_parameters).length > 0) {
      const template = await state.getTemplate(input.template_id);
      const merged = mergeTemplateParameterDefaults(template?.parameters_schema ?? [], input.template_parameters);
      context = appendTemplateParametersToContext(context, merged);
    }

    // Spec §11.2 — heuristic keyword pre-screen (NOT a legal EU AI Act
    // assessment) + deterministic autonomy ceiling: missions flagged
    // high_risk cannot run at full_autonomy.
    const { classifyMissionRisk, validateAutonomyForRisk, saveRiskClassification } =
      await import('./mission-checkpoint.js');
    const assessment = classifyMissionRisk(input.objective, context);
    const requestedAutonomy = input.autonomy_level ?? 'check_in';
    const autonomyCheck = validateAutonomyForRisk(requestedAutonomy, assessment.classification);
    if (!autonomyCheck.ok) {
      throw new Error(`Mission governance: ${autonomyCheck.reason}`);
    }

    const id = newMissionId();
    const ts = nowIso();
    const mission: Mission = {
      id,
      title: input.title.trim(),
      objective: input.objective.trim(),
      context,
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

    // 2A.5 — tell the decomposer which action capabilities (Service Packs +
    // credentials) are actually installed, so it can plan api_call/browser
    // tasks against reality (or be forbidden from emitting them entirely).
    const capabilities = await buildActionCapabilityContext(db);
    const result = await decomposeMission(mission, template, capabilities);
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

  /**
   * Grant approval for an action task (api_call / database_query / browser)
   * that was paused by the autonomy gate. Stamps approval metadata into
   * module_config, re-queues the task, and resumes the mission. The next
   * advance() call will run the approved task.
   *
   * Distinct from approveCheckpoint (which completes a checkpoint task):
   * this one unblocks work that hasn't executed yet.
   */
  async function grantTaskApproval(
    missionId: string,
    taskId: string,
    approvedByUserId: string,
    feedback?: string,
  ): Promise<void> {
    const task = await state.getTask(taskId);
    if (!task || task.mission_id !== missionId) throw new Error('Task not found');
    if (task.task_type === 'checkpoint') {
      throw new Error('Use approveCheckpoint for checkpoint tasks');
    }
    if (task.status !== 'paused') {
      throw new Error(`Task is in status '${task.status}' — only paused tasks need approval`);
    }
    await state.markTaskApproved(taskId, { approvedBy: approvedByUserId, feedback: feedback ?? null });
    await state.updateTaskStatus(taskId, 'queued');
    await state.logActivity(missionId, {
      activityType: 'approval_granted',
      description: feedback
        ? `Approved '${task.title}' — ${feedback.slice(0, 200)}`
        : `Approved '${task.title}'`,
      taskId,
    });
    const mission = await state.getMission(missionId);
    if (mission?.status === 'review' || mission?.status === 'paused') {
      await state.updateMissionStatus(missionId, 'active');
      await state.logActivity(missionId, {
        activityType: 'mission_resumed',
        description: 'Resumed after action-task approval',
      });
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

  /**
   * Reject an action task paused at the autonomy gate. Marks the task failed
   * with the feedback as the recorded error. Mission stays paused so the
   * human can re-plan or abort; we don't auto-resume because the next task
   * in the graph may depend on this one.
   */
  async function rejectTaskApproval(missionId: string, taskId: string, feedback: string): Promise<void> {
    const task = await state.getTask(taskId);
    if (!task || task.mission_id !== missionId) throw new Error('Task not found');
    if (task.task_type === 'checkpoint') {
      throw new Error('Use rejectCheckpoint for checkpoint tasks');
    }
    if (task.status !== 'paused') {
      throw new Error(`Task is in status '${task.status}' — only paused tasks can be rejected at the approval gate`);
    }
    await state.updateTaskStatus(taskId, 'failed', { lastError: feedback, completedAt: nowIso() });
    await state.logActivity(missionId, {
      activityType: 'approval_rejected',
      description: feedback,
      taskId,
    });
  }

  // ── Execution ────────────────────────────────────────────────────────────

  /**
   * Identify the next task whose dependencies are all completed and which is
   * still queued. Returns null if no task is ready (mission may be done or
   * blocked). Treats 'skipped' deps as met — a conditional false branch
   * that skipped a dependency should not block the successor chain.
   */
  async function getNextReadyTask(missionId: string): Promise<MissionTask | null> {
    const ready = await getReadyTasks(missionId, 1);
    return ready[0] ?? null;
  }

  /**
   * Identify up to `limit` tasks ready to run in parallel. Returned tasks
   * have mutually-compatible dependencies (none depends on another in the
   * batch), so they are safe to execute concurrently. Used by advanceBatch
   * to run parallel_group children without round-trips.
   */
  async function getReadyTasks(missionId: string, limit: number): Promise<MissionTask[]> {
    if (limit <= 0) return [];
    const tasks = await state.listTasks(missionId);
    // 'completed' and 'skipped' both satisfy downstream deps — a skipped
    // branch (from a conditional task's false verdict) shouldn't freeze
    // tasks further down the chain.
    const resolvedIds = new Set(
      tasks.filter(t => t.status === 'completed' || t.status === 'skipped').map(t => t.id),
    );
    const deps = await state.listDependencies(missionId);
    const queuedTasks = tasks
      .filter(t => t.status === 'queued')
      .sort((a, b) => a.sort_order - b.sort_order);

    const batch: MissionTask[] = [];
    const batchIds = new Set<string>();
    for (const t of queuedTasks) {
      if (batch.length >= limit) break;
      const myDeps = deps.filter(d => d.task_id === t.id && d.dependency_type === 'blocking');
      const allDepsMet = myDeps.every(d => resolvedIds.has(d.depends_on_task_id));
      if (!allDepsMet) continue;
      // Don't add a task that depends on another already in this batch —
      // parallelism requires mutual independence within the tick.
      const depsOnBatch = myDeps.some(d => batchIds.has(d.depends_on_task_id));
      if (depsOnBatch) continue;
      batch.push(t);
      batchIds.add(t.id);
    }
    return batch;
  }

  /**
   * Auto-deliver the final synthesis when a mission completes (Wave-2 2A.2).
   * Delivers to in_app (always implemented) honouring the mission's
   * preferred channel via resolveNotificationChannel. Skips when the graph
   * already delivered through a completed notification task (avoids
   * duplicate inbox entries). Best-effort — a delivery failure never
   * un-completes the mission; it logs an activity entry and the delivery
   * retry tick takes over for transient errors.
   */
  async function deliverFinalSynthesis(mission: Mission): Promise<void> {
    try {
      const tasks = await state.listTasks(mission.id);
      if (hasCompletedNotificationTask(tasks)) return;
      const synthesis = pickFinalSynthesis(tasks);
      if (!synthesis) return;
      const target = resolveNotificationChannel(null, mission.notification_preferences);
      const result = await delivery.deliver({
        missionId: mission.id,
        taskId: synthesis.id,
        channel: target.channel,
        destination: target.destination,
        subject: `Mission completed: ${mission.title}`,
        body: synthesis.output_full ?? '',
      });
      await state.logActivity(mission.id, {
        activityType: 'deliverable_sent',
        description: `Final synthesis ('${synthesis.title}') delivered → ${target.channel}: ${result.status}${target.note ? ` — ${target.note}` : ''}`,
        taskId: synthesis.id,
        details: { delivery_id: result.delivery_id, channel: target.channel, status: result.status },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await state.logActivity(mission.id, {
        activityType: 'delivery_failed',
        description: `Auto-delivery of final synthesis failed: ${msg}`,
      }).catch(() => { /* best-effort */ });
    }
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
        await deliverFinalSynthesis(mission);
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

  /**
   * Advance the mission by up to `maxParallel` mutually-independent ready
   * tasks, executed via Promise.allSettled so one failure doesn't abort
   * the others. Returns per-task AdvanceResult[] so the caller sees every
   * branch's outcome.
   *
   * Semantics:
   *   • Budget check runs once before the batch. A task that would bust
   *     the budget mid-batch still completes (it's cheaper to let it
   *     finish than to orphan its partial state); the next batch call
   *     will see the mission paused.
   *   • Any task that pauses the mission (approval gate, explicit
   *     checkpoint) transitions the mission to 'review' synchronously in
   *     the executor; subsequent calls see mission.status !== 'active'
   *     and return no_ready_task until a human resumes.
   *
   * Default maxParallel = 4 — enough to benefit a parallel_group fan-out
   * without thundering-herd on LLM providers. Caller can override.
   */
  async function advanceBatch(
    missionId: string,
    maxParallel = 4,
  ): Promise<{ status: 'no_ready_task' | 'mission_completed' | 'mission_paused' | 'batch_executed'; results: AdvanceResult[]; reason?: string }> {
    const mission = await state.getMission(missionId);
    if (!mission) throw new Error('Mission not found');
    if (mission.status !== 'active') {
      return { status: 'no_ready_task', results: [], reason: `Mission is '${mission.status}', not 'active'` };
    }

    const budget = computeBudgetStatus(mission);
    if (budget.tokens.exceeded) {
      await pauseMission(missionId, `Token budget exceeded (${budget.tokens.consumed.toLocaleString()} / ${budget.tokens.max.toLocaleString()})`);
      await state.logActivity(missionId, { activityType: 'budget_exceeded', description: 'Token budget reached' });
      return { status: 'mission_paused', results: [], reason: 'token_budget_exceeded' };
    }

    const ready = await getReadyTasks(missionId, Math.max(1, Math.min(maxParallel, 16)));
    if (ready.length === 0) {
      const tasks = await state.listTasks(missionId);
      const allDone = tasks.length > 0 && tasks.every(t => t.status === 'completed' || t.status === 'skipped' || t.status === 'failed');
      if (allDone) {
        await state.updateMissionStatus(missionId, 'completed', { completedAt: nowIso() });
        await state.logActivity(missionId, { activityType: 'mission_completed', description: 'All tasks completed' });
        await deliverFinalSynthesis(mission);
        return { status: 'mission_completed', results: [] };
      }
      return { status: 'no_ready_task', results: [] };
    }

    const settled = await Promise.allSettled(
      ready.map(async (task) => {
        const result = await executor.executeTask(mission, task);
        if (result.pausedMission) return { status: 'mission_paused' as const, task, reason: result.reason };
        if (!result.success) return { status: 'task_failed' as const, task, reason: result.reason };
        return { status: 'task_completed' as const, task };
      }),
    );
    const results: AdvanceResult[] = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      const err = s.reason instanceof Error ? s.reason.message : String(s.reason);
      return { status: 'task_failed', task: ready[i], reason: `Unhandled error: ${err}` };
    });
    const pausedAny = results.some(r => r.status === 'mission_paused');
    return { status: pausedAny ? 'mission_paused' : 'batch_executed', results };
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
    grantTaskApproval,
    rejectCheckpoint,
    rejectTaskApproval,
    // execution
    getNextReadyTask,
    getReadyTasks,
    advance,
    advanceBatch,
    // budget
    computeBudgetStatus,
    // expose state for downstream services
    state,
  };
}

export type MissionController = ReturnType<typeof createMissionController>;
