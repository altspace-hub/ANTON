// ── Missions — Local State Persistence ──────────────────────────────────────
// Pure data-access layer for Mission entities. No business logic, no AAP wire
// protocol — just SQL → typed objects in/out. All table refs use the
// `missions.` schema prefix; cross-schema joins use `public.users` etc.

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import type {
  Mission,
  MissionStatus,
  MissionTask,
  MissionTaskDependency,
  MissionActivity,
  MissionDecision,
  MissionTemplate,
  MissionTemplateParameter,
  TaskGraphTemplate,
  ModelStrategy,
  DataScope,
  NotificationPreferences,
  TaskStatus,
} from './types.js';

// ── Row types (raw from PG; JSONB may arrive as object or string) ──────────

interface MissionRow {
  id: string;
  title: string;
  objective: string;
  context: string | null;
  success_criteria: string;
  autonomy_level: string;
  status: string;
  priority: string;
  token_budget_max: number | string;
  token_budget_consumed: number | string;
  time_budget_max_seconds: number;
  time_active_max_seconds: number;
  time_active_consumed_seconds: number;
  financial_budget_max: number | string;
  financial_budget_consumed: number | string;
  data_scope: unknown;
  notification_preferences: unknown;
  model_strategy: unknown;
  template_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  deadline: string | null;
  mission_summary: string | null;
  mission_summary_updated_at: string | null;
}

interface TaskRow {
  id: string;
  mission_id: string;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  priority: number;
  module_id: string | null;
  area_id: string | null;
  module_config: unknown;
  provider: string | null;
  model: string | null;
  model_tier: string | null;
  estimated_tokens: number | null;
  actual_tokens_consumed: number;
  estimated_duration_seconds: number | null;
  actual_duration_seconds: number | null;
  output_summary: string | null;
  output_full: string | null;
  quality_score: number | string | null;
  confidence_score: number | string | null;
  atoms_produced: number;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  sort_order: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface DependencyRow {
  id: number | string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
}

interface ActivityRow {
  id: number | string;
  mission_id: string;
  task_id: string | null;
  timestamp: string;
  activity_type: string;
  description: string | null;
  details: unknown;
  tokens_consumed: number;
}

interface DecisionRow {
  id: string;
  mission_id: string;
  task_id: string | null;
  timestamp: string;
  decision_type: string;
  description: string;
  options_considered: unknown;
  selected_option: string;
  confidence: number | string;
  reasoning: string | null;
  overridden_by_human: boolean;
  override_reasoning: string | null;
  compliance_check_passed: boolean;
}

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  pillar: string;
  category: string | null;
  version: string;
  author: string | null;
  parameters_schema: unknown;
  task_graph_template: unknown;
  default_data_scope: unknown;
  default_budget: unknown;
  default_autonomy_level: string;
  success_criteria_template: string | null;
  required_modules: unknown;
  times_used: number;
  avg_completion_time_seconds: number | null;
  avg_quality_score: number | string | null;
  avg_token_consumption: number | string | null;
  is_builtin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── JSON parsing helpers ───────────────────────────────────────────────────

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v == null) return null;
  return asNumber(v);
}

// ── Row hydration ──────────────────────────────────────────────────────────

function rowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    title: row.title,
    objective: row.objective,
    context: row.context,
    success_criteria: row.success_criteria,
    autonomy_level: row.autonomy_level as Mission['autonomy_level'],
    status: row.status as MissionStatus,
    priority: row.priority as Mission['priority'],
    token_budget_max: asNumber(row.token_budget_max),
    token_budget_consumed: asNumber(row.token_budget_consumed),
    time_budget_max_seconds: row.time_budget_max_seconds,
    time_active_max_seconds: row.time_active_max_seconds,
    time_active_consumed_seconds: row.time_active_consumed_seconds,
    financial_budget_max: asNumber(row.financial_budget_max),
    financial_budget_consumed: asNumber(row.financial_budget_consumed),
    data_scope: asJson<DataScope>(row.data_scope, {}),
    notification_preferences: asJson<NotificationPreferences>(row.notification_preferences, {}),
    model_strategy: asJson<ModelStrategy>(row.model_strategy, {} as ModelStrategy),
    template_id: row.template_id,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    deadline: row.deadline,
    mission_summary: row.mission_summary,
    mission_summary_updated_at: row.mission_summary_updated_at,
  };
}

function rowToTask(row: TaskRow): MissionTask {
  return {
    id: row.id,
    mission_id: row.mission_id,
    parent_task_id: row.parent_task_id,
    title: row.title,
    description: row.description,
    task_type: row.task_type as MissionTask['task_type'],
    status: row.status as TaskStatus,
    priority: row.priority,
    module_id: row.module_id,
    area_id: row.area_id,
    module_config: asJson<Record<string, unknown>>(row.module_config, {}),
    provider: row.provider,
    model: row.model,
    model_tier: row.model_tier as MissionTask['model_tier'],
    estimated_tokens: row.estimated_tokens,
    actual_tokens_consumed: row.actual_tokens_consumed,
    estimated_duration_seconds: row.estimated_duration_seconds,
    actual_duration_seconds: row.actual_duration_seconds,
    output_summary: row.output_summary,
    output_full: row.output_full,
    quality_score: asNullableNumber(row.quality_score),
    confidence_score: asNullableNumber(row.confidence_score),
    atoms_produced: row.atoms_produced,
    retry_count: row.retry_count,
    max_retries: row.max_retries,
    last_error: row.last_error,
    sort_order: row.sort_order,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

function rowToDependency(row: DependencyRow): MissionTaskDependency {
  return {
    id: asNumber(row.id),
    task_id: row.task_id,
    depends_on_task_id: row.depends_on_task_id,
    dependency_type: row.dependency_type as MissionTaskDependency['dependency_type'],
  };
}

function rowToActivity(row: ActivityRow): MissionActivity {
  return {
    id: asNumber(row.id),
    mission_id: row.mission_id,
    task_id: row.task_id,
    timestamp: row.timestamp,
    activity_type: row.activity_type,
    description: row.description,
    details: asJson<Record<string, unknown>>(row.details, {}),
    tokens_consumed: row.tokens_consumed,
  };
}

function rowToDecision(row: DecisionRow): MissionDecision {
  return {
    id: row.id,
    mission_id: row.mission_id,
    task_id: row.task_id,
    timestamp: row.timestamp,
    decision_type: row.decision_type as MissionDecision['decision_type'],
    description: row.description,
    options_considered: asJson<MissionDecision['options_considered']>(row.options_considered, []),
    selected_option: row.selected_option,
    confidence: asNumber(row.confidence, 0.5),
    reasoning: row.reasoning,
    overridden_by_human: !!row.overridden_by_human,
    override_reasoning: row.override_reasoning,
    compliance_check_passed: !!row.compliance_check_passed,
  };
}

function rowToTemplate(row: TemplateRow): MissionTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pillar: row.pillar as MissionTemplate['pillar'],
    category: row.category,
    version: row.version,
    author: row.author,
    parameters_schema: asJson<MissionTemplateParameter[]>(row.parameters_schema, []),
    task_graph_template: asJson<TaskGraphTemplate>(row.task_graph_template, { tasks: [] }),
    default_data_scope: asJson<DataScope>(row.default_data_scope, {}),
    default_budget: asJson<MissionTemplate['default_budget']>(row.default_budget, {}),
    default_autonomy_level: row.default_autonomy_level as MissionTemplate['default_autonomy_level'],
    success_criteria_template: row.success_criteria_template,
    required_modules: asJson<string[]>(row.required_modules, []),
    times_used: row.times_used,
    avg_completion_time_seconds: row.avg_completion_time_seconds,
    avg_quality_score: asNullableNumber(row.avg_quality_score),
    avg_token_consumption: asNullableNumber(row.avg_token_consumption),
    is_builtin: !!row.is_builtin,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ── ID helpers ─────────────────────────────────────────────────────────────

export function newMissionId(): string {
  return `m_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export function newTaskId(): string {
  return `t_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export function newDecisionId(): string {
  return `d_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

// ── State factory ──────────────────────────────────────────────────────────

export function createMissionState(db: DatabaseAdapter) {

  // ── Missions ─────────────────────────────────────────────────────────────

  async function insertMission(m: Mission): Promise<void> {
    await db.run(
      `INSERT INTO missions.missions
        (id, title, objective, context, success_criteria, autonomy_level, status, priority,
         token_budget_max, token_budget_consumed,
         time_budget_max_seconds, time_active_max_seconds, time_active_consumed_seconds,
         financial_budget_max, financial_budget_consumed,
         data_scope, notification_preferences, model_strategy,
         template_id, created_by, created_at, updated_at, started_at, completed_at, deadline,
         mission_summary, mission_summary_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id, m.title, m.objective, m.context, m.success_criteria, m.autonomy_level, m.status, m.priority,
      m.token_budget_max, m.token_budget_consumed,
      m.time_budget_max_seconds, m.time_active_max_seconds, m.time_active_consumed_seconds,
      m.financial_budget_max, m.financial_budget_consumed,
      JSON.stringify(m.data_scope), JSON.stringify(m.notification_preferences), JSON.stringify(m.model_strategy),
      m.template_id, m.created_by, m.created_at, m.updated_at, m.started_at, m.completed_at, m.deadline,
      m.mission_summary, m.mission_summary_updated_at,
    );
  }

  async function getMission(id: string): Promise<Mission | null> {
    const row = await db.get<MissionRow>(`SELECT * FROM missions.missions WHERE id = ?`, id);
    return row ? rowToMission(row) : null;
  }

  async function listMissions(filter?: {
    status?: MissionStatus | MissionStatus[];
    createdBy?: string;
    pillar?: string;
    limit?: number;
  }): Promise<Mission[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      const placeholders = statuses.map(() => '?').join(', ');
      where.push(`status IN (${placeholders})`);
      args.push(...statuses);
    }
    if (filter?.createdBy) {
      where.push('created_by = ?');
      args.push(filter.createdBy);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    args.push(filter?.limit ?? 100);
    const rows = await db.all<MissionRow>(
      `SELECT * FROM missions.missions ${whereSql} ORDER BY created_at DESC LIMIT ?`,
      ...args,
    );
    return rows.map(rowToMission);
  }

  async function updateMissionStatus(id: string, status: MissionStatus, opts?: { startedAt?: string; completedAt?: string }): Promise<void> {
    const sets: string[] = ['status = ?', 'updated_at = NOW()'];
    const args: unknown[] = [status];
    if (opts?.startedAt) { sets.push('started_at = ?'); args.push(opts.startedAt); }
    if (opts?.completedAt) { sets.push('completed_at = ?'); args.push(opts.completedAt); }
    args.push(id);
    await db.run(`UPDATE missions.missions SET ${sets.join(', ')} WHERE id = ?`, ...args);
  }

  async function bumpTokenBudget(id: string, tokens: number): Promise<void> {
    await db.run(
      `UPDATE missions.missions SET token_budget_consumed = token_budget_consumed + ?, updated_at = NOW() WHERE id = ?`,
      tokens, id,
    );
  }

  async function setMissionSummary(id: string, summary: string): Promise<void> {
    await db.run(
      `UPDATE missions.missions SET mission_summary = ?, mission_summary_updated_at = NOW(), updated_at = NOW() WHERE id = ?`,
      summary, id,
    );
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  async function insertTask(t: MissionTask): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_tasks
        (id, mission_id, parent_task_id, title, description, task_type, status, priority,
         module_id, area_id, module_config,
         provider, model, model_tier,
         estimated_tokens, actual_tokens_consumed, estimated_duration_seconds, actual_duration_seconds,
         output_summary, output_full, quality_score, confidence_score, atoms_produced,
         retry_count, max_retries, last_error,
         sort_order, created_at, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id, t.mission_id, t.parent_task_id, t.title, t.description, t.task_type, t.status, t.priority,
      t.module_id, t.area_id, JSON.stringify(t.module_config),
      t.provider, t.model, t.model_tier,
      t.estimated_tokens, t.actual_tokens_consumed, t.estimated_duration_seconds, t.actual_duration_seconds,
      t.output_summary, t.output_full, t.quality_score, t.confidence_score, t.atoms_produced,
      t.retry_count, t.max_retries, t.last_error,
      t.sort_order, t.created_at, t.started_at, t.completed_at,
    );
  }

  async function getTask(id: string): Promise<MissionTask | null> {
    const row = await db.get<TaskRow>(`SELECT * FROM missions.mission_tasks WHERE id = ?`, id);
    return row ? rowToTask(row) : null;
  }

  async function listTasks(missionId: string): Promise<MissionTask[]> {
    const rows = await db.all<TaskRow>(
      `SELECT * FROM missions.mission_tasks WHERE mission_id = ? ORDER BY sort_order ASC, created_at ASC`,
      missionId,
    );
    return rows.map(rowToTask);
  }

  async function updateTaskStatus(id: string, status: TaskStatus, opts?: { startedAt?: string; completedAt?: string; lastError?: string }): Promise<void> {
    const sets: string[] = ['status = ?'];
    const args: unknown[] = [status];
    if (opts?.startedAt) { sets.push('started_at = ?'); args.push(opts.startedAt); }
    if (opts?.completedAt) { sets.push('completed_at = ?'); args.push(opts.completedAt); }
    if (opts?.lastError !== undefined) { sets.push('last_error = ?'); args.push(opts.lastError); }
    args.push(id);
    await db.run(`UPDATE missions.mission_tasks SET ${sets.join(', ')} WHERE id = ?`, ...args);
  }

  async function recordTaskOutput(
    id: string,
    output: { full: string; summary?: string | null; provider: string; model: string; tier: string; tokens: number; durationSeconds: number; quality?: number | null; confidence?: number | null },
  ): Promise<void> {
    await db.run(
      `UPDATE missions.mission_tasks SET
         output_full = ?, output_summary = ?,
         provider = ?, model = ?, model_tier = ?,
         actual_tokens_consumed = actual_tokens_consumed + ?, actual_duration_seconds = ?,
         quality_score = ?, confidence_score = ?,
         status = 'completed', completed_at = NOW()
       WHERE id = ?`,
      output.full, output.summary ?? null,
      output.provider, output.model, output.tier,
      output.tokens, output.durationSeconds,
      output.quality ?? null, output.confidence ?? null,
      id,
    );
  }

  /**
   * Update editable task fields (Wave-2 2A.5 task editor). Only the supplied
   * keys are written. Status/output/timing fields are intentionally NOT
   * editable here — those belong to the executor.
   */
  async function updateTaskFields(id: string, fields: {
    title?: string;
    description?: string | null;
    task_type?: string;
    module_config?: Record<string, unknown>;
    estimated_tokens?: number | null;
    sort_order?: number;
  }): Promise<void> {
    const sets: string[] = [];
    const args: unknown[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); args.push(fields.title); }
    if (fields.description !== undefined) { sets.push('description = ?'); args.push(fields.description); }
    if (fields.task_type !== undefined) { sets.push('task_type = ?'); args.push(fields.task_type); }
    if (fields.module_config !== undefined) { sets.push('module_config = ?'); args.push(JSON.stringify(fields.module_config)); }
    if (fields.estimated_tokens !== undefined) { sets.push('estimated_tokens = ?'); args.push(fields.estimated_tokens); }
    if (fields.sort_order !== undefined) { sets.push('sort_order = ?'); args.push(fields.sort_order); }
    if (sets.length === 0) return;
    args.push(id);
    await db.run(`UPDATE missions.mission_tasks SET ${sets.join(', ')} WHERE id = ?`, ...args);
  }

  async function bumpTaskRetry(id: string, error: string): Promise<void> {
    await db.run(
      `UPDATE missions.mission_tasks SET retry_count = retry_count + 1, last_error = ?, status = 'queued' WHERE id = ?`,
      error, id,
    );
  }

  /**
   * Stamp approval metadata on an action task's module_config. Used by the
   * check-in / briefing autonomy gate — the executor reads these fields to
   * decide whether to run the task or pause pending approval.
   *
   * Merges into existing module_config rather than overwriting so the
   * underlying task params (url, query, workflow_id, …) are preserved.
   */
  async function markTaskApproved(id: string, params: { approvedBy: string; feedback?: string | null }): Promise<void> {
    const existing = await db.get<{ module_config: unknown }>(
      `SELECT module_config FROM missions.mission_tasks WHERE id = ?`,
      id,
    );
    if (!existing) throw new Error(`Task ${id} not found`);
    const current = asJson<Record<string, unknown>>(existing.module_config, {});
    const merged = {
      ...current,
      approval_granted: true,
      approved_at: new Date().toISOString(),
      approved_by: params.approvedBy,
      approval_feedback: params.feedback ?? null,
    };
    await db.run(
      `UPDATE missions.mission_tasks SET module_config = ? WHERE id = ?`,
      JSON.stringify(merged), id,
    );
  }

  // ── Dependencies ─────────────────────────────────────────────────────────

  async function insertDependency(taskId: string, dependsOnTaskId: string, type: 'blocking' | 'informational' = 'blocking'): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_task_dependencies (task_id, depends_on_task_id, dependency_type)
       VALUES (?, ?, ?)
       ON CONFLICT (task_id, depends_on_task_id) DO NOTHING`,
      taskId, dependsOnTaskId, type,
    );
  }

  /** Remove every dependency edge where the given task is the dependent. Used by the task editor to replace depends_on. */
  async function deleteDependenciesFor(taskId: string): Promise<void> {
    await db.run(`DELETE FROM missions.mission_task_dependencies WHERE task_id = ?`, taskId);
  }

  async function listDependencies(missionId: string): Promise<MissionTaskDependency[]> {
    const rows = await db.all<DependencyRow>(
      `SELECT d.* FROM missions.mission_task_dependencies d
       JOIN missions.mission_tasks t ON t.id = d.task_id
       WHERE t.mission_id = ?`,
      missionId,
    );
    return rows.map(rowToDependency);
  }

  // ── Activity ─────────────────────────────────────────────────────────────

  async function logActivity(missionId: string, params: {
    activityType: string;
    description?: string;
    taskId?: string | null;
    details?: Record<string, unknown>;
    tokensConsumed?: number;
  }): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details, tokens_consumed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      missionId, params.taskId ?? null, params.activityType, params.description ?? null,
      JSON.stringify(params.details ?? {}), params.tokensConsumed ?? 0,
    );
  }

  async function listActivity(missionId: string, limit = 200): Promise<MissionActivity[]> {
    const rows = await db.all<ActivityRow>(
      `SELECT * FROM missions.mission_activity WHERE mission_id = ? ORDER BY timestamp DESC LIMIT ?`,
      missionId, limit,
    );
    return rows.map(rowToActivity);
  }

  // ── Decisions ────────────────────────────────────────────────────────────

  async function recordDecision(d: MissionDecision): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_decisions
        (id, mission_id, task_id, timestamp, decision_type, description,
         options_considered, selected_option, confidence, reasoning,
         overridden_by_human, override_reasoning, compliance_check_passed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.id, d.mission_id, d.task_id, d.timestamp, d.decision_type, d.description,
      JSON.stringify(d.options_considered), d.selected_option, d.confidence, d.reasoning,
      d.overridden_by_human, d.override_reasoning, d.compliance_check_passed,
    );
  }

  async function listDecisions(missionId: string): Promise<MissionDecision[]> {
    const rows = await db.all<DecisionRow>(
      `SELECT * FROM missions.mission_decisions WHERE mission_id = ? ORDER BY timestamp ASC`,
      missionId,
    );
    return rows.map(rowToDecision);
  }

  // ── Templates ────────────────────────────────────────────────────────────

  async function insertTemplate(t: MissionTemplate): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_templates
        (id, name, description, pillar, category, version, author,
         parameters_schema, task_graph_template, default_data_scope, default_budget,
         default_autonomy_level, success_criteria_template, required_modules,
         is_builtin, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      t.id, t.name, t.description, t.pillar, t.category, t.version, t.author,
      JSON.stringify(t.parameters_schema), JSON.stringify(t.task_graph_template),
      JSON.stringify(t.default_data_scope), JSON.stringify(t.default_budget),
      t.default_autonomy_level, t.success_criteria_template, JSON.stringify(t.required_modules),
      t.is_builtin, t.is_active,
    );
  }

  async function getTemplate(id: string): Promise<MissionTemplate | null> {
    const row = await db.get<TemplateRow>(`SELECT * FROM missions.mission_templates WHERE id = ?`, id);
    return row ? rowToTemplate(row) : null;
  }

  async function listTemplates(filter?: { pillar?: string; activeOnly?: boolean }): Promise<MissionTemplate[]> {
    const where: string[] = [];
    const args: unknown[] = [];
    if (filter?.pillar) { where.push('pillar = ?'); args.push(filter.pillar); }
    if (filter?.activeOnly !== false) { where.push('is_active = TRUE'); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.all<TemplateRow>(
      `SELECT * FROM missions.mission_templates ${whereSql} ORDER BY name ASC`,
      ...args,
    );
    return rows.map(rowToTemplate);
  }

  // ── Counts (cheap projections for list views) ────────────────────────────

  async function countActivity(missionId: string): Promise<number> {
    const row = await db.get<{ c: number | string }>(
      `SELECT COUNT(*)::int AS c FROM missions.mission_activity WHERE mission_id = ?`,
      missionId,
    );
    return asNumber(row?.c ?? 0);
  }

  async function countDecisions(missionId: string): Promise<number> {
    const row = await db.get<{ c: number | string }>(
      `SELECT COUNT(*)::int AS c FROM missions.mission_decisions WHERE mission_id = ?`,
      missionId,
    );
    return asNumber(row?.c ?? 0);
  }

  return {
    // missions
    insertMission, getMission, listMissions, updateMissionStatus,
    bumpTokenBudget, setMissionSummary,
    // tasks
    insertTask, getTask, listTasks, updateTaskStatus, updateTaskFields, recordTaskOutput, bumpTaskRetry, markTaskApproved,
    // dependencies
    insertDependency, deleteDependenciesFor, listDependencies,
    // activity
    logActivity, listActivity, countActivity,
    // decisions
    recordDecision, listDecisions, countDecisions,
    // templates
    insertTemplate, getTemplate, listTemplates,
    // re-exports for use elsewhere
    rowToTask, rowToMission,
  };
}

export type MissionState = ReturnType<typeof createMissionState>;
