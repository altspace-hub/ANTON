import { getRoutedUtilityModel } from './utility-model.js';
import type { DatabaseAdapter } from '../db/database.js';
import { callChat } from './provider-router.js';
import type { ExtractAtomsResult } from './atom-extractor.js';

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * An owner predicate on checkpoint_decisions.decided_by — build it with
 * `ownerFilter(req, 'decided_by')` (middleware/ownership.ts). decided_by holds
 * the deciding user's id (storeCheckpointDecision writes req.user.id), so on a
 * team server a non-admin reads only the decisions they made: module workflows
 * are 'module:<id>', shared by every user, so a workflow id alone scoped nothing.
 * Required rather than defaulted so a new caller has to decide; empty sql is the
 * unscoped read (solo, admins).
 */
export interface DecisionOwnerScope { sql: string; params: string[] }

export interface StoreOutputParams {
  executionId: string;
  workflowId: string;
  stepIndex: number;
  stepType: string;
  areaId?: string;
  moduleId?: string;
  connectionId?: string;
  outputData: unknown;
  workflowName: string;
  stepName: string;
  userId: string;
}

export interface StoreCheckpointDecisionParams {
  executionId: string;
  workflowId: string;
  stepIndex: number;
  aiRecommendation?: string;
  aiConfidence?: number;
  humanDecision: string;
  humanReasoning?: string;
  isOverride: boolean;
  overrideCategory?: string;
  contextSnapshot: unknown;
  userId: string;
}

/** workflow_outputs.learning_status — the learning pipeline's own ledger (migration 275). */
export type LearningStatus = 'pending' | 'summarised' | 'learned' | 'skipped' | 'failed';

export interface WorkflowOutput {
  id: string;
  execution_id: string;
  workflow_id: string;
  step_index: number;
  step_type: string;
  area_id: string | null;
  module_id: string | null;
  connection_id: string | null;
  output_data: string;
  output_summary: string | null;
  created_at: string;
  created_by: string;
  workflow_name: string;
  step_name: string;
  learning_status?: LearningStatus;
  learning_attempts?: number;
  learning_error?: string | null;
  learned_at?: string | null;
}

export interface CheckpointDecision {
  id: string;
  execution_id: string;
  workflow_id: string;
  step_index: number;
  ai_recommendation: string | null;
  ai_confidence: number | null;
  human_decision: string;
  human_reasoning: string | null;
  is_override: number;
  override_category: string | null;
  context_snapshot: string | null;
  decided_by: string;
  decided_at: string;
}

// ── The learning pipeline (Wave 4, 2026-09-17) ──────────────────────────────
//
// Live finding 2026-09-16: workflow_outputs held 16 rows of which 7 were never
// summarised and nothing was ever learned from a chat. The summary ran in a
// setImmediate while the interactive engine slot was still counted, so its
// background call was refused "SDK engine busy" every time; the failure was
// logged and forgotten. Now every step writes its state to the row
// (pending → summarised → learned, or skipped / failed with the reason), a
// run is idempotent, and memory-sweep.ts retries what did not finish.

/** Outputs shorter than this carry nothing worth an LLM call. */
export const MIN_LEARNABLE_CHARS = 200;
/** learning_error is a reason, not a stack trace. */
export const LEARNING_ERROR_MAX_CHARS = 500;
/** How much of an output the summariser sees. */
const SUMMARY_INPUT_CHARS = 4000;

/**
 * The statements, exported so a test can answer them by identity and
 * tests/db/query-column-drift.test.ts can run them against a real schema.
 */
export const LEARNING_SQL = {
  /** Params: output id. */
  load: 'SELECT id, output_data, output_summary, learning_status, learning_attempts FROM workflow_outputs WHERE id = ?',
  /** Params: output id. */
  bumpAttempts: 'UPDATE workflow_outputs SET learning_attempts = learning_attempts + 1 WHERE id = ?',
  /** Params: reason, output id. */
  markSkipped: "UPDATE workflow_outputs SET learning_status = 'skipped', learning_error = ? WHERE id = ?",
  /** Params: summary, output id. */
  markSummarised: "UPDATE workflow_outputs SET output_summary = ?, learning_status = 'summarised', learning_error = NULL WHERE id = ?",
  /** Params: output id. */
  markLearned: "UPDATE workflow_outputs SET learning_status = 'learned', learned_at = NOW(), learning_error = NULL WHERE id = ?",
  /** Params: error, output id. */
  markFailed: "UPDATE workflow_outputs SET learning_status = 'failed', learning_error = ? WHERE id = ?",
  /** Params: output id. Atoms already learned from this output (a caller that extracted directly). */
  hasAtoms: 'SELECT 1 AS ok FROM knowledge_atoms WHERE source_output_id = ? LIMIT 1',
  /** Params: maxAttempts, olderThanMinutes, limit. Oldest first, so a backlog drains in order. */
  unlearned: `SELECT id FROM workflow_outputs
     WHERE learning_status IN ('pending', 'summarised', 'failed')
       AND learning_attempts < ?
       AND created_at < NOW() - make_interval(mins => ?)
     ORDER BY created_at ASC
     LIMIT ?`,
} as const;

interface LearningRow {
  id: string;
  output_data: string;
  output_summary: string | null;
  learning_status: LearningStatus;
  learning_attempts: number;
}

export interface LearningRunResult {
  outputId: string;
  /** The ledger state the row is in after this call ('missing' when there is no such row). */
  status: LearningStatus | 'missing';
  /** True when the row was already 'learned' and nothing ran. */
  alreadyLearned?: boolean;
  /** What extraction did, when it ran. */
  atoms?: ExtractAtomsResult;
  /** The reason a run was skipped or failed. */
  error?: string;
}

/** The text an output amounts to: a stored string as itself, anything else as its JSON. */
export function learnableText(outputData: string): string {
  try {
    const parsed: unknown = JSON.parse(outputData);
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  } catch {
    return outputData;
  }
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, LEARNING_ERROR_MAX_CHARS);
}

/**
 * Run the learning pipeline for one stored output and record every step on
 * the row. Idempotent: a 'learned' row returns at once, an existing summary
 * is reused, and an output that already has atoms (a caller that extracted
 * directly) is marked learned without a second extraction. Never throws —
 * a failure lands in learning_status='failed' + learning_error.
 */
export async function runLearningForOutput(db: DatabaseAdapter, outputId: string): Promise<LearningRunResult> {
  const row = await db.get<LearningRow>(LEARNING_SQL.load, outputId);
  if (!row) return { outputId, status: 'missing', error: 'output not found' };
  if (row.learning_status === 'learned') return { outputId, status: 'learned', alreadyLearned: true };

  await db.run(LEARNING_SQL.bumpAttempts, outputId);

  try {
    const text = learnableText(row.output_data);
    if (text.trim().length < MIN_LEARNABLE_CHARS) {
      await db.run(LEARNING_SQL.markSkipped, 'too short', outputId);
      return { outputId, status: 'skipped', error: 'too short' };
    }

    // 1. Summary — reused when an earlier pass already produced one.
    if (!row.output_summary) {
      const truncated = text.length > SUMMARY_INPUT_CHARS ? text.slice(0, SUMMARY_INPUT_CHARS) + '...(truncated)' : text;
      // Through provider-router, as background work. This was a raw Anthropic
      // client on the metered key: every open-chat turn logged "Summary
      // generation failed" and no atom was ever learned from a chat.
      const message = await callChat({
        model: await getRoutedUtilityModel(db),
        system: 'You summarise workflow step outputs in one concise sentence (max 20 words). Return only the sentence — no preamble.',
        messages: [{ role: 'user', content: `Summarise this workflow output in one sentence:\n\n${truncated}` }],
        maxTokens: 120,
        background: true,
        purpose: 'memory-summary',
        db,
      });
      const summary = message.text.trim().slice(0, 500);
      await db.run(LEARNING_SQL.markSummarised, summary, outputId);
    }

    // 2. Atoms — unless a direct caller already learned this output.
    let atoms: ExtractAtomsResult | undefined;
    const already = await db.get<{ ok: number }>(LEARNING_SQL.hasAtoms, outputId);
    if (!already) {
      // Lazy import: keeps the extractor (and the embedding stack behind it)
      // out of this module's load graph.
      const { createAtomExtractor } = await import('./atom-extractor.js');
      const extractor = await createAtomExtractor(db);
      atoms = await extractor.extractAtoms(outputId);
    }

    await db.run(LEARNING_SQL.markLearned, outputId);
    return { outputId, status: 'learned', ...(atoms ? { atoms } : {}) };
  } catch (err) {
    const error = errorText(err);
    console.warn(`[output-store] learning failed for ${outputId}: ${error}`);
    try {
      await db.run(LEARNING_SQL.markFailed, error, outputId);
    } catch (writeErr) {
      console.error('[output-store] could not record learning failure for', outputId, writeErr instanceof Error ? writeErr.message : writeErr);
    }
    return { outputId, status: 'failed', error };
  }
}

export interface SweepOptions {
  /** Rows per pass. */
  limit?: number;
  /** Leave the newest rows to the post-run hook; only older ones are retried. */
  olderThanMinutes?: number;
  /** A row that failed this many times is left alone. */
  maxAttempts?: number;
}

export interface SweepResult {
  /** Rows the pass selected. */
  scanned: number;
  learned: number;
  failed: number;
  /** True when the pass stopped early because the engine had no background slot. */
  stopped: boolean;
}

/** True when the message says the subscription engine refused a background slot. */
export function isEngineBusyError(message: string | undefined): boolean {
  return /SDK engine busy/i.test(message ?? '');
}

/**
 * Retry learning for outputs that never finished, oldest first and one at a
 * time. A run refused "SDK engine busy" ends the pass — the slot is taken and
 * every further row would be refused the same way; the next pass retries.
 */
export async function sweepUnlearnedOutputs(db: DatabaseAdapter, opts: SweepOptions = {}): Promise<SweepResult> {
  const limit = opts.limit ?? 10;
  const olderThanMinutes = opts.olderThanMinutes ?? 5;
  const maxAttempts = opts.maxAttempts ?? 5;

  const rows = await db.all<{ id: string }>(LEARNING_SQL.unlearned, maxAttempts, olderThanMinutes, limit);
  const result: SweepResult = { scanned: rows.length, learned: 0, failed: 0, stopped: false };

  for (const row of rows) {
    const run = await runLearningForOutput(db, row.id);
    if (run.status === 'learned') {
      result.learned++;
    } else if (run.status === 'failed') {
      result.failed++;
      if (isEngineBusyError(run.error)) {
        result.stopped = true;
        break;
      }
    }
    // 'skipped' and 'missing' are neither: the row will not be selected again.
  }
  return result;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export async function createOutputStore(db: DatabaseAdapter) {
  // ── Public API ─────────────────────────────────────────────────────────────

  async function storeOutput(params: StoreOutputParams): Promise<string> {
    const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await db.run(`
    INSERT INTO workflow_outputs
      (id, execution_id, workflow_id, step_index, step_type, area_id, module_id, connection_id,
       output_data, created_by, workflow_name, step_name)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
      id,
      params.executionId,
      params.workflowId,
      params.stepIndex,
      params.stepType,
      params.areaId ?? null,
      params.moduleId ?? null,
      params.connectionId ?? null,
      JSON.stringify(params.outputData),
      params.userId,
      params.workflowName,
      params.stepName,
    );

    // Learn after the current tick so the HTTP response is not delayed. The
    // engine slot the run held is released before this queues (claude-sdk-
    // client releases it ahead of onComplete), so the background call is not
    // refused for a slot the caller itself was holding.
    queueLearning(id);

    return id;
  }

  async function storeCheckpointDecision(params: StoreCheckpointDecisionParams): Promise<string> {
    const id = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await db.run(`
    INSERT INTO checkpoint_decisions
      (id, execution_id, workflow_id, step_index, ai_recommendation, ai_confidence,
       human_decision, human_reasoning, is_override, override_category, context_snapshot, decided_by)
    VALUES
      (@id, @execution_id, @workflow_id, @step_index, @ai_recommendation, @ai_confidence,
       @human_decision, @human_reasoning, @is_override, @override_category, @context_snapshot, @decided_by)
  `, {
      id,
      execution_id: params.executionId,
      workflow_id: params.workflowId,
      step_index: params.stepIndex,
      ai_recommendation: params.aiRecommendation ?? null,
      ai_confidence: params.aiConfidence ?? null,
      human_decision: params.humanDecision,
      human_reasoning: params.humanReasoning ?? null,
      is_override: params.isOverride ? 1 : 0,
      override_category: params.overrideCategory ?? null,
      context_snapshot: params.contextSnapshot ? JSON.stringify(params.contextSnapshot) : null,
      decided_by: params.userId,
    });

    return id;
  }

  async function getOutputsForExecution(executionId: string): Promise<WorkflowOutput[]> {
    return await db.all(`
    SELECT * FROM workflow_outputs WHERE execution_id = ? ORDER BY step_index ASC
  `, executionId) as WorkflowOutput[];
  }

  async function getDecisionsForWorkflow(workflowId: string, owner: DecisionOwnerScope, limit = 100): Promise<CheckpointDecision[]> {
    return await db.all(`
    SELECT * FROM checkpoint_decisions WHERE workflow_id = ?${owner.sql} ORDER BY decided_at DESC LIMIT ?
  `, workflowId, ...owner.params, limit) as CheckpointDecision[];
  }

  async function getDecisionDistribution(
    workflowId: string,
    stepIndex: number,
    owner: DecisionOwnerScope,
  ): Promise<Record<string, number>> {
    const rows = await db.all(`
    SELECT human_decision AS decision, COUNT(*) AS count
    FROM checkpoint_decisions
    WHERE workflow_id = ? AND step_index = ?${owner.sql}
    GROUP BY human_decision
    ORDER BY count DESC
  `, workflowId, stepIndex, ...owner.params) as Array<{
      decision: string;
      count: number;
    }>;
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.decision] = row.count;
    }
    return result;
  }

  // ── Background helpers ───────────────────────────────────────────────────

  function queueLearning(outputId: string): void {
    setImmediate(() => {
      // runLearningForOutput records its own failures; this catch is for a
      // broken ledger write, which must not become an unhandled rejection.
      runLearningForOutput(db, outputId).catch((err) => {
        console.error('[output-store] learning pipeline crashed for', outputId, err instanceof Error ? err.message : err);
      });
    });
  }

  return {
    storeOutput,
    storeCheckpointDecision,
    getOutputsForExecution,
    getDecisionsForWorkflow,
    getDecisionDistribution,
    runLearningForOutput: (outputId: string) => runLearningForOutput(db, outputId),
    sweepUnlearnedOutputs: (opts?: SweepOptions) => sweepUnlearnedOutputs(db, opts),
    // Expose for testing
    _queueLearning: queueLearning,
    _getOutputById: async (id: string) => await db.get(`
    SELECT * FROM workflow_outputs WHERE id = ?
  `, id) as WorkflowOutput | undefined,
  };
}

export type OutputStore = ReturnType<typeof createOutputStore>;
