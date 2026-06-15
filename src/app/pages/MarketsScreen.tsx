/**
 * MarketsScreen — Markets briefing + tape + Monte-Carlo prediction.
 *
 * Layout from design/screens-modules.jsx MarketsScreen:
 *   • Top bar — title + "● LIVE · Europe open" line
 *   • Morning briefing hero — sparkles label, 18px headline, blurb, pill row
 *     (citations / portfolio / flags), Read brief + Play audio buttons
 *   • Tape — watchlist rows: ticker mono + vol + sparkline + price + change
 *   • Local prediction card — Monte Carlo style, accent-tinted, 3-bucket
 *     horizontal stacked bar with %s
 *
 * Data is real: pulls from the existing markets pillar tables via the
 * /api/app/markets/* adapter we just added to app-gateway.
 */

import { memo, useEffect, useState } from 'react';
import { Btn, Pill, SectionLabel, Ico, Spinner } from '../components/ui';
import {
  getMarketBriefing, getMarketTape, getMarketPrediction,
  type MarketBriefing, type TapeRow, type MarketPrediction,
} from '../services/markets';
import { speak as ttsSpeak, stop as ttsStop, isAvailable as ttsAvailable } from '../services/tts';

interface Props { orgId: string }

function formatPrice(p: number | string | null | undefined): string {
  if (p == null) return '—';
  // Postgres NUMERIC fields ride through the wire as strings; coerce.
  const n = typeof p === 'number' ? p : Number(p);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (n >= 10)   return n.toFixed(2);
  return n.toFixed(4);
}

function formatChange(c: number | string | null | undefined): string {
  if (c == null) return '—';
  const n = typeof c === 'number' ? c : Number(c);
  if (!Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

/** Tiny SVG sparkline from a number[] series. Coloured by overall direction.
 *  AP21: memoised so re-rendering the tape (every prediction tick) doesn't
 *  recompute Math.min/max + the points string for every row. */
const Sparkline = memo(function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) {
    return <svg width="50" height="20" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const w = 50, h = 20;
  const stepX = w / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / span) * (h - 2) - 1).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polyline
        fill="none"
        stroke={up ? 'var(--color-green)' : 'var(--color-red)'}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
});

function liveDot(): { label: string; color: string } {
  // CET market hours roughly 9-17:30. Treat 9:00-22:00 CET as "live" (US still open).
  const h = new Date().getUTCHours() + 1; // CET ~ UTC+1; ignoring DST nuance for the live-pill copy
  if (h >= 9 && h < 22) return { label: '● LIVE', color: 'var(--color-green)' };
  return { label: '● CLOSED', color: 'var(--color-text-muted)' };
}

export default function MarketsScreen(_props: Props): JSX.Element {
  const [briefing,   setBriefing]   = useState<MarketBriefing | null>(null);
  const [tape,       setTape]       = useState<TapeRow[]>([]);
  const [prediction, setPrediction] = useState<MarketPrediction | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [speaking,   setSpeaking]   = useState(false);

  // Stop any in-flight TTS when the screen unmounts (barge-in cleanup)
  useEffect(() => () => { ttsStop(); }, []);

  function togglePlayBriefing() {
    if (!briefing) return;
    if (speaking) { ttsStop(); setSpeaking(false); return; }
    if (!ttsAvailable()) return;
    const text = [briefing.headline, briefing.blurb].filter(Boolean).join('. ');
    setSpeaking(true);
    void ttsSpeak(text, { onEnd: () => setSpeaking(false) });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [b, t, p] = await Promise.all([
          getMarketBriefing().catch(() => null),
          getMarketTape(8).catch(() => []),
          getMarketPrediction().catch(() => null),
        ]);
        if (!cancelled) {
          setBriefing(b);
          setTape(t);
          setPrediction(p);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const live = liveDot();

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--color-surface-alt)',
          minHeight: 44,
        }}
      >
        <div>
          <h1
            className="text-[var(--color-text)]"
            style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.05 }}
          >
            Markets
          </h1>
          <div
            className="font-mono text-[0.6875rem] text-[var(--color-text-muted)]"
            style={{ letterSpacing: '0.3px' }}
          >
            <span style={{ color: live.color }}>{live.label}</span>
            {' · '}{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div className="-mr-2.5 flex items-center">
          <button
            aria-label="Search markets"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Ico name="search" color="var(--color-text-muted)" size={18} />
          </button>
          <button
            aria-label="Daily insights"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Ico name="sparkles" color="var(--color-accent)" size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}

        {/* ── Morning briefing hero ─────────────────────────── */}
        {!loading && briefing && (
          <div
            className="mx-4 mt-3 rounded-[var(--radius-r3)] p-4"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <Ico name="sparkles" color="var(--color-accent)" size={14} />
              <span
                className="font-mono font-bold uppercase"
                style={{ fontSize: '0.6875rem', color: 'var(--color-accent)', letterSpacing: '0.5px' }}
              >
                Morning briefing · by your ANTON
              </span>
            </div>
            <div
              className="text-[var(--color-text)]"
              style={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.4px' }}
            >
              {briefing.headline ?? 'Quiet morning. No active narratives.'}
            </div>
            {briefing.blurb && (
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-body)]">
                {briefing.blurb}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Pill tone="teal">{briefing.citations} citations</Pill>
              <Pill tone="blue">Your portfolio · {briefing.portfolio_size} positions</Pill>
              {briefing.flags > 0 && <Pill tone="gold">{briefing.flags} flag{briefing.flags === 1 ? '' : 's'}</Pill>}
            </div>
            {briefing.available && ttsAvailable() && (
              <div className="mt-3">
                <Btn
                  size="sm"
                  variant={speaking ? 'primary' : 'secondary'}
                  onClick={togglePlayBriefing}
                  icon={<Ico name={speaking ? 'x' : 'mic'} color="currentColor" size={13} />}
                >
                  {speaking ? 'Stop' : 'Play brief'}
                </Btn>
              </div>
            )}
          </div>
        )}

        {/* ── Tape — watchlist ──────────────────────────────── */}
        {!loading && tape.length > 0 && (
          <>
            <SectionLabel className="px-4 pb-1.5 pt-4">Tape · your watchlist</SectionLabel>
            <div
              className="mb-4 overflow-hidden rounded-[var(--radius-r2)]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                marginLeft: 16,
                marginRight: 16,
              }}
            >
              {tape.map((r, i) => {
                // change_pct can ride the wire as a Postgres NUMERIC string —
                // a bare `>= 0` comparison would lexicographically compare
                // strings ("-1.2" >= "0" === false but for the wrong reason).
                const up = Number(r.change_pct ?? 0) >= 0;
                return (
                  <div
                    key={r.symbol}
                    className="flex items-center gap-3"
                    style={{
                      paddingLeft: 14,
                      paddingRight: 14,
                      paddingTop: 12,
                      paddingBottom: 12,
                      borderBottom: i < tape.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="font-mono font-bold text-[var(--color-text)]"
                          style={{ fontSize: '0.75rem', letterSpacing: '-0.1px' }}
                        >
                          {r.symbol}
                        </span>
                      </div>
                      {r.name && (
                        <div
                          className="mt-0.5 truncate text-[0.6875rem] text-[var(--color-text-muted)]"
                          style={{ maxWidth: 130 }}
                        >
                          {r.name}
                        </div>
                      )}
                    </div>
                    {r.spark && r.spark.length >= 2 ? (
                      <Sparkline data={r.spark} up={up} />
                    ) : (
                      <span style={{ width: 50 }} />
                    )}
                    <div className="text-right" style={{ minWidth: 80 }}>
                      <div
                        className="font-mono font-bold text-[var(--color-text)]"
                        style={{ fontSize: '0.8125rem', letterSpacing: '-0.1px' }}
                      >
                        {formatPrice(r.price)}
                      </div>
                      <div
                        className="font-mono font-semibold"
                        style={{
                          fontSize: '0.6875rem',
                          color: up ? 'var(--color-green)' : 'var(--color-red)',
                        }}
                      >
                        {formatChange(r.change_pct)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && tape.length === 0 && (
          <div className="mx-4 mt-3 rounded-[var(--radius-r2)] border border-dashed border-[var(--color-border)] p-4 text-center">
            <Ico name="arrowUp" color="var(--color-text-faint)" size={20} />
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">No tape yet.</p>
            <p className="mt-1 text-[0.6875rem] text-[var(--color-text-faint)]">
              Activate an ANTON 100 index on the main instance to populate this watchlist.
            </p>
          </div>
        )}

        {/* ── Monte-Carlo prediction card ──────────────────── */}
        {!loading && prediction?.available && prediction.buckets && (
          <div
            className="mx-4 mb-5 rounded-[var(--radius-r2)] p-3.5"
            style={{
              background: 'var(--color-accent-soft)',
              border: '1px solid var(--color-accent-dim)',
            }}
          >
            <div
              className="mb-1 font-mono font-bold uppercase"
              style={{ fontSize: '0.6875rem', color: 'var(--color-accent)', letterSpacing: '0.5px' }}
            >
              Local prediction · Monte Carlo
            </div>
            <div
              className="mb-2 text-[var(--color-text)]"
              style={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.3 }}
            >
              {prediction.title}
              {prediction.target_symbol && (
                <span
                  className="ml-2 font-mono text-[var(--color-accent)]"
                  style={{ fontSize: '0.6875rem' }}
                >
                  · {prediction.target_symbol}
                </span>
              )}
            </div>
            {/* Stacked bar */}
            <div
              className="mb-1.5 flex gap-1 overflow-hidden rounded"
              style={{ height: 18 }}
            >
              {prediction.buckets.map((b, i) => (
                <div
                  key={i}
                  style={{
                    flex: Math.max(1, b.pct),
                    background:
                      b.color === 'accent' ? 'var(--color-accent)' :
                      b.color === 'gold'   ? 'var(--color-gold)' :
                      'var(--color-red)',
                  }}
                />
              ))}
            </div>
            <div
              className="flex justify-between font-mono text-[var(--color-text-muted)]"
              style={{ fontSize: '0.6875rem' }}
            >
              {prediction.buckets.map((b, i) => (
                <span key={i}>
                  <b
                    style={{
                      color:
                        b.color === 'accent' ? 'var(--color-accent)' :
                        b.color === 'gold'   ? 'var(--color-gold)' :
                        'var(--color-red)',
                    }}
                  >
                    {b.pct}%
                  </b>{' '}
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
