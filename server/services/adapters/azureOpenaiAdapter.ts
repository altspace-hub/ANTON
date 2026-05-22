// ═══════════════════════════════════════════════════════════
// Azure OpenAI Adapter — Streams Azure OpenAI completions as SSE
//
// Supports both standard models (GPT-5.4, GPT-4o, GPT-4 Turbo) and
// reasoning models (o3, o4-mini) with reasoning_effort mapping.
// ═══════════════════════════════════════════════════════════

import { AzureOpenAI } from 'openai';
import type OpenAI from 'openai';
import type { Response } from 'express';
import type { ThinkingLevel } from '../../../src/lib/types.js';
import type { UnifiedLLMRequest, UnifiedLLMResponse } from '../model-adapter.js';

// ── Configuration ──────────────────────────────────────────

export interface AzureOpenAIConfig {
  endpoint: string;      // e.g. https://my-resource.openai.azure.com
  apiKey: string;
  apiVersion: string;    // e.g. 2024-12-01-preview
  deployment: string;    // Azure deployment name
  isReasoningModel?: boolean; // true for o3, o4-mini
}

export interface AzureOpenAIStreamParams {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens?: number;
  thinkingLevel?: ThinkingLevel;
  isReasoningModel?: boolean;
  seed?: number;
  structuredOutput?: {
    enabled: boolean;
    schema?: Record<string, unknown>;
    description?: string;
  };
}

// ── Reasoning Effort Mapping ───────────────────────────────

const REASONING_EFFORT_MAP: Record<ThinkingLevel, 'low' | 'medium' | 'high'> = {
  quick: 'low',
  think: 'medium',
  think_hard: 'high',
  investigate: 'high',
  plan_first: 'high',
  deep_investigate: 'high',
};

// ── Temperature Mapping ────────────────────────────────────

function mapTemperature(creativity: string, providerMax: number): number {
  const baseTemps: Record<string, number> = { strict: 0.0, balanced: 0.5, creative: 0.9 };
  const baseTemp = baseTemps[creativity] ?? 0.5;
  return (baseTemp / 1.0) * providerMax;
}

// ── Streaming Function (matches adapters/ pattern) ─────────

export async function streamAzureOpenAI(
  params: AzureOpenAIStreamParams,
  config: AzureOpenAIConfig,
  res: Response
): Promise<{ inputTokens: number; outputTokens: number; text: string }> {
  const isReasoning = config.isReasoningModel || params.isReasoningModel;

  // Reasoning models need longer timeouts — they "think" before producing tokens
  const client = new AzureOpenAI({
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    apiVersion: config.apiVersion,
    deployment: config.deployment,
    timeout: isReasoning ? 10 * 60 * 1000 : 5 * 60 * 1000, // 10min reasoning, 5min standard
    maxRetries: 3,
    fetch: globalThis.fetch, // Use Node.js 22 native fetch — node-fetch has Content-Length bugs with UTF-8
  });

  // Sanitize: remove null bytes and control chars that break JSON serialization
  const sanitize = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');

  // Cap system prompt for Azure payload limits
  const maxSystemChars = 80_000;
  let systemContent = sanitize(params.system);
  if (systemContent.length > maxSystemChars) {
    systemContent = systemContent.slice(0, maxSystemChars) + '\n\n[... Context truncated to fit Azure payload limits.]';
    console.warn(`[azure-openai] System prompt truncated: ${params.system.length} → ${maxSystemChars} chars`);
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    ...params.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: sanitize(m.content),
    })),
  ];

  // Build request body as plain object to avoid TypeScript issues with Azure-specific params
  const body: Record<string, unknown> = {
    model: config.deployment,
    messages,
    stream: true,
    max_completion_tokens: params.maxTokens || 16384,
  };

  // Reasoning models: use reasoning_effort, no temperature
  if (isReasoning) {
    const effort = REASONING_EFFORT_MAP[params.thinkingLevel || 'think'];
    body.reasoning_effort = effort;
  } else {
    body.temperature = params.temperature;
  }

  // Seed for reproducibility
  if (params.seed !== undefined) {
    body.seed = params.seed;
  }

  // Structured output (JSON mode)
  if (params.structuredOutput?.enabled) {
    if (params.structuredOutput.schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          strict: true,
          schema: params.structuredOutput.schema,
        },
      };
    } else {
      body.response_format = { type: 'json_object' };
    }
  }

  // Send a keepalive comment before starting the stream —
  // reasoning models can take 30-120s before the first token arrives,
  // and browsers/proxies may close idle SSE connections.
  if (isReasoning) {
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Model is reasoning...' })}\n\n`);
  }

  // Keepalive interval: send a heartbeat every 15s while waiting for tokens
  let receivedFirstToken = false;
  const keepaliveInterval = setInterval(() => {
    if (!receivedFirstToken) {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        // Connection may have closed
        clearInterval(keepaliveInterval);
      }
    } else {
      clearInterval(keepaliveInterval);
    }
  }, 15_000);

  console.log(`[azure-openai] streamAzureOpenAI: deployment=${config.deployment}, reasoning=${isReasoning}, apiVersion=${config.apiVersion}, msgCount=${messages.length}, systemLen=${params.system?.length ?? 0}`);

  try {
    const stream = await client.chat.completions.create(body as unknown as OpenAI.ChatCompletionCreateParamsStreaming);

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      if (!receivedFirstToken) {
        receivedFirstToken = true;
        clearInterval(keepaliveInterval);
      }
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        res.write(`data: ${JSON.stringify({ type: 'text_delta', content: delta })}\n\n`);
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens || 0;
        outputTokens = chunk.usage.completion_tokens || 0;
      }
    }

    console.log(`[azure-openai] stream complete: ${fullText.length} chars, ${inputTokens}in/${outputTokens}out`);
    return { inputTokens, outputTokens, text: fullText };
  } catch (err: unknown) {
    const e = err as { status?: number; code?: string; type?: string; message?: string; error?: { message?: string; code?: string; type?: string }; cause?: unknown };
    console.error(`[azure-openai] stream FAILED:`, {
      status: e.status,
      code: e.code || e.error?.code,
      type: e.type || e.error?.type,
      message: e.message || e.error?.message,
      cause: e.cause ? String(e.cause) : undefined,
      deployment: config.deployment,
      apiVersion: config.apiVersion,
      isReasoning,
    });
    throw err;
  } finally {
    clearInterval(keepaliveInterval);
  }
}

// ── Class-based Adapter (matches model-adapter.ts pattern) ──

export class AzureOpenAIAdapter {
  private client: AzureOpenAI;
  private deployment: string;
  private isReasoningModel: boolean;

  constructor(config: AzureOpenAIConfig) {
    this.client = new AzureOpenAI({
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      apiVersion: config.apiVersion,
      deployment: config.deployment,
      timeout: config.isReasoningModel ? 10 * 60 * 1000 : 5 * 60 * 1000,
      maxRetries: 3,
      fetch: globalThis.fetch, // Use Node.js 22 native fetch — node-fetch miscalculates Content-Length on multi-byte UTF-8
    });
    this.deployment = config.deployment;
    this.isReasoningModel = config.isReasoningModel ?? false;
  }

  async sendRequest(req: UnifiedLLMRequest): Promise<UnifiedLLMResponse> {
    const creativity = req.creativity || 'balanced';

    // Sanitize text: remove null bytes and other control chars that break JSON serialization
    const sanitize = (s: string) => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');

    let systemContent = sanitize(req.systemPrompt);

    // Azure gateway drops connections on large payloads.
    // Cap system prompt to ~80K chars (~20K tokens) to keep total body under 100KB.
    const maxSystemChars = 80_000;
    if (systemContent.length > maxSystemChars) {
      systemContent = systemContent.slice(0, maxSystemChars) + '\n\n[... Context truncated to fit Azure payload limits.]';
      console.warn(`[azure-openai] System prompt truncated: ${req.systemPrompt.length} → ${maxSystemChars} chars`);
    }

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...req.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: sanitize(m.content),
      })),
    ];

    // Use streaming internally to avoid connection timeouts on long reasoning requests
    const body: Record<string, unknown> = {
      model: this.deployment,
      messages,
      max_completion_tokens: req.maxTokens || 16384,
      stream: true,
    };

    // Reasoning models: reasoning_effort instead of temperature
    if (this.isReasoningModel) {
      const effort = REASONING_EFFORT_MAP[req.thinking || 'think'];
      body.reasoning_effort = effort;
    } else {
      body.temperature = mapTemperature(creativity, 2.0);
    }

    // Seed for reproducibility
    if (req.seed !== undefined) {
      body.seed = req.seed;
    }

    // Structured output (JSON mode)
    if (req.structuredOutput?.enabled) {
      if (req.structuredOutput.schema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            strict: true,
            schema: req.structuredOutput.schema,
          },
        };
      } else {
        body.response_format = { type: 'json_object' };
      }
    }

    const bodySize = JSON.stringify(body).length;
    const actualSystemLen = (messages[0].content as string).length;
    console.log(`[azure-openai] sendRequest: deployment=${this.deployment}, reasoning=${this.isReasoningModel}, msgCount=${messages.length}, systemLen=${actualSystemLen}, bodySize=${bodySize}`);

    try {
      const stream = await this.client.chat.completions.create(body as unknown as OpenAI.ChatCompletionCreateParamsStreaming);

      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason: string | undefined;

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) fullText += delta;
        if (chunk.choices?.[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens || 0;
          outputTokens = chunk.usage.completion_tokens || 0;
        }
      }

      console.log(`[azure-openai] sendRequest complete: ${fullText.length} chars, ${inputTokens}in/${outputTokens}out`);
      return {
        content: fullText,
        usage: { inputTokens, outputTokens },
        finishReason,
      };
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string; type?: string; message?: string; error?: { message?: string; code?: string; type?: string }; cause?: { code?: string; message?: string; errno?: string } };
      console.error(`[azure-openai] sendRequest FAILED:`, {
        status: e.status,
        code: e.code || e.error?.code,
        message: e.message || e.error?.message,
        causeCode: e.cause?.code,
        causeMessage: e.cause?.message,
        deployment: this.deployment,
        isReasoning: this.isReasoningModel,
        bodySize,
      });
      if (err instanceof Error && err.cause) {
        console.error(`[azure-openai] Underlying cause:`, err.cause);
      }
      throw err;
    }
  }

  async *sendStreamRequest(req: UnifiedLLMRequest): AsyncGenerator<string, void, unknown> {
    const creativity = req.creativity || 'balanced';

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: req.systemPrompt },
      ...req.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const params: Record<string, unknown> = {
      model: this.deployment,
      messages,
      max_completion_tokens: req.maxTokens || 16384,
      stream: true,
    };

    // Reasoning models: reasoning_effort instead of temperature
    if (this.isReasoningModel) {
      const effort = REASONING_EFFORT_MAP[req.thinking || 'think'];
      params.reasoning_effort = effort;
    } else {
      params.temperature = mapTemperature(creativity, 2.0);
    }

    // Seed for reproducibility
    if (req.seed !== undefined) {
      params.seed = req.seed;
    }

    // Structured output (JSON mode)
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

    const stream = await this.client.chat.completions.create(params as unknown as OpenAI.ChatCompletionCreateParamsStreaming);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
