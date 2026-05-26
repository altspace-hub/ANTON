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

export interface OpenAICompatibleStreamParams {
  baseUrl: string;                            // e.g. 'https://api.deepseek.com/v1'
  apiKey?: string;                            // bearer token (omitted for fully open endpoints)
  model: string;                              // raw model id as the endpoint expects it
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  extraHeaders?: Record<string, string>;      // e.g. OpenRouter wants HTTP-Referer + X-Title
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
  const url = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(params.extraHeaders ?? {}),
  };
  if (params.apiKey) {
    headers['Authorization'] = `Bearer ${params.apiKey}`;
  }

  const body = {
    model: params.model,
    stream: true,
    messages: [
      { role: 'system', content: params.system },
      ...params.messages,
    ],
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

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
