import { Coins, Zap, TrendingDown } from 'lucide-react';

interface StatusIndicatorProps {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  model: string;
  isStreaming: boolean;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

function estimateCost(
  input: number,
  output: number,
  model: string,
  cached: number = 0,
  cacheCreation: number = 0
): string {
  const costs: Record<string, { i: number; o: number }> = {
    'claude-opus-4-7': { i: 15, o: 75 },
    'claude-sonnet-4-5-20250929': { i: 3, o: 15 },
    'claude-haiku-4-5-20251001': { i: 1, o: 5 },
  };
  const c = costs[model] || costs['claude-opus-4-7'];
  const inputCost = (input * c.i) / 1_000_000;
  const outputCost = (output * c.o) / 1_000_000;
  const cachedCost = (cached * c.i * 0.1) / 1_000_000; // 90% discount
  const cacheCreationCost = (cacheCreation * c.i) / 1_000_000;
  const total = inputCost + outputCost + cachedCost + cacheCreationCost;
  return total < 0.01 ? '<$0.01' : `$${total.toFixed(2)}`;
}

// MODEL-03: compute what the same tokens would cost on a cheaper model
function modelSavingsComparison(input: number, output: number, currentModel: string): { label: string; saving: string } | null {
  const modelCosts: Record<string, { i: number; o: number; label: string }> = {
    'claude-opus-4-7': { i: 15, o: 75, label: 'Opus 4.7' },
    'claude-sonnet-4-6': { i: 3, o: 15, label: 'Sonnet 4.6' },
    'claude-sonnet-4-5-20250929': { i: 3, o: 15, label: 'Sonnet 4.5' },
    'claude-haiku-4-5-20251001': { i: 1, o: 5, label: 'Haiku 4.5' },
  };
  // Only show if current model is Opus
  if (!currentModel.includes('opus')) return null;
  const current = modelCosts[currentModel];
  const sonnet = modelCosts['claude-sonnet-4-6'];
  if (!current || !sonnet) return null;
  const currentCost = (input * current.i + output * current.o) / 1_000_000;
  const sonnetCost  = (input * sonnet.i  + output * sonnet.o)  / 1_000_000;
  const saving = currentCost - sonnetCost;
  if (saving < 0.01) return null;
  return { label: 'Sonnet 4.6', saving: `$${saving.toFixed(2)}` };
}

function estimateCacheSavings(cached: number, model: string): string {
  const costs: Record<string, { i: number }> = {
    'claude-opus-4-7': { i: 15 },
    'claude-sonnet-4-5-20250929': { i: 3 },
    'claude-haiku-4-5-20251001': { i: 1 },
  };
  const c = costs[model] || costs['claude-opus-4-7'];
  const savings = (cached * c.i * 0.9) / 1_000_000; // 90% of what would have been paid
  return savings < 0.01 ? '<$0.01' : `$${savings.toFixed(2)}`;
}

export default function StatusIndicator({
  inputTokens,
  outputTokens,
  cachedTokens = 0,
  cacheCreationTokens = 0,
  model,
  isStreaming,
}: StatusIndicatorProps) {
  if (inputTokens === 0 && outputTokens === 0 && !isStreaming) return null;

  const hasCacheData = cachedTokens > 0 || cacheCreationTokens > 0;
  const savingsHint = inputTokens > 0 ? modelSavingsComparison(inputTokens, outputTokens, model) : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-adv-dark-2 px-3 py-2">
      <div className="flex items-center gap-4">
        {isStreaming && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 animate-pulse rounded-full bg-adv-teal" />
            <span className="text-xs text-adv-teal">Streaming...</span>
          </div>
        )}

        {(inputTokens > 0 || outputTokens > 0) && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-adv-gray">
              <Zap className="h-3 w-3" />
              <span>{formatTokens(inputTokens)} in</span>
              <span className="text-adv-gray">·</span>
              <span>{formatTokens(outputTokens)} out</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-adv-gray">
              <Coins className="h-3 w-3" />
              <span>{estimateCost(inputTokens, outputTokens, model, cachedTokens, cacheCreationTokens)}</span>
            </div>
          </>
        )}
      </div>

      {savingsHint && (
        <div className="flex items-center gap-2 border-t border-border pt-2 text-xs text-adv-gray">
          <TrendingDown className="h-3 w-3 text-adv-green" />
          <span>
            Same result on <span className="text-adv-off-white">{savingsHint.label}</span> would save ~
            <span className="text-adv-green font-medium"> {savingsHint.saving}</span>
          </span>
        </div>
      )}

      {hasCacheData && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          {cachedTokens > 0 && (
            <div className="flex items-center gap-2 text-xs text-adv-teal">
              <Zap className="h-3.5 w-3.5" />
              <span>
                Cached: {formatTokens(cachedTokens)} tokens (saved ~{estimateCacheSavings(cachedTokens, model)})
              </span>
            </div>
          )}
          {cacheCreationTokens > 0 && (
            <div className="text-xs text-adv-gray">
              Cache created: {formatTokens(cacheCreationTokens)} tokens (subsequent calls will be faster + cheaper)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
