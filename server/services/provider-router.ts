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
 */

import type { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getProviderFromModelId } from './model-adapter.js';
import { streamMistral, type MistralStreamParams } from './adapters/mistralAdapter.js';
import { streamOpenAI } from './adapters/openaiAdapter.js';
import { streamGemini } from './adapters/geminiAdapter.js';
import { streamOllama, callOllama } from './adapters/ollamaAdapter.js';
import { streamAzureOpenAI } from './adapters/azureOpenaiAdapter.js';
import type { AzureOpenAIConfig } from './adapters/azureOpenaiAdapter.js';
import { streamOpenAICompatible, callOpenAICompatible } from './adapters/openaiCompatibleAdapter.js';
import { resolveCustomEndpoint } from '../routes/custom-model-endpoints.js';
import { MODEL_CAPABILITIES, getThinkingConfig } from '../config/model-capabilities.js';

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
  /** Seed for reproducible outputs */
  seed?: number;
  /** Database adapter — required for Azure OpenAI config resolution */
  db?: import('../db/database.js').DatabaseAdapter;
}

export interface ChatResult {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
}

// ── Model Tier Resolution ──────────────────────────────────────

/** Default tier-to-model mapping per provider */
const TIER_MAP: Record<string, Record<ModelTier, string>> = {
  anthropic: {
    large: 'claude-opus-4-8',
    medium: 'claude-sonnet-4-6',
    small: 'claude-haiku-4-5-20251001',
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
};

/**
 * Detect which provider is currently configured (has API key).
 * Priority: Anthropic > Mistral > OpenAI > Google > Ollama
 */
function getConfiguredProvider(): string {
  // Honor an explicit non-Claude DEFAULT_MODEL first, so an operator who sets
  // DEFAULT_MODEL=mistral-large-latest / ollama:qwen / compat:<slug>:<model> gets
  // the specialty routes (which hardcode mapModelToProvider('claude-…')) on THAT
  // provider, instead of whichever cloud key happens to be highest priority.
  const def = process.env.DEFAULT_MODEL;
  if (def && !def.startsWith('claude-')) {
    let p: string | null = null;
    try { p = getProviderFromModelId(def); } catch { p = null; }
    if (p === 'ollama' || p === 'openai_compatible') return p;          // keyless / per-endpoint creds
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
  // configured DEFAULT_MODEL id for every tier.
  if ((provider === 'ollama' || provider === 'openai_compatible') && process.env.DEFAULT_MODEL) {
    return process.env.DEFAULT_MODEL;
  }
  return TIER_MAP[provider]?.[t] || TIER_MAP.anthropic[t];
}

/**
 * Get the equivalent model for the current provider given a Claude model ID.
 * Used when routes hardcode Claude models — maps to the right provider equivalent.
 */
export function mapModelToProvider(claudeModelId: string): string {
  const provider = getConfiguredProvider();
  if (provider === 'anthropic') return claudeModelId;

  // Local Ollama / compat endpoints have no tier mapping — use the configured
  // DEFAULT_MODEL id directly.
  if ((provider === 'ollama' || provider === 'openai_compatible') && process.env.DEFAULT_MODEL) {
    return process.env.DEFAULT_MODEL;
  }

  // Map Claude model to tier, then resolve for active provider
  const claudeToTier: Record<string, ModelTier> = {
    'claude-opus-4-8': 'large',
    'claude-sonnet-4-6': 'medium',
    'claude-sonnet-4-5-20250929': 'medium',
    'claude-haiku-4-5-20251001': 'small',
  };

  const tier = claudeToTier[claudeModelId] || 'medium';
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

  // Skip web_search tools — only Claude supports this natively
  const convertible = tools.filter(t => t.type !== 'web_search_20250305' && t.type !== 'web_search');
  if (convertible.length === 0) return undefined;

  // Convert to OpenAI/Mistral function-calling format
  return convertible.map(tool => ({
    type: 'function',
    function: {
      name: tool.name || tool.type,
      description: (tool as Record<string, unknown>).description || '',
      parameters: (tool as Record<string, unknown>).input_schema || { type: 'object', properties: {} },
    },
  }));
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
export async function streamChat(
  config: StreamChatConfig,
  res: Response
): Promise<ChatResult> {
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
    }, res);
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  }

  throw new Error(`Unsupported provider: ${provider}`);
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
  const thinkingConfig = config.thinkingLevel
    ? getThinkingConfig(modelId, config.thinkingLevel)
    : null;

  const apiParams: Record<string, unknown> = {
    model: modelId,
    max_tokens: Math.max(thinkingConfig?.maxTokens || 0, maxTokens),
    system: config.system,
    messages: config.messages.map(m => ({ role: m.role, content: m.content })),
  };

  // Add thinking params
  if (thinkingConfig && thinkingConfig.thinkingType === 'adaptive') {
    apiParams.thinking = { type: 'adaptive' };
    apiParams.output_config = { effort: thinkingConfig.effort || 'medium' };
  } else if (thinkingConfig && thinkingConfig.thinkingType === 'enabled' && thinkingConfig.budgetTokens) {
    apiParams.thinking = { type: 'enabled', budget_tokens: thinkingConfig.budgetTokens };
  }

  // Add tools (only if no thinking — mutually exclusive in some configs)
  if (config.tools && config.tools.length > 0 && !thinkingConfig) {
    apiParams.tools = config.tools;
  }

  const stream = client.messages.stream(apiParams as Anthropic.MessageStreamParams);

  let fullText = '';
  let fullThinking = '';
  let inputTokens = 0;
  let outputTokens = 0;

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
      const usage = msg?.usage as Record<string, number> | undefined;
      if (usage) {
        inputTokens = usage.input_tokens || 0;
      }
    }
  }

  return { text: fullText, thinking: fullThinking, inputTokens, outputTokens };
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

  const body: Record<string, unknown> = {
    model: resolvedModel,
    messages: [
      { role: 'system', content: config.system },
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

  // Add tools (converted to Mistral format)
  if (config.tools && config.tools.length > 0) {
    const converted = convertToolsForProvider(config.tools, 'mistral');
    if (converted) {
      body.tools = converted;
      body.tool_choice = 'auto';
    }
  }

  if (config.seed !== undefined) {
    body.random_seed = config.seed;
  }

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

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

/**
 * Non-streaming chat completion. Returns the full response.
 * Used by routes that need a complete response (scoring, bridges, etc.)
 */
export async function callChat(config: StreamChatConfig): Promise<ChatResult> {
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
    const thinkingConfig = config.thinkingLevel
      ? getThinkingConfig(modelId, config.thinkingLevel)
      : null;

    const apiParams: Record<string, unknown> = {
      model: modelId,
      max_tokens: thinkingConfig?.maxTokens || maxTokens,
      system: config.system,
      messages: config.messages.map(m => ({ role: m.role, content: m.content })),
    };

    if (thinkingConfig && thinkingConfig.thinkingType === 'adaptive') {
      apiParams.thinking = { type: 'adaptive' };
      apiParams.output_config = { effort: thinkingConfig.effort || 'medium' };
    } else if (thinkingConfig && thinkingConfig.thinkingType === 'enabled' && thinkingConfig.budgetTokens) {
      apiParams.thinking = { type: 'enabled', budget_tokens: thinkingConfig.budgetTokens };
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
    };
  }

  // ── Mistral (non-streaming) ──
  if (provider === 'mistral') {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY not configured');

    const { model: resolvedModel, promptMode } = resolveMistralThinking(modelId, config.thinkingLevel);

    const body: Record<string, unknown> = {
      model: resolvedModel,
      messages: [
        { role: 'system', content: config.system },
        ...config.messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: config.temperature ?? 0.5,
      max_tokens: maxTokens,
    };

    if (promptMode) body.prompt_mode = promptMode;
    if (config.seed !== undefined) body.random_seed = config.seed;

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: config.system },
          ...config.messages.map(m => ({ role: m.role, content: m.content })),
        ],
        max_tokens: maxTokens,
        temperature: config.temperature ?? 0.5,
      }),
    });

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
    });
    return { text: result.text, thinking: '', inputTokens: result.inputTokens, outputTokens: result.outputTokens };
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
