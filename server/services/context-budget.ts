/**
 * context-budget.ts — capability-aware context budgeting (plan 2.15).
 *
 * Before this module, knowledge assembly budgeted ~892k tokens for EVERY
 * model: a 7B Ollama model with a 32k window silently received (and
 * truncated) near-million-token prompts. This resolves a per-model
 * context window and derives a safe knowledge budget from it.
 *
 * Window resolution order:
 *   1. MODEL_CAPABILITIES registry (Claude / GPT / Gemini / Mistral). An
 *      sdk:<model> id is looked up by its underlying model — the engine's
 *      model has the engine's window (engine-model-id.ts).
 *   2. ollama:<model> → Ollama /api/show model_info context_length
 *      (cached per model; 32k fallback when unreachable/unknown).
 *   3. compat:<slug>:<model> → the endpoint's optional context_window
 *      column (migration 215); else the window the endpoint's /models
 *      reported for the model (migration 288), capped at 128k; 32k default.
 *      With no db passed, the database registered at boot is used.
 *   4. azure:<deployment> → 128k (conservative GPT-4-class default).
 *   5. Unknown / custom-slot ids → 32k.
 *
 * Budget = window − output reserve − system-prompt reserve, clamped to
 * [4k, env MAX_CONTEXT_TOKENS]. 1M-window models keep the historical
 * 800k knowledge budget (matches the long-standing claude.ts behaviour).
 * A compat model reserves the max_tokens a run actually sends (reasoning
 * room included), and its /models window is the smaller of the model's and
 * its top provider's (compat-endpoint.ts).
 *
 * num_ctx for Ollama: min(model window, OLLAMA_NUM_CTX env override or
 * 32k) — never blindly request a 1M KV cache on local hardware.
 */

import { MODEL_CAPABILITIES } from '../config/model-capabilities.js';
import { resolveCustomEndpoint } from './custom-endpoint-resolver.js';
import { getRouterDb, normalizeModelMeta, type CompatModelMeta } from './compat-endpoint.js';
import { capabilityModelId } from './engine-model-id.js';
import { compatMaxTokens, COMPAT_WORK_RUN_MAX_TOKENS } from './adapters/openaiCompatibleAdapter.js';
import type { DatabaseAdapter } from '../db/database.js';

const DEFAULT_LOCAL_CONTEXT = 32_768;
/** Largest window taken from an endpoint's /models without an admin setting. */
const COMPAT_REPORTED_WINDOW_CAP = 131_072;
const SYSTEM_PROMPT_RESERVE = 8_000;
/** Output reserve for sub-1M models — real module outputs sit well below
 *  model ceilings, so reserving the full maxOutputTokens would waste half
 *  a small model's window. */
const MAX_OUTPUT_RESERVE = 16_384;
const MIN_BUDGET = 4_096;
/** Historical knowledge budget for 1M-context models (see claude.ts). */
const LONG_CONTEXT_BUDGET = 800_000;

// ── Ollama window discovery ─────────────────────────────────────────

const ollamaWindowCache = new Map<string, number>();

/**
 * Query Ollama /api/show for the model's trained context length.
 * Cached per model name; falls back to 32k when unreachable or the
 * response doesn't expose a context_length key.
 */
export async function resolveOllamaContextWindow(modelName: string): Promise<number> {
  const cached = ollamaWindowCache.get(modelName);
  if (cached !== undefined) return cached;

  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  let window = DEFAULT_LOCAL_CONTEXT;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.OLLAMA_AUTH_TOKEN) headers['Authorization'] = `Bearer ${process.env.OLLAMA_AUTH_TOKEN}`;
    const res = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: modelName }),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as { model_info?: Record<string, unknown> };
      // model_info keys are arch-prefixed, e.g. 'qwen2.context_length'
      const info = data.model_info ?? {};
      for (const [key, value] of Object.entries(info)) {
        if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) {
          window = value;
          break;
        }
      }
    }
  } catch {
    // Unreachable Ollama — keep the 32k fallback; do NOT cache failures
    // so a later-started Ollama is picked up.
    return DEFAULT_LOCAL_CONTEXT;
  }
  ollamaWindowCache.set(modelName, window);
  return window;
}

/** Test hook — clear the per-model window cache. */
export function resetOllamaWindowCacheForTests(): void {
  ollamaWindowCache.clear();
}

// ── Generic resolution ──────────────────────────────────────────────

/**
 * Resolve the total context window (input + output tokens) for any
 * ANTON model id. Never throws — unknown ids get the 32k local default.
 */
export async function resolveContextWindow(
  modelId: string,
  db?: DatabaseAdapter,
): Promise<number> {
  const caps = MODEL_CAPABILITIES[capabilityModelId(modelId)];
  if (caps) return caps.maxContextWindow;

  if (modelId.startsWith('ollama:')) {
    return resolveOllamaContextWindow(modelId.slice('ollama:'.length));
  }

  if (modelId.startsWith('compat:')) {
    return (await compatKnownWindow(modelId, db)) ?? DEFAULT_LOCAL_CONTEXT;
  }

  if (modelId.startsWith('azure:')) return 128_000;

  return DEFAULT_LOCAL_CONTEXT;
}

/**
 * A compat model's window when something states it: the endpoint's
 * context_window (an admin setting), else the window its /models reported,
 * capped — GLM 5.3 Flash reports 1.31M, which would let one run pack 800k
 * tokens of documents onto a paid key. An admin who wants more sets
 * context_window on the endpoint. null = unknown.
 */
async function compatKnownWindow(modelId: string, db?: DatabaseAdapter): Promise<number | null> {
  const target = db ?? getRouterDb();
  const slug = modelId.split(':')[1];
  const model = modelId.split(':').slice(2).join(':');
  if (!target || !slug) return null;
  try {
    const endpoint = await resolveCustomEndpoint(target, slug);
    if (endpoint?.contextWindow && endpoint.contextWindow > 0) return endpoint.contextWindow;
    const reported = normalizeModelMeta(endpoint?.modelMeta[model])?.contextLength;
    if (reported) return Math.min(reported, COMPAT_REPORTED_WINDOW_CAP);
  } catch {
    // endpoint table unavailable — unknown
  }
  return null;
}

/**
 * The window a compat run's WHOLE input (system prompt, history, message) is
 * held to: the stated window, or — when nothing states one — the most this
 * server lets a compat run send (128k). The 32k default above is a
 * conservative guess for packing documents, not a limit to refuse runs at.
 */
export async function resolveCompatInputWindow(modelId: string, db?: DatabaseAdapter): Promise<number> {
  return (await compatKnownWindow(modelId, db)) ?? COMPAT_REPORTED_WINDOW_CAP;
}

/**
 * The max_tokens a compat run sends when the caller did not say: the Work
 * route's default (or the endpoint's ceiling) plus the largest reasoning room
 * the adapter adds when the model reasons, clamped to the endpoint's and the
 * model's own ceilings. Reasoning counts against max_tokens and the provider
 * refuses a prompt that leaves less than that, so this — not the 8k default —
 * is what the prompt must leave room for (review C10: a large-document run
 * passed the budget and then got an HTTP 400 no retry could help).
 */
async function compatOutputReserve(modelId: string, db?: DatabaseAdapter): Promise<number> {
  const parts = modelId.split(':');
  const slug = parts[1];
  const model = parts.slice(2).join(':');
  let endpointCeiling: number | null = null;
  let meta: CompatModelMeta | undefined;
  const target = db ?? getRouterDb();
  if (target && slug) {
    try {
      const endpoint = await resolveCustomEndpoint(target, slug);
      endpointCeiling = endpoint?.maxOutputTokens ?? null;
      meta = normalizeModelMeta(endpoint?.modelMeta[model]);
    } catch {
      // endpoint table unavailable — the defaults below
    }
  }
  return compatMaxTokens(
    endpointCeiling ?? COMPAT_WORK_RUN_MAX_TOKENS,
    meta?.reasoning ? { effort: 'max' } : undefined,
    endpointCeiling,
    meta?.maxCompletionTokens,
  ) ?? COMPAT_WORK_RUN_MAX_TOKENS;
}

/**
 * Derive the knowledge-assembly token budget for a model: how many
 * tokens of reference material can safely be packed into the prompt.
 * Clamped to env MAX_CONTEXT_TOKENS (global operator cap, default 900k).
 *
 * `outputTokens`: the max_tokens the caller will actually send, when it
 * knows it (the Work route does for a compat run); the room left for it is
 * exactly that. A compat id without it reserves the most a run can send.
 */
export async function resolveContextBudget(
  modelId: string,
  db?: DatabaseAdapter,
  opts: { outputTokens?: number } = {},
): Promise<number> {
  const envCap = Number(process.env.MAX_CONTEXT_TOKENS) || 900_000;
  const window = await resolveContextWindow(modelId, db);

  if (window >= 1_000_000) {
    return Math.min(LONG_CONTEXT_BUDGET, envCap);
  }

  const caps = MODEL_CAPABILITIES[capabilityModelId(modelId)];
  const requested = typeof opts.outputTokens === 'number' && Number.isFinite(opts.outputTokens) && opts.outputTokens > 0
    ? Math.floor(opts.outputTokens)
    : undefined;
  const outputReserve = modelId.startsWith('compat:')
    ? (requested ?? await compatOutputReserve(modelId, db))
    : Math.min(caps?.maxOutputTokens ?? 8_192, MAX_OUTPUT_RESERVE);
  const budget = Math.max(MIN_BUDGET, window - outputReserve - SYSTEM_PROMPT_RESERVE);
  return Math.min(budget, envCap);
}

/**
 * num_ctx value for Ollama requests: the model's trained window capped
 * at 32k (or the OLLAMA_NUM_CTX env override) — large enough for real
 * knowledge work, small enough not to OOM typical local hardware.
 */
export async function resolveOllamaNumCtx(modelId: string): Promise<number> {
  const modelName = modelId.startsWith('ollama:') ? modelId.slice('ollama:'.length) : modelId;
  const window = await resolveOllamaContextWindow(modelName);
  const envOverride = Number(process.env.OLLAMA_NUM_CTX);
  const cap = Number.isFinite(envOverride) && envOverride > 0 ? envOverride : DEFAULT_LOCAL_CONTEXT;
  return Math.min(window, cap);
}
