// ═══════════════════════════════════════════════════════════
// OpenAI-Compatible Adapter
//
// Generic adapter for any endpoint that speaks the OpenAI
// /v1/chat/completions wire format with bearer-token auth.
//
// Works for:
//   - DeepSeek            (api.deepseek.com/v1)
//   - OpenRouter          (openrouter.ai/api/v1) — 200+ models behind one key
//   - Together.ai         (api.together.xyz/v1)
//   - Groq                (api.groq.com/openai/v1) — fastest tokens/sec
//   - Fireworks           (api.fireworks.ai/inference/v1)
//   - DeepInfra           (api.deepinfra.com/v1/openai)
//   - vLLM (self-hosted)  (http://your-host:8000/v1)
//   - LM Studio (local)   (http://localhost:1234/v1)
//   - llama.cpp server    (http://localhost:8080/v1)
//   - Ollama OpenAI-compat (http://localhost:11434/v1) — alternative to Ollama native
//
// Wire format: standard OpenAI Chat Completions. SSE streaming for live deltas.
// ═══════════════════════════════════════════════════════════

import type { Response } from 'express';
import {
  convertClaudeToolsToOpenAI,
  isCapabilityRejection,
  JSON_ONLY_NUDGE,
  type ClaudeToolLike,
} from './provider-extras.js';

export interface OpenAICompatibleStreamParams {
  baseUrl: string;                            // e.g. 'https://api.deepseek.com/v1'
  apiKey?: string;                            // bearer token (omitted for fully open endpoints)
  model: string;                              // raw model id as the endpoint expects it
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  extraHeaders?: Record<string, string>;      // e.g. OpenRouter wants HTTP-Referer + X-Title
  /** Native JSON mode (response_format json_object). OpenRouter/Groq/DeepSeek accept it. */
  jsonMode?: boolean;
  /** Claude-format tools — converted to OpenAI function-calling shape. */
  tools?: ClaudeToolLike[];
}

function compatHeaders(params: OpenAICompatibleStreamParams): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(params.extraHeaders ?? {}),
  };
  if (params.apiKey) headers['Authorization'] = `Bearer ${params.apiKey}`;
  return headers;
}

/** Build the chat body. `withExtras=false` drops tools + response_format
 *  on the capability-rejection retry (minimal vLLM/llama.cpp configs). */
function buildCompatBody(params: OpenAICompatibleStreamParams, stream: boolean, withExtras: boolean): Record<string, unknown> {
  const tools = withExtras ? convertClaudeToolsToOpenAI(params.tools) : undefined;
  const useJson = withExtras && params.jsonMode;
  const system = !withExtras && params.jsonMode
    ? params.system + JSON_ONLY_NUDGE
    : params.system;
  return {
    model: params.model,
    stream,
    messages: [
      { role: 'system', content: system },
      ...params.messages,
    ],
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
    ...(useJson ? { response_format: { type: 'json_object' } } : {}),
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
  };
}

/** POST with one retry without tools/response_format on a 400/422 that
 *  mentions them. Throws on other failures so callers see the real error. */
async function postCompatChat(
  params: OpenAICompatibleStreamParams,
  stream: boolean,
): Promise<globalThis.Response> {
  const url = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const hasExtras = !!(params.jsonMode || (params.tools && params.tools.length > 0));
  let response = await fetch(url, {
    method: 'POST',
    headers: compatHeaders(params),
    body: JSON.stringify(buildCompatBody(params, stream, true)),
  });
  if (!response.ok && hasExtras) {
    const errText = await response.text();
    if (isCapabilityRejection(response.status, errText)) {
      console.warn(`[openai-compatible-adapter] ${response.status} rejecting tools/response_format — retrying without (model=${params.model})`);
      response = await fetch(url, {
        method: 'POST',
        headers: compatHeaders(params),
        body: JSON.stringify(buildCompatBody(params, stream, false)),
      });
    } else {
      throw new Error(`OpenAI-compatible endpoint error (${params.baseUrl}): ${response.status} — ${errText}`);
    }
  }
  return response;
}

export interface OpenAICompatibleStreamResult {
  inputTokens: number;
  outputTokens: number;
  text: string;
}

/**
 * Stream a chat completion through any OpenAI-compatible endpoint
 * and forward the deltas to the supplied SSE response.
 */
export async function streamOpenAICompatible(
  params: OpenAICompatibleStreamParams,
  res: Response,
): Promise<OpenAICompatibleStreamResult> {
  const response = await postCompatChat(params, true);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI-compatible endpoint error (${params.baseUrl}): ${response.status} — ${errText}`);
  }

  let fullText = '';
  let promptTokens = 0;
  let completionTokens = 0;

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
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ type: 'text_delta', content: delta })}\n\n`);
        }
        if (parsed.usage) {
          promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
          completionTokens = parsed.usage.completion_tokens ?? completionTokens;
        }
      } catch {
        // Skip malformed JSON lines — some providers send keep-alive comments
      }
    }
  }

  return { inputTokens: promptTokens, outputTokens: completionTokens, text: fullText };
}

/**
 * Non-streaming completion through any OpenAI-compatible endpoint (for callChat /
 * scoring / agent paths). Mirrors streamOpenAICompatible but returns full text.
 */
export async function callOpenAICompatible(
  params: OpenAICompatibleStreamParams,
): Promise<OpenAICompatibleStreamResult> {
  const response = await postCompatChat(params, false);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI-compatible endpoint error (${params.baseUrl}): ${response.status} — ${errText}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

/**
 * List the models exposed by an OpenAI-compatible endpoint via GET /models.
 * Most providers honour this; returns an empty array if the endpoint doesn't.
 */
export async function listOpenAICompatibleModels(
  baseUrl: string,
  apiKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<string[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { data?: Array<{ id: string }> };
    return data.data?.map((m) => m.id) ?? [];
  } catch {
    return [];
  }
}

/**
 * Health-check an OpenAI-compatible endpoint. Lightweight: tries GET /models.
 */
export async function checkOpenAICompatibleHealth(
  baseUrl: string,
  apiKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ available: boolean; modelCount?: number; error?: string }> {
  try {
    const models = await listOpenAICompatibleModels(baseUrl, apiKey, extraHeaders);
    return { available: true, modelCount: models.length };
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : String(err) };
  }
}
