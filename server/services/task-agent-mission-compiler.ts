/**
 * task-agent-mission-compiler.ts — Wave 5.1 (Core Experience Review 2026-06):
 * Task Agent ↔ Missions convergence bridge.
 *
 * The Task Agent owns the best intake conversation in the product (approach
 * proposal from the self-knowledge DB, clarifying questions, intake_complete
 * gate) but its execution layer is one prose-only LLM call per step — it
 * cannot ACT. Missions own the action layer (HTTP/browser/DB executors,
 * credential vault, autonomy gates, the background runner) but have weak
 * intake. This module compiles a completed Task Agent intake INTO a mission:
 *
 *   approach.execution_steps + intake answers + attached docs + grounding
 *     → CreateMissionInput fields + a TaskGraphTemplate + honesty notes
 *
 * Mapping rules (deliberately conservative):
 *   • Prose steps → `llm` mission tasks carrying the same step prompt the
 *     Task Agent's execute-step endpoint would have built (task context +
 *     intake answers ride in mission.context, which the mission executor
 *     injects into every task's system prompt).
 *   • A step may DECLARE an action via the optional `action_type` +
 *     `action_config` fields (new, additive — no existing approach uses
 *     them). Valid declarations compile to real api_call / browser /
 *     database_query mission tasks. Invalid/incomplete declarations fall
 *     back to an llm step WITH a warning note — never silently degraded,
 *     never fabricated.
 *   • Between steps the compiler inserts `checkpoint` tasks by default —
 *     this preserves the Task Agent's human-gated "Run Step N" progression
 *     AND honestly covers the one thing a mission cannot do: mid-execution
 *     clarifying conversation. The checkpoint is where the human reviews
 *     and (via mission feedback) steers.
 *
 * Everything in this file is PURE (no DB, no LLM, no IO) so the compile
 * mapping is exhaustively unit-testable. The route in
 * server/routes/task-agent.ts does the IO: loads rows, fetches grounding
 * text, calls this, persists via mission-controller.briefMissionWithGraph.
 */

import { validateActionTaskConfig } from './missions/mission-decomposition.js';
import type { TaskGraphTemplate, TaskGraphNode, TaskType, MissionTask, Mission } from './missions/types.js';
import {
  missionTaskToStepRecord,
  DELIVERABLE_MISSION_TASK_TYPES,
  type SharedStepRecord,
} from '../types/step-record.js';

// ── Input shapes ────────────────────────────────────────────────────────────

/** Mission action types a Task Agent approach step may declare. */
export const STEP_ACTION_TYPES = ['api_call', 'browser', 'database_query'] as const;
export type StepActionType = typeof STEP_ACTION_TYPES[number];

/**
 * One execution step of an anton_approaches row (execution_steps JSON).
 * `action_type` / `action_config` are NEW optional fields (additive — the
 * JSON column needs no migration): future approaches can declare that a
 * step is a real action. All 9 seeded approaches are prose-only and compile
 * to llm tasks; the compiler never invents actions for them.
 */
export interface ApproachExecutionStep {
  step: number;
  name: string;
  capability_id?: string;
  description?: string;
  /** Optional declared mission action for this step. */
  action_type?: string;
  /** Config for the declared action (url / service_id+workflow_id / query …). */
  action_config?: Record<string, unknown>;
}

export interface CompileTaskInput {
  task: {
    id: string;
    title: string;
    description: string;
    priority?: string;
  };
  approach: {
    id: string;
    name: string;
    outcome?: string;
    execution_steps: ApproachExecutionStep[];
  };
  intakeAnswers: Record<string, string>;
  /** Extracted text of attached documents (already capped at upload time). */
  attachedFiles: Array<{ name: string; text: string }>;
  /** Pre-fetched framework/pack grounding text (item 1.3 layer), if any. */
  groundingText?: string | null;
  options?: {
    /** Insert a human checkpoint between steps (default true — Task Agent parity). */
    interStepCheckpoints?: boolean;
  };
}

export interface CompileNote {
  level: 'info' | 'warning';
  step?: number;
  message: string;
}

export interface CompiledMission {
  mission: {
    title: string;
    objective: string;
    context: string;
    success_criteria: string;
    autonomy_level: 'check_in';
    priority: 'low' | 'normal' | 'high' | 'critical';
  };
  graph: TaskGraphTemplate;
  notes: CompileNote[];
}

// ── Budgets ─────────────────────────────────────────────────────────────────
// mission.context is injected into EVERY task's system prompt by the mission
// executor, so it must stay bounded. Attached documents get excerpts, not
// full text — an honest warning note records the truncation.

export const CONTEXT_DOC_CHAR_BUDGET = 12_000;   // total across all docs
export const CONTEXT_DOC_CHAR_PER_FILE = 4_000;  // per single doc
export const CONTEXT_TOTAL_CHAR_CAP = 24_000;    // hard cap on mission.context

const DEFAULT_LLM_STEP_TOKENS = 8_000;

// ── Compile ─────────────────────────────────────────────────────────────────

function truncateWithMarker(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max).trim() + '\n…[truncated for mission context]', truncated: true };
}

function buildMissionContext(input: CompileTaskInput, notes: CompileNote[]): string {
  const parts: string[] = [];

  const answers = Object.entries(input.intakeAnswers ?? {});
  if (answers.length > 0) {
    parts.push(`GATHERED CONTEXT (Task Agent intake)\n${answers.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`);
  }

  if (input.attachedFiles.length > 0) {
    let remaining = CONTEXT_DOC_CHAR_BUDGET;
    const docParts: string[] = [];
    let anyTruncated = false;
    for (const f of input.attachedFiles) {
      const cap = Math.max(0, Math.min(CONTEXT_DOC_CHAR_PER_FILE, remaining));
      if (cap === 0) {
        docParts.push(`[Document "${f.name}" omitted — context budget exhausted]`);
        anyTruncated = true;
        continue;
      }
      const { text, truncated } = truncateWithMarker(f.text, cap);
      anyTruncated = anyTruncated || truncated;
      remaining -= text.length;
      docParts.push(`--- DOCUMENT: ${f.name} ---\n${text}`);
    }
    parts.push(`ATTACHED DOCUMENTS\n${docParts.join('\n\n')}`);
    if (anyTruncated) {
      notes.push({
        level: 'warning',
        message: `Attached documents exceed the mission context budget (${CONTEXT_DOC_CHAR_BUDGET.toLocaleString()} chars) — excerpts were compiled in. The classic per-step Task Agent path carries full document text; use it if full-document grounding is critical.`,
      });
    }
  }

  if (input.groundingText && input.groundingText.trim()) {
    parts.push(input.groundingText.trim());
  }

  let context = parts.join('\n\n');
  if (context.length > CONTEXT_TOTAL_CHAR_CAP) {
    context = context.slice(0, CONTEXT_TOTAL_CHAR_CAP).trim() + '\n…[context truncated]';
    notes.push({ level: 'warning', message: 'Compiled mission context exceeded the hard cap and was truncated.' });
  }
  return context;
}

/** The per-step prompt — mirrors what task-agent execute-step asks for. */
function buildStepPrompt(step: ApproachExecutionStep, taskTitle: string): string {
  return [
    `You are executing Step ${step.step}: ${step.name} of the task "${taskTitle}".`,
    step.description ? `Step purpose: ${step.description}` : '',
    'Produce the complete deliverable for THIS step now. This is real work for a client — apply your full expertise. Use the GATHERED CONTEXT, ATTACHED DOCUMENTS, and any framework grounding in the mission context.',
  ].filter(Boolean).join('\n');
}

/**
 * Compile a completed Task Agent intake into a mission definition.
 * Pure — all IO (loading rows, grounding retrieval, persistence) is the
 * caller's job.
 */
export function compileTaskToMission(input: CompileTaskInput): CompiledMission {
  const notes: CompileNote[] = [];
  const interStepCheckpoints = input.options?.interStepCheckpoints !== false;

  const steps = [...(input.approach.execution_steps ?? [])].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));

  const nodes: TaskGraphNode[] = [];
  let prevLocalId: string | null = null;
  let sortOrder = 1;

  const pushNode = (node: TaskGraphNode): void => {
    if (prevLocalId) node.depends_on = [prevLocalId];
    node.sort_order = sortOrder++;
    nodes.push(node);
    prevLocalId = node.local_id;
  };

  if (steps.length === 0) {
    // An approach without steps still compiles — one llm task from the
    // approach itself, honestly flagged.
    notes.push({
      level: 'warning',
      message: `Approach "${input.approach.name}" declares no execution steps — compiled to a single llm task from the approach outcome.`,
    });
    pushNode({
      local_id: 's1',
      title: input.approach.name,
      description: input.approach.outcome ?? input.task.description,
      task_type: 'llm',
      prompt: `Carry out the task "${input.task.title}" using the approach "${input.approach.name}". Produce the complete deliverable.`,
      estimated_tokens: DEFAULT_LLM_STEP_TOKENS,
    });
  }

  steps.forEach((step, idx) => {
    const localId = `s${idx + 1}`;

    // Checkpoint BETWEEN steps (not before the first) — preserves the Task
    // Agent's human-gated per-step progression, and is the honest stand-in
    // for mid-execution clarifying conversation (which missions don't have).
    if (interStepCheckpoints && idx > 0) {
      pushNode({
        local_id: `${localId}_gate`,
        title: `Review Step ${steps[idx - 1].step} output`,
        description: `Human review gate (Task Agent parity): review the previous step's output before Step ${step.step} runs. Mid-execution clarifying conversation is not available inside a mission — use approve/reject feedback here to steer.`,
        task_type: 'checkpoint',
        checkpoint_message: `Step ${steps[idx - 1].step} ("${steps[idx - 1].name}") is complete. Review its output, then approve to run Step ${step.step}: ${step.name}.`,
      });
    }

    // Declared action?
    if (step.action_type !== undefined) {
      const isKnownAction = (STEP_ACTION_TYPES as readonly string[]).includes(step.action_type);
      const configError = isKnownAction
        ? validateActionTaskConfig(step.action_type, step.action_config)
        : `unknown action_type '${step.action_type}' (expected one of: ${STEP_ACTION_TYPES.join(', ')})`;

      if (isKnownAction && !configError) {
        notes.push({
          level: 'info',
          step: step.step,
          message: `Step ${step.step} ("${step.name}") compiled as a ${step.action_type} action task. The mission autonomy gate (check_in) will require approval before it runs.`,
        });
        pushNode({
          local_id: localId,
          title: step.name,
          description: step.description,
          task_type: step.action_type as TaskType,
          module_config: { ...(step.action_config ?? {}) },
        });
        return;
      }

      // Honest fallback — never silently degrade a declared action.
      notes.push({
        level: 'warning',
        step: step.step,
        message: `Step ${step.step} ("${step.name}") declared an action but it cannot compile (${configError}). Falling back to an llm step gated by the inter-step checkpoint — the action will NOT be performed automatically.`,
      });
    }

    // Prose step → llm task.
    pushNode({
      local_id: localId,
      title: step.name,
      description: step.description,
      task_type: 'llm',
      prompt: buildStepPrompt(step, input.task.title),
      estimated_tokens: DEFAULT_LLM_STEP_TOKENS,
    });
  });

  const context = buildMissionContext(input, notes);

  const priorityMap: Record<string, CompiledMission['mission']['priority']> = {
    low: 'low', normal: 'normal', high: 'high', urgent: 'critical', critical: 'critical',
  };

  return {
    mission: {
      title: input.task.title,
      objective: input.task.description,
      context,
      success_criteria: input.approach.outcome?.trim()
        || `Complete every step of the "${input.approach.name}" approach and deliver the final output for human review.`,
      // check_in mirrors the Task Agent's behavior: a human approves every
      // action and reviews between steps. Never auto-raise autonomy here.
      autonomy_level: 'check_in',
      priority: priorityMap[input.task.priority ?? 'normal'] ?? 'normal',
    },
    graph: { tasks: nodes },
    notes,
  };
}

// ── Status round-trip (mission → Task Agent view) ───────────────────────────

export interface LinkedMissionSummary {
  id: string;
  status: string;
  title: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  /** Title of the task currently active / paused-for-approval, if any. */
  current_task_title: string | null;
  /** True when the mission is paused at a checkpoint / approval gate. */
  awaiting_human: boolean;
  progress_pct: number;
}

/**
 * Project a mission + its tasks into the compact summary the Task Agent
 * task view shows. Pure.
 */
export function summarizeLinkedMission(
  mission: Pick<Mission, 'id' | 'status' | 'title'>,
  tasks: Array<Pick<MissionTask, 'title' | 'status'>>,
): LinkedMissionSummary {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const current = tasks.find(t => t.status === 'active') ?? tasks.find(t => t.status === 'paused') ?? null;
  return {
    id: mission.id,
    status: mission.status,
    title: mission.title,
    total_tasks: total,
    completed_tasks: completed,
    failed_tasks: failed,
    current_task_title: current?.title ?? null,
    awaiting_human: mission.status === 'review' || tasks.some(t => t.status === 'paused'),
    progress_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// ── Deliverable assembly (mission completion → Task Agent delivery) ─────────

export interface MissionDeliverable {
  /** Concatenated markdown deliverable across deliverable-producing tasks. */
  deliverableText: string;
  /** Shared step records to append to anton_tasks.execution_results. */
  stepRecords: SharedStepRecord[];
}

/**
 * Build the Task Agent deliverable from a completed mission's tasks.
 * Control-flow tasks (checkpoint / conditional / parallel_group /
 * notification) are excluded — only deliverable-producing tasks count.
 * Pure.
 */
export function buildMissionDeliverable(
  tasks: Array<Pick<MissionTask,
    'id' | 'title' | 'description' | 'task_type' | 'status' | 'output_full'
    | 'quality_score' | 'retry_count' | 'completed_at' | 'sort_order'>>,
): MissionDeliverable {
  const deliverableTasks = [...tasks]
    .filter(t => t.status === 'completed'
      && DELIVERABLE_MISSION_TASK_TYPES.has(t.task_type)
      && (t.output_full ?? '').trim().length > 0)
    .sort((a, b) => a.sort_order - b.sort_order);

  const stepRecords = deliverableTasks.map((t, i) => missionTaskToStepRecord(t, i));
  const deliverableText = stepRecords
    .map((r, i) => `## Step ${i + 1}: ${r.name}\n\n${r.output}`)
    .join('\n\n---\n\n');

  return { deliverableText, stepRecords };
}
