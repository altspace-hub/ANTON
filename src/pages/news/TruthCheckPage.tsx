/**
 * TruthCheckPage.tsx
 *
 * AI-powered claim verification.
 * Route: /news/truth-check
 *
 * Features:
 * - Claim textarea → POST /api/news/truth-check
 * - Verdict chip (true / mostly_true / mixed / mostly_false / false / unverifiable)
 * - Confidence bar
 * - Explanation + red flags list
 * - Recent truth checks history (localStorage)
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Shield,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MinusCircle,
  HelpCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Verdict = 'true' | 'mostly_true' | 'mixed' | 'mostly_false' | 'false' | 'unverifiable';

interface TruthCheckResult {
  verdict: Verdict;
  confidence: number;        // 0-100
  explanation: string;
  red_flags: string[];
  supporting_evidence?: string[];
  claim: string;
  checked_at: string;
}

// ── Verdict config ────────────────────────────────────────────────────────────

interface VerdictConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  chipClass: string;
  barClass: string;
  borderClass: string;
}

const VERDICT_CONFIG: Record<Verdict, VerdictConfig> = {
  true: {
    label: 'True',
    icon: CheckCircle2,
    chipClass: 'bg-adv-green/20 text-adv-green border border-adv-green/40',
    barClass: 'bg-adv-green',
    borderClass: 'border-adv-green/30',
  },
  mostly_true: {
    label: 'Mostly True',
    icon: CheckCircle2,
    chipClass: 'bg-green-500/10 text-green-400 border border-green-500/30',
    barClass: 'bg-green-400',
    borderClass: 'border-green-500/20',
  },
  mixed: {
    label: 'Mixed',
    icon: MinusCircle,
    chipClass: 'bg-adv-gold/20 text-adv-gold border border-adv-gold/40',
    barClass: 'bg-adv-gold',
    borderClass: 'border-adv-gold/30',
  },
  mostly_false: {
    label: 'Mostly False',
    icon: AlertCircle,
    chipClass: 'bg-orange-500/10 text-orange-400 border border-orange-500/30',
    barClass: 'bg-orange-400',
    borderClass: 'border-orange-500/20',
  },
  false: {
    label: 'False',
    icon: XCircle,
    chipClass: 'bg-adv-red/20 text-adv-red border border-adv-red/40',
    barClass: 'bg-adv-red',
    borderClass: 'border-adv-red/30',
  },
  unverifiable: {
    label: 'Unverifiable',
    icon: HelpCircle,
    chipClass: 'bg-adv-gray/20 text-adv-gray border border-adv-gray/30',
    barClass: 'bg-adv-gray',
    borderClass: 'border-adv-gray/20',
  },
};

const HISTORY_KEY = 'anton-truth-check-history';
const MAX_HISTORY = 10;

// ── Component ────────────────────────────────────────────────────────────────

export default function TruthCheckPage() {
  const location = useLocation();

  // Pre-fill from navigation state (e.g. from StoryDetailPage)
  const prefill = (location.state as { claim?: string } | null)?.claim ?? '';

  const [claim, setClaim] = useState(prefill);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TruthCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TruthCheckResult[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load history
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored) as TruthCheckResult[]);
    } catch {
      // ignore parse errors
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [claim]);

  const saveToHistory = (item: TruthCheckResult) => {
    setHistory((prev) => {
      const next = [item, ...prev].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  };

  const handleVerify = async () => {
    const trimmed = claim.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch('/api/news/truth-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: trimmed }),
      });

      if (!response.ok) {
        const body = await response.text();
        setError(`Request failed (${response.status}): ${body}`);
        return;
      }

      const data = (await response.json()) as TruthCheckResult;
      const enriched: TruthCheckResult = {
        ...data,
        claim: trimmed,
        checked_at: new Date().toISOString(),
      };
      setResult(enriched);
      saveToHistory(enriched);
    } catch (err) {
      setError((err as Error).message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleVerify();
    }
  };

  const loadHistoryItem = (item: TruthCheckResult) => {
    setClaim(item.claim);
    setResult(item);
    setHistoryOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
            <Shield className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">Truth Check</h1>
            <p className="text-xs text-adv-gray">Verify claims with AI-powered source analysis</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Input card */}
          <div className="rounded-xl border border-border bg-adv-card p-6">
            <label className="block text-sm font-medium text-adv-off-white mb-2">
              Enter a claim to verify
            </label>
            <textarea
              ref={textareaRef}
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. &ldquo;The European Central Bank raised interest rates to 5% in January 2025&rdquo;"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-adv-dark px-4 py-3 text-sm
                         text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none
                         transition-colors"
              style={{ minHeight: '80px', maxHeight: '200px', overflowY: 'auto' }}
              disabled={loading}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-adv-gray-med">Ctrl+Enter to verify</span>
              <button
                onClick={handleVerify}
                disabled={!claim.trim() || loading}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium
                           text-adv-dark transition-colors hover:bg-adv-teal-dark
                           disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Verify Claim
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-adv-red shrink-0" />
                <p className="text-sm text-adv-red">{error}</p>
              </div>
            </div>
          )}

          {/* Result card */}
          {result && (() => {
            const verdict = VERDICT_CONFIG[result.verdict] ?? VERDICT_CONFIG.unverifiable;
            const VerdictIcon = verdict.icon;
            return (
              <div className={`rounded-xl border bg-adv-card p-6 ${verdict.borderClass}`}>
                {/* Verdict header */}
                <div className="flex items-center gap-3 mb-5">
                  <VerdictIcon className="h-6 w-6 text-inherit shrink-0" />
                  <div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${verdict.chipClass}`}>
                      {verdict.label}
                    </span>
                  </div>
                </div>

                {/* Confidence bar */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-adv-gray">Confidence</span>
                    <span className="text-xs font-semibold text-adv-off-white">{result.confidence}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-adv-dark overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${verdict.barClass}`}
                      style={{ width: `${result.confidence}%` }}
                    />
                  </div>
                </div>

                {/* Explanation */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-adv-gray uppercase tracking-wide mb-2">Explanation</h3>
                  <p className="text-sm text-adv-off-white leading-relaxed">{result.explanation}</p>
                </div>

                {/* Red flags */}
                {result.red_flags?.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold text-adv-gray uppercase tracking-wide mb-2">
                      Red Flags
                    </h3>
                    <ul className="space-y-1.5">
                      {result.red_flags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-adv-off-white">
                          <AlertCircle className="h-3.5 w-3.5 text-adv-gold shrink-0 mt-0.5" />
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Supporting evidence */}
                {result.supporting_evidence && result.supporting_evidence.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-adv-gray uppercase tracking-wide mb-2">
                      Supporting Evidence
                    </h3>
                    <ul className="space-y-1.5">
                      {result.supporting_evidence.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-adv-off-white">
                          <CheckCircle2 className="h-3.5 w-3.5 text-adv-green shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Checked claim */}
                <div className="mt-5 pt-4 border-t border-border">
                  <p className="text-[10px] text-adv-gray-med">
                    Claim: <span className="text-adv-gray italic">"{result.claim}"</span>
                  </p>
                </div>
              </div>
            );
          })()}

          {/* History section */}
          {history.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-adv-dark/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-adv-gray" />
                  <span className="text-sm font-medium text-adv-off-white">
                    Recent Checks ({history.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); clearHistory(); }}
                    className="rounded p-1 text-adv-gray-med hover:text-adv-red transition-colors"
                    title="Clear history"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {historyOpen ? (
                    <ChevronUp className="h-4 w-4 text-adv-gray" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-adv-gray" />
                  )}
                </div>
              </button>

              {historyOpen && (
                <div className="border-t border-border divide-y divide-border">
                  {history.map((item, i) => {
                    const cfg = VERDICT_CONFIG[item.verdict] ?? VERDICT_CONFIG.unverifiable;
                    const VerdictIcon = cfg.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => loadHistoryItem(item)}
                        className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-adv-dark transition-colors"
                      >
                        <VerdictIcon className="h-4 w-4 shrink-0 mt-0.5 text-adv-gray" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-adv-off-white line-clamp-1">{item.claim}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-medium ${cfg.chipClass.split(' ').find(c => c.startsWith('text-')) ?? 'text-adv-gray'}`}>
                              {cfg.label}
                            </span>
                            <span className="text-[10px] text-adv-gray-med">
                              {new Date(item.checked_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
