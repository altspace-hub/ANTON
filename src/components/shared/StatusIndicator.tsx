import { Coins, Zap, TrendingDown } from 'lucide-react';
import { getModelPricing } from '../../lib/constants';

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
  const c = getModelPricing(model);
  const inputCost = (input * c.input) / 1_000_000;
  const outputCost = (output * c.output) / 1_000_000;
  const cachedCost = (cached * c.input * 0.1) / 1_000_000; // 90% discount
  const cacheCreationCost = (cacheCreation * c.input) / 1_000_000;
  const total = inputCost + outputCost + cachedCost + cacheCreationCost;
  return total < 0.01 ? '<$0.01' : `$${total.toFixed(2)}`;
}

// MODEL-03: compute what the same tokens would cost on a cheaper model
function modelSavingsComparison(input: number, output: number, currentModel: string): { label: string; saving: string } | null {
  // Only show if current model is Opus or Fable (the premium tiers)
  if (!currentModel.includes('opus') && !currentModel.includes('fable')) return null;
  const current = getModelPricing(currentModel);
  const sonnet = getModelPricing('claude-sonnet-4-6');
  const currentCost = (input * current.input + output * current.output) / 1_000_000;
  const sonnetCost  = (input * sonnet.input  + output * sonnet.output)  / 1_000_000;
  const saving = currentCost - sonnetCost;
  if (saving < 0.01) return null;
  return { label: 'Sonnet 4.6', saving: `$${saving.toFixed(2)}` };
}

function estimateCacheSavings(cached: number, model: string): string {
  const c = getModelPricing(model);
  const savings = (cached * c.input * 0.9) / 1_000_000; // 90% of what would have been paid
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
