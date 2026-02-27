import React, { useEffect, useState } from 'react';
import { BarChart2, CheckCircle2, XCircle, Minus, AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface BenchmarkResult {
  moduleType: string;
  score: number;
  totalComponents: number;
  foundComponents: number;
  missing: string[];
  found: string[];
  suggestions: string[];
}

interface BenchmarkDisplayProps {
  content: string;
  moduleId?: string;
}

// All benchmark components for a given moduleType — we derive 'required' status from
// the found/missing arrays returned by the server. Required = mentioned in suggestions.
function isRequiredMissing(name: string, suggestions: string[]): boolean {
  return suggestions.some((s) => s.toLowerCase().includes(name.toLowerCase()));
}

export default function BenchmarkDisplay({ content, moduleId }: BenchmarkDisplayProps) {
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function runBenchmark() {
    if (!content?.trim()) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, moduleId }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = await res.json() as BenchmarkResult;
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runBenchmark();
    // We deliberately only re-run when content/moduleId change — not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, moduleId]);

  function getScoreColor(score: number): string {
    if (score >= 80) return 'text-adv-green';
    if (score >= 60) return 'text-adv-gold';
    return 'text-adv-red';
  }

  function getProgressColor(score: number): string {
    if (score >= 80) return 'bg-adv-green';
    if (score >= 60) return 'bg-adv-gold';
    return 'bg-adv-red';
  }

  return (
    <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-adv-teal-dim">
            <BarChart2 className="w-4 h-4 text-adv-teal" />
          </div>
          <h3 className="font-semibold text-adv-off-white">Output Benchmark</h3>
        </div>
        <button
          onClick={() => void runBenchmark()}
          disabled={loading || !content?.trim()}
          className="p-1.5 rounded-lg text-adv-gray hover:text-adv-teal hover:bg-adv-teal-dim transition-colors disabled:opacity-50"
          title="Re-run benchmark"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Empty content */}
      {!content?.trim() && !loading && (
        <div className="py-6 text-center">
          <BarChart2 className="w-8 h-8 text-adv-gray-med mx-auto mb-2 opacity-40" />
          <p className="text-sm text-adv-gray-med">No output to benchmark yet.</p>
          <p className="text-xs text-adv-gray-med mt-1">Run an analysis to see quality benchmarks.</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          <div className="h-6 w-48 rounded bg-adv-dark-2 animate-pulse" />
          <div className="h-3 rounded bg-adv-dark-2 animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 rounded bg-adv-dark-2 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-adv-dark-2 text-adv-gray-med text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Benchmark failed. Check server connection.</span>
        </div>
      )}

      {/* Results */}
      {!loading && !error && result && (
        <>
          {/* Score summary */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-adv-gray">
                <span className={`text-lg font-bold ${getScoreColor(result.score)}`}>
                  {result.score}%
                </span>
                {' '}— {result.foundComponents}/{result.totalComponents} standard components found
              </p>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                result.score >= 80
                  ? 'bg-green-900/30 text-green-400'
                  : result.score >= 60
                  ? 'bg-yellow-900/30 text-yellow-400'
                  : 'bg-red-900/30 text-red-400'
              }`}>
                {result.score >= 80 ? 'Strong' : result.score >= 60 ? 'Acceptable' : 'Needs work'}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-adv-dark-2 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${getProgressColor(result.score)}`}
                style={{ width: `${result.score}%` }}
              />
            </div>
          </div>

          {/* Component checklist */}
          {(result.found.length > 0 || result.missing.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-xs text-adv-gray-med uppercase tracking-wide font-medium mb-2">
                Components
              </p>

              {/* Found items */}
              {result.found.map((name) => (
                <div key={name} className="flex items-center gap-2.5 py-1">
                  <CheckCircle2 className="w-4 h-4 text-adv-green shrink-0" />
                  <span className="text-sm text-adv-off-white">{name}</span>
                </div>
              ))}

              {/* Missing items */}
              {result.missing.map((name) => {
                const required = isRequiredMissing(name, result.suggestions);
                return (
                  <div key={name} className="flex items-center justify-between gap-2 py-1">
                    <div className="flex items-center gap-2.5">
                      {required
                        ? <XCircle className="w-4 h-4 text-adv-red shrink-0" />
                        : <Minus className="w-4 h-4 text-adv-gray-med shrink-0" />
                      }
                      <span className={`text-sm ${required ? 'text-adv-off-white' : 'text-adv-gray'}`}>
                        {name}
                      </span>
                      {!required && (
                        <span className="text-xs text-adv-gray-med">(optional)</span>
                      )}
                    </div>
                    {/* Placeholder "Add" button */}
                    <button
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-adv-teal border border-adv-teal/30 hover:bg-adv-teal-dim transition-colors shrink-0"
                      onClick={() => {/* placeholder — no action */}}
                      title={`Add ${name} to output`}
                    >
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Improvement suggestions */}
          {result.suggestions.length > 0 && (
            <div className="pt-1 border-t border-border">
              <p className="text-xs text-adv-gray-med uppercase tracking-wide font-medium mb-2">
                Improvement Tips
              </p>
              <ul className="space-y-1.5">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-adv-gray">
                    <span className="text-adv-teal mt-0.5 shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
