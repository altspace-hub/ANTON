// ═══════════════════════════════════════════════════════════
// Ollama Adapter — Streams Ollama chat completions as SSE
// Ollama exposes a chat API at http://localhost:11434 by default.
// Set OLLAMA_BASE_URL to point at a remote instance (LAN, Tailscale, etc.).
// Optionally set OLLAMA_AUTH_TOKEN if Ollama is behind a reverse proxy
// that requires a bearer token (Caddy / nginx with basic-auth → bearer
// rewrite, Cloudflare Access JWT, etc.). Native Ollama has no auth.
// ═══════════════════════════════════════════════════════════

import type { Response } from 'express';

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
}

export async function streamOllama(
  params: OllamaStreamParams,
  res: Response
): Promise<{ inputTokens: number; outputTokens: number; text: string }> {
  const body = {
    model: params.model,
    stream: true,
    messages: [
      { role: 'system', content: params.system },
      ...params.messages,
    ],
    options: {
      temperature: params.temperature ?? 0.7,
      num_ctx: 32768,
      ...(params.maxTokens ? { num_predict: params.maxTokens } : {}),
    },
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: ollamaHeaders(),
    body: JSON.stringify(body),
  });

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
