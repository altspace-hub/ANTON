/**
 * ModelRecommendationBadge.tsx
 *
 * Wave 2.1 — Model Auto-Routing
 *
 * Shows ANTON's recommended model for the current task configuration.
 * Fetches from POST /api/model-router/recommend on mount (and when props change).
 * Displays a badge with the recommendation and a dropdown of alternatives on hover.
 */

import { useEffect, useRef, useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface ModelAlternative {
  model: string;
  estimatedCostMultiplier: number;
  qualityEstimate: 'excellent' | 'good' | 'adequate';
  reason: string;
}

interface ModelRecommendation {
  recommended: string;
  reason: string;
  alternatives: ModelAlternative[];
}

// ── Props ─────────────────────────────────────────────────────

interface ModelRecommendationBadgeProps {
  moduleId?: string;
  thinkingLevel?: string;
  outputFormats?: string[];
  areaId?: string;
  onModelSelect?: (model: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────

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

function shortLabel(model: string): string {
  return MODEL_SHORT_LABELS[model] ?? model;
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

// ── Component ─────────────────────────────────────────────────

export default function ModelRecommendationBadge({
  moduleId,
  thinkingLevel,
  outputFormats,
  areaId,
  onModelSelect,
}: ModelRecommendationBadgeProps) {
  const [recommendation, setRecommendation] = useState<ModelRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch recommendation whenever relevant props change
  useEffect(() => {
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
  }, [moduleId, thinkingLevel, JSON.stringify(outputFormats), areaId]);

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

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-adv-gray animate-pulse">
        <Sparkles className="h-3 w-3" />
        Checking best model...
      </div>
    );
  }

  if (!recommendation) return null;

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* ── Badge ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 rounded-lg border border-adv-teal/30 bg-adv-teal-soft px-2.5 py-1.5">
        <Sparkles className="h-3 w-3 shrink-0 text-adv-teal" />
        <span className="text-xs text-adv-teal font-medium">ANTON recommends:</span>
        <span className="text-xs text-adv-white font-semibold">
          {shortLabel(recommendation.recommended)}
        </span>
        <span className="hidden sm:inline text-xs text-adv-gray">
          — {recommendation.reason}
        </span>

        {/* Accept button */}
        {onModelSelect && (
          <button
            onClick={() => onModelSelect(recommendation.recommended)}
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
                      {shortLabel(alt.model)}
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
                  </p>
                </div>
                {onModelSelect && (
                  <button
                    onClick={() => {
                      onModelSelect(alt.model);
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
