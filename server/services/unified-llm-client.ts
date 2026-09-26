/**
 * unified-llm-client.ts
 *
 * Multi-Provider LLM Client
 *
 * Purpose: Route requests to the appropriate provider adapter based on model ID.
 * Preserves existing Anthropic-specific features (prompt caching) while enabling
 * OpenAI, Google, Mistral, and Ollama support.
 *
 * Architecture:
 * - Anthropic models → claude-client.ts (preserves prompt caching optimization)
 * - All other models → ModelAdapter (unified interface)
 */

import type { StreamSink } from './stream-sink.js';
import type { DatabaseAdapter } from '../db/database.js';
import { createModelAdapter, getProviderFromModelId, getCustomModelConfigsSync, type UnifiedLLMRequest, type OpenAICompatibleConfig } from './model-adapter.js';
import * as claudeClient from './claude-client.js';
import * as sdkClient from './claude-sdk-client.js';
import * as codexClient from './codex-sdk-client.js';
import { decrypt } from './credential-vault.js';
import type { AzureOpenAIConfig } from './adapters/azureOpenaiAdapter.js';
import { resolveCompatModel } from './compat-endpoint.js';
import { assertSpendAllowed } from './llm-spend.js';
import { mapModelToProvider } from './provider-router.js';
import type { CompatInputMessage, OpenAICompatibleStreamResult } from './adapters/openaiCompatibleAdapter.js';
import { withCurrentDate } from '../lib/current-date.js';
import type { ModelId, ThinkingLevel, CreativityLevel } from '../../src/lib/types.js';

// ── Configuration ──────────────────────────────────────────────

interface UnifiedStreamConfig {
  model: ModelId;
  thinking: ThinkingLevel;
  creativity?: CreativityLevel;
  system: string;
  staticSystemPrompt?: string;
  /** Tell the model today's date (default true). See server/lib/current-date.ts. */
  currentDate?: boolean;
  messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }>;
  tools?: Array<{ type: string; name: string }>;
  maxTokens?: number;
  nativeReasoningEnabled?: boolean;
  seed?: number;
  /** Request native JSON mode where the provider supports it (M7 —
   *  Mistral/compat response_format, Ollama format:'json', OpenAI/Gemini
   *  schema mode). Claude callers keep using prompt instructions. */
  structuredOutput?: UnifiedLLMRequest['structuredOutput'];
  db?: DatabaseAdapter;
}

export interface StreamCompletionData {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
  /** Why the model stopped, where the adapter reports it ('length' = cut off). */
  finishReason?: string | null;
  /** Set when the answer is incomplete (a compat answer cut off at the output limit). */
  warning?: string;
}

/** The frame that tells a streaming client its answer was cut off. */
function truncationFrame(warning: string): object {
  return { type: 'warning', code: 'output_truncated', message: warning };
}

// ── Environment Variables ─────────────────────────────────────

const API_KEYS: Record<string, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  google: process.env.GOOGLE_API_KEY,
  mistral: process.env.MISTRAL_API_KEY,
  azure_openai: undefined, // Loaded from DB per-request
  ollama: undefined, // Ollama runs locally, no API key needed
};

// ── Azure OpenAI Config Resolution ────────────────────────
async function resolveAzureConfig(modelId: string, db?: DatabaseAdapter): Promise<AzureOpenAIConfig | null> {
  if (!db || !modelId.startsWith('azure:')) return null;
  const deploymentName = modelId.replace('azure:', '');

  const deployment = await db.get<{
    deployment_name: string;
    model_name: string;
    is_reasoning_model: boolean;
    config_id: string;
  }>('SELECT deployment_name, model_name, is_reasoning_model, config_id FROM azure_openai_deployments WHERE deployment_name = $1 AND is_active = TRUE', [deploymentName]);

  if (!deployment) return null;

  const config = await db.get<{
    endpoint: string;
    api_key_encrypted: string;
    api_version: string;
  }>('SELECT endpoint, api_key_encrypted, api_version FROM azure_openai_config WHERE id = $1 AND is_active = TRUE', [deployment.config_id || 'default']);

  if (!config) return null;

  return {
    endpoint: config.endpoint,
    apiKey: decrypt(config.api_key_encrypted),
    apiVersion: config.api_version,
    deployment: deployment.deployment_name,
    isReasoningModel: deployment.is_reasoning_model,
  };
}

// ── OpenAI-Compatible Endpoint Resolution ──────────────────
// Resolve the custom endpoint config (DeepSeek / OpenRouter / Together / Groq /
// vLLM / …) for compat:<slug>:<model> ids. Shared by all three entry points
// (streamToResponse, sendRequest, streamToHandler) so each passes the same
// 4th arg to createModelAdapter. The one resolver (compat-endpoint.ts) refuses
// a model the endpoint does not allow and falls back on the database
// registered at boot when the caller passed none.
async function resolveCompatConfig(modelId: string, db?: DatabaseAdapter): Promise<OpenAICompatibleConfig> {
  const compat = await resolveCompatModel(modelId, db);
  return {
    baseUrl: compat.endpoint.baseUrl,
    apiKey: compat.endpoint.apiKey,
    extraHeaders: compat.endpoint.extraHeaders,
    extraBody: compat.endpoint.extraBody,
    modelMeta: compat.meta,
    maxOutputTokens: compat.endpoint.maxOutputTokens,
    pricing: compat.pricing,
    modelId,
    db,
  };
}

/**
 * Entry rules shared by the three entry points: today's date in the system
 * prompt, a bare claude-* id mapped to the configured engine (Civic, Grow and
 * Procure name literal Sonnet ids; on a server with no Anthropic key they
 * failed with "API key not configured" instead of following the Settings
 * default, as every provider-router call does), and the daily spend caps for
 * priced compat calls.
 */
async function enterRouter(config: UnifiedStreamConfig): Promise<{ config: UnifiedStreamConfig; provider: ReturnType<typeof getProviderFromModelId> }> {
  let next = withCurrentDate(config);
  if (typeof next.model === 'string' && next.model.startsWith('claude-')) {
    const mapped = mapModelToProvider(next.model);
    if (mapped !== next.model) next = { ...next, model: mapped as ModelId };
  }
  const provider = getProviderFromModelId(next.model, next.db);
  if (provider === 'openai_compatible') await assertSpendAllowed({ db: next.db });
  return { config: next, provider };
}

/** The compat adapter's own token counts, when the last call reported them. */
function compatUsageOf(adapter: object): OpenAICompatibleStreamResult | null {
  const last = (adapter as { lastResult?: OpenAICompatibleStreamResult | null }).lastResult;
  return last ?? null;
}

/**
 * For a compat endpoint, the messages with their content blocks intact: the
 * adapter turns images into image parts (or refuses them), instead of the
 * JSON-stringified base64 every other adapter here is handed.
 */
function compatMessagesFor(provider: string, config: UnifiedStreamConfig): { compatMessages?: CompatInputMessage[] } {
  if (provider !== 'openai_compatible') return {};
  return { compatMessages: config.messages.map((m) => ({ role: m.role, content: m.content })) };
}

// ── Provider Detection ─────────────────────────────────────────

function getApiKeyForModel(modelId: string, db?: DatabaseAdapter): string | undefined {
  // Check custom model slots for API key overrides
  if (db) {
    const customModels = getCustomModelConfigsSync(db);
    const match = customModels.find((m: { modelId: string }) => m.modelId === modelId);
    if (match) {
      // Custom API key override takes priority
      if (match.apiKeyOverride) return match.apiKeyOverride;
      // Then check custom env var
      if (match.apiKeyEnvVar && process.env[match.apiKeyEnvVar]) return process.env[match.apiKeyEnvVar];
      // Fall through to standard provider key
    }
  }

  const provider = getProviderFromModelId(modelId, db);
  // Re-read env vars at call time (they may be set at runtime via settings)
  const keys: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    ollama: undefined,
  };
  return keys[provider];
}

export function isModelAvailable(modelId: string, db?: DatabaseAdapter): boolean {
  try {
    const provider = getProviderFromModelId(modelId, db);

    // Ollama models require local installation, not API key
    if (provider === 'ollama') {
      // Will check Ollama health in the request
      return true;
    }

    // Azure models are available if they're in the deployments table (checked at request time)
    if (provider === 'azure_openai') {
      return true;
    }

    const apiKey = getApiKeyForModel(modelId, db);
    return !!apiKey;
  } catch {
    return false;
  }
}

// ── Unified Streaming Function ────────────────────────────────

export async function streamToResponse(
  config: UnifiedStreamConfig,
  res: StreamSink,
  onComplete?: (data: StreamCompletionData) => void
): Promise<void> {
  const entered = await enterRouter(config);
  config = entered.config;
  const provider = entered.provider;

  // Subscription execution engines — sdk:<model> / codex:<model> run through
  // the Claude Agent SDK / Codex SDK subprocess (subscription auth), emitting
  // the identical SSE contract.
  if (provider === 'anthropic_sdk' || provider === 'openai_codex') {
    const engine = provider === 'anthropic_sdk' ? sdkClient : codexClient;
    return engine.streamToResponse(
      {
        model: config.model,
        thinking: config.thinking,
        system: config.system,
        staticSystemPrompt: config.staticSystemPrompt,
        messages: config.messages,
        tools: config.tools,
      },
      res,
      onComplete
    );
  }

  // Special case: Use existing claude-client for Anthropic models
  // This preserves prompt caching optimization
  if (provider === 'anthropic') {
    return claudeClient.streamToResponse(
      {
        model: config.model as 'claude-opus-5-5' | 'claude-opus-4-8' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6',
        thinking: config.thinking,
        system: config.system,
        staticSystemPrompt: config.staticSystemPrompt,
        messages: config.messages,
        tools: config.tools,
        maxTokens: config.maxTokens,
        nativeReasoningEnabled: config.nativeReasoningEnabled,
      },
      res,
      onComplete
    );
  }

  // For all other providers, use ModelAdapter
  let azureConfig: AzureOpenAIConfig | null = null;
  if (provider === 'azure_openai') {
    azureConfig = await resolveAzureConfig(config.model, config.db);
    if (!azureConfig) {
      throw new Error('Azure OpenAI deployment not configured or inactive');
    }
  }

  // Resolve OpenAI-compatible custom endpoint (DeepSeek / OpenRouter / Together / Groq / vLLM / …)
  let compatConfig: OpenAICompatibleConfig | undefined;
  if (provider === 'openai_compatible') {
    compatConfig = await resolveCompatConfig(config.model, config.db);
  }

  const apiKey = provider === 'azure_openai' || provider === 'openai_compatible'
    ? undefined
    : getApiKeyForModel(config.model, config.db);

  if (!apiKey && provider !== 'ollama' && provider !== 'azure_openai' && provider !== 'openai_compatible') {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  const adapter = createModelAdapter(provider, apiKey, azureConfig ?? undefined, compatConfig);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    // Strip Claude-specific web search instructions for non-Anthropic providers
    const webSearchWasRequested = config.system?.includes('WEB SEARCH ENABLED');
    const cleanSystem = (s: string) => s
      .replace(/## WEB SEARCH ENABLED\n[^\n]*Use the web_search tool[^\n]*/g, '')
      .replace(/\n{3,}/g, '\n\n');

    let systemPrompt = config.staticSystemPrompt
      ? cleanSystem(`${config.staticSystemPrompt}\n\n${config.system}`)
      : cleanSystem(config.system);

    // For ALL non-Anthropic providers: if web search was requested and Bing is
    // configured, pre-search and inject results (Claude uses its native web_search
    // tool; this path is only reached by non-Anthropic providers).
    if (webSearchWasRequested && config.db) {
      try {
        const { getBingSearchApiKey, searchAndFormat, extractSearchQuery } = await import('./bing-search.js');
        const bingKey = await getBingSearchApiKey(config.db);
        if (bingKey) {
          const lastUserMsg = [...config.messages].reverse().find(m => m.role === 'user');
          const queryText = lastUserMsg
            ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg.content))
            : '';
          if (queryText) {
            const searchResults = await searchAndFormat(extractSearchQuery(queryText), bingKey);
            systemPrompt += `\n\n${searchResults}`;
          }
        }
      } catch (bingErr) {
        console.warn('[ANTON] Bing search failed:', bingErr instanceof Error ? bingErr.message : bingErr);
      }
    }

    // Build unified request
    const unifiedReq: UnifiedLLMRequest = {
      model: config.model,
      systemPrompt,
      messages: config.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      thinking: config.thinking,
      creativity: config.creativity || 'balanced',
      maxTokens: config.maxTokens,
      seed: config.seed,
      tools: config.tools,
      structuredOutput: config.structuredOutput,
      stream: true,
      ...compatMessagesFor(provider, config),
    };

    let fullText = '';
    let startTime = Date.now();

    // Stream response
    for await (const chunk of adapter.sendStreamRequest(unifiedReq)) {
      fullText += chunk;
      sendEvent({ type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } });
    }

    const elapsed = Date.now() - startTime;

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters) — unless
    // the endpoint reported them (compat endpoints do, with include_usage).
    const reported = compatUsageOf(adapter);
    const estimatedInputTokens = reported?.inputTokens || Math.ceil(
      (unifiedReq.systemPrompt.length + JSON.stringify(unifiedReq.messages).length) / 4
    );
    const estimatedOutputTokens = reported?.outputTokens || Math.ceil(fullText.length / 4);

    // A compat answer cut off at the output limit is said so, not passed off as complete.
    if (reported?.warning) sendEvent(truncationFrame(reported.warning));

    // Send completion event
    sendEvent({
      type: 'message_stop',
      usage: {
        input_tokens: estimatedInputTokens,
        output_tokens: estimatedOutputTokens,
      },
    });

    sendEvent({ type: 'done' });

    res.end();

    // Call onComplete callback
    if (onComplete) {
      onComplete({
        text: fullText,
        // Compat endpoints return the model's reasoning; other adapters do not.
        thinking: reported?.thinking ?? '',
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        ...(reported?.reasoningTokens ? { thinkingTokens: reported.reasoningTokens } : {}),
        ...(reported ? { finishReason: reported.finishReason } : {}),
        ...(reported?.warning ? { warning: reported.warning } : {}),
      });
    }

    console.log(
      `[unified-llm-client] Streamed ${estimatedOutputTokens} tokens from ${provider} (${config.model}) in ${elapsed}ms`
    );
  } catch (error) {
    console.error(`[unified-llm-client] Streaming error (${provider}):`, error);

    sendEvent({
      type: 'error',
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown streaming error',
      },
    });

    res.end();
    throw error;
  }
}

// ── Non-Streaming Request (for Review Engine, etc.) ───────────

export async function sendRequest(config: UnifiedStreamConfig): Promise<StreamCompletionData> {
  const entered = await enterRouter(config);
  config = entered.config;
  const provider = entered.provider;

  // Subscription execution engines — aggregate the stream into one completion.
  if (provider === 'anthropic_sdk' || provider === 'openai_codex') {
    const engine = provider === 'anthropic_sdk' ? sdkClient : codexClient;
    return engine.completeText({
      model: config.model,
      thinking: config.thinking,
      system: config.system,
      staticSystemPrompt: config.staticSystemPrompt,
      messages: config.messages,
      tools: config.tools,
    });
  }

  // For Anthropic, we could use the existing client, but it's stream-only
  // So we'll use the adapter for consistency in non-streaming mode

  let azureConfigNonStream: AzureOpenAIConfig | null = null;
  if (provider === 'azure_openai') {
    azureConfigNonStream = await resolveAzureConfig(config.model, config.db);
    if (!azureConfigNonStream) {
      throw new Error('Azure OpenAI deployment not configured or inactive');
    }
  }

  // Resolve OpenAI-compatible custom endpoint (DeepSeek / OpenRouter / Together / Groq / vLLM / …)
  let compatConfigNonStream: OpenAICompatibleConfig | undefined;
  if (provider === 'openai_compatible') {
    compatConfigNonStream = await resolveCompatConfig(config.model, config.db);
  }

  const apiKey = provider === 'azure_openai' || provider === 'openai_compatible'
    ? undefined
    : getApiKeyForModel(config.model, config.db);

  if (!apiKey && provider !== 'ollama' && provider !== 'azure_openai' && provider !== 'openai_compatible') {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  const adapter = createModelAdapter(provider, apiKey, azureConfigNonStream ?? undefined, compatConfigNonStream);

  const unifiedReq: UnifiedLLMRequest = {
    model: config.model,
    systemPrompt: config.staticSystemPrompt
      ? `${config.staticSystemPrompt}\n\n${config.system}`
      : config.system,
    messages: config.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
    thinking: config.thinking,
    creativity: config.creativity || 'balanced',
    maxTokens: config.maxTokens,
    seed: config.seed,
    tools: config.tools,
    structuredOutput: config.structuredOutput,
    stream: false,
    ...compatMessagesFor(provider, config),
  };

  const response = await adapter.sendRequest(unifiedReq);
  const warning = compatUsageOf(adapter)?.warning;

  return {
    text: response.content,
    thinking: response.thinking || '',
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    thinkingTokens: response.usage.thinkingTokens,
    // Kept, so a caller can tell a cut-off answer ('length') from a complete one.
    finishReason: response.finishReason ?? null,
    ...(warning ? { warning } : {}),
  };
}

// ── Callback-based Streaming (for WebSocket delivery) ─────────

export async function streamToHandler(
  config: UnifiedStreamConfig,
  onEvent: (event: object) => void,
  onComplete?: (data: StreamCompletionData) => void
): Promise<void> {
  const entered = await enterRouter(config);
  config = entered.config;
  const provider = entered.provider;

  if (provider === 'anthropic' || provider === 'anthropic_sdk' || provider === 'openai_codex') {
    // Create a mock response to capture SSE events from claude-client
    // (or the subscription engines, which deliberately mirror its
    // swallow-into-SSE-error contract) and redirect them to the onEvent callback
    let mockEventCount = 0;
    // claude-client's streamToResponse SWALLOWS API errors: on failure it
    // emits an SSE `error` event then res.end()s, rather than throwing or
    // calling onComplete. For real HTTP SSE the browser sees that event — but
    // on this sync/onComplete path (e.g. companion /query-sync) onComplete is
    // the ONLY completion signal, so an error means the awaiting caller hangs
    // forever (observed: no-credit Anthropic key → app stuck on "Thinking…").
    // Capture the error + completion so we can rethrow below and let the
    // caller reject (→ 500) instead of hanging.
    let streamErrorMessage: string | null = null;
    let completed = false;
    // A real StreamSink (no Express fakery): parses the SSE wire format the
    // stream writes and forwards each event to the caller's handler.
    const mockRes: StreamSink = {
      headersSent: false,
      writeHead: () => undefined,
      write: (chunk: string) => {
        // Parse all SSE data lines from the chunk (may contain multiple events)
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              mockEventCount++;
              if (parsed && parsed.type === 'error') {
                streamErrorMessage =
                  (parsed.error && parsed.error.message) || parsed.message || 'LLM streaming error';
              }
              onEvent(parsed);
            } catch {}
          }
        }
        return true;
      },
      end: () => { console.log(`[streamToHandler] mock end, ${mockEventCount} events forwarded`); },
    };

    const wrappedComplete = onComplete
      ? (data: StreamCompletionData) => { completed = true; onComplete(data); }
      : undefined;

    if (provider === 'anthropic_sdk' || provider === 'openai_codex') {
      const engine = provider === 'anthropic_sdk' ? sdkClient : codexClient;
      await engine.streamToResponse(
        {
          model: config.model,
          thinking: config.thinking,
          system: config.system,
          staticSystemPrompt: config.staticSystemPrompt,
          messages: config.messages,
          tools: config.tools,
        },
        mockRes,
        wrappedComplete
      );
    } else {
      await claudeClient.streamToResponse(
      {
        model: config.model as 'claude-opus-5-5' | 'claude-opus-4-8' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6',
        thinking: config.thinking,
        system: config.system,
        staticSystemPrompt: config.staticSystemPrompt,
        messages: config.messages,
        tools: config.tools,
        maxTokens: config.maxTokens,
        nativeReasoningEnabled: config.nativeReasoningEnabled,
      },
      mockRes,
      wrappedComplete
    );
    }

    // If the underlying stream errored (provider 4xx, insufficient credit, …)
    // and never completed, surface it so the caller rejects instead of hanging.
    if (!completed && streamErrorMessage) {
      throw new Error(streamErrorMessage);
    }
    return;
  }

  // Non-Anthropic providers
  let azureConfig: AzureOpenAIConfig | null = null;
  if (provider === 'azure_openai') {
    azureConfig = await resolveAzureConfig(config.model, config.db);
    if (!azureConfig) throw new Error('Azure OpenAI deployment not configured or inactive');
  }

  // Resolve OpenAI-compatible custom endpoint (DeepSeek / OpenRouter / Together / Groq / vLLM / …)
  let compatConfig: OpenAICompatibleConfig | undefined;
  if (provider === 'openai_compatible') {
    compatConfig = await resolveCompatConfig(config.model, config.db);
  }

  const apiKey = provider === 'azure_openai' || provider === 'openai_compatible'
    ? undefined
    : getApiKeyForModel(config.model, config.db);
  if (!apiKey && provider !== 'ollama' && provider !== 'azure_openai' && provider !== 'openai_compatible') {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  const adapter = createModelAdapter(provider, apiKey, azureConfig ?? undefined, compatConfig);

  const unifiedReq: UnifiedLLMRequest = {
    model: config.model,
    systemPrompt: config.staticSystemPrompt
      ? `${config.staticSystemPrompt}\n\n${config.system}`
      : config.system,
    messages: config.messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
    thinking: config.thinking,
    creativity: config.creativity || 'balanced',
    maxTokens: config.maxTokens,
    seed: config.seed,
    tools: config.tools,
    structuredOutput: config.structuredOutput,
    stream: true,
    ...compatMessagesFor(provider, config),
  };

  let fullText = '';

  try {
    onEvent({ type: 'message_start' });

    for await (const chunk of adapter.sendStreamRequest(unifiedReq)) {
      fullText += chunk;
      onEvent({ type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } });
    }

    const reported = compatUsageOf(adapter);
    const estimatedInputTokens = reported?.inputTokens || Math.ceil(
      (unifiedReq.systemPrompt.length + JSON.stringify(unifiedReq.messages).length) / 4
    );
    const estimatedOutputTokens = reported?.outputTokens || Math.ceil(fullText.length / 4);

    if (reported?.warning) onEvent(truncationFrame(reported.warning));
    onEvent({
      type: 'message_stop',
      usage: { input_tokens: estimatedInputTokens, output_tokens: estimatedOutputTokens },
    });
    onEvent({ type: 'done' });

    if (onComplete) {
      onComplete({
        text: fullText,
        thinking: reported?.thinking ?? '',
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        ...(reported?.reasoningTokens ? { thinkingTokens: reported.reasoningTokens } : {}),
        ...(reported ? { finishReason: reported.finishReason } : {}),
        ...(reported?.warning ? { warning: reported.warning } : {}),
      });
    }
  } catch (error) {
    onEvent({
      type: 'error',
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown streaming error',
      },
    });
    throw error;
  }
}

// ── Health Check ───────────────────────────────────────────────

export async function checkProviderHealth(provider: 'anthropic' | 'openai' | 'azure_openai' | 'google' | 'mistral' | 'ollama'): Promise<{
  available: boolean;
  error?: string;
}> {
  // Check API key presence
  if (provider !== 'ollama' && !API_KEYS[provider]) {
    return { available: false, error: `API key not configured for ${provider}` };
  }

  // Special case: Ollama requires local server check
  if (provider === 'ollama') {
    try {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });

      if (!response.ok) {
        return { available: false, error: 'Ollama server not responding' };
      }

      const data = await response.json();
      return {
        available: true,
        error: undefined,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Ollama server unreachable',
      };
    }
  }

  // For cloud providers, just check API key presence (actual validation happens on first request)
  return { available: true };
}

// ── Export Legacy Functions for Compatibility ──────────────────

export { isApiKeyConfigured } from './claude-client.js';
export { getClient } from './claude-client.js';
