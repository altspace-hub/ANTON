/**
 * model-router.ts
 *
 * Model Auto-Routing Service (Wave 3.7 — provider-aware)
 *
 * Purpose: recommend the optimal model for a given task based on output
 * formats, thinking level, module, and area context — for the provider the
 * user actually runs on.
 *
 * Tiers (small / medium / large) are DERIVED from the real registries:
 *   - server/types/modelAdapter.ts MODEL_REGISTRY (costTier + live pricing,
 *     itself a projection of server/config/model-capabilities.ts)
 *   - server/services/provider-router.ts TIER_MAP (the canonical per-provider
 *     tier choice, validated against the registry)
 * Costs come from registry pricing — no hardcoded multipliers.
 *
 * The provider is resolved from the user's configured default model
 * (default-model-store: Settings choice → env DEFAULT_MODEL), so a Mistral
 * user gets small/medium/large Mistral recommendations, an Ollama/compat user
 * gets their local model, and Claude users get Haiku/Sonnet/Opus.
 */

import { MODEL_REGISTRY, type ModelConfig } from '../types/modelAdapter.js';
import { TIER_MAP, type ModelTier } from './provider-router.js';
import { getEffectiveDefaultModel } from './default-model-store.js';

// ── Types ────────────────────────────────────────────────────

export interface ModelPricing {
  /** USD per 1M input tokens (0 for local models) */
  inputPer1M: number;
  /** USD per 1M output tokens (0 for local models) */
  outputPer1M: number;
}

export interface ModelAlternative {
  model: string;
  displayName: string;
  estimatedCostMultiplier: number;
  qualityEstimate: 'excellent' | 'good' | 'adequate';
  reason: string;
  pricing: ModelPricing;
}

export interface ModelRecommendation {
  recommended: string;
  displayName: string;
  provider: string;
  tier: ModelTier;
  reason: string;
  pricing: ModelPricing;
  alternatives: ModelAlternative[];
}

// ── Task-shaped tier rules (unchanged inputs) ─────────────────

// Output formats that require large-tier reasoning
const LARGE_OUTPUT_FORMATS = new Set([
  'executive-summary',
  'regulatory-comparison',
  'detailed-findings',
  'risk-appetite-statement',
  'decision-memo',
  'maturity-assessment',
  'impact-assessment',
]);

// Output formats well-served by the medium tier
const MEDIUM_OUTPUT_FORMATS = new Set([
  'action-plan',
  'policy-document',
  'mitigation-plan',
  'project-plan',
  'raci-matrix',
  'gap-scoring-matrix',
  'monitoring-plan',
  'budget-resource-estimate',
  'data-readiness-scorecard',
  'client-proposal',
  'stakeholder-presentation',
  'training-material',
]);

// Output formats appropriate for the small tier
const SMALL_OUTPUT_FORMATS = new Set([
  'quick-briefing',
  'problem-solution',
  'compliance-calendar',
]);

interface TierDecision {
  tier: ModelTier;
  reason: string;
}

/** Decide the task-shaped tier from thinking level + output formats. Pure. */
export function decideTier(params: {
  thinkingLevel?: string;
  outputFormats?: string[];
}): TierDecision {
  const { thinkingLevel, outputFormats = [] } = params;

  // Rule 1: Thinking level overrides everything
  if (thinkingLevel === 'investigate' || thinkingLevel === 'plan_first') {
    return { tier: 'large', reason: 'Deep investigation requires maximum reasoning capability' };
  }
  if (thinkingLevel === 'quick') {
    return { tier: 'small', reason: 'Quick responses are fast and efficient on the small tier' };
  }

  // Rule 2: Output format — large triggers
  if (outputFormats.some((f) => LARGE_OUTPUT_FORMATS.has(f))) {
    return { tier: 'large', reason: 'Complex regulatory analysis requires deepest reasoning' };
  }

  // Rule 3: Output format — small triggers (only if exclusively small formats)
  if (outputFormats.length > 0 && outputFormats.every((f) => SMALL_OUTPUT_FORMATS.has(f))) {
    return { tier: 'small', reason: 'Fast and efficient for summaries' };
  }

  // Rule 4 + default: medium
  void MEDIUM_OUTPUT_FORMATS; // medium formats and the default share the medium tier
  return { tier: 'medium', reason: 'Professional drafting — good balance of quality and cost' };
}

// ── Registry-derived tier models per provider ─────────────────

const TIER_TO_COST_TIER: Record<ModelTier, 1 | 2 | 3> = { small: 1, medium: 2, large: 3 };
const COST_TIER_QUALITY: Record<1 | 2 | 3, 'adequate' | 'good' | 'excellent'> = {
  1: 'adequate',
  2: 'good',
  3: 'excellent',
};

/**
 * Blended per-1M-token cost for ranking. Module runs are prompt-heavy
 * (knowledge sources + system prompt dominate; output is 4–8k tokens), so
 * input is weighted 3:1 over output. Used only for honest relative
 * multipliers — raw registry prices are returned alongside.
 */
export function blendedCostPer1M(pricing: ModelPricing): number {
  return pricing.inputPer1M * 0.75 + pricing.outputPer1M * 0.25;
}

/**
 * Derive the tier→model mapping for a provider from MODEL_REGISTRY costTier.
 * The canonical TIER_MAP entry is preferred when it exists in the registry at
 * the right tier (it encodes "current generation"); otherwise the cheapest
 * registry model at that tier wins. Returns only tiers the provider has.
 */
export function deriveTierModels(provider: string): Partial<Record<ModelTier, ModelConfig>> {
  const result: Partial<Record<ModelTier, ModelConfig>> = {};
  const providerModels = Object.values(MODEL_REGISTRY).filter((m) => m.provider === provider);

  for (const tier of ['small', 'medium', 'large'] as ModelTier[]) {
    const costTier = TIER_TO_COST_TIER[tier];
    const candidates = providerModels.filter((m) => m.costTier === costTier);
    if (candidates.length === 0) continue;

    const canonical = TIER_MAP[provider]?.[tier];
    const canonicalEntry = candidates.find((m) => m.modelId === canonical);
    if (canonicalEntry) {
      result[tier] = canonicalEntry;
    } else {
      result[tier] = [...candidates].sort(
        (a, b) =>
          blendedCostPer1M({ inputPer1M: a.costPer1MInput, outputPer1M: a.costPer1MOutput }) -
          blendedCostPer1M({ inputPer1M: b.costPer1MInput, outputPer1M: b.costPer1MOutput })
      )[0];
    }
  }
  return result;
}

const TIER_REASONS: Record<ModelTier, string> = {
  large: 'Maximum reasoning depth — best for board-level and regulatory deliverables',
  medium: 'Strong quality at lower cost — suitable for most professional drafting',
  small: 'Fastest and cheapest — good for summaries and simple tasks',
};

function pricingOf(m: ModelConfig): ModelPricing {
  return { inputPer1M: m.costPer1MInput, outputPer1M: m.costPer1MOutput };
}

// ── Recommendation logic ─────────────────────────────────────

export interface RecommendModelParams {
  moduleId?: string;
  thinkingLevel?: string;
  outputFormats?: string[];
  areaId?: string;
  /**
   * The user's configured default model (Settings → env DEFAULT_MODEL).
   * Injectable for tests; the route passes getEffectiveDefaultModel().
   * Determines the provider whose tiers are recommended.
   */
  defaultModel?: string;
}

export function recommendModel(params: RecommendModelParams): ModelRecommendation {
  const decision = decideTier(params);
  const defaultModel = params.defaultModel ?? getEffectiveDefaultModel();

  // Local / per-endpoint models (ollama:*, compat:*): no static tiers — the
  // honest recommendation is the user's own local model at zero token cost.
  if (defaultModel && (defaultModel.startsWith('ollama:') || defaultModel.startsWith('compat:'))) {
    const isOllama = defaultModel.startsWith('ollama:');
    return {
      recommended: defaultModel,
      displayName: defaultModel,
      provider: isOllama ? 'ollama' : 'openai_compatible',
      tier: decision.tier,
      reason: isOllama
        ? 'Local model — runs on your hardware at no per-token cost'
        : 'Your configured budget endpoint — pricing set by the endpoint provider',
      pricing: { inputPer1M: 0, outputPer1M: 0 },
      alternatives: [],
    };
  }

  // Resolve the provider from the registry; unknown defaults (azure:*, custom
  // slots) fall back honestly to "use your configured default" with no tiers.
  const defaultEntry = defaultModel ? MODEL_REGISTRY[defaultModel] : undefined;
  if (defaultModel && !defaultEntry) {
    return {
      recommended: defaultModel,
      displayName: defaultModel,
      provider: 'unknown',
      tier: decision.tier,
      reason: 'Your configured default model (not in the static registry — no tier data available)',
      pricing: { inputPer1M: 0, outputPer1M: 0 },
      alternatives: [],
    };
  }

  const provider = defaultEntry?.provider ?? 'anthropic';
  const tierModels = deriveTierModels(provider);

  // Pick the decided tier; degrade to the nearest available tier if the
  // provider lacks one (registry-driven, so this is provider-shape-proof).
  const fallbackOrder: Record<ModelTier, ModelTier[]> = {
    large: ['large', 'medium', 'small'],
    medium: ['medium', 'large', 'small'],
    small: ['small', 'medium', 'large'],
  };
  let chosenTier: ModelTier = decision.tier;
  let chosen: ModelConfig | undefined;
  for (const t of fallbackOrder[decision.tier]) {
    if (tierModels[t]) { chosenTier = t; chosen = tierModels[t]; break; }
  }

  if (!chosen) {
    // Registry has no models for this provider at all — should not happen.
    return {
      recommended: defaultModel ?? 'claude-sonnet-4-6',
      displayName: defaultModel ?? 'Claude Sonnet 4.6',
      provider,
      tier: decision.tier,
      reason: decision.reason,
      pricing: { inputPer1M: 0, outputPer1M: 0 },
      alternatives: [],
    };
  }

  const chosenBlended = blendedCostPer1M(pricingOf(chosen));
  const alternatives: ModelAlternative[] = (['small', 'medium', 'large'] as ModelTier[])
    .filter((t) => t !== chosenTier && tierModels[t])
    .map((t) => {
      const alt = tierModels[t]!;
      const altBlended = blendedCostPer1M(pricingOf(alt));
      return {
        model: alt.modelId,
        displayName: alt.displayName,
        estimatedCostMultiplier: chosenBlended > 0 ? altBlended / chosenBlended : 1,
        qualityEstimate: COST_TIER_QUALITY[alt.costTier],
        reason: TIER_REASONS[t],
        pricing: pricingOf(alt),
      };
    });

  return {
    recommended: chosen.modelId,
    displayName: chosen.displayName,
    provider,
    tier: chosenTier,
    reason: decision.reason,
    pricing: pricingOf(chosen),
    alternatives,
  };
}
