import { useState, useEffect } from 'react';
import {
  Brain,
  TrendingUp,
  History,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface RecentDecision {
  decision: string;
  reasoning: string | null;
  isOverride: boolean;
  overrideCategory: string | null;
  decidedBy: string;
  decidedAt: string;
  aiRecommendation: string | null;
  aiConfidence: number | null;
}

interface MemoryData {
  hasHistory: boolean;
  message?: string;
  totalDecisions?: number;
  distribution?: Record<string, number>;
  aiAlignmentRate?: number;
  overrideRate?: number;
  topOverrideReason?: string;
  dominantDecision?: string;
  dominantDecisionRate?: number;
  recentDecisions?: RecentDecision[];
  insight?: string;
  history?: RecentDecision[];
}

export interface CheckpointMemoryPanelProps {
  workflowId: string;
  stepIndex: number;
  aiRecommendation: string;
  aiConfidence?: number; // 0-1
  onDecision?: (decision: string, reasoning: string, isOverride: boolean) => void;
}

const DECISION_OPTIONS = ['approve', 'reject', 'escalate', 'defer'];

const OVERRIDE_CATEGORIES = [
  'business_context_not_in_prompt',
  'regulatory_exception',
  'risk_tolerance_adjustment',
  'incomplete_information',
  'policy_change',
  'manual_review_preferred',
  'other',
];

function formatOverrideCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function DecisionBadge({ decision }: { decision: string }) {
  const colors: Record<string, string> = {
    approve: 'bg-adv-green/20 text-adv-green border-adv-green/30',
    reject: 'bg-adv-red/20 text-adv-red border-adv-red/30',
    escalate: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30',
    defer: 'bg-adv-blue/20 text-adv-blue border-adv-blue/30',
  };
  const cls = colors[decision.toLowerCase()] ?? 'bg-adv-gray/20 text-adv-gray border-adv-gray/30';
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {decision}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-border bg-adv-card p-4">
      <div className="h-3 w-1/3 rounded bg-adv-dark-2" />
      <div className="h-2 w-2/3 rounded bg-adv-dark-2" />
      <div className="h-2 w-1/2 rounded bg-adv-dark-2" />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

export default function CheckpointMemoryPanel({
  workflowId,
  stepIndex,
  aiRecommendation,
  aiConfidence,
  onDecision,
}: CheckpointMemoryPanelProps) {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Decision form state
  const [decision, setDecision] = useState('approve');
  const [reasoning, setReasoning] = useState('');
  const [isOverride, setIsOverride] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMemory() {
      setLoading(true);
      setFetchError(null);
      try {
        const params = new URLSearchParams({ aiRecommendation });
        const res = await fetch(
          `/api/memory/checkpoints/${encodeURIComponent(workflowId)}/${stepIndex}?${params}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: MemoryData = await res.json();
        setData(json);
      } catch (err) {
        setFetchError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchMemory();
  }, [workflowId, stepIndex, aiRecommendation]);

  // Detect override automatically when decision differs from AI recommendation
  useEffect(() => {
    if (aiRecommendation && decision !== aiRecommendation) {
      setIsOverride(true);
    }
  }, [decision, aiRecommendation]);

  const handleSubmit = async () => {
    if (!reasoning.trim()) {
      setSubmitError('Reasoning is required before recording a decision.');
      return;
    }
    if (isOverride && !overrideCategory) {
      setSubmitError('Please select an override category.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (onDecision) {
        onDecision(decision, reasoning.trim(), isOverride);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 p-4">
        <p className="text-xs text-adv-red">Failed to load institutional memory: {fetchError}</p>
      </div>
    );
  }

  const hasHistory = data?.hasHistory ?? false;
  const totalDecisions = data?.totalDecisions ?? 0;
  const distribution = data?.distribution ?? {};
  const overrideRate = data?.overrideRate ?? 0;
  const aiAlignmentRate = data?.aiAlignmentRate ?? 0;
  const topOverrideReason = data?.topOverrideReason;
  const recentDecisions = data?.recentDecisions ?? data?.history ?? [];
  const insight = data?.insight ?? '';

  const sortedDistribution = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  const maxCount = sortedDistribution[0]?.[1] ?? 1;

  const aiAgreesWithMajority =
    data?.dominantDecision?.toLowerCase() === aiRecommendation.toLowerCase();

  const showOverrideWarning = overrideRate >= 0.4 && totalDecisions >= 5;

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-adv-teal" />
        <div>
          <h3 className="text-sm font-semibold text-adv-off-white">Institutional Memory</h3>
          {hasHistory ? (
            <p className="text-[11px] text-adv-gray">
              Based on {totalDecisions} past decision{totalDecisions !== 1 ? 's' : ''} at this checkpoint
            </p>
          ) : (
            <p className="text-[11px] text-adv-gray">No history yet at this checkpoint</p>
          )}
        </div>
      </div>

      {!hasHistory ? (
        /* ── Empty state ── */
        <div className="rounded-xl border border-border bg-adv-card p-4">
          <div className="flex items-center gap-2 text-adv-gray">
            <History className="h-4 w-4" />
            <p className="text-xs">
              First time at this checkpoint — your decision will be remembered for future reference.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Insight Banner ── */}
          {insight && (
            <div className="rounded-xl border border-adv-gold/40 bg-adv-teal-soft p-4">
              <div className="flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-adv-teal" />
                <p className="text-xs text-adv-off-white leading-relaxed">{insight}</p>
              </div>
            </div>
          )}

          {/* ── Decision Distribution ── */}
          {sortedDistribution.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
                Decision Distribution
              </h4>
              <div className="space-y-2">
                {sortedDistribution.map(([dec, count]) => {
                  const pct = Math.round((count / totalDecisions) * 100);
                  const isMajority = count === maxCount;
                  return (
                    <div key={dec} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`capitalize font-medium ${isMajority ? 'text-adv-teal' : 'text-adv-gray'}`}>
                          {dec}
                        </span>
                        <span className="text-adv-gray">
                          {pct}% ({count}/{totalDecisions})
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-adv-dark">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${isMajority ? 'bg-adv-teal' : 'bg-adv-gray-med'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── AI Alignment Indicator ── */}
          <div className="rounded-xl border border-border bg-adv-card px-4 py-3">
            <div className="flex items-center gap-2">
              {aiAgreesWithMajority ? (
                <>
                  <CheckCircle className="h-4 w-4 text-adv-green" />
                  <span className="text-xs text-adv-off-white">
                    AI agrees with majority decision
                    {aiAlignmentRate > 0 && (
                      <span className="ml-1 text-adv-gray">
                        ({Math.round(aiAlignmentRate * 100)}% alignment)
                      </span>
                    )}
                  </span>
                </>
              ) : showOverrideWarning ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-adv-gold" />
                  <span className="text-xs text-adv-off-white">
                    AI recommendation is often overridden here
                    <span className="ml-1 text-adv-gold">
                      ({Math.round(overrideRate * 100)}% override rate)
                    </span>
                    {topOverrideReason && (
                      <span className="ml-1 text-adv-gray">
                        — common reason: {formatOverrideCategory(topOverrideReason)}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-adv-gray" />
                  <span className="text-xs text-adv-gray">
                    AI recommendation differs from most common past decision
                  </span>
                </>
              )}
            </div>
            {aiConfidence !== undefined && (
              <p className="mt-1.5 text-xs text-adv-gray">
                AI confidence in current recommendation: {Math.round(aiConfidence * 100)}%
              </p>
            )}
          </div>

          {/* ── Recent Decisions (collapsible) ── */}
          {recentDecisions.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
              <button
                onClick={() => setHistoryOpen(v => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-adv-dark-2/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-adv-gray" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
                    Recent Decisions ({recentDecisions.length})
                  </span>
                </div>
                {historyOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" />
                  : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />
                }
              </button>
              {historyOpen && (
                <div className="border-t border-border divide-y divide-border">
                  {recentDecisions.map((item, idx) => (
                    <div key={idx} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <DecisionBadge decision={item.decision} />
                        {item.isOverride && (
                          <span className="rounded border border-adv-gold/30 bg-adv-gold/10 px-1.5 py-0.5 text-xs text-adv-gold">
                            Override
                            {item.overrideCategory && ` — ${formatOverrideCategory(item.overrideCategory)}`}
                          </span>
                        )}
                        <span className="text-xs text-adv-gray">
                          {item.decidedBy} · {formatDate(item.decidedAt)}
                        </span>
                      </div>
                      {item.reasoning && (
                        <p className="text-[11px] text-adv-gray leading-relaxed line-clamp-3">
                          {item.reasoning}
                        </p>
                      )}
                      {item.aiRecommendation && (
                        <p className="text-xs text-adv-gray">
                          AI recommended: <span className="capitalize">{item.aiRecommendation}</span>
                          {item.aiConfidence !== null && item.aiConfidence !== undefined && (
                            <span> ({Math.round(item.aiConfidence * 100)}% confidence)</span>
                          )}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Decision Form ── */}
      {onDecision && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-4 space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-adv-teal">
            Record Your Decision
          </h4>

          {/* Decision selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-adv-gray">Decision</label>
            <div className="flex flex-wrap gap-2">
              {DECISION_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => setDecision(opt)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    decision === opt
                      ? 'border-adv-teal bg-adv-teal text-adv-dark'
                      : 'border-border text-adv-gray hover:border-adv-teal/50 hover:text-adv-off-white'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-adv-gray">
              Reasoning <span className="text-adv-red">*</span>
            </label>
            <textarea
              value={reasoning}
              onChange={e => setReasoning(e.target.value)}
              placeholder="Explain your decision — this will help future reviewers understand the context..."
              rows={3}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
            />
          </div>

          {/* Override toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isOverride}
                onChange={e => {
                  setIsOverride(e.target.checked);
                  if (!e.target.checked) setOverrideCategory('');
                }}
                className="rounded border-border accent-adv-teal"
              />
              <span className="text-xs text-adv-gray">
                This overrides the AI recommendation
                {aiRecommendation && (
                  <span className="ml-1 text-adv-gray">
                    (AI recommended: <span className="capitalize">{aiRecommendation}</span>)
                  </span>
                )}
              </span>
            </label>
          </div>

          {/* Override category */}
          {isOverride && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-adv-gray">
                Override reason <span className="text-adv-red">*</span>
              </label>
              <select
                value={overrideCategory}
                onChange={e => setOverrideCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              >
                <option value="">Select a reason...</option>
                {OVERRIDE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{formatOverrideCategory(cat)}</option>
                ))}
              </select>
            </div>
          )}

          {submitError && (
            <p className="text-[11px] text-adv-red">{submitError}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !reasoning.trim()}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-adv-dark border-t-transparent" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Record Decision
          </button>
        </div>
      )}
    </div>
  );
}
