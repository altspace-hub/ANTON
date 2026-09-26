/**
 * provider-router.ts
 *
 * Provider-agnostic AI call router for ANTON.
 *
 * Replaces direct `anthropic.messages.stream()` / `.create()` calls in specialty routes.
 * Routes to Claude, Mistral, OpenAI, Gemini, or Ollama based on configured model.
 *
 * Two main entry points:
 *   streamChat(config, res)  — SSE streaming to Express response
 *   callChat(config)         — non-streaming, returns text + usage
 *
 * Model tier mapping lets routes specify "large" / "medium" / "small" intent
 * and the router picks the right model for the configured provider.
 *
 * Default-model precedence (plan 2.12 — the Settings picker governs the
 * whole product, not just module runs):
 *   1. An explicit concrete model id passed by the caller (module runs
 *      already pass the session model — untouched).
 *   2. The persisted Settings default (app_settings 'default_model' via
 *      default-model-store.ts, cached in-memory, updated on save).
 *   3. env DEFAULT_MODEL.
 *   4. Provider env-key priority: Anthropic > Mistral > OpenAI > Google.
 */

import type { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getProviderFromModelId } from './model-adapter.js';
// Static on purpose: a request-time first dynamic import deadlocks the event
// loop under `tsx watch` with an open stdin (see claude-sdk-client.ts).
import {
  completeText as sdkEngineCompleteText,
  streamToResponse as sdkEngineStream,
  stripWebSearchInstructions,
  type SdkCompletionData,
} from './claude-sdk-client.js';
import { completeText as codexEngineCompleteText, streamToResponse as codexEngineStream } from './codex-sdk-client.js';
import type { StreamSink } from './stream-sink.js';
import { streamMistral, type MistralStreamParams } from './adapters/mistralAdapter.js';
import { streamOpenAI } from './adapters/openaiAdapter.js';
import { isOpenAIReasoningModel, openaiReasoningEffort, claudeGeneration } from './thinking-map.js';
import { isThinkingLevel } from './user-module-defaults.js';
import { streamGemini } from './adapters/geminiAdapter.js';
import { streamOllama, callOllama } from './adapters/ollamaAdapter.js';
import { streamAzureOpenAI } from './adapters/azureOpenaiAdapter.js';
import type { AzureOpenAIConfig } from './adapters/azureOpenaiAdapter.js';
import { streamOpenAICompatible, callOpenAICompatible } from './adapters/openaiCompatibleAdapter.js';
import { resolveCustomEndpoint } from './custom-endpoint-resolver.js';
import { MODEL_CAPABILITIES, getThinkingConfig, estimateCost } from '../config/model-capabilities.js';
import { CLAUDE_LARGE, CLAUDE_MEDIUM, CLAUDE_SMALL } from '../config/claude-lineup.js';
import { getEffectiveDefaultModel } from './default-model-store.js';
import { enqueueAudit } from './audit-queue.js';
import type { AuditEntry } from './auditLogger.js';
import { capabilityModelId } from './engine-model-id.js';
import { withCurrentDate } from '../lib/current-date.js';
import { resolveOllamaNumCtx } from './context-budget.js';
import {
  convertClaudeToolsToOpenAI,
  isCapabilityRejection,
  JSON_ONLY_NUDGE,
  type ClaudeToolLike,
} from './adapters/provider-extras.js';

// ── OpenAI-compatible (compat:<slug>:<model>) endpoint resolution ──
async function resolveCompatConfig(
  modelId: string,
  db?: import('../db/database.js').DatabaseAdapter,
): Promise<{ baseUrl: string; apiKey?: string; extraHeaders?: Record<string, string>; model: string }> {
  if (!db) throw new Error('Database adapter required to resolve a compat: model endpoint');
  const slug = modelId.split(':')[1];
  if (!slug) throw new Error(`Invalid compat model id: ${modelId} (expected compat:<slug>:<model>)`);
  const endpoint = await resolveCustomEndpoint(db, slug);
  if (!endpoint) {
    throw new Error(`No enabled custom model endpoint with slug "${slug}". Add one in Settings → Local & cost-effective models.`);
  }
  const parts = modelId.split(':');
  const model = parts.slice(2).join(':');
  if (!model) throw new Error(`Invalid compat model id: ${modelId} (expected compat:<slug>:<model>)`);
  return { baseUrl: endpoint.baseUrl, apiKey: endpoint.apiKey, extraHeaders: endpoint.extraHeaders, model };
}

// ── Types ──────────────────────────────────────────────────────

export type ModelTier = 'large' | 'medium' | 'small';

export interface StreamChatConfig {
  /** Model ID to use, OR a model tier ('large'/'medium'/'small') to auto-resolve */
  model?: string;
  /** Model tier — resolved to a concrete model ID based on configured provider */
  tier?: ModelTier;
  /** System prompt */
  system: string;
  /**
   * Whether to tell the model today's date (default true). Every call gets it
   * appended to its system prompt unless the prompt already carries it — see
   * server/lib/current-date.ts. Pass `false` ONLY where the system prompt must
   * reach the model byte-for-byte: replay, which resends a stored prompt and
   * records its hash, would otherwise send today's date instead of the date the
   * original run saw.
   */
  currentDate?: boolean;
  /** Conversation messages */
  messages: Array<{ role: string; content: string }>;
  /** Max output tokens */
  maxTokens?: number;
  /** Temperature (0-1 for Claude, 0-2 for others) */
  temperature?: number;
  /** Thinking level for Claude, or triggers Magistral for Mistral */
  thinkingLevel?: string;
  /** Tools (Claude format — auto-converted for other providers) */
  tools?: Array<{ type: string; name?: string; [key: string]: unknown }>;
  /** Request JSON-only output. Uses native JSON mode where the provider
   *  supports it (Mistral/compat response_format, Ollama format:'json');
   *  Claude callers rely on prompt instructions as before. */
  jsonMode?: boolean;
  /** Scheduled or batch work rather than something a person is waiting on.
   *  Only the subscription engines act on it, where concurrency is scarce:
   *  background runs yield a slot so an interactive request is never starved
   *  by a queue the user did not start. Defaults to interactive. */
  background?: boolean;
  /** Seed for reproducible outputs */
  seed?: number;
  /** Database adapter — required for Azure OpenAI config resolution */
  db?: import('../db/database.js').DatabaseAdapter;
  /**
   * Track E: name the utility this call serves ('quality-score',
   * 'atom-extraction', 'session-conclusion', …) and callChat writes an
   * audit_log row for it — module_id `utility:<purpose>`, the resolved
   * provider and model, tokens, cost on the same basis as a module run — so
   * the ledger sees the background calls that used to run unrecorded. Needs
   * `db` as well; streaming callers are audited by their routes.
   */
  purpose?: string;
}

export interface ChatResult {
  text: string;
  thinking: string;
  /** Uncached input tokens (the API's input_tokens — cache reads/writes are separate). */
  inputTokens: number;
  outputTokens: number;
  /** Prompt-cache reads, where the provider reports them (Anthropic API, SDK engine). */
  cacheReadTokens?: number;
  /** Prompt-cache writes, where the provider reports them (Anthropic API, SDK engine). */
  cacheCreationTokens?: number;
  /**
   * The model id the provider says it actually served — the API's dated
   * `response.model`, the SDK engine's per-model usage key. Undefined for
   * providers that do not report one; never a copy of the id that was sent.
   */
  modelServed?: string;
}

// ── Model Tier Resolution ──────────────────────────────────────

/** Default tier-to-model mapping per provider */
export const TIER_MAP: Record<string, Record<ModelTier, string>> = {
  // The API-path lineup — one place to move when a model ships (claude-lineup.ts).
  anthropic: {
    large: CLAUDE_LARGE,
    medium: CLAUDE_MEDIUM,
    small: CLAUDE_SMALL,
  },
  mistral: {
    large: 'mistral-large-latest',
    medium: 'mistral-medium-latest',
    small: 'mistral-small-latest',
  },
  openai: {
    large: 'gpt-4.1',
    medium: 'gpt-4o',
    small: 'gpt-4o-mini',
  },
  google: {
    large: 'gemini-2.5-pro',
    medium: 'gemini-2.5-flash',
    small: 'gemini-2.0-flash',
  },
  // The subscription engine. `large` is overridden by the configured default
  // (the user's own pick — sdk:claude-opus-5-5 today, sdk:claude-fable-5-1 if
  // they choose it); medium and small stay on Sonnet 5 so the ~40 Haiku-class
  // utility calls (extraction, scoring, naming) are not promoted to Opus on
  // plan usage the moment the router learns about the engine.
  anthropic_sdk: {
    large: 'sdk:claude-opus-5-5',
    medium: 'sdk:claude-sonnet-5',
    small: 'sdk:claude-sonnet-5',
  },
};

/**
 * Detect which provider is currently configured (has API key).
 * Priority: Anthropic > Mistral > OpenAI > Google > Ollama
 */
export function getConfiguredProvider(): string {
  // Honor an explicit non-Claude default model first (persisted Settings
  // choice, then env DEFAULT_MODEL), so a user who picks
  // mistral-large-latest / ollama:qwen / compat:<slug>:<model> gets the
  // specialty routes (which hardcode mapModelToProvider('claude-…')) on THAT
  // provider, instead of whichever cloud key happens to be highest priority.
  const def = getEffectiveDefaultModel();
  if (def && !def.startsWith('claude-')) {
    let p: string | null = null;
    try { p = getProviderFromModelId(def); } catch { p = null; }
    if (p === 'ollama' || p === 'openai_compatible') return p;          // keyless / per-endpoint creds
    // Subscription engines are keyless too: the enabled/signed-in check
    // happens at call time, like Ollama's health check. Without this line an
    // sdk: default fell through to "ANTHROPIC_API_KEY is set → 'anthropic'"
    // and every specialty route billed the (unfunded) key instead.
    if (p === 'anthropic_sdk' || p === 'openai_codex') return p;
    if (p === 'mistral' && process.env.MISTRAL_API_KEY) return 'mistral';
    if (p === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
    if (p === 'google' && process.env.GOOGLE_API_KEY) return 'google';
    // azure / key-missing → fall through to env-priority below
  }
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.MISTRAL_API_KEY) return 'mistral';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_API_KEY) return 'google';
  return 'anthropic'; // fallback
}

/**
 * Resolve a model tier to a concrete model ID for the active provider.
 */
export function resolveModel(tierOrModel?: string, tier?: ModelTier): string {
  // If a concrete model ID is provided, use it
  if (tierOrModel && !['large', 'medium', 'small'].includes(tierOrModel)) {
    return tierOrModel;
  }

  const t = (tier || tierOrModel || 'medium') as ModelTier;
  const provider = getConfiguredProvider();
  // Local Ollama / compat endpoints have no large/medium/small tiers — use the
  // configured default model id (Settings > env) for every tier.
  const def = getEffectiveDefaultModel();
  if ((provider === 'ollama' || provider === 'openai_compatible' || provider === 'openai_codex') && def) {
    return def;
  }
  // The large tier is whatever the user set as default — on the subscription
  // engine, and on the API when the default is a Claude id. Without the second
  // half a Settings pick of Opus 4.8 ran large-tier work on the lineup's Opus.
  if (t === 'large' && def && (provider === 'anthropic_sdk' || (provider === 'anthropic' && def.startsWith('claude-')))) return def;
  return TIER_MAP[provider]?.[t] || TIER_MAP.anthropic[t];
}

/** The tier a Claude family name implies; 'medium' for anything else. */
function claudeFamilyTier(claudeModelId: string): ModelTier {
  if (/^claude-(?:opus|fable|mythos)-/.test(claudeModelId)) return 'large';
  if (/^claude-haiku-/.test(claudeModelId)) return 'small';
  return 'medium';
}

/**
 * Get the equivalent model for the current provider given a Claude model ID.
 * Used when routes hardcode Claude models — maps to the right provider equivalent.
 */
export function mapModelToProvider(claudeModelId: string): string {
  // Only a bare Claude id needs mapping. An id that already names an engine or
  // another provider (sdk:, codex:, ollama:, mistral-…) is the caller's explicit
  // choice — engagements pass the resolved product default through here — and
  // must never be re-tiered into something else.
  if (!claudeModelId.startsWith('claude-')) return claudeModelId;

  const provider = getConfiguredProvider();
  if (provider === 'anthropic') return claudeModelId;

  // Local Ollama / compat endpoints (and Codex) have no tier mapping — use the
  // configured default model id (Settings > env) directly.
  const def = getEffectiveDefaultModel();
  if ((provider === 'ollama' || provider === 'openai_compatible' || provider === 'openai_codex') && def) {
    return def;
  }

  // Map Claude model to tier, then resolve for active provider
  const claudeToTier: Record<string, ModelTier> = {
    'claude-fable-5-1': 'large',
    'claude-fable-5': 'large',
    'claude-opus-5-5': 'large',
    'claude-opus-5': 'large',
    'claude-opus-4-8': 'large',
    'claude-opus-4-7': 'large',
    'claude-opus-4-6': 'large',
    'claude-sonnet-5': 'medium',
    'claude-sonnet-4-6': 'medium',
    'claude-sonnet-4-5-20250929': 'medium',
    // Haiku (4.5 today, 5.5 next) takes 'small' from claudeFamilyTier below.
  };

  // A Claude id not listed yet (Haiku 5.5, Sonnet 5.5 the day they ship) takes
  // its family's tier — defaulting it to 'medium' would run a Haiku utility
  // call on Sonnet, or an Opus run on Sonnet.
  const tier = claudeToTier[claudeModelId] || claudeFamilyTier(claudeModelId);
  // Subscription engine: a large-tier Claude id follows the user's default.
  if (provider === 'anthropic_sdk' && tier === 'large' && def) return def;
  return TIER_MAP[provider]?.[tier] || claudeModelId;
}

// ── Tool Format Conversion ─────────────────────────────────────

/**
 * Convert Claude tool format to OpenAI/Mistral format.
 * Claude: { type, name, description, input_schema }
 * Mistral/OpenAI: { type: "function", function: { name, description, parameters } }
 */
export function convertToolsForProvider(
  tools: Array<{ type: string; name?: string; [key: string]: unknown }>,
  provider: string
): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  if (provider === 'anthropic') return tools; // No conversion needed

  // Shared converter (adapters/provider-extras.ts): drops Claude-only
  // web_search tools, emits OpenAI/Mistral function-calling format.
  return convertClaudeToolsToOpenAI(tools as ClaudeToolLike[]);
}

// ── Thinking Configuration for Mistral ─────────────────────────

/**
 * For Mistral: if thinking is requested at investigate+ level,
 * switch to the Magistral reasoning model equivalent.
 * think_hard stays on the standard model (Large/Medium/Small are already capable).
 */
export function resolveMistralThinking(
  modelId: string,
  thinkingLevel?: string
): { model: string; promptMode?: string } {
  if (!thinkingLevel) return { model: modelId };

  const reasoningLevels = ['investigate', 'plan_first', 'deep_investigate'];
  if (!reasoningLevels.includes(thinkingLevel)) return { model: modelId };

  // Map generalist → Magistral reasoning model
  if (modelId === 'mistral-large-latest' || modelId === 'mistral-medium-latest') {
    return { model: 'magistral-medium-latest', promptMode: 'reasoning' };
  }
  if (modelId === 'mistral-small-latest') {
    return { model: 'magistral-small-latest', promptMode: 'reasoning' };
  }

  // Already a Magistral model
  if (modelId.startsWith('magistral-')) {
    return { model: modelId, promptMode: 'reasoning' };
  }

  return { model: modelId };
}

// ── Streaming Chat ─────────────────────────────────────────────

/**
 * Stream a chat completion to an Express SSE response.
 * Routes to the right provider based on model ID.
 *
 * The caller should set SSE headers before calling this:
 *   res.writeHead(200, { 'Content-Type': 'text/event-stream', ... })
 *
 * Returns the accumulated result after stream completes.
 */
// withCurrentDate lives in ../lib/current-date.ts, shared with unified-llm-client.ts.
export { withCurrentDate };

export async function streamChat(
  config: StreamChatConfig,
  res: Response
): Promise<ChatResult> {
  config = withCurrentDate(config);
  const modelId = resolveModel(config.model, config.tier);
  let provider: string;
  try {
    provider = getProviderFromModelId(modelId, config.db);
  } catch {
    provider = 'anthropic';
  }

  const temperature = config.temperature ?? 0.5;
  const maxTokens = config.maxTokens ?? 8192;

  // ── Anthropic ──
  if (provider === 'anthropic') {
    return streamChatAnthropic(modelId, config, temperature, maxTokens, res);
  }

  // ── Subscription execution engines (streaming) ──
  if (provider === 'anthropic_sdk' || provider === 'openai_codex') {
    return streamChatEngine(provider, modelId, config, res);
  }

  // Strip Claude-specific web search instructions for non-Anthropic providers
  config = {
    ...config,
    system: config.system
      .replace(/## WEB SEARCH ENABLED\n[^\n]*Use the web_search tool[^\n]*/g, '')
      .replace(/\n{3,}/g, '\n\n'),
  };

  // ── Mistral ──
  if (provider === 'mistral') {
    return streamChatMistral(modelId, config, temperature, maxTokens, res);
  }

  // ── OpenAI ──
  if (provider === 'openai') {
    const result = await streamOpenAI({
      model: modelId,
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      maxTokens,
      seed: config.seed,
      // Without it every reasoning model ran at the adapter's 'think' default,
      // whatever level the run asked for.
      thinkingLevel: isThinkingLevel(config.thinkingLevel) ? config.thinkingLevel : undefined,
    }, res);
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  // ── Google ──
  if (provider === 'google') {
    const result = await streamGemini({
      model: modelId,
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      maxTokens,
    }, res);
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  // ── Azure OpenAI ──
  if (provider === 'azure_openai') {
    if (!config.db) throw new Error('Database adapter required for Azure OpenAI');
    const deploymentName = modelId.replace('azure:', '');
    const { decrypt } = await import('./credential-vault.js');
    const dep = await config.db.get(
      'SELECT deployment_name, model_name, is_reasoning_model, config_id FROM azure_openai_deployments WHERE deployment_name = $1 AND is_active = TRUE',
      deploymentName
    ) as { deployment_name: string; model_name: string; is_reasoning_model: boolean; config_id: string } | undefined;
    if (!dep) throw new Error(`Azure deployment "${deploymentName}" not found or inactive`);
    const cfg = await config.db.get(
      'SELECT endpoint, api_key_encrypted, api_version FROM azure_openai_config WHERE id = $1 AND is_active = TRUE',
      dep.config_id || 'default'
    ) as { endpoint: string; api_key_encrypted: string; api_version: string } | undefined;
    if (!cfg) throw new Error('Azure OpenAI not configured');
    const azureConfig: AzureOpenAIConfig = {
      endpoint: cfg.endpoint,
      apiKey: decrypt(cfg.api_key_encrypted),
      apiVersion: cfg.api_version,
      deployment: dep.deployment_name,
      isReasoningModel: dep.is_reasoning_model,
    };
    const result = await streamAzureOpenAI({
      model: dep.deployment_name,
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      maxTokens,
      thinkingLevel: config.thinkingLevel as import('../../src/lib/types.js').ThinkingLevel | undefined,
      isReasoningModel: dep.is_reasoning_model,
      seed: config.seed,
    }, azureConfig, res);
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  // ── Ollama ──
  if (provider === 'ollama') {
    const result = await streamOllama({
      model: modelId.replace(/^ollama:/, ''),
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      maxTokens,
      numCtx: await resolveOllamaNumCtx(modelId),
      jsonMode: config.jsonMode,
      tools: config.tools,
    }, res);
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  // ── OpenAI-compatible (compat:<slug>:<model>) ──
  if (provider === 'openai_compatible') {
    const compat = await resolveCompatConfig(modelId, config.db);
    const result = await streamOpenAICompatible({
      baseUrl: compat.baseUrl,
      apiKey: compat.apiKey,
      extraHeaders: compat.extraHeaders,
      model: compat.model,
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      maxTokens,
      jsonMode: config.jsonMode,
      tools: config.tools,
    }, res);
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// ── Subscription-engine streaming helper ──

/**
 * sdk:<model> / codex:<model> through the same engines callChat reaches, but
 * wired to a forwarding sink rather than the caller's response.
 *
 * The engine writes the full module-run SSE envelope (stream_start … usage …
 * stream_end … [DONE]) and ends the sink. streamChat's callers expect only
 * text_delta / thinking_delta frames and write their own terminator afterwards
 * — task-agent even re-enters streamChat on the same response for quality
 * retries. Handing `res` straight to the engine would end the response under
 * them (ERR_STREAM_WRITE_AFTER_END) and leak frames their parsers do not know.
 *
 * Engine failures (disabled, busy, not signed in, run error) arrive as SSE
 * `error` events and never throw; the sink captures them so this branch keeps
 * the API branch's throw-on-failure contract. maxTokens, temperature, seed and
 * jsonMode have no surface on the engine and are not forwarded; tools are —
 * the Claude engine grants its web tools when ANTON's web_search entry is
 * present, Codex has none and gets the instruction stripped.
 */
async function streamChatEngine(
  provider: 'anthropic_sdk' | 'openai_codex',
  modelId: string,
  config: StreamChatConfig,
  res: Response,
): Promise<ChatResult> {
  const engineStream = provider === 'anthropic_sdk' ? sdkEngineStream : codexEngineStream;
  const out: { completion: SdkCompletionData | null; error: string | null } = { completion: null, error: null };
  const sink: StreamSink = {
    headersSent: true,            // the caller owns its headers …
    writeHead: () => undefined,
    write: (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const event = JSON.parse(line.slice(6)) as { type?: string; message?: string };
          if (event.type === 'text_delta' || event.type === 'thinking_delta') res.write(`${line}\n\n`);
          else if (event.type === 'error' && event.message) out.error = event.message;
        } catch { /* non-JSON frame — ignore */ }
      }
    },
    end: () => undefined,         // … and its terminator.
  };
  await engineStream({
    model: modelId,
    thinking: (config.thinkingLevel ?? 'quick') as 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate',
    system: provider === 'openai_codex' ? stripWebSearchInstructions(config.system) : config.system,
    messages: config.messages.map(m => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
    tools: config.tools,
  }, sink, (data) => { out.completion = data; }, { background: config.background === true });
  if (!out.completion) throw new Error(out.error ?? 'SDK engine returned no completion');
  return {
    text: out.completion.text,
    thinking: out.completion.thinking,
    inputTokens: out.completion.inputTokens,
    outputTokens: out.completion.outputTokens,
    cacheReadTokens: out.completion.cacheReadTokens ?? 0,
    cacheCreationTokens: out.completion.cacheCreationTokens ?? 0,
    modelServed: out.completion.modelServed,
  };
}

// ── Anthropic thinking ──

/** max_tokens floor for a Claude 5 call that names no thinking level. */
export const IMPLICIT_THINKING_MIN_TOKENS = 4096;

/**
 * Thinking parameters for an Anthropic API request, and the max_tokens to send.
 *
 * With a thinking level: the capability table's config. Without one, a Claude 5
 * model still thinks — omitting the parameter runs adaptive thinking at the
 * API's default effort ('medium' on Opus 5.5, 'high' on Opus 5), and Opus 5.5
 * cannot turn it off. A no-level call meant "no thinking" on Opus 4.8, and its
 * max_tokens was sized for the answer alone; so such a call gets effort 'low'
 * and at least IMPLICIT_THINKING_MIN_TOKENS, or the thinking can use up a small
 * budget and the answer comes back empty.
 */
export function anthropicThinkingParams(
  modelId: string,
  thinkingLevel: string | undefined,
  maxTokens: number,
): { params: Record<string, unknown>; maxTokens: number } {
  const thinkingConfig = thinkingLevel ? getThinkingConfig(modelId, thinkingLevel) : null;
  if (thinkingConfig && thinkingConfig.thinkingType === 'adaptive') {
    return {
      params: { thinking: { type: 'adaptive' }, output_config: { effort: thinkingConfig.effort || 'medium' } },
      maxTokens: Math.max(thinkingConfig.maxTokens, maxTokens),
    };
  }
  if (thinkingConfig && thinkingConfig.thinkingType === 'enabled' && thinkingConfig.budgetTokens) {
    return {
      params: { thinking: { type: 'enabled', budget_tokens: thinkingConfig.budgetTokens } },
      maxTokens: Math.max(thinkingConfig.maxTokens, maxTokens),
    };
  }
  const generation = claudeGeneration(modelId);
  if (!thinkingConfig && generation !== null && generation >= 5) {
    return {
      params: { output_config: { effort: 'low' } },
      maxTokens: Math.max(maxTokens, IMPLICIT_THINKING_MIN_TOKENS),
    };
  }
  return { params: {}, maxTokens: Math.max(thinkingConfig?.maxTokens || 0, maxTokens) };
}

// ── Anthropic streaming helper ──

async function streamChatAnthropic(
  modelId: string,
  config: StreamChatConfig,
  temperature: number,
  maxTokens: number,
  res: Response
): Promise<ChatResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const client = new Anthropic({ apiKey });
  const thinkingSetup = anthropicThinkingParams(modelId, config.thinkingLevel, maxTokens);

  const apiParams: Record<string, unknown> = {
    model: modelId,
    max_tokens: thinkingSetup.maxTokens,
    system: config.system,
    messages: config.messages.map(m => ({ role: m.role, content: m.content })),
    ...thinkingSetup.params,
  };

  // Tools and thinking go together on the Messages API — adaptive thinking is
  // built for tool use, and budget thinking has taken tools since Claude 3.7.
  // The old "mutually exclusive" guard silently dropped web search from every
  // caller that also set a thinking level (engagements, legal research).
  if (config.tools && config.tools.length > 0) {
    apiParams.tools = config.tools;
  }

  const stream = client.messages.stream(apiParams as Anthropic.MessageStreamParams);

  let fullText = '';
  let fullThinking = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let modelServed: string | undefined;

  for await (const event of stream) {
    const ev = event as unknown as Record<string, unknown>;
    if (ev.type === 'content_block_delta') {
      const delta = ev.delta as Record<string, unknown>;
      if (delta.type === 'text_delta') {
        const text = delta.text as string;
        fullText += text;
        res.write(`data: ${JSON.stringify({ type: 'text_delta', content: text })}\n\n`);
      } else if (delta.type === 'thinking_delta') {
        const text = delta.thinking as string;
        fullThinking += text;
        res.write(`data: ${JSON.stringify({ type: 'thinking_delta', content: text })}\n\n`);
      }
    } else if (ev.type === 'message_delta') {
      const usage = (ev.usage as Record<string, number> | undefined);
      if (usage) {
        outputTokens = usage.output_tokens || 0;
      }
    } else if (ev.type === 'message_start') {
      const msg = ev.message as Record<string, unknown> | undefined;
      if (typeof msg?.model === 'string' && msg.model.length > 0) modelServed = msg.model;
      const usage = msg?.usage as Record<string, number> | undefined;
      if (usage) {
        inputTokens = usage.input_tokens || 0;
        cacheReadTokens = usage.cache_read_input_tokens || 0;
        cacheCreationTokens = usage.cache_creation_input_tokens || 0;
      }
    }
  }

  return { text: fullText, thinking: fullThinking, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, modelServed };
}

// ── Mistral streaming helper ──

async function streamChatMistral(
  modelId: string,
  config: StreamChatConfig,
  temperature: number,
  maxTokens: number,
  res: Response
): Promise<ChatResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY not configured');

  // Resolve thinking → Magistral model switch
  const { model: resolvedModel, promptMode } = resolveMistralThinking(modelId, config.thinkingLevel);

  // M7 (plan 2.13): JSON mode + tools sent natively; one retry without
  // them (plus a prompt-based JSON nudge) if the API rejects the fields.
  const buildBody = (withExtras: boolean): Record<string, unknown> => {
    const system = !withExtras && config.jsonMode
      ? config.system + JSON_ONLY_NUDGE
      : config.system;
    const body: Record<string, unknown> = {
      model: resolvedModel,
      messages: [
        { role: 'system', content: system },
        ...config.messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };

    // Add reasoning mode for Magistral
    if (promptMode) {
      body.prompt_mode = promptMode;
    }

    if (withExtras && config.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    // Add tools (converted to Mistral format)
    if (withExtras && config.tools && config.tools.length > 0) {
      const converted = convertToolsForProvider(config.tools, 'mistral');
      if (converted) {
        body.tools = converted;
        body.tool_choice = 'auto';
      }
    }

    if (config.seed !== undefined) {
      body.random_seed = config.seed;
    }
    return body;
  };

  const post = (withExtras: boolean) => fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildBody(withExtras)),
  });

  const hasExtras = !!(config.jsonMode || (config.tools && config.tools.length > 0));
  let response = await post(true);
  if (!response.ok && hasExtras) {
    const errText = await response.text();
    if (isCapabilityRejection(response.status, errText)) {
      console.warn(`[provider-router] Mistral ${response.status} rejecting tools/response_format — retrying without (model=${resolvedModel})`);
      response = await post(false);
    } else {
      throw new Error(`Mistral API error: ${response.status} ${errText}`);
    }
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mistral API error: ${response.status} ${err}`);
  }

  let fullText = '';
  let fullThinking = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;

        if (delta) {
          // Handle structured content (Magistral thinking blocks)
          if (Array.isArray(delta.content)) {
            for (const block of delta.content) {
              if (block.type === 'thinking' && block.thinking) {
                for (const part of block.thinking) {
                  if (part.type === 'text' && part.text) {
                    fullThinking += part.text;
                    res.write(`data: ${JSON.stringify({ type: 'thinking_delta', content: part.text })}\n\n`);
                  }
                }
              } else if (block.type === 'text' && block.text) {
                fullText += block.text;
                res.write(`data: ${JSON.stringify({ type: 'text_delta', content: block.text })}\n\n`);
              }
            }
          }
          // Handle simple string content (standard Mistral models)
          else if (typeof delta.content === 'string') {
            fullText += delta.content;
            res.write(`data: ${JSON.stringify({ type: 'text_delta', content: delta.content })}\n\n`);
          }
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }
      } catch {
        // skip parse errors
      }
    }
  }

  return { text: fullText, thinking: fullThinking, inputTokens, outputTokens };
}

// ── Non-Streaming Chat ─────────────────────────────────────────

export interface UtilityAuditInput {
  purpose: string;
  provider: string;
  modelId: string;
  thinkingLevel?: string;
  seed?: number;
  /** Uncached input tokens, as ChatResult reports them. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  status: 'success' | 'error';
}

/**
 * The audit_log row for one utility call, on the chat route's cost basis:
 * registry pricing → list cost; ollama → 0; a subscription engine (plan usage)
 * or an unpriced provider (azure/compat) → undefined, so the queue keeps NULL
 * rather than a phantom or a "free".
 *
 * Priced cost: uncached input at list, cache reads at the cached-input rate,
 * cache writes at 1.25× list. estimateCost() takes cached tokens as a SUBSET of
 * its input figure, so reads and writes are added to the input it is given and
 * the 0.25× write premium on top.
 */
export function buildUtilityAuditEntry(input: UtilityAuditInput): AuditEntry {
  const isEngine = input.provider === 'anthropic_sdk' || input.provider === 'openai_codex';
  const bareModel = capabilityModelId(input.modelId);
  const caps = isEngine ? undefined : MODEL_CAPABILITIES[bareModel];
  const cacheRead = input.cacheReadTokens ?? 0;
  const cacheCreate = input.cacheCreationTokens ?? 0;
  const estimatedCostUsd = caps
    ? estimateCost(bareModel, input.inputTokens + cacheRead + cacheCreate, input.outputTokens, cacheRead)
      + (cacheCreate / 1_000_000) * caps.pricing.inputPerMillion * 0.25
    : input.provider === 'ollama' ? 0 : undefined;
  return {
    moduleId: `utility:${input.purpose}`,
    model: input.modelId,
    provider: input.provider,
    thinkingLevel: input.thinkingLevel,
    writingTone: 'professional',
    emojiEnabled: false,
    structuredReasoning: false,
    transparencyLevel: 0,
    inputTokenCount: input.inputTokens,
    outputTokenCount: input.outputTokens,
    cachedTokens: cacheRead,
    cacheCreationTokens: cacheCreate,
    estimatedCostUsd,
    responseStatus: input.status,
    seed: input.seed,
  };
}

/**
 * Non-streaming chat completion. Returns the full response.
 * Used by routes that need a complete response (scoring, bridges, etc.)
 *
 * With `purpose` + `db` set the call is audited (see buildUtilityAuditEntry):
 * one row on success with the real token counts, one on failure with status
 * 'error' before the error is rethrown.
 */
export async function callChat(config: StreamChatConfig): Promise<ChatResult> {
  config = withCurrentDate(config);
  if (!config.purpose || !config.db) return dispatchCallChat(config);

  const modelId = resolveModel(config.model, config.tier);
  let provider: string;
  try {
    provider = getProviderFromModelId(modelId, config.db);
  } catch {
    provider = 'anthropic';
  }
  const purpose = config.purpose;
  const audit = (status: 'success' | 'error', usage: Partial<ChatResult>): void => {
    enqueueAudit(buildUtilityAuditEntry({
      purpose, provider, modelId,
      thinkingLevel: config.thinkingLevel, seed: config.seed,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      cacheReadTokens: usage.cacheReadTokens || 0,
      cacheCreationTokens: usage.cacheCreationTokens || 0,
      status,
    }));
  };
  try {
    const result = await dispatchCallChat(config);
    audit('success', result);
    return result;
  } catch (err) {
    audit('error', {});
    throw err;
  }
}

async function dispatchCallChat(config: StreamChatConfig): Promise<ChatResult> {
  const modelId = resolveModel(config.model, config.tier);
  let provider: string;
  try {
    provider = getProviderFromModelId(modelId, config.db);
  } catch {
    provider = 'anthropic';
  }

  const maxTokens = config.maxTokens ?? 8192;

  // ── Anthropic (non-streaming) ──
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const client = new Anthropic({ apiKey });
    const thinkingSetup = anthropicThinkingParams(modelId, config.thinkingLevel, maxTokens);

    const apiParams: Record<string, unknown> = {
      model: modelId,
      max_tokens: thinkingSetup.maxTokens,
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      ...thinkingSetup.params,
    };

    // Forward tools — with thinking too; see streamChatAnthropic for why the
    // former exclusivity guard was wrong.
    if (config.tools && config.tools.length > 0) {
      apiParams.tools = config.tools;
    }

    // Use streaming internally to avoid "Streaming is required for operations
    // that may take longer than 10 minutes" SDK error on large requests
    const stream = client.messages.stream(apiParams as unknown as Anthropic.MessageCreateParamsStreaming);
    const response = await stream.finalMessage();

    let text = '';
    let thinking = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'thinking') thinking += ((block as unknown as Record<string, unknown>).thinking as string) || '';
    }

    return {
      text,
      thinking,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      modelServed: typeof response.model === 'string' && response.model.length > 0 ? response.model : undefined,
    };
  }

  // ── Mistral (non-streaming) ──
  if (provider === 'mistral') {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY not configured');

    const { model: resolvedModel, promptMode } = resolveMistralThinking(modelId, config.thinkingLevel);

    // M7 (plan 2.13): this body previously dropped tools + JSON mode.
    // Now both are sent natively, with one retry without them on rejection.
    const buildBody = (withExtras: boolean): Record<string, unknown> => {
      const system = !withExtras && config.jsonMode
        ? config.system + JSON_ONLY_NUDGE
        : config.system;
      const body: Record<string, unknown> = {
        model: resolvedModel,
        messages: [
          { role: 'system', content: system },
          ...config.messages.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: config.temperature ?? 0.5,
        max_tokens: maxTokens,
      };

      if (promptMode) body.prompt_mode = promptMode;
      if (config.seed !== undefined) body.random_seed = config.seed;
      if (withExtras && config.jsonMode) body.response_format = { type: 'json_object' };
      if (withExtras && config.tools && config.tools.length > 0) {
        const converted = convertToolsForProvider(config.tools, 'mistral');
        if (converted) {
          body.tools = converted;
          body.tool_choice = 'auto';
        }
      }
      return body;
    };

    const post = (withExtras: boolean) => fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildBody(withExtras)),
    });

    const hasExtras = !!(config.jsonMode || (config.tools && config.tools.length > 0));
    let response = await post(true);
    if (!response.ok && hasExtras) {
      const errText = await response.text();
      if (isCapabilityRejection(response.status, errText)) {
        console.warn(`[provider-router] Mistral ${response.status} rejecting tools/response_format — retrying without (model=${resolvedModel})`);
        response = await post(false);
      } else {
        throw new Error(`Mistral API error: ${response.status} ${errText}`);
      }
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Mistral API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    let text = '';
    let thinking = '';

    // Handle structured content (Magistral)
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'thinking' && block.thinking) {
          for (const part of block.thinking) {
            if (part.type === 'text') thinking += part.text;
          }
        } else if (block.type === 'text') {
          text += block.text;
        }
      }
    } else {
      text = typeof content === 'string' ? content : JSON.stringify(content);
    }

    return {
      text,
      thinking,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
  }

  // ── OpenAI / Google / Ollama (non-streaming) ──
  // For these, use a simple fetch-based approach
  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    // Reasoning models (o-series, GPT-5.x, GPT-6) take reasoning_effort +
    // max_completion_tokens and reject temperature — the same split as the
    // streaming adapter; this branch used to send temperature to all of them.
    const sizing: Record<string, unknown> = isOpenAIReasoningModel(modelId)
      ? { reasoning_effort: openaiReasoningEffort(isThinkingLevel(config.thinkingLevel) ? config.thinkingLevel : 'think', modelId), max_completion_tokens: maxTokens }
      : { max_tokens: maxTokens, temperature: config.temperature ?? 0.5 };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: config.system },
          ...config.messages.map(m => ({ role: m.role, content: m.content })),
        ],
        ...sizing,
      }),
    });
    if (!response.ok) {
      // A 4xx used to come back as an empty answer (data.choices undefined).
      throw new Error(`OpenAI API error: ${response.status} ${(await response.text()).slice(0, 300)}`);
    }

    const data = await response.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      thinking: '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
  }

  // ── Azure OpenAI (non-streaming) ──
  if (provider === 'azure_openai') {
    if (!config.db) throw new Error('Database adapter required for Azure OpenAI');
    const deploymentName = modelId.replace('azure:', '');
    const { decrypt } = await import('./credential-vault.js');
    const dep = await config.db.get(
      'SELECT deployment_name, model_name, is_reasoning_model, config_id FROM azure_openai_deployments WHERE deployment_name = $1 AND is_active = TRUE',
      deploymentName
    ) as { deployment_name: string; model_name: string; is_reasoning_model: boolean; config_id: string } | undefined;
    if (!dep) throw new Error(`Azure deployment "${deploymentName}" not found or inactive`);
    const cfg = await config.db.get(
      'SELECT endpoint, api_key_encrypted, api_version FROM azure_openai_config WHERE id = $1 AND is_active = TRUE',
      dep.config_id || 'default'
    ) as { endpoint: string; api_key_encrypted: string; api_version: string } | undefined;
    if (!cfg) throw new Error('Azure OpenAI not configured');

    const { AzureOpenAIAdapter } = await import('./adapters/azureOpenaiAdapter.js');
    const adapter = new AzureOpenAIAdapter({
      endpoint: cfg.endpoint,
      apiKey: decrypt(cfg.api_key_encrypted),
      apiVersion: cfg.api_version,
      deployment: dep.deployment_name,
      isReasoningModel: dep.is_reasoning_model,
    });
    const result = await adapter.sendRequest({
      model: dep.deployment_name,
      systemPrompt: config.system,
      messages: config.messages.map(m => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
      thinking: config.thinkingLevel as import('../../src/lib/types.js').ThinkingLevel | undefined,
      creativity: 'balanced',
      maxTokens,
      seed: config.seed,
    });
    return {
      text: result.content,
      thinking: '',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    };
  }

  // ── Ollama (non-streaming) ──
  if (provider === 'ollama') {
    const result = await callOllama({
      model: modelId.replace(/^ollama:/, ''),
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: config.temperature,
      maxTokens,
      numCtx: await resolveOllamaNumCtx(modelId),
      jsonMode: config.jsonMode,
      tools: config.tools,
    });
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  // ── OpenAI-compatible (non-streaming) ──
  if (provider === 'openai_compatible') {
    const compat = await resolveCompatConfig(modelId, config.db);
    const result = await callOpenAICompatible({
      baseUrl: compat.baseUrl,
      apiKey: compat.apiKey,
      extraHeaders: compat.extraHeaders,
      model: compat.model,
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: config.temperature,
      maxTokens,
      jsonMode: config.jsonMode,
      tools: config.tools,
    });
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  // ── Subscription execution engines (non-streaming) ──
  // sdk:<model> / codex:<model> run through the Claude Agent SDK / Codex SDK
  // subprocess on this machine's subscription sign-in — no API key. Like the
  // API branches, failures (engine disabled, not signed in, run error) throw.
  // jsonMode is not forwarded (the engines carry JSON expectations in the
  // prompt, as the Anthropic branch does); tools are — the Claude engine grants
  // its web tools for ANTON's web_search entry, Codex has none.
  if (provider === 'anthropic_sdk' || provider === 'openai_codex') {
    const completeText = provider === 'anthropic_sdk' ? sdkEngineCompleteText : codexEngineCompleteText;
    const data = await completeText({
      model: modelId,
      thinking: (config.thinkingLevel ?? 'quick') as 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate',
      system: provider === 'openai_codex' ? stripWebSearchInstructions(config.system) : config.system,
      messages: config.messages.map(m => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      })),
      tools: config.tools,
    }, { background: config.background === true });
    return {
      text: data.text,
      thinking: data.thinking,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheReadTokens: data.cacheReadTokens ?? 0,
      cacheCreationTokens: data.cacheCreationTokens ?? 0,
      modelServed: data.modelServed,
    };
  }

  throw new Error(`Non-streaming not implemented for provider: ${provider}`);
}

// ── SSE Helpers ────────────────────────────────────────────────

/** Set standard SSE headers on an Express response */
export function setSSEHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}
