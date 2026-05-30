/**
 * model-router.ts
 *
 * Model Auto-Routing Service
 *
 * Purpose: Recommend the optimal Claude model for a given task based on
 * output formats, thinking level, module, and area context.
 */

// ── Types ────────────────────────────────────────────────────

export interface ModelAlternative {
  model: string;
  estimatedCostMultiplier: number;
  qualityEstimate: 'excellent' | 'good' | 'adequate';
  reason: string;
}

export interface ModelRecommendation {
  recommended: string;
  reason: string;
  alternatives: ModelAlternative[];
}

// ── Model definitions ────────────────────────────────────────

const ALL_MODELS = {
  OPUS: 'claude-opus-4-8',
  SONNET: 'claude-sonnet-4-5-20250929',
  HAIKU: 'claude-haiku-4-5-20251001',
} as const;

type ModelValue = (typeof ALL_MODELS)[keyof typeof ALL_MODELS];

// Relative cost multipliers (Sonnet = 1.0 baseline)
const COST_RELATIVE: Record<ModelValue, number> = {
  'claude-opus-4-8': 5.0,
  'claude-sonnet-4-5-20250929': 1.0,
  'claude-haiku-4-5-20251001': 0.15,
};

// Output formats that require Opus-level reasoning
const OPUS_OUTPUT_FORMATS = new Set([
  'executive-summary',
  'regulatory-comparison',
  'detailed-findings',
  'risk-appetite-statement',
  'decision-memo',
  'maturity-assessment',
  'impact-assessment',
]);

// Output formats well-served by Sonnet
const SONNET_OUTPUT_FORMATS = new Set([
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

// Output formats appropriate for Haiku
const HAIKU_OUTPUT_FORMATS = new Set([
  'quick-briefing',
  'problem-solution',
  'compliance-calendar',
]);

// ── Recommendation logic ─────────────────────────────────────

function buildAlternatives(
  recommended: ModelValue
): ModelAlternative[] {
  const others = (Object.values(ALL_MODELS) as ModelValue[]).filter(
    (m) => m !== recommended
  );

  const qualityMap: Record<ModelValue, 'excellent' | 'good' | 'adequate'> = {
    'claude-opus-4-8': 'excellent',
    'claude-sonnet-4-5-20250929': 'good',
    'claude-haiku-4-5-20251001': 'adequate',
  };

  const reasonMap: Record<ModelValue, string> = {
    'claude-opus-4-8':
      'Maximum reasoning depth — best for board-level and regulatory deliverables',
    'claude-sonnet-4-5-20250929':
      'Strong quality at lower cost — suitable for most professional drafting',
    'claude-haiku-4-5-20251001':
      'Fastest and cheapest — good for summaries and simple tasks',
  };

  return others.map((model) => ({
    model,
    estimatedCostMultiplier:
      COST_RELATIVE[model] / COST_RELATIVE[recommended],
    qualityEstimate: qualityMap[model],
    reason: reasonMap[model],
  }));
}

export function recommendModel(params: {
  moduleId?: string;
  thinkingLevel?: string;
  outputFormats?: string[];
  areaId?: string;
}): ModelRecommendation {
  const { thinkingLevel, outputFormats = [] } = params;

  // Rule 1: Thinking level overrides everything
  if (thinkingLevel === 'investigate' || thinkingLevel === 'plan_first') {
    return {
      recommended: ALL_MODELS.OPUS,
      reason: 'Deep investigation requires maximum reasoning capability',
      alternatives: buildAlternatives(ALL_MODELS.OPUS),
    };
  }

  if (thinkingLevel === 'quick') {
    return {
      recommended: ALL_MODELS.HAIKU,
      reason: 'Quick responses are fast and efficient with Haiku',
      alternatives: buildAlternatives(ALL_MODELS.HAIKU),
    };
  }

  // Rule 2: Output format — Opus triggers
  const needsOpus = outputFormats.some((f) => OPUS_OUTPUT_FORMATS.has(f));
  if (needsOpus) {
    return {
      recommended: ALL_MODELS.OPUS,
      reason:
        'Complex regulatory analysis requires deepest reasoning',
      alternatives: buildAlternatives(ALL_MODELS.OPUS),
    };
  }

  // Rule 3: Output format — Haiku triggers (only if exclusively Haiku formats)
  const allHaiku =
    outputFormats.length > 0 &&
    outputFormats.every((f) => HAIKU_OUTPUT_FORMATS.has(f));
  if (allHaiku) {
    return {
      recommended: ALL_MODELS.HAIKU,
      reason: 'Fast and efficient for summaries',
      alternatives: buildAlternatives(ALL_MODELS.HAIKU),
    };
  }

  // Rule 4: Output format — Sonnet triggers
  const needsSonnet = outputFormats.some((f) => SONNET_OUTPUT_FORMATS.has(f));
  if (needsSonnet) {
    return {
      recommended: ALL_MODELS.SONNET,
      reason:
        'Professional drafting — good balance of quality and cost',
      alternatives: buildAlternatives(ALL_MODELS.SONNET),
    };
  }

  // Default: Sonnet
  return {
    recommended: ALL_MODELS.SONNET,
    reason: 'Professional drafting — good balance of quality and cost',
    alternatives: buildAlternatives(ALL_MODELS.SONNET),
  };
}
