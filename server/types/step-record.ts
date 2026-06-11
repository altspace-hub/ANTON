/**
 * step-record.ts — the ONE shared step/quality-record shape used by both
 * task systems (Core Experience Review 2026-06, item 5.1).
 *
 * Today ANTON has two proposal→confirm task systems with zero shared code:
 *   • Task Agent (anton_tasks.execution_results JSON column) — entries were
 *     an anonymous inline type in server/routes/task-agent.ts
 *   • Missions (missions.mission_tasks rows) — output_full / quality_score /
 *     retry_count columns on the task row
 *
 * This module is the convergence seam: a single TypeScript shape both sides
 * produce and consume, WITHOUT forcing schema migrations on either store.
 * The field names deliberately match the Task Agent's persisted JSON (so
 * existing execution_results documents already conform), and
 * `missionTaskToStepRecord` maps a mission task row into the same shape.
 *
 * Future unification grows along this seam: when missions gain a quality
 * gate, they populate StepQualityRecord; when Task Agent execution moves
 * fully into missions, execution_results becomes a pure projection of
 * mission tasks through this type.
 */

/**
 * Quality-gate verdict attached to a step. Field names match what the
 * Task Agent route has historically persisted inside execution_results
 * (quality_dimensions is the spread of task-quality-gate's GateDimensions).
 */
export interface StepQualityRecord {
  quality_score?: number | null;
  quality_critique?: string;
  quality_dimensions?: Record<string, number>;
  retry_count?: number;
}

/**
 * One executed step's outcome — produced by Task Agent per-step execution
 * AND by the mission→task sync bridge.
 */
export interface SharedStepRecord extends StepQualityRecord {
  /** Zero-based step index within the parent task/mission. */
  step: number;
  name: string;
  output: string;
  /** ISO timestamp of completion. */
  at: string;
  thinking_level?: string;
  thinking?: string;
  description?: string;
  /** Which engine executed this step. Absent = legacy task_agent records. */
  source?: 'task_agent' | 'mission';
  /** Set when source==='mission' — the missions.mission_tasks row id. */
  mission_task_id?: string;
}

/** The subset of a mission task row the converter needs (matches MissionTask). */
export interface MissionTaskLike {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  output_full: string | null;
  quality_score: number | null;
  retry_count: number;
  completed_at: string | null;
  sort_order: number;
}

/** Mission task types that produce a deliverable (vs control-flow plumbing). */
export const DELIVERABLE_MISSION_TASK_TYPES: ReadonlySet<string> = new Set([
  'llm', 'research', 'analysis', 'export', 'review',
  'api_call', 'browser', 'database_query',
]);

/**
 * Map a completed mission task into the shared step record shape.
 * Pure — unit-testable without a DB.
 */
export function missionTaskToStepRecord(task: MissionTaskLike, stepIndex: number): SharedStepRecord {
  return {
    step: stepIndex,
    name: task.title,
    output: task.output_full ?? '',
    at: task.completed_at ?? new Date().toISOString(),
    description: task.description ?? undefined,
    quality_score: task.quality_score,
    retry_count: task.retry_count > 0 ? task.retry_count : undefined,
    source: 'mission',
    mission_task_id: task.id,
  };
}
