import React from 'react';
import {
  AlertTriangle,
  Info,
  TrendingUp,
  Users,
  GitMerge,
  Zap,
  ArrowUpRight,
  CheckCircle2
} from 'lucide-react';
import { DetectedPattern } from './types';
import { formatDistanceToNow } from 'date-fns';

interface PatternCardProps {
  pattern: DetectedPattern;
  onInvestigate?: () => void;
  onResolve?: () => void;
}

const PATTERN_ICONS = {
  temporal_correlation: TrendingUp,
  entity_convergence: Users,
  cascade: Zap,
  trend_divergence: ArrowUpRight,
  gap: Info,
};

const SEVERITY_STYLES = {
  critical: 'border-red-500 bg-red-950/30',
  warning: 'border-amber-500 bg-amber-950/30',
  info: 'border-blue-500 bg-blue-950/30',
  positive: 'border-emerald-500 bg-emerald-950/30',
};

const SEVERITY_BADGE_STYLES = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  positive: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export function PatternCard({ pattern, onInvestigate, onResolve }: PatternCardProps) {
  const Icon = PATTERN_ICONS[pattern.pattern_type];
  const affectedEntities = pattern.affected_entities ? JSON.parse(pattern.affected_entities) : [];

  const relativeTime = formatDistanceToNow(new Date(pattern.detected_at), { addSuffix: true });

  return (
    <div
      className={`border-l-4 rounded-lg p-4 ${SEVERITY_STYLES[pattern.severity]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="mt-1">
            <Icon className="w-5 h-5 text-adv-teal" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-adv-white">{pattern.title}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded border ${SEVERITY_BADGE_STYLES[pattern.severity]}`}
              >
                {pattern.severity.toUpperCase()}
              </span>
              <span className="text-xs text-adv-gray">{relativeTime}</span>
            </div>

            <p className="text-sm text-adv-off-white">{pattern.description}</p>

            {affectedEntities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {affectedEntities.map((entity: any, idx: number) => (
                  <span
                    key={idx}
                    className="text-xs px-2 py-1 rounded bg-adv-dark-2 text-adv-gray border border-adv-gray-med/20"
                  >
                    {entity.entity_type}: {entity.entity_id}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {onInvestigate && pattern.status === 'active' && (
            <button
              onClick={onInvestigate}
              className="px-3 py-1.5 text-sm rounded bg-adv-teal hover:bg-adv-teal-dark text-white transition-colors"
            >
              Investigate
            </button>
          )}
          {onResolve && pattern.status === 'active' && (
            <button
              onClick={onResolve}
              className="px-3 py-1.5 text-sm rounded border border-adv-gray-med/30 hover:bg-adv-card text-adv-off-white transition-colors flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" />
              Resolve
            </button>
          )}
        </div>
      </div>

      {pattern.status !== 'active' && (
        <div className="mt-3 pt-3 border-t border-adv-gray-med/20">
          <p className="text-xs text-adv-gray">
            Status: <span className="text-adv-off-white">{pattern.status}</span>
            {pattern.resolved_by && <> • Resolved by {pattern.resolved_by}</>}
            {pattern.resolution_notes && <> • {pattern.resolution_notes}</>}
          </p>
        </div>
      )}
    </div>
  );
}
