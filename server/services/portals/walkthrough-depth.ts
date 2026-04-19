/**
 * walkthrough-depth.ts — replacement for the missing `getPromptTier()`.
 *
 * The Spec v0.1 referenced `getPromptTier()` 3 times as the model-aware-depth
 * mechanism for the portal walkthrough. The function does not exist in the
 * codebase (per investigation note §E.2). v0.2 of the Spec adds this small
 * helper instead: maps MODEL_CAPABILITIES + AntonThinkingLevel to one of
 * three depth buckets that the walkthrough engine consults to pick prompt
 * elaboration, branch count, and persona panel size.
 *
 * Three buckets:
 *
 *   simple   — small models, short branches, single-persona prompts
 *              (Haiku 4.5, Ollama local models, or `quick` thinking level)
 *
 *   standard — mid-tier models with `think` thinking level
 *              (Sonnet 4.6 default; Opus 4.7 with `quick`)
 *
 *   deep     — Opus 4.7 + `think_hard` or higher; full multi-persona panel
 *              and thorough phase recap on every transition
 */

import {
  MODEL_CAPABILITIES,
  type AntonThinkingLevel,
  type ModelCapabilities,
} from '../../config/model-capabilities.js';

export type WalkthroughDepth = 'simple' | 'standard' | 'deep';

/**
 * Determine walkthrough depth for a (model, thinking-level) pair.
 *
 * Heuristic:
 *   - `quick` thinking always yields 'simple' (the user opted out of depth).
 *   - context window <= 200k → 'simple' (Haiku, most local Ollama).
 *   - thinking level >= `think_hard` AND context window >= 500k → 'deep'.
 *   - everything else → 'standard'.
 */
export function getWalkthroughDepth(
  modelId: string,
  thinkingLevel: AntonThinkingLevel = 'think',
): WalkthroughDepth {
  if (thinkingLevel === 'quick') return 'simple';

  const caps: ModelCapabilities | undefined = MODEL_CAPABILITIES[modelId];
  // Unknown model → conservative default.
  if (!caps) return 'standard';

  if (caps.maxContextWindow <= 200_000) return 'simple';

  const isHighThinking =
    thinkingLevel === 'think_hard' ||
    thinkingLevel === 'investigate' ||
    thinkingLevel === 'plan_first' ||
    thinkingLevel === 'deep_investigate';

  if (isHighThinking && caps.maxContextWindow >= 500_000) return 'deep';

  return 'standard';
}

/**
 * Recommended max LLM output tokens per phase given the depth bucket.
 * The walkthrough engine uses this to bound LLM responses so phase recaps
 * stay digestible.
 */
export function maxPhaseOutputTokens(depth: WalkthroughDepth): number {
  switch (depth) {
    case 'simple':
      return 1024;
    case 'standard':
      return 4096;
    case 'deep':
      return 16_384;
  }
}

/**
 * How many expert personas the engine should consult during the Review phase.
 * Higher depth = wider panel.
 */
export function reviewPanelSize(depth: WalkthroughDepth): number {
  switch (depth) {
    case 'simple':
      return 1;
    case 'standard':
      return 2;
    case 'deep':
      return 4;
  }
}
