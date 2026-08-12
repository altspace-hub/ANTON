// ═══════════════════════════════════════════════════════════
// OpenAI Adapter — Streams OpenAI chat completions as SSE
// ═══════════════════════════════════════════════════════════

import type { Response } from 'express';
import type { ThinkingLevel } from '../../../src/lib/types.js';
import { isOpenAIReasoningModel, openaiReasoningEffort } from '../thinking-map.js';

export interface OpenAIStreamParams {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens?: number;
  nativeReasoningEnabled?: boolean;
  /** ANTON thinking level — maps to reasoning_effort on o-series reasoning models. */
  thinkingLevel?: ThinkingLevel;
  seed?: number;
}

export async function streamOpenAI(
  params: OpenAIStreamParams,
  res: Response
): Promise<{ inputTokens: number; outputTokens: number; text: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: 'system', content: params.system },
      ...params.messages,
    ],
    stream: true,
    stream_options: { include_usage: true },
  };

  // Reasoning models (o-series AND gpt-5.x) take reasoning_effort, reject
  // temperature, and use max_completion_tokens. Everything else is a standard chat
  // completion. The model is passed through because the accepted effort values
  // differ: gpt-5.x adds xhigh/max, which an o-series deployment rejects with a 400.
  if (isOpenAIReasoningModel(params.model)) {
    body.reasoning_effort = openaiReasoningEffort(params.thinkingLevel ?? 'think', params.model);
    body.max_completion_tokens = params.maxTokens || 8192;
  } else {
    body.temperature = params.temperature;
    body.max_tokens = params.maxTokens || 8192;
  }

  // Add seed if provided for reproducible outputs
  if (params.seed !== undefined) {
    body.seed = params.seed;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
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
