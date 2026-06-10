// ═══════════════════════════════════════════════════════════
// Ollama Adapter — Streams Ollama chat completions as SSE
// Ollama exposes a chat API at http://localhost:11434 by default.
// Set OLLAMA_BASE_URL to point at a remote instance (LAN, Tailscale, etc.).
// Optionally set OLLAMA_AUTH_TOKEN if Ollama is behind a reverse proxy
// that requires a bearer token (Caddy / nginx with basic-auth → bearer
// rewrite, Cloudflare Access JWT, etc.). Native Ollama has no auth.
// ═══════════════════════════════════════════════════════════

import type { Response } from 'express';
import {
  convertClaudeToolsToOpenAI,
  isCapabilityRejection,
  JSON_ONLY_NUDGE,
  type ClaudeToolLike,
} from './provider-extras.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_AUTH_TOKEN = process.env.OLLAMA_AUTH_TOKEN || '';

function ollamaHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OLLAMA_AUTH_TOKEN) h['Authorization'] = `Bearer ${OLLAMA_AUTH_TOKEN}`;
  return h;
}

export interface OllamaStreamParams {
  model: string;           // e.g. 'llama3.2', 'mistral', 'qwen2.5'
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  /** Per-model context window (from context-budget.ts). Default 32k. */
  numCtx?: number;
  /** Native JSON mode (format:'json') — modern Ollama supports this. */
  jsonMode?: boolean;
  /** Claude-format tools — converted to OpenAI function-calling shape. */
  tools?: ClaudeToolLike[];
}

/** Build the Ollama /api/chat body. `withExtras=false` drops tools +
 *  format on the capability-rejection retry (older Ollama builds). */
function buildOllamaBody(params: OllamaStreamParams, stream: boolean, withExtras: boolean): Record<string, unknown> {
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
    ...(useJson ? { format: 'json' } : {}),
    ...(tools ? { tools } : {}),
    options: {
      temperature: params.temperature ?? 0.7,
      num_ctx: params.numCtx ?? 32768,
      ...(params.maxTokens ? { num_predict: params.maxTokens } : {}),
    },
  };
}

/** POST /api/chat with a one-retry fallback when the endpoint rejects
 *  tools/format (400/422 mentioning them). */
async function postOllamaChat(params: OllamaStreamParams, stream: boolean): Promise<globalThis.Response> {
  const hasExtras = !!(params.jsonMode || (params.tools && params.tools.length > 0));
  let response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: ollamaHeaders(),
    body: JSON.stringify(buildOllamaBody(params, stream, true)),
  });
  if (!response.ok && hasExtras) {
    const errText = await response.text();
    if (isCapabilityRejection(response.status, errText)) {
      console.warn(`[ollama-adapter] ${response.status} rejecting tools/format — retrying without (model=${params.model})`);
      response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: ollamaHeaders(),
        body: JSON.stringify(buildOllamaBody(params, stream, false)),
      });
    } else {
      throw new Error(`Ollama error: ${response.status} — ${errText}`);
    }
  }
  return response;
}

export async function streamOllama(
  params: OllamaStreamParams,
  res: Response
): Promise<{ inputTokens: number; outputTokens: number; text: string }> {
  const response = await postOllamaChat(params, true);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama error: ${response.status} — ${errText}`);
  }

  let fullText = '';
  let promptTokens = 0;
  let evalTokens = 0;

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
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
          prompt_eval_count?: number;
          eval_count?: number;
        };
        if (parsed.message?.content) {
          fullText += parsed.message.content;
          res.write(`data: ${JSON.stringify({ type: 'text_delta', content: parsed.message.content })}\n\n`);
        }
        if (parsed.done) {
          promptTokens = parsed.prompt_eval_count ?? 0;
          evalTokens = parsed.eval_count ?? 0;
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  return { inputTokens: promptTokens, outputTokens: evalTokens, text: fullText };
}

/**
 * Non-streaming Ollama chat completion (for callChat / scoring / agent paths).
 * Mirrors streamOllama but returns the full text instead of an SSE stream.
 */
export async function callOllama(
  params: OllamaStreamParams,
): Promise<{ inputTokens: number; outputTokens: number; text: string }> {
  const response = await postOllamaChat(params, false);
  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    text: data.message?.content ?? '',
    inputTokens: data.prompt_eval_count ?? 0,
    outputTokens: data.eval_count ?? 0,
  };
}

export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      headers: ollamaHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { models?: Array<{ name: string }> };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}
