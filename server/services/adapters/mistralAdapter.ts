// ═══════════════════════════════════════════════════════════
// Mistral Adapter — Streams Mistral chat completions as SSE
// Supports both standard Mistral models and Magistral reasoning models.
// Magistral returns structured thinking blocks: { type: "thinking" } + { type: "text" }
// ═══════════════════════════════════════════════════════════

import type { Response } from 'express';

export interface MistralStreamParams {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens?: number;
  nativeReasoningEnabled?: boolean;
  /** ANTON thinking level — used to decide whether to switch to Magistral */
  thinkingLevel?: string;
  seed?: number;
  /** Abort signal for request cancellation/timeout */
  signal?: AbortSignal;
}

/**
 * Resolve whether to switch from a generalist Mistral model to a Magistral
 * reasoning model based on the thinking level.
 */
function resolveModel(model: string, thinkingLevel?: string, nativeReasoningEnabled?: boolean): { model: string; useReasoning: boolean } {
  // Already a Magistral model — always use reasoning mode
  if (model.startsWith('magistral-')) {
    return { model, useReasoning: true };
  }

  // Explicit native reasoning toggle (from claude.ts route)
  if (nativeReasoningEnabled) {
    if (model === 'mistral-large-latest' || model === 'mistral-medium-latest') {
      return { model: 'magistral-medium-latest', useReasoning: true };
    }
    if (model === 'mistral-small-latest') {
      return { model: 'magistral-small-latest', useReasoning: true };
    }
  }

  // Thinking level escalation — only switch to Magistral for investigate+ levels
  // think_hard stays on the same model (Mistral Large/Medium/Small are already capable)
  if (thinkingLevel) {
    const reasoningLevels = ['investigate', 'plan_first', 'deep_investigate'];
    if (reasoningLevels.includes(thinkingLevel)) {
      if (model === 'mistral-large-latest' || model === 'mistral-medium-latest') {
        return { model: 'magistral-medium-latest', useReasoning: true };
      }
      if (model === 'mistral-small-latest') {
        return { model: 'magistral-small-latest', useReasoning: true };
      }
    }
  }

  return { model, useReasoning: false };
}

export async function streamMistral(
  params: MistralStreamParams,
  res: Response
): Promise<{ inputTokens: number; outputTokens: number; text: string; thinking: string }> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY not configured');

  const { model: modelToUse, useReasoning } = resolveModel(
    params.model, params.thinkingLevel, params.nativeReasoningEnabled
  );

  console.log(`[mistral-adapter] Streaming → model=${modelToUse} (from ${params.model}) thinking=${params.thinkingLevel || 'none'} reasoning=${useReasoning} maxTokens=${params.maxTokens || 8192}`);

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

  // Enable structured reasoning for Magistral models
  if (useReasoning) {
    body.prompt_mode = 'reasoning';
  }

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
    signal: params.signal,
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[mistral-adapter] API error: ${response.status} ${err}`);
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
        const delta = chunk.choices?.[0]?.delta;

        if (delta) {
          // Handle structured content (Magistral thinking blocks)
          // Magistral v2509+ returns: [{ type: "thinking", thinking: [{ type: "text", text: "..." }] }, { type: "text", text: "..." }]
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

  console.log(`[mistral-adapter] stream_end → model=${modelToUse} textLen=${fullText.length} thinkingLen=${fullThinking.length} in=${inputTokens} out=${outputTokens}`);

  return { inputTokens, outputTokens, text: fullText, thinking: fullThinking };
}
