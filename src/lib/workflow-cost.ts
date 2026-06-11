/**
 * workflow-cost.ts — rough pre-run cost estimate for interactive workflows
 * (Wave 4.5). Same approach as the Open Chat pre-send estimate
 * (PromptPage.tsx "Pre-run cost estimate"): a ~4-chars-per-token heuristic on
 * the known prompt text plus a flat assumed output size, priced from the
 * client-side MODELS registry.
 *
 * This is an ESTIMATE, not a quote: actual cost depends on user input size,
 * carried context, thinking tokens, and real response length. Surfaces that
 * show it must label it as approximate.
 */

import { MODELS } from '@/lib/constants';
import type { WorkflowStep } from '@/lib/workflow-definitions';

/** Fixed overheads for the heuristic (tokens). */
const SYSTEM_PROMPT_OVERHEAD_TOKENS = 1500;   // system prompt + formatting instructions
const CARRIED_CONTEXT_TOKENS = 2000;          // previous step outputs fed forward
const DEFAULT_OUTPUT_TOKENS = 4000;           // assumed response size
const OPUS_OUTPUT_TOKENS = 8000;              // Opus tends to be asked for long-form

// Unknown model → Sonnet 4.6 pricing (non-zero fallback, matches the server's
// token-estimator convention).
const FALLBACK_PRICING = { input: 3, output: 15 };

export interface WorkflowCostEstimate {
  /** Total estimated USD across all AI (claude/llm) steps. */
  totalUsd: number;
  /** Number of AI steps included in the estimate. */
  aiStepCount: number;
  /** Per-step breakdown (stepId → { model, usd }). */
  perStep: Array<{ stepId: string; label: string; model: string; usd: number }>;
}

function pricingFor(modelId: string): { input: number; output: number } {
  const info = MODELS.find((m) => m.id === modelId);
  if (!info) return FALLBACK_PRICING;
  return { input: info.inputCostPer1M, output: info.outputCostPer1M };
}

/**
 * Estimate the cost of running all AI steps of a workflow.
 * Per-step `config.model` is honored; steps without one use `defaultModelId`
 * (the session/global model).
 */
export function estimateWorkflowCost(
  steps: WorkflowStep[],
  defaultModelId: string
): WorkflowCostEstimate {
  const perStep: WorkflowCostEstimate['perStep'] = [];
  let totalUsd = 0;
  let aiStepIndex = 0;

  for (const step of steps) {
    if (step.type !== 'claude' && step.type !== 'llm') continue;

    const model = (step.config.model || '').trim() || defaultModelId;
    const promptChars = (step.config.promptTemplate || '').length + (step.description || '').length;
    const inputTokens =
      Math.ceil(promptChars / 4) +
      SYSTEM_PROMPT_OVERHEAD_TOKENS +
      (aiStepIndex > 0 ? CARRIED_CONTEXT_TOKENS : 0);
    const outputTokens = model.startsWith('claude-opus') || model.startsWith('claude-fable')
      ? OPUS_OUTPUT_TOKENS
      : DEFAULT_OUTPUT_TOKENS;

    const { input, output } = pricingFor(model);
    const usd = (inputTokens / 1_000_000) * input + (outputTokens / 1_000_000) * output;

    perStep.push({ stepId: step.id, label: step.label, model, usd });
    totalUsd += usd;
    aiStepIndex++;
  }

  return { totalUsd, aiStepCount: perStep.length, perStep };
}

/** "<$0.01" / "~$0.12" / "~$1.3" display formatting (Open Chat convention). */
export function formatCostEstimate(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `~$${usd.toFixed(2)}`;
  return `~$${usd.toFixed(1)}`;
}
