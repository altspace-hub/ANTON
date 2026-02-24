import Database from 'better-sqlite3';
import { getClient } from './claude-client.js';

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── Factory ─────────────────────────────────────────────────────────────────

export function createOutputStore(db: Database.Database) {
  // Prepared statements (created once for performance)
  const insertOutput = db.prepare(`
    INSERT INTO workflow_outputs
      (id, execution_id, workflow_id, step_index, step_type, area_id, module_id, connection_id,
       output_data, created_by, workflow_name, step_name)
    VALUES
      (@id, @execution_id, @workflow_id, @step_index, @step_type, @area_id, @module_id, @connection_id,
       @output_data, @created_by, @workflow_name, @step_name)
  `);

  const updateSummary = db.prepare(`
    UPDATE workflow_outputs SET output_summary = @summary WHERE id = @id
  `);

  const insertDecision = db.prepare(`
    INSERT INTO checkpoint_decisions
      (id, execution_id, workflow_id, step_index, ai_recommendation, ai_confidence,
       human_decision, human_reasoning, is_override, override_category, context_snapshot, decided_by)
    VALUES
      (@id, @execution_id, @workflow_id, @step_index, @ai_recommendation, @ai_confidence,
       @human_decision, @human_reasoning, @is_override, @override_category, @context_snapshot, @decided_by)
  `);

  const selectOutputsByExecution = db.prepare(`
    SELECT * FROM workflow_outputs WHERE execution_id = ? ORDER BY step_index ASC
  `);

  const selectDecisionsByWorkflow = db.prepare(`
    SELECT * FROM checkpoint_decisions WHERE workflow_id = ? ORDER BY decided_at DESC LIMIT ?
  `);

  const selectOutputById = db.prepare(`
    SELECT * FROM workflow_outputs WHERE id = ?
  `);

  const selectDecisionDistribution = db.prepare(`
    SELECT human_decision AS decision, COUNT(*) AS count
    FROM checkpoint_decisions
    WHERE workflow_id = ? AND step_index = ?
    GROUP BY human_decision
    ORDER BY count DESC
  `);

  // ── Public API ─────────────────────────────────────────────────────────────

  function storeOutput(params: StoreOutputParams): string {
    const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    insertOutput.run({
      id,
      execution_id: params.executionId,
      workflow_id: params.workflowId,
      step_index: params.stepIndex,
      step_type: params.stepType,
      area_id: params.areaId ?? null,
      module_id: params.moduleId ?? null,
      connection_id: params.connectionId ?? null,
      output_data: JSON.stringify(params.outputData),
      created_by: params.userId,
      workflow_name: params.workflowName,
      step_name: params.stepName,
    });

    // Queue background summary generation — do not block the caller
    queueSummaryGeneration(id, params.outputData);

    return id;
  }

  function storeCheckpointDecision(params: StoreCheckpointDecisionParams): string {
    const id = `dec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    insertDecision.run({
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

  function getOutputsForExecution(executionId: string): WorkflowOutput[] {
    return selectOutputsByExecution.all(executionId) as WorkflowOutput[];
  }

  function getDecisionsForWorkflow(workflowId: string, limit = 100): CheckpointDecision[] {
    return selectDecisionsByWorkflow.all(workflowId, limit) as CheckpointDecision[];
  }

  function getDecisionDistribution(
    workflowId: string,
    stepIndex: number
  ): Record<string, number> {
    const rows = selectDecisionDistribution.all(workflowId, stepIndex) as Array<{
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

  function queueSummaryGeneration(outputId: string, outputData: unknown): void {
    // Run after current event-loop tick so the HTTP response is not delayed
    setImmediate(async () => {
      try {
        const client = getClient();

        // Truncate large payloads to avoid excessive token usage
        const dataStr = JSON.stringify(outputData);
        const truncated = dataStr.length > 4000 ? dataStr.slice(0, 4000) + '...(truncated)' : dataStr;

        const message = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 120,
          system: 'You summarise workflow step outputs in one concise sentence (max 20 words). Return only the sentence — no preamble.',
          messages: [
            {
              role: 'user',
              content: `Summarise this workflow output in one sentence:\n\n${truncated}`,
            },
          ],
        });

        // Extract text from the response
        let summary = '';
        for (const block of message.content) {
          if (block.type === 'text') summary += block.text;
        }
        summary = summary.trim().slice(0, 500);

        updateSummary.run({ id: outputId, summary });

        // Trigger atom extraction once summary is stored
        await triggerAtomExtraction(outputId);
      } catch (err) {
        // Background failure — log but do not propagate
        console.error('[output-store] Summary generation failed for', outputId, err);
      }
    });
  }

  async function triggerAtomExtraction(outputId: string): Promise<void> {
    try {
      // Lazy-import to avoid circular dependency: atom-extractor imports output-store
      const { createAtomExtractor } = await import('./atom-extractor.js');
      const extractor = createAtomExtractor(db, getClient());
      await extractor.extractAtoms(outputId);
    } catch (err) {
      console.error('[output-store] Atom extraction failed for', outputId, err);
    }
  }

  return {
    storeOutput,
    storeCheckpointDecision,
    getOutputsForExecution,
    getDecisionsForWorkflow,
    getDecisionDistribution,
    // Expose for testing
    _queueSummaryGeneration: queueSummaryGeneration,
    _getOutputById: (id: string) => selectOutputById.get(id) as WorkflowOutput | undefined,
  };
}

export type OutputStore = ReturnType<typeof createOutputStore>;
