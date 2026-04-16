import { type Tiktoken, encoding_for_model } from 'tiktoken';

// Use cl100k_base (GPT-4/Claude-compatible tokeniser).
// Falls back to char-count heuristic if tiktoken fails to load.
let _tokenizer: Tiktoken | null = null;
try {
  _tokenizer = encoding_for_model('gpt-3.5-turbo');
} catch {
  // tiktoken WASM not available — heuristic fallback
}

export function estimateTokens(text: string): number {
  if (_tokenizer) {
    try {
      return _tokenizer.encode(text).length;
    } catch {
      // fall through to heuristic
    }
  }
  // ~4 chars/token fallback
  return Math.ceil(text.length / 4);
}

export function estimateTokensFromWordCount(wordCount: number): number {
  // Average ~1.3 tokens per word
  return Math.ceil(wordCount * 1.3);
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  // Pricing as of 2026-03-15 (per million tokens)
  const costs: Record<string, { input: number; output: number }> = {
    'claude-opus-4-7': { input: 5, output: 25 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
    'gpt-4.1': { input: 2, output: 8 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gemini-2.5-pro': { input: 1.25, output: 10 },
    'gemini-2.5-flash': { input: 0.30, output: 2.5 },
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    // Mistral (verified from docs.mistral.ai 2026-03-15)
    'mistral-large-latest': { input: 0.50, output: 1.50 },
    'mistral-medium-latest': { input: 0.40, output: 2.00 },
    'mistral-small-latest': { input: 0.10, output: 0.30 },
    'magistral-medium-latest': { input: 2.00, output: 5.00 },
    'magistral-small-latest': { input: 0.50, output: 1.50 },
  };
  const modelCost = costs[model] || costs['claude-sonnet-4-6'];
  return (inputTokens * modelCost.input + outputTokens * modelCost.output) / 1_000_000;
}

export function getContextUtilization(tokenCount: number, maxTokens: number = 900_000): {
  percentage: number;
  level: 'ok' | 'warning' | 'critical';
  message: string;
} {
  const percentage = (tokenCount / maxTokens) * 100;
  if (percentage >= 90) {
    return { percentage, level: 'critical', message: 'Context nearly full. Remove some documents or use summary mode.' };
  }
  if (percentage >= 75) {
    return { percentage, level: 'warning', message: 'Approaching context limit. Consider reducing loaded documents.' };
  }
  return { percentage, level: 'ok', message: '' };
}
