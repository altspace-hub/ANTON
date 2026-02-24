// ═══════════════════════════════════════════════════════════
// Mistral Adapter — Streams Mistral chat completions as SSE
// Uses the OpenAI-compatible Mistral API format
// ═══════════════════════════════════════════════════════════

import type { Response } from 'express';

export interface MistralStreamParams {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens?: number;
  nativeReasoningEnabled?: boolean;
  seed?: number;
}

export async function streamMistral(
  params: MistralStreamParams,
  res: Response
): Promise<{ inputTokens: number; outputTokens: number; text: string }> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY not configured');

  // Switch to Magistral model variant when native reasoning is enabled
  let modelToUse = params.model;
  if (params.nativeReasoningEnabled && params.model === 'mistral-large-latest') {
    modelToUse = 'magistral-medium-latest';
  }

  const body: Record<string, unknown> = {
    model: modelToUse,
    messages: [
      { role: 'system', content: params.system },
      ...params.messages,
    ],
    temperature: params.temperature,
    max_tokens: params.maxTokens || 8192,
    stream: true,
  };

  // Add seed if provided for reproducible outputs (Mistral uses 'random_seed')
  if (params.seed !== undefined) {
    body.random_seed = params.seed;
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
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ type: 'text_delta', content: delta })}\n\n`);
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

  return { inputTokens, outputTokens, text: fullText };
}
