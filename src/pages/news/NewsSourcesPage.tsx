/**
 * NewsSourcesPage.tsx
 *
 * Source Intelligence — shows all tracked news sources grouped by bias rating
 * on a horizontal political spectrum.
 * Route: /news/sources
 *
 * Features:
 * - Fetches GET /api/news/sources
 * - Horizontal spectrum layout: Far Left → Far Right (7 columns)
 * - Each source card: name, country flag emoji, factuality score, category
 * - Country filter
 */

import { useEffect, useState } from 'react';
import { Radio, Loader2, AlertCircle } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type BiasRating =
  | 'far_left'
  | 'left'
  | 'center_left'
  | 'center'
  | 'center_right'
  | 'right'
  | 'far_right';

interface NewsSource {
  id: string;
  name: string;
  url: string;
  bias_rating: BiasRating;
  factuality_score: number;   // 0-100
  country: string;            // ISO-2 code: se, no, gb, us, etc.
  category?: string;
  active: boolean;
}

// ── Spectrum config ──────────────────────────────────────────────────────────

interface SpectrumColumn {
  rating: BiasRating;
  label: string;
  shortLabel: string;
  headerBg: string;
  headerText: string;
  dotClass: string;
  cardBorder: string;
  scoreColor: (score: number) => string;
}

const SPECTRUM: SpectrumColumn[] = [
  {
    rating: 'far_left',
    label: 'Far Left',
    shortLabel: 'Far L',
    headerBg: 'bg-red-900/40',
    headerText: 'text-red-400',
    dotClass: 'bg-red-500',
    cardBorder: 'border-red-900/30',
    scoreColor: (s) => s >= 70 ? 'text-adv-green' : s >= 40 ? 'text-adv-gold' : 'text-adv-red',
  },
  {
    rating: 'left',
    label: 'Left',
    shortLabel: 'Left',
    headerBg: 'bg-orange-900/30',
    headerText: 'text-orange-400',
    dotClass: 'bg-orange-400',
    cardBorder: 'border-orange-900/20',
    scoreColor: (s) => s >= 70 ? 'text-adv-green' : s >= 40 ? 'text-adv-gold' : 'text-adv-red',
  },
  {
    rating: 'center_left',
    label: 'Center-Left',
    shortLabel: 'C-Left',
    headerBg: 'bg-yellow-900/20',
    headerText: 'text-yellow-400',
    dotClass: 'bg-yellow-400',
    cardBorder: 'border-yellow-900/20',
    scoreColor: (s) => s >= 70 ? 'text-adv-green' : s >= 40 ? 'text-adv-gold' : 'text-adv-red',
  },
  {
    rating: 'center',
    label: 'Center',
    shortLabel: 'Center',
    headerBg: 'bg-adv-gray/10',
    headerText: 'text-adv-gray',
    dotClass: 'bg-adv-gray',
    cardBorder: 'border-adv-gray/20',
    scoreColor: (s) => s >= 70 ? 'text-adv-green' : s >= 40 ? 'text-adv-gold' : 'text-adv-red',
  },
  {
    rating: 'center_right',
    label: 'Center-Right',
    shortLabel: 'C-Right',
    headerBg: 'bg-sky-900/20',
    headerText: 'text-sky-400',
    dotClass: 'bg-sky-400',
    cardBorder: 'border-sky-900/20',
    scoreColor: (s) => s >= 70 ? 'text-adv-green' : s >= 40 ? 'text-adv-gold' : 'text-adv-red',
  },
  {
    rating: 'right',
    label: 'Right',
    shortLabel: 'Right',
    headerBg: 'bg-adv-blue/10',
    headerText: 'text-adv-blue',
    dotClass: 'bg-adv-blue',
    cardBorder: 'border-adv-blue/20',
    scoreColor: (s) => s >= 70 ? 'text-adv-green' : s >= 40 ? 'text-adv-gold' : 'text-adv-red',
  },
  {
    rating: 'far_right',
    label: 'Far Right',
    shortLabel: 'Far R',
    headerBg: 'bg-blue-950/50',
    headerText: 'text-blue-300',
    dotClass: 'bg-blue-900',
    cardBorder: 'border-blue-950/40',
    scoreColor: (s) => s >= 70 ? 'text-adv-green' : s >= 40 ? 'text-adv-gold' : 'text-adv-red',
  },
];

// ── Country flags (subset) ────────────────────────────────────────────────────

const COUNTRY_FLAGS: Record<string, string> = {
  se: '🇸🇪',
  no: '🇳🇴',
  gb: '🇬🇧',
  uk: '🇬🇧',
  us: '🇺🇸',
  de: '🇩🇪',
  fr: '🇫🇷',
  fi: '🇫🇮',
  dk: '🇩🇰',
  global: '🌐',
};

function getFlag(country: string): string {
  return COUNTRY_FLAGS[country?.toLowerCase()] ?? '🌐';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function NewsSourcesPage() {
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/news/sources')
      .then((r) => (r.ok ? (r.json() as Promise<NewsSource[]>) : Promise.resolve([])))
      .then((data) => {
        setSources(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Derive unique countries for filter
  const countries = ['all', ...Array.from(new Set(sources.map((s) => s.country?.toLowerCase()).filter(Boolean)))];

  const filtered = sources.filter((s) => {
    if (countryFilter !== 'all' && s.country?.toLowerCase() !== countryFilter) return false;
    return true;
  });

  const groupedByRating = SPECTRUM.map((col) => ({
    ...col,
    items: filtered.filter((s) => s.bias_rating === col.rating),
  }));

  const totalActive = filtered.filter((s) => s.active).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-gold/10">
            <Radio className="h-5 w-5 text-adv-gold" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">Source Intelligence</h1>
            <p className="text-xs text-adv-gray">Media bias spectrum — understand where your news comes from</p>
          </div>
        </div>
      </div>

      {/* Filter + stats bar */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-3 shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-adv-gray shrink-0">Country:</span>
          <div className="flex gap-1 flex-wrap">
            {countries.map((c) => (
              <button
                key={c}
                onClick={() => setCountryFilter(c)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors capitalize ${
                  countryFilter === c
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {c === 'all' ? 'All' : `${getFlag(c)} ${c.toUpperCase()}`}
              </button>
            ))}
          </div>
          {!loading && (
            <span className="ml-auto text-xs text-adv-gray">
              {totalActive} active · {filtered.length} total sources
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-8 w-8 text-adv-gray mb-3" />
            <p className="text-sm text-adv-gray">No sources found. Add sources via settings.</p>
          </div>
        ) : (
          <>
            {/* Spectrum header bar */}
            <div className="grid grid-cols-7 gap-2 mb-3">
              {SPECTRUM.map((col) => (
                <div
                  key={col.rating}
                  className={`rounded-t-lg px-2 py-2 text-center ${col.headerBg}`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <div className={`h-2 w-2 rounded-full ${col.dotClass}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wide hidden lg:block ${col.headerText}`}>
                      {col.label}
                    </span>
                    <span className={`text-xs font-semibold uppercase tracking-wide lg:hidden ${col.headerText}`}>
                      {col.shortLabel}
                    </span>
                  </div>
                  <span className="text-xs text-adv-gray">
                    {groupedByRating.find(g => g.rating === col.rating)?.items.length ?? 0}
                  </span>
                </div>
              ))}
            </div>

            {/* Source cards grid */}
            <div className="grid grid-cols-7 gap-2 items-start">
              {groupedByRating.map((col) => (
                <div key={col.rating} className="space-y-2">
                  {col.items.length === 0 ? (
                    <div className={`rounded-lg border border-dashed ${col.cardBorder} p-3 text-center`}>
                      <span className="text-xs text-adv-gray">—</span>
                    </div>
                  ) : (
                    col.items.map((source) => (
                      <div
                        key={source.id}
                        className={`rounded-lg border ${col.cardBorder} bg-adv-card p-2.5 hover:bg-adv-card/80 transition-colors`}
                      >
                        {/* Name + flag */}
                        <div className="flex items-start gap-1.5 mb-2">
                          <span className="text-sm leading-none mt-0.5">{getFlag(source.country)}</span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium text-adv-off-white hover:text-adv-teal transition-colors leading-tight break-words"
                          >
                            {source.name}
                          </a>
                        </div>

                        {/* Factuality score */}
                        <div className="mb-1.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-adv-gray uppercase tracking-wide">Factuality</span>
                            <span className={`text-xs font-semibold ${col.scoreColor(source.factuality_score)}`}>
                              {source.factuality_score}
                            </span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-adv-dark overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                source.factuality_score >= 70
                                  ? 'bg-adv-green'
                                  : source.factuality_score >= 40
                                  ? 'bg-adv-gold'
                                  : 'bg-adv-red'
                              }`}
                              style={{ width: `${source.factuality_score}%` }}
                            />
                          </div>
                        </div>

                        {/* Category + active badge */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {source.category && (
                            <span className="text-xs text-adv-gray capitalize bg-adv-dark rounded px-1 py-0.5">
                              {source.category}
                            </span>
                          )}
                          {!source.active && (
                            <span className="text-xs text-adv-gray bg-adv-dark rounded px-1 py-0.5">
                              inactive
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-6 flex items-center justify-center gap-6 flex-wrap">
              <span className="text-xs text-adv-gray">Factuality score:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-adv-green" />
                <span className="text-[11px] text-adv-gray">70–100 High</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-adv-gold" />
                <span className="text-[11px] text-adv-gray">40–69 Mixed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-adv-red" />
                <span className="text-[11px] text-adv-gray">0–39 Low</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
