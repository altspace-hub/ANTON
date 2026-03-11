import React, { useState } from 'react';
import {
  AlertTriangle,
  Info,
  TrendingUp,
  Users,
  GitMerge,
  Zap,
  ArrowUpRight,
  CheckCircle2,
  Brain,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { DetectedPattern } from './types';
import { formatDistanceToNow } from 'date-fns';

interface PatternCardProps {
  pattern: DetectedPattern;
  onInvestigate?: () => void;
  onResolve?: () => void;
}

const PATTERN_ICONS: Record<string, typeof TrendingUp> = {
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

interface AiAnalysis {
  explanation: string;
  urgency: 'low' | 'medium' | 'high';
  actions: string[];
}

export function PatternCard({ pattern, onInvestigate, onResolve }: PatternCardProps) {
  const Icon = PATTERN_ICONS[pattern.pattern_type] ?? Info;
  const affectedEntities = pattern.affected_entities ? JSON.parse(pattern.affected_entities) : [];
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  async function runAnalysis() {
    setAnalysisLoading(true);
    setAnalysisOpen(true);
    try {
      const r = await fetch('/api/ai-assist/pattern-analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patternType: pattern.pattern_type,
          title: pattern.title,
          description: pattern.description,
          severity: pattern.severity,
          evidenceCount: pattern.evidence_count,
          affectedEntities,
        }),
      });
      if (r.ok) setAiAnalysis(await r.json() as AiAnalysis);
    } catch { /* ignore */ } finally { setAnalysisLoading(false); }
  }

  const urgencyColor = { low: 'text-adv-gray', medium: 'text-adv-gold', high: 'text-adv-red' };

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
              <h3 className="font-semibold text-adv-off-white">{pattern.title}</h3>
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
                    className="text-xs px-2 py-1 rounded bg-secondary text-adv-gray border border-border"
                  >
                    {entity.entity_type}: {entity.entity_id}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={aiAnalysis ? () => setAnalysisOpen(v => !v) : runAnalysis}
            disabled={analysisLoading}
            className="px-3 py-1.5 text-sm rounded border border-adv-teal/30 bg-adv-teal/10 text-adv-teal hover:bg-adv-teal/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title="Get AI analysis of this pattern"
          >
            {analysisLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            {analysisLoading ? 'Analysing…' : aiAnalysis ? (analysisOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : 'Analyse'}
          </button>
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

      {aiAnalysis && analysisOpen && (
        <div className="mt-3 pt-3 border-t border-adv-teal/20 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-3.5 h-3.5 text-adv-teal" />
            <span className="text-xs font-medium text-adv-teal">AI Analysis</span>
            <span className={`text-xs font-medium ml-auto ${urgencyColor[aiAnalysis.urgency] ?? 'text-adv-gray'}`}>
              {aiAnalysis.urgency.toUpperCase()} urgency
            </span>
          </div>
          <p className="text-sm text-adv-off-white">{aiAnalysis.explanation}</p>
          {aiAnalysis.actions.length > 0 && (
            <ul className="space-y-1">
              {aiAnalysis.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                  <span className="text-adv-teal mt-0.5">→</span>
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {pattern.status !== 'active' && (
        <div className="mt-3 pt-3 border-t border-border">
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
