/**
 * model-adapter.ts
 *
 * Multi-LLM ModelAdapter Pattern
 *
 * Purpose: Normalize API calls across different LLM providers.
 * Each provider has different parameter names, formats, and capabilities.
 * This adapter translates openEXPERT's unified config into provider-specific requests.
 *
 * Supported Providers:
 * - Anthropic (Claude Opus, Sonnet, Haiku)
 * - OpenAI (GPT-4o, GPT-4o Mini)
 * - Google (Gemini 2.0 Flash)
 * - Mistral (Mistral Large)
 * - Ollama (local models: Llama, Mistral, Qwen, etc.)
 *
 * Design: Factory pattern → creates provider-specific adapter instances
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Mistral } from '@mistralai/mistralai';
import type Database from 'better-sqlite3';
import type { ModelProvider, ThinkingLevel, CreativityLevel } from '../../src/lib/types.js';
import type { CustomModelConfig } from '../routes/settings.js';

// ── Unified Request Interface ──────────────────────────────────

export interface UnifiedLLMRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model: string;
  thinking?: ThinkingLevel;
  creativity?: CreativityLevel;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  seed?: number;
  tools?: any[]; // Web search, structured output, etc.
  structuredOutput?: {
    enabled: boolean;
    schema?: any; // JSON Schema for OpenAI/Google
    description?: string; // Natural language description
  };
}

export interface UnifiedLLMResponse {
  content: string;
  thinking?: string; // Reasoning trace if available
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
  };
  finishReason?: string;
}

// ── Provider-Specific Adapters ─────────────────────────────────

abstract class BaseAdapter {
  abstract sendRequest(req: UnifiedLLMRequest): Promise<UnifiedLLMResponse>;
  abstract sendStreamRequest(req: UnifiedLLMRequest): AsyncGenerator<string, void, unknown>;

  /**
   * Map openEXPERT creativity level to provider-specific temperature.
   * Different providers have different optimal ranges.
   */
  protected mapTemperature(creativity: CreativityLevel, providerMax: number): number {
    const baseTemps: Record<string, number> = { strict: 0.0, balanced: 0.5, creative: 0.9 };
    const baseTemp = baseTemps[creativity];
    // Normalize to provider's range (e.g., GPT uses 0-2, Claude uses 0-1)
    return (baseTemp / 1.0) * providerMax;
  }

  /**
   * Map openEXPERT thinking level to provider-specific parameters.
   * Claude: budget_tokens, GPT: model variant, Gemini: mode toggle, etc.
   */
  protected mapThinkingBudget(thinking: ThinkingLevel): number {
    const budgets: Record<ThinkingLevel, number> = {
      quick: 0,
      think: 4096,
      think_hard: 16384,
      investigate: 32768,
      plan_first: 32768,
      deep_investigate: 65536,
    };
    return budgets[thinking];
  }
}

// ── Anthropic Adapter ──────────────────────────────────────────

class AnthropicAdapter extends BaseAdapter {
  private client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  async sendRequest(req: UnifiedLLMRequest): Promise<UnifiedLLMResponse> {
    const thinking = req.thinking || 'think';
    const creativity = req.creativity || 'balanced';

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens || 8192,
      system: req.systemPrompt,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: this.mapTemperature(creativity, 1.0),
    };

    // Claude 4.6 models support extended thinking
    if (req.model.includes('opus') || req.model.includes('sonnet-4-6')) {
      const budget = this.mapThinkingBudget(thinking);
      if (budget > 0) {
        params.thinking = { type: 'enabled', budget_tokens: budget };
      }
    }

    // Add tools if provided (e.g., web search)
    if (req.tools && req.tools.length > 0) {
      params.tools = req.tools;
    }

    const response = await this.client.messages.create(params);

    let content = '';
    let thinkingContent = '';

    for (const block of response.content) {
      if (block.type === 'text') content += block.text;
      if (block.type === 'thinking') thinkingContent += block.thinking;
    }

    return {
      content,
      thinking: thinkingContent || undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      finishReason: response.stop_reason || undefined,
    };
  }

  async *sendStreamRequest(req: UnifiedLLMRequest): AsyncGenerator<string, void, unknown> {
    const thinking = req.thinking || 'think';
    const creativity = req.creativity || 'balanced';

    const params: Anthropic.MessageStreamParams = {
      model: req.model,
      max_tokens: req.maxTokens || 8192,
      system: req.systemPrompt,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: this.mapTemperature(creativity, 1.0),
      stream: true,
    };

    // Extended thinking for Claude 4.6 models
    if (req.model.includes('opus') || req.model.includes('sonnet-4-6')) {
      const budget = this.mapThinkingBudget(thinking);
      if (budget > 0) {
        params.thinking = { type: 'enabled', budget_tokens: budget };
      }
    }

    if (req.tools && req.tools.length > 0) {
      params.tools = req.tools;
    }

    const stream = this.client.messages.stream(params);

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}

// ── OpenAI Adapter ─────────────────────────────────────────────

class OpenAIAdapter extends BaseAdapter {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  async sendRequest(req: UnifiedLLMRequest): Promise<UnifiedLLMResponse> {
    const creativity = req.creativity || 'balanced';

    // Convert system prompt to OpenAI format (role: system in messages array)
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: req.model,
      messages,
      max_tokens: req.maxTokens || 16384,
      temperature: this.mapTemperature(creativity, 2.0), // GPT uses 0-2 range
    };

    // GPT supports seed for reproducibility
    if (req.seed !== undefined) {
      params.seed = req.seed;
    }

    // Native JSON mode for structured output (GPT-4o and later)
    if (req.structuredOutput?.enabled) {
      if (req.structuredOutput.schema) {
        // Strict schema enforcement (requires gpt-4o-2024-08-06+)
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            strict: true,
            schema: req.structuredOutput.schema,
          },
        };
      } else {
        // JSON mode without strict schema
        params.response_format = { type: 'json_object' };
      }
    }

    const response = await this.client.chat.completions.create(params);

    return {
      content: response.choices[0].message.content || '',
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      finishReason: response.choices[0].finish_reason || undefined,
    };
  }

  async *sendStreamRequest(req: UnifiedLLMRequest): AsyncGenerator<string, void, unknown> {
    const creativity = req.creativity || 'balanced';

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: req.model,
      messages,
      max_tokens: req.maxTokens || 16384,
      temperature: this.mapTemperature(creativity, 2.0),
      stream: true,
    };

    if (req.seed !== undefined) {
      params.seed = req.seed;
    }

    // Native JSON mode for structured output
    if (req.structuredOutput?.enabled) {
      if (req.structuredOutput.schema) {
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            strict: true,
            schema: req.structuredOutput.schema,
          },
        };
      } else {
        params.response_format = { type: 'json_object' };
      }
    }

    const stream = await this.client.chat.completions.create(params);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}

// ── Google Gemini Adapter ──────────────────────────────────────

class GoogleAdapter extends BaseAdapter {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async sendRequest(req: UnifiedLLMRequest): Promise<UnifiedLLMResponse> {
    const generationConfig: any = {};

    // Native JSON mode for structured output
    if (req.structuredOutput?.enabled) {
      generationConfig.responseMimeType = 'application/json';
      if (req.structuredOutput.schema) {
        generationConfig.responseSchema = req.structuredOutput.schema;
      }
    }

    const model = this.client.getGenerativeModel({
      model: req.model,
      systemInstruction: req.systemPrompt,
      ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
    });

    const chat = model.startChat({
      history: req.messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    });

    const lastMessage = req.messages[req.messages.length - 1].content;
    const result = await chat.sendMessage(lastMessage);
    const response = result.response;

    return {
      content: response.text(),
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  async *sendStreamRequest(req: UnifiedLLMRequest): AsyncGenerator<string, void, unknown> {
    const generationConfig: any = {};

    // Native JSON mode for structured output
    if (req.structuredOutput?.enabled) {
      generationConfig.responseMimeType = 'application/json';
      if (req.structuredOutput.schema) {
        generationConfig.responseSchema = req.structuredOutput.schema;
      }
    }

    const model = this.client.getGenerativeModel({
      model: req.model,
      systemInstruction: req.systemPrompt,
      ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
    });

    const chat = model.startChat({
      history: req.messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    });

    const lastMessage = req.messages[req.messages.length - 1].content;
    const stream = await chat.sendMessageStream(lastMessage);

    for await (const chunk of stream.stream) {
      yield chunk.text();
    }
  }
}

// ── Mistral Adapter ────────────────────────────────────────────

class MistralAdapter extends BaseAdapter {
  private client: Mistral;

  constructor(apiKey: string) {
    super();
    this.client = new Mistral({ apiKey });
  }

  async sendRequest(req: UnifiedLLMRequest): Promise<UnifiedLLMResponse> {
    const creativity = req.creativity || 'balanced';

    // Mistral uses OpenAI-compatible format
    const messages = [
      { role: 'system' as const, content: req.systemPrompt },
      ...req.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const response = await this.client.chat.complete({
      model: req.model,
      messages,
      maxTokens: req.maxTokens || 8192,
      temperature: this.mapTemperature(creativity, 2.0),
      randomSeed: req.seed,
    });

    const content = response.choices?.[0]?.message?.content;
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    return {
      content: contentStr || '',
      usage: {
        inputTokens: response.usage?.promptTokens || 0,
        outputTokens: response.usage?.completionTokens || 0,
      },
    };
  }

  async *sendStreamRequest(req: UnifiedLLMRequest): AsyncGenerator<string, void, unknown> {
    const creativity = req.creativity || 'balanced';

    const messages = [
      { role: 'system' as const, content: req.systemPrompt },
      ...req.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const streamResponse = await this.client.chat.stream({
      model: req.model,
      messages,
      maxTokens: req.maxTokens || 8192,
      temperature: this.mapTemperature(creativity, 2.0),
      randomSeed: req.seed,
    });

    for await (const chunk of streamResponse) {
      const delta = chunk.data.choices?.[0]?.delta?.content;
      if (delta) {
        const deltaStr = typeof delta === 'string' ? delta : JSON.stringify(delta);
        yield deltaStr;
      }
    }
  }
}

// ── Ollama Adapter (Local Models) ──────────────────────────────

class OllamaAdapter extends BaseAdapter {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    super();
    this.baseUrl = baseUrl;
  }

  async sendRequest(req: UnifiedLLMRequest): Promise<UnifiedLLMResponse> {
    // Extract model name from 'ollama:model:tag' format
    const modelName = req.model.replace('ollama:', '');

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: req.systemPrompt },
          ...req.messages,
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content || '',
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
      },
    };
  }

  async *sendStreamRequest(req: UnifiedLLMRequest): AsyncGenerator<string, void, unknown> {
    const modelName = req.model.replace('ollama:', '');

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: req.systemPrompt },
          ...req.messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            yield data.message.content;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }
}

// ── Factory: Create Adapter by Provider ────────────────────────

export function createModelAdapter(
  provider: ModelProvider,
  apiKey?: string
): BaseAdapter {
  switch (provider) {
    case 'anthropic':
      if (!apiKey) throw new Error('Anthropic API key required');
      return new AnthropicAdapter(apiKey);

    case 'openai':
      if (!apiKey) throw new Error('OpenAI API key required');
      return new OpenAIAdapter(apiKey);

    case 'google':
      if (!apiKey) throw new Error('Google API key required');
      return new GoogleAdapter(apiKey);

    case 'mistral':
      if (!apiKey) throw new Error('Mistral API key required');
      return new MistralAdapter(apiKey);

    case 'ollama':
      // Ollama runs locally, no API key needed
      return new OllamaAdapter(process.env.OLLAMA_BASE_URL);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// ── Helper: Get Provider from Model ID ─────────────────────────

/**
 * Load custom model configs from the app_settings table.
 * Returns an array of enabled CustomModelConfig objects.
 */
export function getCustomModelConfigs(db: Database.Database): CustomModelConfig[] {
  const configs: CustomModelConfig[] = [];
  for (const slot of [1, 2]) {
    try {
      const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'custom_model_slot_${slot}'`).get() as { value: string } | undefined;
      if (row) {
        const config = JSON.parse(row.value) as CustomModelConfig;
        if (config.enabled) configs.push(config);
      }
    } catch {
      // Skip invalid entries
    }
  }
  return configs;
}

export function getProviderFromModelId(modelId: string, db?: Database.Database): ModelProvider {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gpt-')) return 'openai';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('mistral-')) return 'mistral';
  if (modelId.startsWith('ollama:')) return 'ollama';

  // Fallback: check custom model slots in the database
  if (db) {
    const customModels = getCustomModelConfigs(db);
    const match = customModels.find((m) => m.modelId === modelId);
    if (match) return match.provider;
  }

  throw new Error(`Cannot determine provider for model: ${modelId}`);
}
