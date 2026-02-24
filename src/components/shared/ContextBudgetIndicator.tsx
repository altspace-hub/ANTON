import { AlertTriangle, Database } from 'lucide-react';

interface ContextBudgetIndicatorProps {
  systemPromptTokens: number;
  ragTokens: number;
  userMessageTokens: number;
  modelContextLimit: number;
}

export function ContextBudgetIndicator({
  systemPromptTokens,
  ragTokens,
  userMessageTokens,
  modelContextLimit,
}: ContextBudgetIndicatorProps) {
  const totalUsed = systemPromptTokens + ragTokens + userMessageTokens;
  const percentUsed = (totalUsed / modelContextLimit) * 100;
  const remaining = modelContextLimit - totalUsed;

  const color = percentUsed >= 90 ? 'text-adv-red' : percentUsed >= 70 ? 'text-adv-gold' : 'text-adv-teal';
  const bgColor = percentUsed >= 90 ? 'bg-adv-red/10' : percentUsed >= 70 ? 'bg-adv-gold/10' : 'bg-adv-teal/10';
  const barColor = percentUsed >= 90 ? 'bg-adv-red' : percentUsed >= 70 ? 'bg-adv-gold' : 'bg-adv-teal';

  return (
    <div className={`p-3 rounded-lg ${bgColor} border border-${color.replace('text-', '')}/20`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-adv-off-white">Context Budget</span>
        <span className={`text-xs font-mono ${color}`}>
          {totalUsed.toLocaleString()} / {modelContextLimit.toLocaleString()} tokens
        </span>
      </div>

      <div className="w-full bg-adv-dark rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-adv-gray">System:</span>
          <span className="text-adv-off-white ml-1 font-mono">{systemPromptTokens.toLocaleString()}</span>
        </div>
        {ragTokens > 0 && (
          <div className="flex items-center gap-1">
            <Database className="h-3 w-3 text-adv-teal" />
            <span className="text-adv-gray">RAG:</span>
            <span className="text-adv-off-white ml-1 font-mono">{ragTokens.toLocaleString()}</span>
          </div>
        )}
        <div>
          <span className="text-adv-gray">User:</span>
          <span className="text-adv-off-white ml-1 font-mono">{userMessageTokens.toLocaleString()}</span>
        </div>
      </div>

      <div className="mt-2 text-xs text-adv-gray">
        Available: <span className="font-mono text-adv-off-white">{remaining.toLocaleString()}</span> tokens
      </div>

      {percentUsed >= 80 && (
        <div className="mt-2 flex items-start gap-2 text-xs text-adv-gold">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {percentUsed >= 90
              ? 'Approaching context limit. Consider reducing RAG chunks or using a model with larger context.'
              : 'High context usage. Output may be truncated if you add more content.'}
          </span>
        </div>
      )}
    </div>
  );
}
