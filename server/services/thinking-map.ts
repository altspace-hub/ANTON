/**
 * thinking-map.ts — the single source of truth for translating ANTON's
 * `ThinkingLevel` into each provider's reasoning parameters.
 *
 * Before this module the mapping was duplicated: claude-client.ts and
 * model-adapter.ts each carried their own Anthropic map and DISAGREED on
 * think_hard (10000 vs 16384), and model-adapter treated every `opus` as an
 * adaptive-thinking model (wrong for Opus 4.6, which uses budget_tokens here;
 * Opus 4.7 is adaptive-only and 400s on budget_tokens).
 * Azure and Mistral each carried their own copies too. Centralising the maps
 * here kills the drift; each adapter still builds its own request object and
 * applies its own token capping, so provider-specific shaping stays local.
 *
 * The functions are PURE — no I/O, no client state — so they are trivially
 * unit-testable and safe to import from anywhere on the hot path.
 */

import type { ThinkingLevel } from '../../src/lib/types.js';

// ── Anthropic ────────────────────────────────────────────────────────────────

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * The Claude generation of an id — 5 for claude-opus-5-5, claude-sonnet-5,
 * claude-haiku-5-5 or a dated claude-opus-5-20260601 — or null when the id is
 * not a Claude family id. Every Claude 5 model accepts adaptive thinking with
 * the full effort ladder, and none accepts budget_tokens (a 400), so an id of
 * generation 5 or later that is not yet listed below is treated as adaptive:
 * when Sonnet 5.5 or Haiku 5.5 ships, sending budget_tokens (or, on the
 * subscription engine, thinking disabled) would fail every request, while
 * adaptive is what the whole generation takes.
 */
export function claudeGeneration(model: string): number | null {
  const m = /^claude-(?:opus|sonnet|haiku|fable|mythos)-(\d+)(?:-\d{1,2})?(?:-\d{8})?$/.exec(model);
  return m ? Number(m[1]) : null;
}

function isClaude5OrLater(model: string): boolean {
  const generation = claudeGeneration(model);
  return generation !== null && generation >= 5;
}

/** Adaptive-effort models (thinking:{type:'adaptive'} + output_config.effort).
 *  Everything else uses the budget_tokens mechanism below. Keep in sync with the
 *  Anthropic model catalogue — budget_tokens is deprecated on these, and the
 *  Claude 5 generation REJECTS it (400), so a model missing from this list is
 *  not "slightly worse", it fails every request. Claude 5 and later need no
 *  entry (claudeGeneration above); the list is for the 4.x models that moved. */
export function anthropicUsesAdaptive(model: string): boolean {
  return isClaude5OrLater(model)
    || model === 'claude-opus-4-8'
    || model === 'claude-opus-4-7'   // adaptive is its only thinking mode — budget_tokens 400s
    || model === 'claude-sonnet-4-6';
}

/** Models that accept effort 'xhigh' — Opus 4.7 and later and the whole Claude
 *  5 generation. Sonnet 4.6 and the 4.5 generation stop at 'max'. Same
 *  catalogue discipline as anthropicUsesAdaptive. */
export function anthropicSupportsXhigh(model: string): boolean {
  return isClaude5OrLater(model)
    || model === 'claude-opus-4-8'
    || model === 'claude-opus-4-7';
}

/**
 * Six ANTON levels onto five Anthropic efforts. The top three used to collapse
 * to 'max', which left the 'xhigh' rung — the one Anthropic recommends for long
 * agentic work on Claude 5 — unreachable from ANTON. Same shape as the OpenAI
 * ladder below: investigate/plan_first take xhigh, deep_investigate takes max.
 */
const ANTHROPIC_EFFORT: Record<ThinkingLevel, AnthropicEffort> = {
  quick: 'low',
  think: 'medium',
  think_hard: 'high',
  investigate: 'xhigh',
  plan_first: 'xhigh',
  deep_investigate: 'max',
};

/**
 * Effort for an adaptive-thinking Anthropic model, clamped to what it accepts.
 * 'xhigh' folds to 'max' when the model is not given or predates the rung —
 * exactly the value those levels sent before the ladder grew, so nothing
 * changes for a model that cannot use it, and an unknown model never gets a
 * value that would 400.
 */
export function anthropicEffort(level: ThinkingLevel, model?: string): AnthropicEffort {
  const effort = ANTHROPIC_EFFORT[level];
  if (effort === 'xhigh' && !(model && anthropicSupportsXhigh(model))) return 'max';
  return effort;
}

// Canonical budget_tokens per level for older Anthropic models (Sonnet 4.5, Haiku).
// null = thinking OFF. think_hard is canonicalised to 10000 (the value the primary
// module path — claude-client — already used; resolves the 10000/16384 drift).
const ANTHROPIC_BUDGET: Record<ThinkingLevel, number | null> = {
  quick: null,
  think: 4096,
  think_hard: 10000,
  investigate: 32768,
  plan_first: 32768,
  deep_investigate: 32768,
};

/** Uncapped budget_tokens for a budget-mechanism Anthropic model (null = off).
 *  Callers must still clamp to the model's output ceiling. */
export function anthropicBudgetTokens(level: ThinkingLevel): number | null {
  return ANTHROPIC_BUDGET[level];
}

// ── Azure OpenAI (reasoning deployments: o3, o4-mini, …) ──────────────────────

const AZURE_REASONING_EFFORT: Record<ThinkingLevel, 'low' | 'medium' | 'high'> = {
  quick: 'low',
  think: 'medium',
  think_hard: 'high',
  investigate: 'high',
  plan_first: 'high',
  deep_investigate: 'high',
};

/** reasoning_effort for an Azure reasoning deployment (non-reasoning models ignore it). */
export function azureReasoningEffort(level: ThinkingLevel): 'low' | 'medium' | 'high' {
  return AZURE_REASONING_EFFORT[level];
}

// ── OpenAI reasoning models ──────────────────────────────────────────────────

export type OpenAIEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * The GPT-5.x ladder. These models accept none/low/medium/high/xhigh/max, which is
 * a genuine 1:1 with ANTON's six levels — so the top levels no longer collapse.
 *
 * Note OpenAI treats reasoning_effort as a CEILING, not a floor: on a prompt the
 * model judges easy it may spend zero reasoning tokens even at `max`. So a higher
 * level raises the allowance, it does not force deliberation.
 */
const OPENAI_EFFORT_FULL: Record<ThinkingLevel, OpenAIEffort> = {
  quick: 'low',
  think: 'medium',
  think_hard: 'high',
  investigate: 'xhigh',
  plan_first: 'xhigh',
  deep_investigate: 'max',
};

/** o-series (o1/o3/o4…) accepts only low/medium/high — fold the top three down. */
const OPENAI_EFFORT_O_SERIES: Record<ThinkingLevel, 'low' | 'medium' | 'high'> = {
  quick: 'low',
  think: 'medium',
  think_hard: 'high',
  investigate: 'high',
  plan_first: 'high',
  deep_investigate: 'high',
};

/** True for GPT-6 and later (gpt-6-astra, gpt-6-sol, gpt-6-luna …): every
 *  model of the generation is an always-reasoning model. The hyphenated ids
 *  never matched the gpt-5.x test below, so GPT-6 went out as a plain chat
 *  call — temperature + max_tokens, which a reasoning model rejects. */
function isGpt6OrLater(model: string): boolean {
  const m = /^gpt-(\d+)(?=[.-]|$)/i.exec(model);
  return m !== null && Number(m[1]) >= 6;
}

/** True for GPT-5.x and GPT-6+, which support the extended xhigh/max efforts. */
export function openaiSupportsExtendedEffort(model: string): boolean {
  return /^gpt-5\./i.test(model) || isGpt6OrLater(model);
}

/** reasoning_effort for an OpenAI reasoning model, clamped to what it accepts.
 *  Passing `xhigh` to an o-series deployment is a 400, so the model matters. */
export function openaiReasoningEffort(level: ThinkingLevel, model?: string): OpenAIEffort {
  if (model && openaiSupportsExtendedEffort(model)) return OPENAI_EFFORT_FULL[level];
  return OPENAI_EFFORT_O_SERIES[level];
}

/**
 * True for OpenAI models that accept `reasoning_effort`, REJECT `temperature`, and
 * use `max_completion_tokens` instead of `max_tokens`.
 *
 * Covers the o-series (o1/o3/o4…) AND the GPT-5.x family. The GPT-5.x half was
 * missing, which meant every gpt-5.* model was treated as a plain chat model: the
 * thinking level was silently dropped on the floor and the UI's claim that these
 * models "reason on or off" was describing a request we never actually sent.
 *
 * Detection stays deliberately narrow — a model we are unsure about is treated as
 * non-reasoning, which is the safe default (a normal chat call rather than a
 * rejected one). gpt-4o and friends take none of these parameters.
 */
export function isOpenAIReasoningModel(model: string): boolean {
  return /^o[1-9]/i.test(model) || /^gpt-5\./i.test(model) || isGpt6OrLater(model);
}

// ── Codex (the ChatGPT-subscription SDK engine) ──────────────────────────────

export type CodexEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** modelReasoningEffort for the Codex SDK engine (codex:<model> ids). Codex
 *  accepts minimal..xhigh — no 'max' — so the top three levels share xhigh. */
const CODEX_EFFORT: Record<ThinkingLevel, CodexEffort> = {
  quick: 'minimal',
  think: 'medium',
  think_hard: 'high',
  investigate: 'xhigh',
  plan_first: 'xhigh',
  deep_investigate: 'xhigh',
};

export function codexReasoningEffort(level: ThinkingLevel): CodexEffort {
  return CODEX_EFFORT[level];
}

// ── Mistral (switch to a Magistral reasoning model) ───────────────────────────

const MISTRAL_REASONING_LEVELS: ReadonlySet<string> = new Set([
  'investigate',
  'plan_first',
  'deep_investigate',
]);

/** True when the thinking level should escalate Mistral to a Magistral reasoning
 *  model. think_hard deliberately stays on the base model (already capable). */
export function mistralUsesReasoning(level: string): boolean {
  return MISTRAL_REASONING_LEVELS.has(level);
}

// ── UI granularity classifier ─────────────────────────────────────────────────

/**
 * How finely a (provider, model) actually honours the six thinking levels — so the
 * UI can tell the truth (e.g. grey out levels a model collapses or ignores):
 *   full     — every level maps to a distinct reasoning setting (Anthropic).
 *   effort3  — three effort buckets (Azure reasoning deployments).
 *   threshold— reasoning turns on above a threshold level (Mistral → Magistral).
 *   binary   — reasoning is on/off only (OpenAI, Gemini native toggle).
 *   none     — thinking level has no effect (Ollama, generic compat endpoints).
 */
export type ThinkingGranularity = 'full' | 'effort3' | 'threshold' | 'binary' | 'none';

export function thinkingGranularity(
  provider: string,
  opts?: { azureReasoning?: boolean },
): ThinkingGranularity {
  switch (provider) {
    case 'anthropic':
      return 'full';
    case 'azure':
      return opts?.azureReasoning ? 'effort3' : 'none';
    case 'mistral':
      return 'threshold';
    case 'openai':
    case 'google':
      return 'binary';
    case 'ollama':
    case 'compat':
    default:
      return 'none';
  }
}
