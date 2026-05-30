import { type Tiktoken, encoding_for_model } from 'tiktoken';
import { estimateCost as capEstimateCost, MODEL_CAPABILITIES } from '../config/model-capabilities.js';

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
  // Pricing source of truth is model-capabilities.ts::estimateCost — this is a
  // thin, signature-compatible delegate, so a model/price update is a one-file
  // edit (MODEL_CAPABILITIES). Unknown models fall back to Sonnet 4.6 pricing
  // (a non-zero estimate, matching prior behaviour rather than $0-for-unknown).
  const known = model in MODEL_CAPABILITIES ? model : 'claude-sonnet-4-6';
  return capEstimateCost(known, inputTokens, outputTokens, 0);
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
