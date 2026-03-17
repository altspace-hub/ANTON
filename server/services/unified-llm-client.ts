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

import type { Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createModelAdapter, getProviderFromModelId, getCustomModelConfigs, type UnifiedLLMRequest } from './model-adapter.js';
import * as claudeClient from './claude-client.js';
import type { ModelId, ThinkingLevel, CreativityLevel } from '../../src/lib/types.js';

// ── Configuration ──────────────────────────────────────────────

interface UnifiedStreamConfig {
  model: ModelId;
  thinking: ThinkingLevel;
  creativity?: CreativityLevel;
  system: string;
  staticSystemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }>;
  tools?: Array<{ type: string; name: string }>;
  maxTokens?: number;
  nativeReasoningEnabled?: boolean;
  seed?: number;
  db?: DatabaseAdapter;
}

export interface StreamCompletionData {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens?: number;
}

// ── Environment Variables ─────────────────────────────────────

const API_KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  google: process.env.GOOGLE_API_KEY,
  mistral: process.env.MISTRAL_API_KEY,
  ollama: undefined, // Ollama runs locally, no API key needed
};

// ── Provider Detection ─────────────────────────────────────────

function getApiKeyForModel(modelId: string, db?: DatabaseAdapter): string | undefined {
  // Check custom model slots for API key overrides
  if (db) {
    const customModels = getCustomModelConfigs(db);
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

    const apiKey = getApiKeyForModel(modelId, db);
    return !!apiKey;
  } catch {
    return false;
  }
}

// ── Unified Streaming Function ────────────────────────────────

export async function streamToResponse(
  config: UnifiedStreamConfig,
  res: Response,
  onComplete?: (data: StreamCompletionData) => void
): Promise<void> {
  const provider = getProviderFromModelId(config.model, config.db);

  // Special case: Use existing claude-client for Anthropic models
  // This preserves prompt caching optimization
  if (provider === 'anthropic') {
    return claudeClient.streamToResponse(
      {
        model: config.model as 'claude-opus-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6',
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
  const apiKey = getApiKeyForModel(config.model, config.db);

  if (!apiKey && provider !== 'ollama') {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  const adapter = createModelAdapter(provider, apiKey);

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
    // Build unified request
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
      stream: true,
    };

    let fullText = '';
    let startTime = Date.now();

    // Stream response
    for await (const chunk of adapter.sendStreamRequest(unifiedReq)) {
      fullText += chunk;
      sendEvent({ type: 'content_block_delta', delta: { type: 'text_delta', text: chunk } });
    }

    const elapsed = Date.now() - startTime;

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const estimatedInputTokens = Math.ceil(
      (unifiedReq.systemPrompt.length + JSON.stringify(unifiedReq.messages).length) / 4
    );
    const estimatedOutputTokens = Math.ceil(fullText.length / 4);

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
        thinking: '', // Non-Anthropic models don't separate thinking blocks
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
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
  const provider = getProviderFromModelId(config.model, config.db);

  // For Anthropic, we could use the existing client, but it's stream-only
  // So we'll use the adapter for consistency in non-streaming mode

  const apiKey = getApiKeyForModel(config.model, config.db);

  if (!apiKey && provider !== 'ollama') {
    throw new Error(`API key not configured for provider: ${provider}`);
  }

  const adapter = createModelAdapter(provider, apiKey);

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
    stream: false,
  };

  const response = await adapter.sendRequest(unifiedReq);

  return {
    text: response.content,
    thinking: response.thinking || '',
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    thinkingTokens: response.usage.thinkingTokens,
  };
}

// ── Health Check ───────────────────────────────────────────────

export async function checkProviderHealth(provider: 'anthropic' | 'openai' | 'google' | 'mistral' | 'ollama'): Promise<{
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
