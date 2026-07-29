// ═══════════════════════════════════════════════════════════
// Gemini Adapter — Streams Google Gemini responses as SSE
// ═══════════════════════════════════════════════════════════

import type { StreamSink } from '../stream-sink.js';

export interface GeminiStreamParams {
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens?: number;
  nativeReasoningEnabled?: boolean;
}

function mapRole(role: string): string {
  return role === 'assistant' ? 'model' : 'user';
}

export async function streamGemini(
  params: GeminiStreamParams,
  res: StreamSink
): Promise<{ inputTokens: number; outputTokens: number; text: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const contents = params.messages.map((m) => ({
    role: mapRole(m.role),
    parts: [{ text: m.content }],
  }));

  const generationConfig: Record<string, unknown> = {
    temperature: params.temperature,
    maxOutputTokens: params.maxTokens || 8192,
  };

  // Enable Deep Think mode when native reasoning is enabled
  if (params.nativeReasoningEnabled) {
    generationConfig.thinkingMode = 'deep';
  }

  const body = {
    contents,
    systemInstruction: { parts: [{ text: params.system }] },
    generationConfig,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
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
      if (!data) continue;
      try {
        const chunk = JSON.parse(data);
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullText += text;
          res.write(`data: ${JSON.stringify({ type: 'text_delta', content: text })}\n\n`);
        }
        // Gemini reports usage in usageMetadata
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount || 0;
          outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
        }
      } catch {
        // skip parse errors
      }
    }
  }

  return { inputTokens, outputTokens, text: fullText };
}
