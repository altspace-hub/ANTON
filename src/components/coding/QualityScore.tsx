import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface QualityScoreProps {
  score: number; // 0-10
  dimensions?: {
    completeness?: number;
    accuracy?: number;
    structure?: number;
    actionability?: number;
    citations?: number;
  };
  compact?: boolean;
  className?: string;
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-adv-green';
  if (score >= 6) return 'text-adv-teal';
  if (score >= 4) return 'text-adv-gold';
  return 'text-adv-red';
}

function scoreBg(score: number): string {
  if (score >= 8) return 'bg-adv-green/10 border-adv-green/30';
  if (score >= 6) return 'bg-adv-teal-dim border-adv-teal/30';
  if (score >= 4) return 'bg-adv-gold/10 border-adv-gold/30';
  return 'bg-adv-red/10 border-adv-red/30';
}

function scoreBarColor(score: number): string {
  if (score >= 8) return 'bg-adv-green';
  if (score >= 6) return 'bg-adv-teal';
  if (score >= 4) return 'bg-adv-gold';
  return 'bg-adv-red';
}

function scoreLabel(score: number): string {
  if (score >= 9) return 'Excellent';
  if (score >= 8) return 'Very Good';
  if (score >= 6) return 'Good';
  if (score >= 4) return 'Fair';
  if (score >= 2) return 'Poor';
  return 'Very Poor';
}

const DIMENSION_LABELS: Record<string, string> = {
  completeness: 'Completeness',
  accuracy: 'Accuracy',
  structure: 'Structure',
  actionability: 'Actionability',
  citations: 'Citations',
};

export default function QualityScore({ score, dimensions, compact = false, className = '' }: QualityScoreProps) {
  const [expanded, setExpanded] = useState(false);
  const clampedScore = Math.max(0, Math.min(10, score));
  const hasDimensions = dimensions && Object.values(dimensions).some((v) => v !== undefined);

  // Compact mode: small circular badge
  if (compact) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border ${scoreBg(clampedScore)} ${scoreColor(clampedScore)} w-7 h-7 text-xs font-bold ${className}`}
        title={`Quality Score: ${clampedScore.toFixed(1)} / 10 — ${scoreLabel(clampedScore)}`}
      >
        {clampedScore.toFixed(0)}
      </span>
    );
  }

  // Full mode: badge with optional expandable dimensions
  return (
    <div className={`rounded-lg border ${scoreBg(clampedScore)} p-3 ${className}`}>
      <div className="flex items-center gap-3">
        {/* Score circle */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${scoreColor(clampedScore)} border-current bg-adv-dark`}
        >
          <span className={`text-sm font-bold ${scoreColor(clampedScore)}`}>
            {clampedScore.toFixed(1)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${scoreColor(clampedScore)}`}>
              {scoreLabel(clampedScore)}
            </span>
            <span className="text-xs text-adv-gray">/ 10</span>
          </div>
          {/* Score bar */}
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-adv-dark">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColor(clampedScore)}`}
              style={{ width: `${(clampedScore / 10) * 100}%` }}
            />
          </div>
        </div>

        {/* Expand toggle for dimensions */}
        {hasDimensions && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-1 text-adv-gray hover:text-adv-off-white transition-colors"
            title={expanded ? 'Hide dimensions' : 'Show dimensions'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Expanded dimension bars */}
      {expanded && hasDimensions && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {Object.entries(dimensions!).map(([key, value]) => {
            if (value === undefined) return null;
            const dimScore = Math.max(0, Math.min(10, value));
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[11px] text-adv-gray">
                  {DIMENSION_LABELS[key] || key}
                </span>
                <div className="flex-1 h-1 overflow-hidden rounded-full bg-adv-dark">
                  <div
                    className={`h-full rounded-full transition-all ${scoreBarColor(dimScore)}`}
                    style={{ width: `${(dimScore / 10) * 100}%` }}
                  />
                </div>
                <span className={`w-6 text-right text-[11px] font-medium ${scoreColor(dimScore)}`}>
                  {dimScore.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
