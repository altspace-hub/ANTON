/**
 * MyBiasPage.tsx
 *
 * Personal Bias Dashboard — shows the user's reading bias profile.
 * Route: /news/my-bias
 *
 * Features:
 * - Fetches GET /api/news/preferences
 * - Bias distribution bar chart (div-based)
 * - Diversity score
 * - Blind spots list
 * - Reading recommendations
 * - "Analyze My Reading" button → POST /api/news/analyze-bias
 */

import { useEffect, useState } from 'react';
import {
  User,
  Loader2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Eye,
  EyeOff,
  Lightbulb,
  BarChart3,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface BiasDistribution {
  far_left?: number;
  left?: number;
  center_left?: number;
  center?: number;
  center_right?: number;
  right?: number;
  far_right?: number;
}

interface UserPreferences {
  bias_distribution: BiasDistribution;
  diversity_score: number;         // 0-100
  blind_spots: string[];
  recommendations: string[];
  total_articles_read: number;
  reading_history?: ReadingRecord[];
}

interface ReadingRecord {
  article_id: string;
  title?: string;
  source_name?: string;
  bias_rating?: string;
  read_at: string;
}

interface AnalysisResult {
  summary: string;
  dominant_lean: string;
  diversity_score: number;
  blind_spots: string[];
  recommendations: string[];
}

// ── Bias bar config ──────────────────────────────────────────────────────────

interface BiasBarEntry {
  key: keyof BiasDistribution;
  label: string;
  shortLabel: string;
  barColor: string;
  textColor: string;
}

const BIAS_BARS: BiasBarEntry[] = [
  { key: 'far_left',    label: 'Far Left',     shortLabel: 'FL',   barColor: 'bg-red-500',    textColor: 'text-red-400' },
  { key: 'left',        label: 'Left',         shortLabel: 'L',    barColor: 'bg-orange-400', textColor: 'text-orange-400' },
  { key: 'center_left', label: 'Center-Left',  shortLabel: 'CL',   barColor: 'bg-yellow-400', textColor: 'text-yellow-400' },
  { key: 'center',      label: 'Center',       shortLabel: 'C',    barColor: 'bg-adv-gray',   textColor: 'text-adv-gray' },
  { key: 'center_right',label: 'Center-Right', shortLabel: 'CR',   barColor: 'bg-sky-400',    textColor: 'text-sky-400' },
  { key: 'right',       label: 'Right',        shortLabel: 'R',    barColor: 'bg-adv-blue',   textColor: 'text-adv-blue' },
  { key: 'far_right',   label: 'Far Right',    shortLabel: 'FR',   barColor: 'bg-blue-900',   textColor: 'text-blue-300' },
];

function getDiversityColor(score: number): string {
  if (score >= 70) return 'text-adv-green';
  if (score >= 40) return 'text-adv-gold';
  return 'text-adv-red';
}

function getDiversityBarColor(score: number): string {
  if (score >= 70) return 'bg-adv-green';
  if (score >= 40) return 'bg-adv-gold';
  return 'bg-adv-red';
}

function getDiversityLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Moderate';
  if (score >= 20) return 'Limited';
  return 'Echo Chamber';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MyBiasPage() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/news/preferences')
      .then((r) => (r.ok ? (r.json() as Promise<UserPreferences>) : null))
      .then((data) => {
        setPreferences(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAnalyze = async () => {
    if (!preferences || analyzing) return;
    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/news/analyze-bias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reading_history: preferences.reading_history ?? [],
          bias_distribution: preferences.bias_distribution,
        }),
      });

      if (!response.ok) {
        setError(`Analysis failed (${response.status})`);
        return;
      }

      const data = (await response.json()) as AnalysisResult;
      setAnalysisResult(data);

      // Merge updated scores back into preferences display
      setPreferences((prev) =>
        prev
          ? {
              ...prev,
              diversity_score: data.diversity_score,
              blind_spots: data.blind_spots,
              recommendations: data.recommendations,
            }
          : prev
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Compute max for bar chart scaling ─────────────────────────────────────

  const distribution = preferences?.bias_distribution ?? {};
  const maxCount = Math.max(1, ...Object.values(distribution).map((v) => v ?? 0));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-green/10">
              <User className="h-5 w-5 text-adv-green" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">My Bias Profile</h1>
              <p className="text-xs text-adv-gray">Understand your reading patterns and blind spots</p>
            </div>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || loading || !preferences}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium
                       text-adv-dark transition-colors hover:bg-adv-teal-dark
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Analyze My Reading
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
            </div>
          ) : !preferences ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="h-8 w-8 text-adv-gray-med mb-3" />
              <p className="text-sm text-adv-gray">No reading history yet. Start reading articles in the Feed.</p>
            </div>
          ) : (
            <>
              {/* Analysis result banner */}
              {analysisResult && (
                <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-adv-teal" />
                    <span className="text-sm font-semibold text-adv-teal">Analysis Complete</span>
                  </div>
                  <p className="text-sm text-adv-off-white">{analysisResult.summary}</p>
                  {analysisResult.dominant_lean && (
                    <p className="mt-1.5 text-xs text-adv-gray">
                      Dominant lean: <span className="text-adv-off-white font-medium">{analysisResult.dominant_lean}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 p-4">
                  <p className="text-sm text-adv-red">{error}</p>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-adv-card p-4">
                  <div className="text-2xl font-bold text-adv-off-white">
                    {preferences.total_articles_read ?? 0}
                  </div>
                  <div className="text-xs text-adv-gray mt-1 flex items-center gap-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    Articles Read
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-adv-card p-4">
                  <div className={`text-2xl font-bold ${getDiversityColor(preferences.diversity_score)}`}>
                    {preferences.diversity_score}
                    <span className="text-sm font-normal text-adv-gray ml-1">/100</span>
                  </div>
                  <div className="text-xs text-adv-gray mt-1 flex items-center gap-1">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Diversity Score
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-adv-card p-4 sm:block hidden">
                  <div className={`text-2xl font-bold ${getDiversityColor(preferences.diversity_score)}`}>
                    {getDiversityLabel(preferences.diversity_score)}
                  </div>
                  <div className="text-xs text-adv-gray mt-1">Reading Range</div>
                </div>
              </div>

              {/* Diversity score bar */}
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-adv-off-white">Source Diversity</h2>
                  <span className={`text-sm font-semibold ${getDiversityColor(preferences.diversity_score)}`}>
                    {preferences.diversity_score}% — {getDiversityLabel(preferences.diversity_score)}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-adv-dark overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getDiversityBarColor(preferences.diversity_score)}`}
                    style={{ width: `${preferences.diversity_score}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-adv-gray">
                  {preferences.diversity_score >= 70
                    ? 'You read from a healthy mix of perspectives.'
                    : preferences.diversity_score >= 40
                    ? 'Your reading is somewhat balanced. Try exploring sources outside your usual range.'
                    : 'Your reading is heavily concentrated. Consider exploring different perspectives.'}
                </p>
              </div>

              {/* Bias distribution bar chart */}
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <h2 className="text-sm font-semibold text-adv-off-white mb-5">Bias Distribution</h2>
                <div className="space-y-3">
                  {BIAS_BARS.map(({ key, label, barColor, textColor }) => {
                    const count = distribution[key] ?? 0;
                    const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className="w-24 shrink-0">
                          <span className={`text-xs font-medium ${textColor}`}>{label}</span>
                        </div>
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex-1 h-5 rounded bg-adv-dark overflow-hidden">
                            <div
                              className={`h-full rounded transition-all ${barColor} opacity-80`}
                              style={{ width: `${pct}%`, minWidth: count > 0 ? '4px' : '0' }}
                            />
                          </div>
                          <span className="text-xs text-adv-gray w-6 text-right shrink-0">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Blind spots */}
              {preferences.blind_spots?.length > 0 && (
                <div className="rounded-xl border border-adv-gold/20 bg-adv-gold/5 p-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-adv-off-white mb-4">
                    <EyeOff className="h-4 w-4 text-adv-gold" />
                    Your Blind Spots
                  </h2>
                  <ul className="space-y-2">
                    {preferences.blind_spots.map((spot, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-adv-off-white">
                        <AlertCircle className="h-3.5 w-3.5 text-adv-gold shrink-0 mt-0.5" />
                        {spot}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {preferences.recommendations?.length > 0 && (
                <div className="rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-adv-off-white mb-4">
                    <Eye className="h-4 w-4 text-adv-teal" />
                    Recommendations
                  </h2>
                  <ul className="space-y-2">
                    {preferences.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-adv-off-white">
                        <Lightbulb className="h-3.5 w-3.5 text-adv-teal shrink-0 mt-0.5" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
