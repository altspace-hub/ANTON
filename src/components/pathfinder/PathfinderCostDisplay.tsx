import { DollarSign, Clock, Cpu } from 'lucide-react';
import type { PathfinderModelResult } from '@/lib/pathfinder-api';

interface PathfinderCostDisplayProps {
  modelResults: PathfinderModelResult[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
}

export default function PathfinderCostDisplay({
  modelResults, totalInputTokens, totalOutputTokens, totalCostUsd, totalDurationMs,
}: PathfinderCostDisplayProps) {
  return (
    <div className="rounded-xl border border-border bg-adv-card p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-adv-gray mb-2">
        <DollarSign className="h-3 w-3" />
        Cost Breakdown
      </div>
      <div className="space-y-1">
        {modelResults.map(r => (
          <div key={r.modelId} className="flex items-center justify-between text-[11px]">
            <span className="text-adv-off-white">{r.role} <span className="text-adv-gray">({r.modelId})</span></span>
            <span className="text-adv-gray">{(r.durationMs / 1000).toFixed(1)}s</span>
          </div>
        ))}
        <div className="my-1.5 h-px bg-border" />
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3 text-adv-gray">
            <span className="flex items-center gap-1"><Cpu className="h-2.5 w-2.5" /> {totalInputTokens.toLocaleString()} in</span>
            <span>{totalOutputTokens.toLocaleString()} out</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-adv-gray"><Clock className="h-2.5 w-2.5" /> {(totalDurationMs / 1000).toFixed(1)}s</span>
            {totalCostUsd > 0 && <span className="text-adv-teal font-medium">${totalCostUsd.toFixed(4)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
