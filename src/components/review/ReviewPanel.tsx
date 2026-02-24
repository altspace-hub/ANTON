/**
 * ReviewPanel.tsx
 *
 * Displays 5-agent review results with scores, findings, and suggestions
 * Can be collapsed/expanded per agent
 */

import { useState, Fragment } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Wrench,
  MessageSquare,
  Swords,
  Star,
} from 'lucide-react';

interface ReviewFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  location?: string;
  suggestion?: string;
}

interface ReviewResult {
  agent: string;
  agentDescription: string;
  score: number;
  findings: ReviewFinding[];
  suggestions: string[];
  executionTimeMs: number;
}

interface ReviewPanelProps {
  overallScore: number;
  reviews: ReviewResult[];
  approved: boolean;
  humanReviewRequired: boolean;
  summary: string;
  totalExecutionTimeMs: number;
}

// Safe markdown-subset renderer — avoids dangerouslySetInnerHTML / XSS.
// Only handles the two patterns used in review summaries: **bold** and newlines.
function renderSummaryText(text: string) {
  return text.split('\n').map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const renderedParts = parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : part
    );
    return (
      <Fragment key={lineIdx}>
        {lineIdx > 0 && <br />}
        {renderedParts}
      </Fragment>
    );
  });
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  quality: Star,
  regulatory: Shield,
  technical: Wrench,
  communications: MessageSquare,
  'red-team': Swords,
};

const SEVERITY_COLORS = {
  critical: 'text-red-400 bg-red-900/20 border-red-500/30',
  high: 'text-orange-400 bg-orange-900/20 border-orange-500/30',
  medium: 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30',
  low: 'text-blue-400 bg-blue-900/20 border-blue-500/30',
  info: 'text-adv-gray bg-adv-dark-2 border-adv-teal/10',
};

export function ReviewPanel({
  overallScore,
  reviews,
  approved,
  humanReviewRequired,
  summary,
  totalExecutionTimeMs,
}: ReviewPanelProps) {
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-green-400';
    if (score >= 7) return 'text-yellow-400';
    if (score >= 5) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreEmoji = (score: number) => {
    if (score >= 9) return '🟢';
    if (score >= 7) return '🟡';
    if (score >= 5) return '🟠';
    return '🔴';
  };

  return (
    <div className="bg-adv-card border border-adv-teal/20 rounded-lg shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-adv-teal/20">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-adv-white">Quality Review Results</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-adv-gray">{(totalExecutionTimeMs / 1000).toFixed(1)}s</span>
            <span className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
              {overallScore}/10
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {humanReviewRequired ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-900/20 border border-red-500/30 rounded-full">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-300">Human Review Required</span>
            </div>
          ) : approved ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-900/20 border border-green-500/30 rounded-full">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-300">Approved</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-yellow-900/20 border border-yellow-500/30 rounded-full">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-yellow-300">Review Recommended</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="px-6 py-4 border-b border-adv-teal/20">
        <div className="prose prose-invert prose-sm max-w-none">
          {renderSummaryText(summary)}
        </div>
      </div>

      {/* Individual Agent Reviews */}
      <div className="divide-y divide-adv-teal/10">
        {reviews.map((review) => {
          const Icon = AGENT_ICONS[review.agent] || Star;
          const isExpanded = expandedAgents.has(review.agent);

          return (
            <div key={review.agent} className="px-6 py-4">
              {/* Agent Header */}
              <button
                onClick={() => toggleAgent(review.agent)}
                className="w-full flex items-center justify-between hover:bg-adv-teal/5 rounded-lg px-3 py-2 -mx-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-adv-teal" />
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-adv-white">{review.agentDescription}</h3>
                    <p className="text-xs text-adv-gray">
                      {review.findings.length} finding{review.findings.length !== 1 ? 's' : ''} •{' '}
                      {(review.executionTimeMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${getScoreColor(review.score)}`}>
                    {getScoreEmoji(review.score)} {review.score}/10
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-adv-gray" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-adv-gray" />
                  )}
                </div>
              </button>

              {/* Agent Details (Expanded) */}
              {isExpanded && (
                <div className="mt-4 space-y-3">
                  {/* Findings */}
                  {review.findings.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-adv-teal mb-2">Findings</h4>
                      <div className="space-y-2">
                        {review.findings.map((finding, i) => (
                          <div
                            key={i}
                            className={`border rounded-lg px-3 py-2 ${SEVERITY_COLORS[finding.severity]}`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-xs font-semibold uppercase">{finding.severity}</span>
                              <span className="text-xs opacity-70">{finding.category}</span>
                            </div>
                            <p className="text-sm mb-1">{finding.message}</p>
                            {finding.location && (
                              <p className="text-xs opacity-70 mb-1">
                                <strong>Location:</strong> {finding.location}
                              </p>
                            )}
                            {finding.suggestion && (
                              <p className="text-xs opacity-90 mt-2 pt-2 border-t border-current/20">
                                <strong>Suggestion:</strong> {finding.suggestion}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  {review.suggestions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-adv-teal mb-2">Suggestions</h4>
                      <ul className="space-y-1 list-disc list-inside text-sm text-adv-off-white">
                        {review.suggestions.map((suggestion, i) => (
                          <li key={i}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {review.findings.length === 0 && review.suggestions.length === 0 && (
                    <p className="text-sm text-adv-gray italic">No findings or suggestions from this agent.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
