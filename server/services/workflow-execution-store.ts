// ═══════════════════════════════════════════════════════════════════
// workflow-execution-store.ts — PostgreSQL persistence for interactive
// workflow executions (Wave 4.1, B7 fix).
//
// The interactive engine (/api/workflows/executions*) holds live
// WorkflowExecution objects in an in-memory Map (hot cache). This store
// serializes the full execution to the workflow_executions table on every
// state change and rehydrates it after a server restart, so paused /
// guided / checkpoint runs survive restarts instead of parking forever.
//
// It also provides the combined pending-approvals view across BOTH
// engines (interactive paused executions + scheduled runs parked at an
// approval gate in workflow_runs).
// ═══════════════════════════════════════════════════════════════════

import type { DatabaseAdapter } from '../db/database.js';
import type { WorkflowDefinition } from '../../src/lib/workflow-definitions.js';

// ── Types (single source of truth — re-exported by routes/workflows.ts) ──

export type ExecutionMode = 'guided' | 'automatic' | 'scheduled' | 'client';
export type ExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StepResult {
  stepId: string;
  stepIndex: number;
  status: StepStatus;
  startedAt: string;
  completedAt?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowDefinition: WorkflowDefinition;
  mode: ExecutionMode;
  status: ExecutionStatus;
  currentStepIndex: number;
  context: Record<string, unknown>;
  stepResults: StepResult[];
  startedAt: string;
  completedAt?: string;
  error?: string;
  /** Module session that claude-step outputs were persisted under (client runs). */
  sessionId?: string;
}

// ── Row shape (workflow_executions, post-migration 230) ─────────────

export interface WorkflowExecutionRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  mode: string | null;
  current_step: number | null;
  step_states: unknown;
  context: unknown;
  workflow_definition: unknown;
  error_message: string | null;
  session_id: string | null;
  started_at: string | Date;
  completed_at: string | Date | null;
}

// ── Pure serialize / deserialize (unit-tested round-trip) ───────────

function parseJsonish<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return undefined; }
  }
  return value as T;
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Serialize a live execution into the column values written to PostgreSQL. */
export function executionToRow(execution: WorkflowExecution): WorkflowExecutionRow {
  return {
    id: execution.id,
    workflow_id: execution.workflowId,
    workflow_name: execution.workflowDefinition?.label ?? execution.workflowId,
    status: execution.status,
    mode: execution.mode,
    current_step: execution.currentStepIndex,
    step_states: JSON.stringify(execution.stepResults ?? []),
    context: JSON.stringify(execution.context ?? {}),
    workflow_definition: JSON.stringify(execution.workflowDefinition ?? null),
    error_message: execution.error ?? null,
    session_id: execution.sessionId ?? null,
    started_at: execution.startedAt,
    completed_at: execution.completedAt ?? null,
  };
}

/**
 * Rehydrate an execution from a workflow_executions row.
 * Returns undefined when the row has no stored workflow_definition (e.g.
 * legacy canvas rows or client-loop summary rows) — those cannot re-enter
 * the server execution loop.
 */
export function rowToExecution(row: WorkflowExecutionRow): WorkflowExecution | undefined {
  const definition = parseJsonish<WorkflowDefinition>(row.workflow_definition);
  if (!definition || !Array.isArray(definition.steps)) return undefined;
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowDefinition: definition,
    mode: (row.mode ?? 'guided') as ExecutionMode,
    status: row.status as ExecutionStatus,
    currentStepIndex: row.current_step ?? 0,
    context: parseJsonish<Record<string, unknown>>(row.context) ?? {},
    stepResults: parseJsonish<StepResult[]>(row.step_states) ?? [],
    startedAt: toIso(row.started_at) ?? new Date().toISOString(),
    completedAt: toIso(row.completed_at),
    error: row.error_message ?? undefined,
    sessionId: row.session_id ?? undefined,
  };
}

// ── Persistence ──────────────────────────────────────────────────────

const UPSERT_SQL = `
  INSERT INTO workflow_executions
    (id, workflow_id, workflow_name, status, mode, current_step,
     step_states, context, workflow_definition, error_message, session_id,
     started_at, completed_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    mode = EXCLUDED.mode,
    current_step = EXCLUDED.current_step,
    step_states = EXCLUDED.step_states,
    context = EXCLUDED.context,
    workflow_definition = COALESCE(EXCLUDED.workflow_definition, workflow_executions.workflow_definition),
    error_message = EXCLUDED.error_message,
    session_id = COALESCE(EXCLUDED.session_id, workflow_executions.session_id),
    completed_at = EXCLUDED.completed_at,
    updated_at = NOW()
`;

/**
 * Persist (upsert) the current state of an execution. Called on every state
 * change. Failures are logged, never thrown — persistence must not break a
 * running workflow (pre-migration deploys lack the state columns).
 */
export async function persistExecution(db: DatabaseAdapter, execution: WorkflowExecution): Promise<void> {
  const row = executionToRow(execution);
  try {
    await db.run(
      UPSERT_SQL,
      row.id, row.workflow_id, row.workflow_name, row.status, row.mode,
      row.current_step, row.step_states, row.context, row.workflow_definition,
      row.error_message, row.session_id, row.started_at, row.completed_at
    );
  } catch (err) {
    console.warn(`[workflow-execution-store] Could not persist execution ${execution.id}:`,
      err instanceof Error ? err.message : err);
  }
}

/** Load + rehydrate one execution from PostgreSQL (restart survival). */
export async function loadExecution(db: DatabaseAdapter, id: string): Promise<WorkflowExecution | undefined> {
  try {
    const row = await db.get<WorkflowExecutionRow>(
      'SELECT * FROM workflow_executions WHERE id = ?', id
    );
    if (!row) return undefined;
    return rowToExecution(row);
  } catch (err) {
    console.warn(`[workflow-execution-store] Could not load execution ${id}:`,
      err instanceof Error ? err.message : err);
    return undefined;
  }
}

export interface ExecutionSummary {
  id: string;
  workflowId: string;
  workflowLabel: string;
  mode: string;
  status: string;
  currentStepIndex: number;
  totalSteps: number;
  startedAt: string;
  completedAt?: string;
}

/** Recent executions (durable list — survives restarts). */
export async function listExecutionSummaries(db: DatabaseAdapter, limit = 50): Promise<ExecutionSummary[]> {
  const rows = await db.all<WorkflowExecutionRow>(
    `SELECT * FROM workflow_executions
     WHERE mode IS NOT NULL
     ORDER BY started_at DESC
     LIMIT ?`, limit
  );
  return rows.map((row) => {
    const definition = parseJsonish<WorkflowDefinition>(row.workflow_definition);
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowLabel: row.workflow_name || row.workflow_id,
      mode: row.mode ?? 'guided',
      status: row.status,
      currentStepIndex: row.current_step ?? 0,
      totalSteps: definition?.steps?.length ?? 0,
      startedAt: toIso(row.started_at) ?? '',
      completedAt: toIso(row.completed_at),
    };
  });
}

// ── Client-loop run summaries (engine 1 minimal fix) ────────────────

export interface ClientRunRecord {
  id: string;
  workflowId: string;
  workflowLabel: string;
  status: ExecutionStatus;
  currentStepIndex: number;
  /** Trimmed step states from the page loop. */
  stepStates: unknown;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Upsert a summary row for a workflow run executed by the client-side page
 * loop (WorkflowsPage). These rows are summaries — workflow_definition stays
 * NULL, so they are listed but never rehydrated into the server engine.
 */
export async function recordClientRun(db: DatabaseAdapter, record: ClientRunRecord): Promise<void> {
  try {
    await db.run(
      UPSERT_SQL,
      record.id, record.workflowId, record.workflowLabel, record.status, 'client',
      record.currentStepIndex, JSON.stringify(record.stepStates ?? []), '{}', null,
      null, record.sessionId ?? null,
      record.startedAt ?? new Date().toISOString(), record.completedAt ?? null
    );
  } catch (err) {
    console.warn(`[workflow-execution-store] Could not record client run ${record.id}:`,
      err instanceof Error ? err.message : err);
  }
}

// ── Pending approvals across BOTH engines ───────────────────────────

export interface PendingApprovalItem {
  /** 'execution' = interactive engine (continue/abort), 'run' = scheduled engine (approve/reject). */
  kind: 'execution' | 'run';
  id: string;
  workflowId: string;
  workflowLabel: string;
  stepIndex: number;
  stepLabel: string;
  mode: string;
  pausedAt: string;
}

/**
 * Parked runs awaiting a human:
 *  - interactive executions with status='paused' (guided pauses + checkpoints)
 *  - scheduled workflow_runs with status='awaiting_approval'
 */
export async function listPendingApprovals(db: DatabaseAdapter): Promise<PendingApprovalItem[]> {
  const items: PendingApprovalItem[] = [];

  try {
    const execRows = await db.all<WorkflowExecutionRow>(
      `SELECT * FROM workflow_executions
       WHERE status = 'paused' AND workflow_definition IS NOT NULL
       ORDER BY started_at DESC LIMIT 20`
    );
    for (const row of execRows) {
      const definition = parseJsonish<WorkflowDefinition>(row.workflow_definition);
      const stepIndex = row.current_step ?? 0;
      const step = definition?.steps?.[stepIndex];
      items.push({
        kind: 'execution',
        id: row.id,
        workflowId: row.workflow_id,
        workflowLabel: row.workflow_name || row.workflow_id,
        stepIndex,
        stepLabel: step?.label ?? `Step ${stepIndex + 1}`,
        mode: row.mode ?? 'guided',
        pausedAt: toIso(row.started_at) ?? '',
      });
    }
  } catch (err) {
    console.warn('[workflow-execution-store] Could not list paused executions:',
      err instanceof Error ? err.message : err);
  }

  try {
    const runRows = await db.all<{
      id: string; workflow_id: string; awaiting_step: number | null;
      awaiting_step_label: string | null; started_at: string | Date;
    }>(
      `SELECT id, workflow_id, awaiting_step, awaiting_step_label, started_at
       FROM workflow_runs
       WHERE status = 'awaiting_approval'
       ORDER BY started_at DESC LIMIT 20`
    );
    for (const row of runRows) {
      items.push({
        kind: 'run',
        id: row.id,
        workflowId: row.workflow_id,
        workflowLabel: row.workflow_id,
        stepIndex: row.awaiting_step ?? 0,
        stepLabel: row.awaiting_step_label ?? `Step ${(row.awaiting_step ?? 0) + 1}`,
        mode: 'scheduled',
        pausedAt: toIso(row.started_at) ?? '',
      });
    }
  } catch (err) {
    console.warn('[workflow-execution-store] Could not list awaiting_approval runs:',
      err instanceof Error ? err.message : err);
  }

  return items.sort((a, b) => (b.pausedAt > a.pausedAt ? 1 : -1));
}
