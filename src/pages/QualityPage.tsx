import { useEffect, useState } from 'react';
import {
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Settings,
  X,
} from 'lucide-react';
import { MODULES } from '@/lib/constants';
import { getModuleFeedbackStats } from '@/lib/api';

interface QualityBaseline {
  module_id: string;
  baseline_score: number;
  sample_size: number;
  updated_at: string;
  trend_direction: 'up' | 'down' | 'flat';
}

interface QualityScore {
  id: string;
  module_id: string;
  score_overall: number;
  score_completeness: number;
  score_accuracy: number;
  score_structure: number;
  score_actionability: number;
  score_citations: number;
  is_regression: number;
  scored_at: string;
}

interface ModuleTrend {
  scores: QualityScore[];
  baseline: QualityBaseline | null;
}

interface FeedbackStats {
  count: number;
  avgRating: number;
  distribution: Record<string, number>;
  recentComments: { rating: number; comment: string; created_at: string }[];
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function QualityPage() {
  const [leaderboard, setLeaderboard] = useState<QualityBaseline[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedTrend, setSelectedTrend] = useState<ModuleTrend | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null);
  const [leaderboardFeedback, setLeaderboardFeedback] = useState<Record<string, FeedbackStats>>({});
  const [loading, setLoading] = useState(true);
  const [showThresholdModal, setShowThresholdModal] = useState(false);

  // Threshold configuration (could be persisted in localStorage)
  const [thresholds, setThresholds] = useState({
    excellent: 8.5,
    good: 7.0,
    acceptable: 5.5,
    poor: 4.0,
  });

  useEffect(() => {
    loadLeaderboard();
  }, []);

  useEffect(() => {
    if (selectedModuleId) {
      loadModuleTrend(selectedModuleId);
    } else {
      setSelectedTrend(null);
    }
  }, [selectedModuleId]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quality/leaderboard', { headers: getAuthHeader() });
      const data = (await res.json()) as QualityBaseline[];
      setLeaderboard(data);
      // Fetch feedback stats for all modules in parallel
      if (data.length > 0) {
        const entries = await Promise.all(
          data.map(async (item) => {
            try {
              const stats = await getModuleFeedbackStats(item.module_id);
              return [item.module_id, stats] as [string, FeedbackStats];
            } catch {
              return null;
            }
          })
        );
        const fbMap: Record<string, FeedbackStats> = {};
        for (const entry of entries) {
          if (entry) fbMap[entry[0]] = entry[1];
        }
        setLeaderboardFeedback(fbMap);
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadModuleTrend = async (moduleId: string) => {
    try {
      const res = await fetch(`/api/quality/trend/${moduleId}`, { headers: getAuthHeader() });
      const data = (await res.json()) as ModuleTrend;
      setSelectedTrend(data);
      // Load feedback stats for the selected module
      try {
        const stats = await getModuleFeedbackStats(moduleId);
        setFeedbackStats(stats);
      } catch {
        setFeedbackStats(null);
      }
    } catch (err) {
      console.error('Failed to load trend:', err);
      setSelectedTrend(null);
      setFeedbackStats(null);
    }
  };

  const getModuleName = (moduleId: string) => {
    return MODULES.find((m) => m.id === moduleId)?.label ?? moduleId;
  };

  const getScoreColor = (score: number) => {
    if (score >= thresholds.excellent) return 'text-adv-green';
    if (score >= thresholds.good) return 'text-adv-teal';
    if (score >= thresholds.acceptable) return 'text-adv-gold';
    if (score >= thresholds.poor) return 'text-adv-red';
    return 'text-adv-red';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= thresholds.excellent) return 'bg-adv-green/10';
    if (score >= thresholds.good) return 'bg-adv-teal/10';
    if (score >= thresholds.acceptable) return 'bg-adv-gold/10';
    if (score >= thresholds.poor) return 'bg-adv-red/10';
    return 'bg-adv-red/10';
  };

  const getTrendIndicator = (moduleId: string) => {
    const entry = leaderboard.find(m => m.module_id === moduleId);
    if (!entry) return null;
    if (entry.trend_direction === 'up') return <TrendingUp className="h-4 w-4 text-adv-green" />;
    if (entry.trend_direction === 'down') return <TrendingDown className="h-4 w-4 text-adv-red" />;
    return <Minus className="h-4 w-4 text-adv-gray" />;
  };

  const calculateStats = () => {
    if (leaderboard.length === 0) {
      return {
        modulesTracked: 0,
        avgQuality: 0,
        excellentCount: 0,
        needsAttentionCount: 0,
      };
    }

    const avgQuality =
      leaderboard.reduce((sum, m) => sum + m.baseline_score, 0) / leaderboard.length;
    const excellentCount = leaderboard.filter((m) => m.baseline_score >= thresholds.excellent)
      .length;
    const needsAttentionCount = leaderboard.filter((m) => m.baseline_score < thresholds.good)
      .length;

    return {
      modulesTracked: leaderboard.length,
      avgQuality,
      excellentCount,
      needsAttentionCount,
    };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-sm text-adv-gray">Loading quality data...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal/10">
            <Star className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-adv-white">Quality Ratchet</h1>
            <p className="text-sm text-adv-gray">Track output quality and prevent regression</p>
          </div>
        </div>
        <button
          onClick={() => setShowThresholdModal(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm text-adv-white transition-colors hover:bg-adv-dark-2"
        >
          <Settings className="h-4 w-4" />
          Thresholds
        </button>
      </div>

      {/* Stats Dashboard */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="mb-1 text-xs text-adv-gray">Modules Tracked</div>
          <div className="text-2xl font-bold text-adv-white">{stats.modulesTracked}</div>
        </div>
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="mb-1 text-xs text-adv-gray">Average Quality</div>
          <div className={`text-2xl font-bold ${getScoreColor(stats.avgQuality)}`}>
            {stats.avgQuality.toFixed(1)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="mb-1 text-xs text-adv-gray">Excellent (≥{thresholds.excellent})</div>
          <div className="text-2xl font-bold text-adv-green">{stats.excellentCount}</div>
        </div>
        <div className="rounded-lg border border-border bg-adv-card p-4">
          <div className="mb-1 text-xs text-adv-gray">Needs Attention (&lt;{thresholds.good})</div>
          <div className="text-2xl font-bold text-adv-red">{stats.needsAttentionCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Module Leaderboard */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-border bg-adv-card overflow-hidden">
            <div className="border-b border-border bg-adv-dark-2 px-4 py-3">
              <h2 className="text-sm font-semibold text-adv-white">Module Leaderboard</h2>
            </div>
            {leaderboard.length === 0 ? (
              <div className="p-4 text-sm text-adv-gray italic">
                No quality data yet. Start using modules to build quality baselines.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {leaderboard.map((item, index) => (
                  <button
                    key={item.module_id}
                    onClick={() => setSelectedModuleId(item.module_id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-adv-dark-2 ${
                      selectedModuleId === item.module_id ? 'bg-adv-teal/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-adv-gray">#{index + 1}</span>
                        <span className="text-sm font-medium text-adv-white">
                          {getModuleName(item.module_id)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getTrendIndicator(item.module_id)}
                        <span className={`text-lg font-bold ${getScoreColor(item.baseline_score)}`}>
                          {item.baseline_score.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-adv-gray">
                      <span>{item.sample_size} score{item.sample_size !== 1 ? 's' : ''}</span>
                      {(() => {
                        const fb = leaderboardFeedback[item.module_id];
                        if (!fb || fb.count === 0) return <span className="text-adv-gray-med">—</span>;
                        return (
                          <span className="text-adv-gold">
                            ★ {fb.avgRating.toFixed(1)} ({fb.count})
                          </span>
                        );
                      })()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Columns: Module Details */}
        <div className="lg:col-span-2">
          {!selectedTrend ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-border bg-adv-card p-8">
              <div className="text-center">
                <Star className="mx-auto mb-3 h-12 w-12 text-adv-gray/30" />
                <p className="text-sm text-adv-gray">Select a module to view quality details</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Module Header */}
              <div className="rounded-lg border border-border bg-adv-card p-6">
                <h2 className="mb-4 text-lg font-semibold text-adv-white">
                  {getModuleName(selectedModuleId || '')}
                </h2>
                <div className="flex items-center gap-6">
                  <div
                    className={`rounded-lg px-4 py-3 ${getScoreBgColor(
                      selectedTrend.baseline?.baseline_score ?? 0
                    )}`}
                  >
                    <div className="text-xs text-adv-gray">Baseline Score</div>
                    <div
                      className={`text-2xl font-bold ${getScoreColor(
                        selectedTrend.baseline?.baseline_score ?? 0
                      )}`}
                    >
                      {selectedTrend.baseline?.baseline_score.toFixed(1) ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-adv-dark-2 px-4 py-3">
                    <div className="text-xs text-adv-gray">Sample Size</div>
                    <div className="text-2xl font-bold text-adv-white">
                      {selectedTrend.baseline?.sample_size ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quality Dimensions Breakdown */}
              {selectedTrend.scores.length > 0 && (
                <div className="rounded-lg border border-border bg-adv-card p-6">
                  <h3 className="mb-4 text-sm font-semibold text-adv-white">
                    Quality Dimensions (Latest Score)
                  </h3>
                  <div className="space-y-3">
                    {[
                      {
                        label: 'Completeness',
                        score: selectedTrend.scores[selectedTrend.scores.length - 1]
                          .score_completeness,
                      },
                      {
                        label: 'Accuracy',
                        score: selectedTrend.scores[selectedTrend.scores.length - 1].score_accuracy,
                      },
                      {
                        label: 'Structure',
                        score: selectedTrend.scores[selectedTrend.scores.length - 1]
                          .score_structure,
                      },
                      {
                        label: 'Actionability',
                        score: selectedTrend.scores[selectedTrend.scores.length - 1]
                          .score_actionability,
                      },
                      {
                        label: 'Citations',
                        score: selectedTrend.scores[selectedTrend.scores.length - 1]
                          .score_citations,
                      },
                    ].map((dim) => (
                      <div key={dim.label}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-adv-gray">{dim.label}</span>
                          <span className={`text-sm font-semibold ${getScoreColor(dim.score)}`}>
                            {dim.score.toFixed(1)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-adv-dark-2">
                          <div
                            className={`h-full transition-all ${
                              dim.score >= thresholds.excellent
                                ? 'bg-adv-green'
                                : dim.score >= thresholds.good
                                ? 'bg-adv-teal'
                                : dim.score >= thresholds.acceptable
                                ? 'bg-adv-gold'
                                : 'bg-adv-red'
                            }`}
                            style={{ width: `${(dim.score / 10) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Scores */}
              <div className="rounded-lg border border-border bg-adv-card p-6">
                <h3 className="mb-4 text-sm font-semibold text-adv-white">Recent Scores</h3>
                {selectedTrend.scores.length === 0 ? (
                  <p className="text-sm text-adv-gray italic">No scores yet for this module.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTrend.scores
                      .slice()
                      .reverse()
                      .slice(0, 10)
                      .map((score) => (
                        <div
                          key={score.id}
                          className="flex items-center justify-between rounded-lg bg-adv-dark-2 px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            {score.is_regression === 1 && (
                              <AlertTriangle className="h-4 w-4 text-adv-red" />
                            )}
                            <div>
                              <div
                                className={`text-lg font-bold ${getScoreColor(score.score_overall)}`}
                              >
                                {score.score_overall.toFixed(1)}
                              </div>
                              <div className="text-xs text-adv-gray">
                                {new Date(score.scored_at).toLocaleDateString()}{' '}
                                {new Date(score.scored_at).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                          {score.is_regression === 1 && (
                            <span className="rounded bg-adv-red/10 px-2 py-1 text-xs font-medium text-adv-red">
                              Regression
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* User Feedback */}
              <div className="rounded-lg border border-border bg-adv-card p-6">
                <h3 className="mb-4 text-sm font-semibold text-adv-white">User Feedback</h3>
                {!feedbackStats || feedbackStats.count === 0 ? (
                  <p className="text-sm text-adv-gray italic">
                    No user ratings yet. Use the Feedback chip in any output to rate it.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Summary row */}
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-adv-gold">
                        {feedbackStats.avgRating.toFixed(1)}
                      </span>
                      <div>
                        <div className="flex items-center gap-0.5 text-lg text-adv-gold">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span key={s}>{s <= Math.round(feedbackStats.avgRating) ? '★' : '☆'}</span>
                          ))}
                        </div>
                        <div className="text-xs text-adv-gray">
                          {feedbackStats.count} rating{feedbackStats.count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    {/* Distribution bars */}
                    <div className="space-y-1">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = feedbackStats.distribution[star] ?? 0;
                        const pct = feedbackStats.count > 0 ? (count / feedbackStats.count) * 100 : 0;
                        return (
                          <div key={star} className="flex items-center gap-2">
                            <span className="w-3 text-right text-xs text-adv-gray">{star}</span>
                            <span className="text-xs text-adv-gold">★</span>
                            <div className="flex-1 h-2 rounded-full bg-adv-dark-2 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-adv-gold transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-5 text-right text-xs text-adv-gray">{count}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Recent comments */}
                    {feedbackStats.recentComments.length > 0 && (
                      <div className="space-y-1 border-t border-border pt-3">
                        <div className="mb-2 text-xs font-medium text-adv-gray">Recent comments</div>
                        {feedbackStats.recentComments.map((c, i) => (
                          <div key={i} className="rounded-lg bg-adv-dark-2 px-3 py-2">
                            <div className="flex items-center gap-1 text-adv-gold text-xs mb-0.5">
                              {Array.from({ length: c.rating }).map((_, j) => (
                                <span key={j}>★</span>
                              ))}
                            </div>
                            <p className="text-xs text-adv-off-white">{c.comment}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Threshold Configuration Modal */}
      {showThresholdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-adv-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-adv-white">Quality Thresholds</h3>
              <button
                onClick={() => setShowThresholdModal(false)}
                className="text-adv-gray transition-colors hover:text-adv-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-6 text-sm text-adv-gray">
              Configure the score thresholds for quality categories. Changes apply immediately to
              all visualizations.
            </p>
            <div className="space-y-4">
              {[
                { key: 'excellent', label: 'Excellent', color: 'text-adv-green' },
                { key: 'good', label: 'Good', color: 'text-adv-teal' },
                { key: 'acceptable', label: 'Acceptable', color: 'text-adv-gold' },
                { key: 'poor', label: 'Poor', color: 'text-adv-red' },
              ].map((threshold) => (
                <div key={threshold.key}>
                  <label className={`mb-1 block text-sm font-medium ${threshold.color}`}>
                    {threshold.label} (≥)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={thresholds[threshold.key as keyof typeof thresholds]}
                    onChange={(e) =>
                      setThresholds({
                        ...thresholds,
                        [threshold.key]: parseFloat(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowThresholdModal(false)}
                className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-adv-teal-dark"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
