// Simple token estimation (~4 characters per token)
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
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
  const costs: Record<string, { input: number; output: number }> = {
    'claude-opus-4-6': { input: 15, output: 75 },
    'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
    'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  };
  const modelCost = costs[model] || costs['claude-opus-4-6'];
  return (inputTokens * modelCost.input + outputTokens * modelCost.output) / 1_000_000;
}

export function getContextUtilization(tokenCount: number, maxTokens: number = 180000): {
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
