// ── Missions — Model Strategy Resolver (Wave-2 2A.4 / parity M8) ───────────
// Honours the mission's stored `model_strategy` instead of hardcoding Claude
// tiers. A Groq/Ollama/compat user can now run a whole mission on their
// chosen models by setting planning/execution/utility_model on the mission.
//
// Resolution order per tier:
//   1. strategy.<tier>_model when set, not 'auto', and resolvable
//      (exact MODEL_REGISTRY id OR a dynamic ollama:/compat:/azure: id that
//      can't be statically enumerated).
//   2. provider_preference='anthropic' (+ key present) pins the Claude tier
//      default without remapping.
//   3. mapModelToProvider(<Claude tier default>) — the established pattern:
//      routes the tier default to whichever provider is configured.

import { mapModelToProvider } from '../provider-router.js';
import { getProviderFromModelId } from '../model-adapter.js';
import { MODEL_REGISTRY } from '../../types/modelAdapter.js';
import type { ModelStrategy, ModelStrategyTier } from './types.js';

const CLAUDE_TIER_DEFAULTS: Record<ModelStrategyTier, string> = {
  planning: 'claude-opus-4-8',
  execution: 'claude-sonnet-4-6',
  utility: 'claude-haiku-4-5-20251001',
};

/**
 * A model id is resolvable when it is a known registry entry, or uses one of
 * the dynamic prefixes whose concrete models live in the DB / a remote
 * endpoint and therefore can't be validated statically. Anything else
 * (e.g. a typo'd 'claude-bananas') is rejected so the tier default applies.
 */
export function isResolvableModelId(modelId: string): boolean {
  if (MODEL_REGISTRY[modelId]) return true;
  return modelId.startsWith('ollama:') || modelId.startsWith('compat:') || modelId.startsWith('azure:');
}

/**
 * Resolve the concrete model for a mission tier, honouring model_strategy.
 * `defaultModel` overrides the built-in Claude tier default (used by
 * decomposition, which historically plans on Sonnet rather than Opus).
 */
export function resolveMissionModel(
  tier: ModelStrategyTier,
  strategy?: Partial<ModelStrategy> | null,
  defaultModel?: string,
): string {
  const requested =
    tier === 'planning' ? strategy?.planning_model
    : tier === 'utility' ? strategy?.utility_model
    : strategy?.execution_model;

  if (requested && requested !== 'auto' && isResolvableModelId(requested)) {
    return requested;
  }

  const tierDefault = defaultModel ?? CLAUDE_TIER_DEFAULTS[tier];
  // Explicit Anthropic preference pins the Claude default (no remap) as long
  // as a key exists; otherwise defer to the configured-provider mapping.
  if (strategy?.provider_preference === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return tierDefault;
  }
  return mapModelToProvider(tierDefault);
}

/**
 * Provider slug for a resolved model id — recorded on task/decision rows so
 * the activity log shows the real provider instead of hardcoded 'anthropic'.
 * Falls back to 'anthropic' for ids the static map can't classify (mirrors
 * provider-router's own catch behaviour).
 */
export function providerForModel(modelId: string): string {
  try { return getProviderFromModelId(modelId); } catch { return 'anthropic'; }
}
