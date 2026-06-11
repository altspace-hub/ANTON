/**
 * run-cost.ts — honest per-call cost for a module run (Finding #1).
 *
 * The global monthly budget cap is ENFORCED as SUM(messages.cost), and analytics
 * read the same column. Before this, unknown-provider runs (ollama:/azure:/compat:)
 * had no modelConfig, so the cost defaulted to Opus pricing ($15/$75 per 1M) and
 * billed phantom dollars into that enforced cap. The honest convention (mirroring
 * engagement-session-bridge.ts):
 *
 *   - known model (in MODEL_REGISTRY)  → real cache-adjusted cost
 *   - ollama: (local, free)            → 0
 *   - other unknowns (azure:/compat:)  → NULL  ("we don't know" — excluded by SUM,
 *                                         so it neither trips the cap nor pollutes
 *                                         analytics totals)
 */

export interface RunCostInput {
  /** True when the model has registry pricing (modelConfig was resolved). */
  hasKnownPricing: boolean;
  /** True when the model is an ollama: local model (free → 0, not NULL). */
  isOllama: boolean;
  /** Per-1M-token input price (0 when pricing unknown — only used when known). */
  costPer1MInput: number;
  /** Per-1M-token output price. */
  costPer1MOutput: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/**
 * Returns the per-call USD cost, or null when the provider's pricing is unknown
 * and the model is not free (so the row carries NULL cost, excluded from SUM()).
 * Cache reads bill at ~10% of input; cache writes at ~125% of input.
 */
export function computeRunCostUsd(input: RunCostInput): number | null {
  if (!input.hasKnownPricing && !input.isOllama) return null;

  const cacheRead = input.cacheReadTokens ?? 0;
  const cacheCreate = input.cacheCreationTokens ?? 0;
  const billableInput = Math.max(0, (input.inputTokens || 0) - cacheRead - cacheCreate);

  return (
    billableInput * input.costPer1MInput +
    cacheRead * (input.costPer1MInput * 0.10) +
    cacheCreate * (input.costPer1MInput * 1.25) +
    (input.outputTokens || 0) * input.costPer1MOutput
  ) / 1_000_000;
}
