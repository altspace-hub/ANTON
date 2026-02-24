import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface QualityScore {
  overall: number;
  completeness: number;
  accuracy: number;
  structure: number;
  actionability: number;
  citations: number;
}

interface QualityScoreCardProps {
  score: QualityScore;
  regressionWarning?: string;
  moduleId: string;
}

export default function QualityScoreCard({ score, regressionWarning, moduleId }: QualityScoreCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const getScoreColor = (val: number) => {
    if (val >= 8) return 'text-adv-green';
    if (val >= 6) return 'text-adv-gold';
    return 'text-adv-red';
  };

  const getScoreBg = (val: number) => {
    if (val >= 8) return 'bg-adv-green/20';
    if (val >= 6) return 'bg-adv-gold/20';
    return 'bg-adv-red/20';
  };

  const dimensions = [
    { key: 'completeness', label: 'Completeness', value: score.completeness },
    { key: 'accuracy', label: 'Accuracy', value: score.accuracy },
    { key: 'structure', label: 'Structure', value: score.structure },
    { key: 'actionability', label: 'Actionability', value: score.actionability },
    { key: 'citations', label: 'Citations', value: score.citations },
  ];

  return (
    <div className="rounded-lg border border-border bg-adv-card p-4 shadow-sm">
      {/* Regression warning banner */}
      {regressionWarning && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-adv-gold/10 border border-adv-gold/30 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-adv-gold mt-0.5" />
          <span className="text-xs text-adv-gold">{regressionWarning}</span>
        </div>
      )}

      {/* Overall score header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Star className="h-5 w-5 text-adv-teal" />
          <span className="text-sm font-medium text-adv-off-white">Quality Score</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${getScoreBg(score.overall)}`}>
            <span className={`text-2xl font-bold ${getScoreColor(score.overall)}`}>
              {score.overall.toFixed(1)}
            </span>
            <span className="text-xs text-adv-gray">/10</span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-adv-gray" />
          ) : (
            <ChevronDown className="h-4 w-4 text-adv-gray" />
          )}
        </div>
      </button>

      {/* Dimension breakdown */}
      {expanded && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {dimensions.map((dim) => (
            <div key={dim.key} className="flex items-center gap-3">
              <span className="min-w-[110px] text-xs text-adv-gray">{dim.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-adv-dark-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    dim.value >= 8 ? 'bg-adv-green' : dim.value >= 6 ? 'bg-adv-gold' : 'bg-adv-red'
                  }`}
                  style={{ width: `${(dim.value / 10) * 100}%` }}
                />
              </div>
              <span className={`min-w-[35px] text-right text-xs font-medium ${getScoreColor(dim.value)}`}>
                {dim.value.toFixed(1)}
              </span>
            </div>
          ))}

          {/* View trend button */}
          <button
            onClick={() => navigate(`/quality?module=${moduleId}`)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-xs text-adv-teal transition-colors hover:bg-adv-card"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            View Quality Trend
          </button>
        </div>
      )}
    </div>
  );
}
