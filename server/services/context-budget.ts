/**
 * context-budget.ts — capability-aware context budgeting (plan 2.15).
 *
 * Before this module, knowledge assembly budgeted ~892k tokens for EVERY
 * model: a 7B Ollama model with a 32k window silently received (and
 * truncated) near-million-token prompts. This resolves a per-model
 * context window and derives a safe knowledge budget from it.
 *
 * Window resolution order:
 *   1. MODEL_CAPABILITIES registry (Claude / GPT / Gemini / Mistral).
 *   2. ollama:<model> → Ollama /api/show model_info context_length
 *      (cached per model; 32k fallback when unreachable/unknown).
 *   3. compat:<slug>:<model> → the endpoint's optional context_window
 *      column (migration 215); 32k default when unset.
 *   4. azure:<deployment> → 128k (conservative GPT-4-class default).
 *   5. Unknown / custom-slot ids → 32k.
 *
 * Budget = window − output reserve − system-prompt reserve, clamped to
 * [4k, env MAX_CONTEXT_TOKENS]. 1M-window models keep the historical
 * 800k knowledge budget (matches the long-standing claude.ts behaviour).
 *
 * num_ctx for Ollama: min(model window, OLLAMA_NUM_CTX env override or
 * 32k) — never blindly request a 1M KV cache on local hardware.
 */

import { MODEL_CAPABILITIES } from '../config/model-capabilities.js';
import { resolveCustomEndpoint } from '../routes/custom-model-endpoints.js';
import type { DatabaseAdapter } from '../db/database.js';

const DEFAULT_LOCAL_CONTEXT = 32_768;
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
  const caps = MODEL_CAPABILITIES[modelId];
  if (caps) return caps.maxContextWindow;

  if (modelId.startsWith('ollama:')) {
    return resolveOllamaContextWindow(modelId.slice('ollama:'.length));
  }

  if (modelId.startsWith('compat:') && db) {
    const slug = modelId.split(':')[1];
    if (slug) {
      try {
        const endpoint = await resolveCustomEndpoint(db, slug);
        if (endpoint?.contextWindow && endpoint.contextWindow > 0) {
          return endpoint.contextWindow;
        }
      } catch {
        // endpoint table unavailable — fall through to default
      }
    }
    return DEFAULT_LOCAL_CONTEXT;
  }

  if (modelId.startsWith('azure:')) return 128_000;

  return DEFAULT_LOCAL_CONTEXT;
}

/**
 * Derive the knowledge-assembly token budget for a model: how many
 * tokens of reference material can safely be packed into the prompt.
 * Clamped to env MAX_CONTEXT_TOKENS (global operator cap, default 900k).
 */
export async function resolveContextBudget(
  modelId: string,
  db?: DatabaseAdapter,
): Promise<number> {
  const envCap = Number(process.env.MAX_CONTEXT_TOKENS) || 900_000;
  const window = await resolveContextWindow(modelId, db);

  if (window >= 1_000_000) {
    return Math.min(LONG_CONTEXT_BUDGET, envCap);
  }

  const caps = MODEL_CAPABILITIES[modelId];
  const outputReserve = Math.min(caps?.maxOutputTokens ?? 8_192, MAX_OUTPUT_RESERVE);
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
