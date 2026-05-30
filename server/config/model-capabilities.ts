/**
 * Model Capabilities Registry
 *
 * Single source of truth for context window sizes, output limits,
 * pricing, and feature support per model.
 *
 * Updated 2026-05-30:
 *   - Opus upgraded 4.7 → 4.8 as the new default (legacy 4.7 + 4.6 kept selectable).
 *   - Haiku 4.5 pricing corrected $0.80/$4 → $1/$5 per current Anthropic docs.
 *   - Mistral aliases auto-resolve server-side: mistral-medium-latest now points
 *     at Medium 3.5 (v26.04); mistral-small-latest at Small 4 (v26.03).
 *   - Added Codestral + Devstral 2 (code specialists).
 *
 * Opus 4.8: 1M context, 128k output, adaptive thinking only (effort defaults to high).
 * Opus 4.7: 1M context, 128k output, adaptive only.
 * Opus 4.6: 1M context, 128k output, supports BOTH adaptive + extended thinking.
 * Sonnet 4.6: 1M context, 64k output, adaptive + extended.
 * Haiku 4.5: 200k context (unchanged).
 */

// ── Types ───────────────────────────────────────────────────────────

export interface ModelCapabilities {
  /** Maximum context window (input + output) in tokens */
  maxContextWindow: number;
  /** Maximum output tokens per response */
  maxOutputTokens: number;
  /** Whether 1M context requires a beta header */
  requires1MBetaHeader: boolean;
  /** Beta header string, if required */
  betaHeader1M?: string;
  /** Whether this model supports context compaction (compact-2026-01-12 beta) */
  supportsCompaction: boolean;
  /** Whether this model supports adaptive thinking (effort param) */
  supportsAdaptiveThinking: boolean;
  /** Whether this model supports extended thinking (budget_tokens) */
  supportsExtendedThinking: boolean;
  /** Pricing per million tokens in USD */
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cachedInputPerMillion: number;
    /** Premium pricing applied above this token threshold (null = no premium) */
    premiumThreshold: number | null;
    /** Multiplier for input above premium threshold */
    premiumInputMultiplier: number;
    /** Multiplier for output above premium threshold */
    premiumOutputMultiplier: number;
  };
  /** Provider identifier */
  provider: 'anthropic' | 'openai' | 'google' | 'mistral' | 'ollama';
}

export interface ThinkingConfig {
  /** API thinking type */
  thinkingType: 'adaptive' | 'enabled' | 'none';
  /** For adaptive: the effort level */
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** For enabled (manual): the budget_tokens value */
  budgetTokens?: number;
  /** The max_tokens to set on the API request (thinking + response) */
  maxTokens: number;
  /** Whether interleaved thinking beta header is needed */
  requiresInterleavedThinkingBeta: boolean;
}

// ANTON thinking level type
export type AntonThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

// ── Model Registry ──────────────────────────────────────────────────

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // ─── Anthropic Claude ──────────────────────────────────────────
  'claude-opus-4-8': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    requires1MBetaHeader: false,
    supportsCompaction: true,
    supportsAdaptiveThinking: true,
    supportsExtendedThinking: false,   // Adaptive only (budget_tokens unsupported)
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cachedInputPerMillion: 0.50,     // 90% discount
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'anthropic',
  },

  'claude-opus-4-7': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    requires1MBetaHeader: false,
    supportsCompaction: true,
    supportsAdaptiveThinking: true,
    supportsExtendedThinking: false,   // Opus 4.7 uses adaptive only (budget_tokens DEPRECATED)
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cachedInputPerMillion: 0.50,     // 90% discount
      premiumThreshold: null,          // No premium — flat rate across 1M
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'anthropic',
  },

  'claude-opus-4-6': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    requires1MBetaHeader: false,
    supportsCompaction: true,
    supportsAdaptiveThinking: true,
    supportsExtendedThinking: true,    // 4.6 uniquely supports BOTH thinking modes
    pricing: {
      inputPerMillion: 5,
      outputPerMillion: 25,
      cachedInputPerMillion: 0.50,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'anthropic',
  },

  'claude-sonnet-4-6': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    requires1MBetaHeader: false,       // GA as of 2026-03-13
    supportsCompaction: true,
    supportsAdaptiveThinking: true,    // Supports both adaptive and manual extended thinking
    supportsExtendedThinking: true,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
      cachedInputPerMillion: 0.30,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'anthropic',
  },

  'claude-sonnet-4-5-20250929': {
    maxContextWindow: 1_000_000,       // Available but requires beta header + premium pricing
    maxOutputTokens: 64_000,
    requires1MBetaHeader: true,
    betaHeader1M: 'context-1m-2025-08-07',
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: true,
    pricing: {
      inputPerMillion: 3,
      outputPerMillion: 15,
      cachedInputPerMillion: 0.30,
      premiumThreshold: 200_000,       // 2x input above 200k
      premiumInputMultiplier: 2,
      premiumOutputMultiplier: 1.5,
    },
    provider: 'anthropic',
  },

  'claude-haiku-4-5-20251001': {
    maxContextWindow: 200_000,
    maxOutputTokens: 8_192,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: true,
    pricing: {
      // Corrected 2026-05-30 to match current Anthropic docs. Previous
      // $0.80/$4 was from an early-access tier.
      inputPerMillion: 1,
      outputPerMillion: 5,
      cachedInputPerMillion: 0.10,     // 90% discount tracks the new base price
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'anthropic',
  },

  // ─── OpenAI ────────────────────────────────────────────────────
  'gpt-4.1': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 8,
      cachedInputPerMillion: 0.50,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'openai',
  },

  'gpt-4o': {
    maxContextWindow: 128_000,
    maxOutputTokens: 16_384,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 2.5,
      outputPerMillion: 10,
      cachedInputPerMillion: 1.25,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'openai',
  },

  'gpt-4o-mini': {
    maxContextWindow: 128_000,
    maxOutputTokens: 16_384,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.15,
      outputPerMillion: 0.6,
      cachedInputPerMillion: 0.075,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'openai',
  },

  // ─── Google ────────────────────────────────────────────────────
  'gemini-2.5-pro': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 1.25,
      outputPerMillion: 10,
      cachedInputPerMillion: 0.31,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'google',
  },

  'gemini-2.5-flash': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.30,
      outputPerMillion: 2.5,
      cachedInputPerMillion: 0.075,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'google',
  },

  'gemini-2.0-flash': {
    maxContextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.10,
      outputPerMillion: 0.40,
      cachedInputPerMillion: 0.025,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'google',
  },

  // ─── Mistral (verified from docs.mistral.ai 2026-05-30) ────────
  // The `-latest` aliases auto-resolve to the newest versions server-side,
  // so callers don't need to update model IDs when Mistral ships a new
  // minor release.

  // Mistral Large 3 (v25.12, Dec 2025) — 675B total / 41B active (MoE)
  'mistral-large-latest': {
    maxContextWindow: 256_000,
    maxOutputTokens: 128_000,          // Match Opus tier — API accepts user-set maxTokens
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.50,
      outputPerMillion: 1.50,
      cachedInputPerMillion: 0.50,     // No cache discount (Mistral doesn't support caching)
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'mistral',
  },

  // Mistral Medium 3.5 (v26.04, Apr 2026) — Premier multimodal optimised
  // for agentic + coding use cases. Replaces 3.1 (Aug 2025) under the same
  // -latest alias.
  'mistral-medium-latest': {
    maxContextWindow: 128_000,
    maxOutputTokens: 64_000,           // Match Sonnet tier
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.40,
      outputPerMillion: 2.00,
      cachedInputPerMillion: 0.40,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'mistral',
  },

  // Mistral Small 4 (v26.03, Mar 2026) — Hybrid model unifying instruct,
  // reasoning, and coding in a single efficient open-weight model.
  // Replaces Small 3.2 (Jun 2025) under the same -latest alias.
  'mistral-small-latest': {
    maxContextWindow: 128_000,
    maxOutputTokens: 8_192,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.10,
      outputPerMillion: 0.30,
      cachedInputPerMillion: 0.10,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'mistral',
  },

  // Magistral Medium 1.2 (Sep 2025) — Premier reasoning model
  'magistral-medium-latest': {
    maxContextWindow: 128_000,
    maxOutputTokens: 64_000,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,   // Uses prompt_mode: "reasoning" instead
    pricing: {
      inputPerMillion: 2.00,
      outputPerMillion: 5.00,
      cachedInputPerMillion: 2.00,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'mistral',
  },

  // Magistral Small 1.2 (Sep 2025) — Open reasoning model
  'magistral-small-latest': {
    maxContextWindow: 128_000,
    maxOutputTokens: 16_384,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.50,
      outputPerMillion: 1.50,
      cachedInputPerMillion: 0.50,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'mistral',
  },

  // Codestral (v25.08, Aug 2025) — Premier code-completion specialist.
  // Tuned for FIM (fill-in-the-middle), short-form completions, and
  // multi-language code generation.
  'codestral-latest': {
    maxContextWindow: 256_000,
    maxOutputTokens: 8_192,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.30,
      outputPerMillion: 0.90,
      cachedInputPerMillion: 0.30,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'mistral',
  },

  // Devstral 2 Medium (v25.12, Dec 2025) — Frontier code agents model for
  // solving software-engineering tasks. Used as the coding-pillar default
  // when the user wants Mistral instead of Claude.
  'devstral-medium-latest': {
    maxContextWindow: 128_000,
    maxOutputTokens: 32_768,
    requires1MBetaHeader: false,
    supportsCompaction: false,
    supportsAdaptiveThinking: false,
    supportsExtendedThinking: false,
    pricing: {
      inputPerMillion: 0.40,
      outputPerMillion: 2.00,
      cachedInputPerMillion: 0.40,
      premiumThreshold: null,
      premiumInputMultiplier: 1,
      premiumOutputMultiplier: 1,
    },
    provider: 'mistral',
  },
};

// ── Helper Functions ──────────────────────────────────────────────

/**
 * Get the usable input token budget for a model.
 * = maxContextWindow - maxOutputTokens (reserve space for response)
 */
export function getUsableInputBudget(modelId: string): number {
  const caps = MODEL_CAPABILITIES[modelId];
  if (!caps) {
    // Fallback for unknown models (e.g., Ollama custom models)
    return 128_000;
  }
  return caps.maxContextWindow - caps.maxOutputTokens;
}

/**
 * Get the usable input budget considering both model limits AND thinking level.
 * This is what the knowledge source panel should display.
 */
export function getKnowledgeSourceBudget(modelId: string, thinkingLevel: AntonThinkingLevel = 'think'): number {
  const caps = MODEL_CAPABILITIES[modelId];
  if (!caps) return 100_000;

  const thinkingConfig = getThinkingConfig(modelId, thinkingLevel);
  return caps.maxContextWindow - thinkingConfig.maxTokens;
}

/**
 * Get the warning threshold (83% of usable input budget).
 */
export function getWarningThreshold(modelId: string): number {
  return Math.floor(getUsableInputBudget(modelId) * 0.83);
}

/**
 * Estimate cost for a given token usage. Returns cost in USD.
 */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const caps = MODEL_CAPABILITIES[modelId];
  if (!caps) return 0;

  const p = caps.pricing;
  const nonCachedInput = inputTokens - cachedTokens;

  let inputCost: number;
  if (p.premiumThreshold && inputTokens > p.premiumThreshold) {
    inputCost = (nonCachedInput / 1_000_000) * p.inputPerMillion * p.premiumInputMultiplier;
  } else {
    inputCost = (nonCachedInput / 1_000_000) * p.inputPerMillion;
  }

  const cachedCost = (cachedTokens / 1_000_000) * p.cachedInputPerMillion;

  let outputCost: number;
  if (p.premiumThreshold && inputTokens > p.premiumThreshold) {
    outputCost = (outputTokens / 1_000_000) * p.outputPerMillion * p.premiumOutputMultiplier;
  } else {
    outputCost = (outputTokens / 1_000_000) * p.outputPerMillion;
  }

  return inputCost + cachedCost + outputCost;
}

/**
 * Check if a beta header is needed for the given model and token count.
 */
export function getBetaHeaders(modelId: string, estimatedInputTokens: number): string[] {
  const caps = MODEL_CAPABILITIES[modelId];
  if (!caps) return [];

  const headers: string[] = [];

  // 1M context beta header (only for Sonnet 4.5 above 200k)
  if (caps.requires1MBetaHeader && caps.betaHeader1M && estimatedInputTokens > 200_000) {
    headers.push(caps.betaHeader1M);
  }

  return headers;
}

/**
 * Format a human-readable context window description for UI display.
 */
export function formatContextInfo(modelId: string): string {
  const caps = MODEL_CAPABILITIES[modelId];
  if (!caps) return 'Unknown model';

  const windowK = caps.maxContextWindow >= 1_000_000
    ? `${(caps.maxContextWindow / 1_000_000).toFixed(0)}M`
    : `${(caps.maxContextWindow / 1_000).toFixed(0)}k`;

  const outputK = caps.maxOutputTokens >= 1_000
    ? `${(caps.maxOutputTokens / 1_000).toFixed(0)}k`
    : `${caps.maxOutputTokens}`;

  return `${windowK} context / ${outputK} max output`;
}

// ── Thinking Configuration ────────────────────────────────────────

/**
 * Get the thinking configuration for a model + ANTON thinking level.
 *
 * Opus 4.7: Adaptive thinking (effort parameter). budget_tokens is DEPRECATED.
 * Sonnet 4.6: Adaptive thinking (preferred). Also supports manual extended thinking.
 * Sonnet 4.5 / Haiku 4.5: Manual extended thinking (budget_tokens).
 * Non-Claude: No native thinking.
 */
export function getThinkingConfig(
  modelId: string,
  antonThinkingLevel: string
): ThinkingConfig {
  const caps = MODEL_CAPABILITIES[modelId];
  if (!caps || caps.provider !== 'anthropic') {
    return { thinkingType: 'none', maxTokens: 4096, requiresInterleavedThinkingBeta: false };
  }

  // ─── Opus 4.8: Adaptive thinking (effort parameter) ────────
  // Same effort mapping as 4.7 for consistency with users' learned
  // baseline. Per Anthropic docs, 4.8's API default for `effort` is `high`
  // when unset — we set it explicitly per ANTON thinking level below.
  if (modelId === 'claude-opus-4-8') {
    const mapping: Record<string, ThinkingConfig> = {
      'quick':            { thinkingType: 'adaptive', effort: 'low',    maxTokens: 16_384,  requiresInterleavedThinkingBeta: false },
      'think':            { thinkingType: 'adaptive', effort: 'medium', maxTokens: 32_768,  requiresInterleavedThinkingBeta: false },
      'think_hard':       { thinkingType: 'adaptive', effort: 'high',   maxTokens: 65_536,  requiresInterleavedThinkingBeta: false },
      'investigate':      { thinkingType: 'adaptive', effort: 'max',    maxTokens: 128_000, requiresInterleavedThinkingBeta: false },
      'plan_first':       { thinkingType: 'adaptive', effort: 'high',   maxTokens: 65_536,  requiresInterleavedThinkingBeta: false },
      'deep_investigate': { thinkingType: 'adaptive', effort: 'max',    maxTokens: 128_000, requiresInterleavedThinkingBeta: false },
    };
    return mapping[antonThinkingLevel] || mapping['think'];
  }

  // ─── Opus 4.6: Adaptive (preferred) — also supports extended ─
  // Mirrors 4.8/4.7's effort mapping. Although 4.6 also accepts
  // budget_tokens, we use adaptive for it too because users expect a
  // consistent UX across Opus generations.
  if (modelId === 'claude-opus-4-6') {
    const mapping: Record<string, ThinkingConfig> = {
      'quick':            { thinkingType: 'adaptive', effort: 'low',    maxTokens: 16_384,  requiresInterleavedThinkingBeta: false },
      'think':            { thinkingType: 'adaptive', effort: 'medium', maxTokens: 32_768,  requiresInterleavedThinkingBeta: false },
      'think_hard':       { thinkingType: 'adaptive', effort: 'high',   maxTokens: 65_536,  requiresInterleavedThinkingBeta: false },
      'investigate':      { thinkingType: 'adaptive', effort: 'max',    maxTokens: 128_000, requiresInterleavedThinkingBeta: false },
      'plan_first':       { thinkingType: 'adaptive', effort: 'high',   maxTokens: 65_536,  requiresInterleavedThinkingBeta: false },
      'deep_investigate': { thinkingType: 'adaptive', effort: 'max',    maxTokens: 128_000, requiresInterleavedThinkingBeta: false },
    };
    return mapping[antonThinkingLevel] || mapping['think'];
  }

  // ─── Opus 4.7: Adaptive thinking (effort parameter) ────────
  if (modelId === 'claude-opus-4-7') {
    const mapping: Record<string, ThinkingConfig> = {
      'quick': {
        thinkingType: 'adaptive',
        effort: 'low',
        maxTokens: 16_384,
        requiresInterleavedThinkingBeta: false,
      },
      'think': {
        thinkingType: 'adaptive',
        effort: 'medium',
        maxTokens: 32_768,
        requiresInterleavedThinkingBeta: false,
      },
      'think_hard': {
        thinkingType: 'adaptive',
        effort: 'high',
        maxTokens: 65_536,
        requiresInterleavedThinkingBeta: false,
      },
      'investigate': {
        thinkingType: 'adaptive',
        effort: 'max',
        maxTokens: 128_000,
        requiresInterleavedThinkingBeta: false,
      },
      'plan_first': {
        thinkingType: 'adaptive',
        effort: 'high',
        maxTokens: 65_536,
        requiresInterleavedThinkingBeta: false,
      },
      'deep_investigate': {
        thinkingType: 'adaptive',
        effort: 'max',
        maxTokens: 128_000,
        requiresInterleavedThinkingBeta: false,
      },
    };
    return mapping[antonThinkingLevel] || mapping['think'];
  }

  // ─── Sonnet 4.6: Adaptive thinking (preferred) ─────────────
  if (modelId === 'claude-sonnet-4-6') {
    const mapping: Record<string, ThinkingConfig> = {
      'quick': {
        thinkingType: 'adaptive',
        effort: 'low',
        maxTokens: 16_384,
        requiresInterleavedThinkingBeta: false,
      },
      'think': {
        thinkingType: 'adaptive',
        effort: 'medium',
        maxTokens: 32_768,
        requiresInterleavedThinkingBeta: false,
      },
      'think_hard': {
        thinkingType: 'adaptive',
        effort: 'high',
        maxTokens: 64_000,
        requiresInterleavedThinkingBeta: false,
      },
      'investigate': {
        thinkingType: 'adaptive',
        effort: 'max',
        maxTokens: 64_000,
        requiresInterleavedThinkingBeta: false,
      },
      'plan_first': {
        thinkingType: 'adaptive',
        effort: 'high',
        maxTokens: 64_000,
        requiresInterleavedThinkingBeta: false,
      },
      'deep_investigate': {
        thinkingType: 'adaptive',
        effort: 'max',
        maxTokens: 64_000,
        requiresInterleavedThinkingBeta: false,
      },
    };
    return mapping[antonThinkingLevel] || mapping['think'];
  }

  // ─── Sonnet 4.5: Manual extended thinking ──────────────────
  if (modelId === 'claude-sonnet-4-5-20250929') {
    const mapping: Record<string, ThinkingConfig> = {
      'quick': {
        thinkingType: 'enabled',
        budgetTokens: 2_048,
        maxTokens: 8_192,
        requiresInterleavedThinkingBeta: true,
      },
      'think': {
        thinkingType: 'enabled',
        budgetTokens: 8_192,
        maxTokens: 16_384,
        requiresInterleavedThinkingBeta: true,
      },
      'think_hard': {
        thinkingType: 'enabled',
        budgetTokens: 16_384,
        maxTokens: 32_768,
        requiresInterleavedThinkingBeta: true,
      },
      'investigate': {
        thinkingType: 'enabled',
        budgetTokens: 32_768,
        maxTokens: 64_000,
        requiresInterleavedThinkingBeta: true,
      },
      'plan_first': {
        thinkingType: 'enabled',
        budgetTokens: 16_384,
        maxTokens: 32_768,
        requiresInterleavedThinkingBeta: true,
      },
      'deep_investigate': {
        thinkingType: 'enabled',
        budgetTokens: 32_768,
        maxTokens: 64_000,
        requiresInterleavedThinkingBeta: true,
      },
    };
    return mapping[antonThinkingLevel] || mapping['think'];
  }

  // ─── Haiku 4.5: Manual extended thinking ───────────────────
  if (modelId === 'claude-haiku-4-5-20251001') {
    const mapping: Record<string, ThinkingConfig> = {
      'quick': {
        thinkingType: 'none',
        maxTokens: 4_096,
        requiresInterleavedThinkingBeta: false,
      },
      'think': {
        thinkingType: 'enabled',
        budgetTokens: 4_096,
        maxTokens: 8_192,
        requiresInterleavedThinkingBeta: true,
      },
      'think_hard': {
        thinkingType: 'enabled',
        budgetTokens: 8_192,
        maxTokens: 16_384,
        requiresInterleavedThinkingBeta: true,
      },
      'investigate': {
        thinkingType: 'enabled',
        budgetTokens: 16_384,
        maxTokens: 32_768,
        requiresInterleavedThinkingBeta: true,
      },
      'plan_first': {
        thinkingType: 'enabled',
        budgetTokens: 8_192,
        maxTokens: 16_384,
        requiresInterleavedThinkingBeta: true,
      },
      'deep_investigate': {
        thinkingType: 'enabled',
        budgetTokens: 16_384,
        maxTokens: 32_768,
        requiresInterleavedThinkingBeta: true,
      },
    };
    return mapping[antonThinkingLevel] || mapping['think'];
  }

  // ─── Non-Claude models: No native thinking ─────────────────
  return { thinkingType: 'none', maxTokens: 4096, requiresInterleavedThinkingBeta: false };
}
