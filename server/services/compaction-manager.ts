/**
 * Compaction Manager
 *
 * Manages context compaction for long-running sessions.
 * Integrates with the Anthropic API's compact-2026-01-12 beta.
 *
 * Key responsibilities:
 * 1. Decide when to enable compaction for a session
 * 2. Configure compaction triggers based on session type
 * 3. Handle compaction pause/resume flow
 * 4. Log compaction events to audit trail
 * 5. Track total tokens consumed across compactions
 *
 * Supported models: Claude Opus 4.8 and Sonnet 4.6 only.
 */

import { MODEL_CAPABILITIES } from '../config/model-capabilities.js';

// ── Types ───────────────────────────────────────────────────────

export interface CompactionConfig {
  /** Enable compaction for this session */
  enabled: boolean;
  /** Token threshold that triggers compaction */
  triggerThreshold: number;
  /** Pause after compaction to let ANTON handle the transition */
  pauseAfterCompaction: boolean;
  /** Maximum total tokens to consume across all compactions before wrapping up */
  totalTokenBudget: number;
}

export interface CompactionState {
  sessionId: string;
  compactionCount: number;
  totalTokensConsumed: number;
  lastCompactionAt: Date | null;
  /** Summary from most recent compaction (for logging/display) */
  lastCompactionSummary: string | null;
}

export type SessionType =
  | 'interactive'           // Normal user chat session
  | 'workflow_execution'    // Multi-step workflow
  | 'orchestrator'          // AI Orchestrator (autonomous/supervised)
  | 'coding_large'          // Coding Large project analysis
  | 'batch_operation';      // Batch processing

// ── Default Configurations ──────────────────────────────────────

const COMPACTION_DEFAULTS: Record<SessionType, Partial<CompactionConfig>> = {
  interactive: {
    // Interactive sessions: compact at 200k to keep responses snappy
    triggerThreshold: 200_000,
    totalTokenBudget: 3_000_000,
    pauseAfterCompaction: false,
  },
  workflow_execution: {
    // Workflows: compact at 150k since each step adds significant context
    triggerThreshold: 150_000,
    totalTokenBudget: 5_000_000,
    pauseAfterCompaction: true,
  },
  orchestrator: {
    // Orchestrator: compact at 300k to maximise context for decision-making
    triggerThreshold: 300_000,
    totalTokenBudget: 10_000_000,
    pauseAfterCompaction: true,
  },
  coding_large: {
    // Coding Large: compact at 500k — wants maximum context for codebase analysis
    triggerThreshold: 500_000,
    totalTokenBudget: 5_000_000,
    pauseAfterCompaction: true,
  },
  batch_operation: {
    // Batch: compact aggressively at 100k per item
    triggerThreshold: 100_000,
    totalTokenBudget: 20_000_000,
    pauseAfterCompaction: true,
  },
};

// ── Public API ──────────────────────────────────────────────────

/**
 * Determine if compaction should be enabled for a session.
 * Only enable for models that support it (Opus 4.8, Sonnet 4.6).
 */
export function shouldEnableCompaction(
  modelId: string,
  sessionType: SessionType
): boolean {
  const caps = MODEL_CAPABILITIES[modelId];
  if (!caps || !caps.supportsCompaction) return false;

  // Always enable for orchestrator and coding_large
  if (sessionType === 'orchestrator' || sessionType === 'coding_large') return true;

  // Enable for workflows
  if (sessionType === 'workflow_execution') return true;

  // For interactive sessions, enable by default (compaction only triggers if needed)
  if (sessionType === 'interactive') return true;

  // Batch always
  if (sessionType === 'batch_operation') return true;

  return false;
}

/**
 * Build the compaction configuration for an API request.
 */
export function buildCompactionConfig(
  modelId: string,
  sessionType: SessionType,
  overrides?: Partial<CompactionConfig>
): CompactionConfig | null {
  if (!shouldEnableCompaction(modelId, sessionType)) return null;

  const defaults = COMPACTION_DEFAULTS[sessionType] || COMPACTION_DEFAULTS.interactive;

  return {
    enabled: true,
    triggerThreshold: overrides?.triggerThreshold ?? defaults.triggerThreshold ?? 200_000,
    pauseAfterCompaction: overrides?.pauseAfterCompaction ?? defaults.pauseAfterCompaction ?? false,
    totalTokenBudget: overrides?.totalTokenBudget ?? defaults.totalTokenBudget ?? 3_000_000,
  };
}

/**
 * Build the context_management parameter for the Anthropic API request.
 */
export function buildContextManagementParam(config: CompactionConfig): object {
  return {
    edits: [{
      type: 'compact_20260112',
      trigger: {
        type: 'input_tokens',
        value: config.triggerThreshold,
      },
      pause_after_compaction: config.pauseAfterCompaction,
    }],
  };
}

/**
 * Create initial compaction state for a session.
 */
export function createCompactionState(sessionId: string): CompactionState {
  return {
    sessionId,
    compactionCount: 0,
    totalTokensConsumed: 0,
    lastCompactionAt: null,
    lastCompactionSummary: null,
  };
}

/**
 * Update compaction state after a compaction event.
 */
export function updateCompactionState(
  state: CompactionState,
  tokensInThisCompaction: number,
  summary?: string
): CompactionState {
  return {
    ...state,
    compactionCount: state.compactionCount + 1,
    totalTokensConsumed: state.totalTokensConsumed + tokensInThisCompaction,
    lastCompactionAt: new Date(),
    lastCompactionSummary: summary ?? state.lastCompactionSummary,
  };
}

/**
 * Check if the session should wrap up (total budget exceeded).
 */
export function shouldWrapUp(
  state: CompactionState,
  config: CompactionConfig
): boolean {
  return state.totalTokensConsumed >= config.totalTokenBudget;
}

/**
 * Build a wrap-up message to inject when total budget is exceeded.
 */
export function buildWrapUpMessage(): { role: 'user'; content: string } {
  return {
    role: 'user',
    content: 'Please wrap up your current work and summarize the final state. ' +
             'Include: key findings, actions taken, remaining items, and any recommendations.',
  };
}

/**
 * Calculate total usage from API response, handling compaction iterations.
 * When compaction is active, usage.iterations[] contains per-iteration token counts.
 */
export function calculateTotalUsage(response: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    iterations?: Array<{ input_tokens?: number; output_tokens?: number }>;
  };
}): { inputTokens: number; outputTokens: number } {
  const usage = response.usage;
  if (!usage) return { inputTokens: 0, outputTokens: 0 };

  if (usage.iterations && usage.iterations.length > 0) {
    // Sum across all iterations (includes compaction iterations)
    let totalInput = 0;
    let totalOutput = 0;
    for (const iter of usage.iterations) {
      totalInput += iter.input_tokens || 0;
      totalOutput += iter.output_tokens || 0;
    }
    return { inputTokens: totalInput, outputTokens: totalOutput };
  }

  // No compaction — use standard fields
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
  };
}
