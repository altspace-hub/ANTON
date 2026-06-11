/**
 * ModelRecommendationBadge.tsx
 *
 * Wave 3.7 — provider-aware model recommendation in the module run bar.
 *
 * Fetches from POST /api/model-router/recommend (registry-derived tiers for
 * the user's configured default provider). Compact badge: "Suggested: X
 * (~cost)" with apply-on-click, an alternatives dropdown, and a dismiss (×).
 * Accept/dismiss are logged to POST /api/model-router/feedback so the
 * recommender's acceptance rate is measurable.
 */

import { useEffect, useRef, useState } from 'react';
import { Sparkles, ChevronDown, X } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

interface ModelAlternative {
  model: string;
  displayName?: string;
  estimatedCostMultiplier: number;
  qualityEstimate: 'excellent' | 'good' | 'adequate';
  reason: string;
  pricing?: ModelPricing;
}

interface ModelRecommendation {
  recommended: string;
  displayName?: string;
  provider?: string;
  reason: string;
  pricing?: ModelPricing;
  alternatives: ModelAlternative[];
}

// ── Props ─────────────────────────────────────────────────────

interface ModelRecommendationBadgeProps {
  moduleId?: string;
  thinkingLevel?: string;
  outputFormats?: string[];
  areaId?: string;
  /** The model currently selected in the run bar — badge hides when it already matches. */
  currentModel?: string;
  onModelSelect?: (model: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────

const DISMISS_KEY = 'openexpert-model-reco-dismissed';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const MODEL_SHORT_LABELS: Record<string, string> = {
  'claude-fable-5': 'Fable 5',
  'claude-opus-4-8': 'Opus',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-5-20250929': 'Sonnet 4.5',
  'claude-haiku-4-5-20251001': 'Haiku',
};

function shortLabel(model: string, displayName?: string): string {
  return MODEL_SHORT_LABELS[model] ?? displayName ?? model;
}

const QUALITY_LABELS: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  adequate: 'Adequate',
};

const QUALITY_COLORS: Record<string, string> = {
  excellent: 'text-adv-teal',
  good: 'text-adv-green',
  adequate: 'text-adv-gold',
};

function formatCostMultiplier(x: number): string {
  if (Math.abs(x - 1) < 0.05) return 'same cost';
  if (x > 1) return `${x.toFixed(1)}× more expensive`;
  const cheaper = (1 / x).toFixed(1);
  return `${cheaper}× cheaper`;
}

/** Honest registry pricing, compact: "~$1/$5 per 1M" or "free (local)". */
function formatPricing(p?: ModelPricing): string {
  if (!p) return '';
  if (p.inputPer1M === 0 && p.outputPer1M === 0) return 'free (local)';
  const fmt = (n: number) => (n >= 10 ? `$${Math.round(n)}` : `$${n}`);
  return `~${fmt(p.inputPer1M)}/${fmt(p.outputPer1M)} per 1M`;
}

function sendFeedback(payload: {
  event: 'accepted' | 'dismissed';
  recommendedModel: string;
  selectedModel?: string;
  provider?: string;
  moduleId?: string;
  thinkingLevel?: string;
}): void {
  fetch('/api/model-router/feedback', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => { /* logging is best-effort */ });
}

// ── Component ─────────────────────────────────────────────────

export default function ModelRecommendationBadge({
  moduleId,
  thinkingLevel,
  outputFormats,
  areaId,
  currentModel,
  onModelSelect,
}: ModelRecommendationBadgeProps) {
  const [recommendation, setRecommendation] = useState<ModelRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch recommendation whenever relevant props change
  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    setLoading(true);
    setRecommendation(null);

    fetch('/api/model-router/recommend', {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ moduleId, thinkingLevel, outputFormats, areaId }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: ModelRecommendation) => {
        if (!cancelled) setRecommendation(data);
      })
      .catch(() => {
        // Silently fail — badge simply won't render
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, thinkingLevel, JSON.stringify(outputFormats), areaId, dismissed]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  if (dismissed) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-adv-gray animate-pulse">
        <Sparkles className="h-3 w-3" />
        Checking best model...
      </div>
    );
  }

  if (!recommendation) return null;

  // Already on the suggested model — nothing to suggest.
  if (currentModel && recommendation.recommended === currentModel) return null;

  const applyModel = (model: string) => {
    if (!onModelSelect) return;
    onModelSelect(model);
    sendFeedback({
      event: 'accepted',
      recommendedModel: recommendation.recommended,
      selectedModel: model,
      provider: recommendation.provider,
      moduleId,
      thinkingLevel,
    });
  };

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    sendFeedback({
      event: 'dismissed',
      recommendedModel: recommendation.recommended,
      provider: recommendation.provider,
      moduleId,
      thinkingLevel,
    });
  };

  const pricingText = formatPricing(recommendation.pricing);

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* ── Compact badge ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-adv-teal/30 bg-adv-teal-soft px-2.5 py-1.5">
        <Sparkles className="h-3 w-3 shrink-0 text-adv-teal" />
        <span className="text-xs text-adv-teal font-medium">Suggested:</span>
        <button
          onClick={() => applyModel(recommendation.recommended)}
          disabled={!onModelSelect}
          title={`${recommendation.reason}${onModelSelect ? ' — click to apply' : ''}`}
          className="text-xs text-adv-white font-semibold hover:text-adv-teal transition-colors disabled:cursor-default"
        >
          {shortLabel(recommendation.recommended, recommendation.displayName)}
          {pricingText && <span className="ml-1 font-normal text-adv-gray">({pricingText})</span>}
        </button>

        {/* Apply button */}
        {onModelSelect && (
          <button
            onClick={() => applyModel(recommendation.recommended)}
            className="ml-1 rounded bg-adv-teal/20 px-1.5 py-0.5 text-[11px] font-medium text-adv-teal hover:bg-adv-teal/30 transition-colors"
          >
            Use
          </button>
        )}

        {/* Alternatives toggle */}
        {recommendation.alternatives.length > 0 && (
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="ml-0.5 rounded p-0.5 text-adv-gray hover:text-adv-teal transition-colors"
            title="See alternatives"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="ml-0.5 rounded p-0.5 text-adv-gray hover:text-adv-off-white transition-colors"
          title="Hide model suggestions for this session"
          aria-label="Dismiss model suggestion"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* ── Alternatives dropdown ──────────────────────────── */}
      {dropdownOpen && recommendation.alternatives.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-72 rounded-lg border border-border bg-adv-card shadow-xl">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-medium text-adv-gray">Alternatives</p>
            <p className="mt-0.5 text-xs text-adv-gray">
              Other models you could use for this task
            </p>
          </div>
          <div className="py-1">
            {recommendation.alternatives.map((alt) => (
              <div
                key={alt.model}
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-adv-dark-2 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-adv-off-white">
                      {shortLabel(alt.model, alt.displayName)}
                    </span>
                    <span
                      className={`text-xs font-medium ${QUALITY_COLORS[alt.qualityEstimate]}`}
                    >
                      {QUALITY_LABELS[alt.qualityEstimate]}
                    </span>
                    <span className="text-xs text-adv-gray ml-auto shrink-0">
                      {formatCostMultiplier(alt.estimatedCostMultiplier)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-adv-gray leading-relaxed">
                    {alt.reason}
                    {alt.pricing && <span className="ml-1 text-adv-gray">· {formatPricing(alt.pricing)}</span>}
                  </p>
                </div>
                {onModelSelect && (
                  <button
                    onClick={() => {
                      applyModel(alt.model);
                      setDropdownOpen(false);
                    }}
                    className="shrink-0 self-center rounded bg-adv-dark px-2 py-1 text-[11px] text-adv-gray border border-border hover:border-adv-teal hover:text-adv-teal transition-colors"
                  >
                    Use
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
