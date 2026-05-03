/**
 * RadarScreen — Horizon Radar (Evolution design).
 *
 * Layout from design/screens-modules.jsx HorizonRadarScreen:
 *   • Top bar  → name + radar glyph + "● SCANNING" line + sources count
 *   • 3-up summary strip (new today / high relevance / action suggested)
 *   • Horizontal category chips (sticky-style)
 *   • Morning brief hero (accent-tinted) when available
 *   • Signal cards stack with a 4 px relevance bar
 *       (red ≥85 / gold ≥65 / accent <65)
 *   • Sources footer ("Nothing is scraped without your say-so")
 */

import { useEffect, useMemo, useState } from 'react';
import { Btn, Pill, SectionLabel, StatusDot, Ico, Spinner } from '../components/ui';
import {
  getRadarItems, getRadarSummary, getRadarSources, triggerRadarScan,
  timeAgo,
  type RadarSignal, type RadarSummary, type RadarSource,
} from '../services/radar';
import { speak as ttsSpeak, stop as ttsStop, isAvailable as ttsAvailable } from '../services/tts';

interface Props { orgId: string }

const CATEGORIES = [
  'All', 'Regulatory', 'Competitors', 'Products', 'Threats', 'Trends',
] as const;

function relBarColour(rel: number): string {
  if (rel >= 85) return 'var(--color-red)';
  if (rel >= 65) return 'var(--color-gold)';
  return 'var(--color-accent)';
}

function pillTone(tone: RadarSignal['tone']): 'red' | 'gold' | 'neutral' | 'teal' {
  return tone;
}

export default function RadarScreen(_props: Props): JSX.Element {
  const [summary,  setSummary]  = useState<RadarSummary | null>(null);
  const [items,    setItems]    = useState<RadarSignal[]>([]);
  const [sources,  setSources]  = useState<RadarSource[]>([]);
  const [category, setCategory] = useState<string>('All');
  const [loading,  setLoading]  = useState(true);
  const [scanning, setScanning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Stop any in-flight TTS when the screen unmounts (barge-in cleanup)
  useEffect(() => () => { ttsStop(); }, []);

  // Load summary + sources once
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [s, src] = await Promise.all([
          getRadarSummary().catch(() => null),
          getRadarSources().catch(() => []),
        ]);
        if (!cancelled) {
          setSummary(s);
          setSources(src);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reload items on category change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const list = await getRadarItems({ category, limit: 30 });
        if (!cancelled) setItems(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load radar items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [category]);

  async function onScan() {
    setScanning(true);
    try {
      await triggerRadarScan(category === 'All' ? undefined : category);
      // After kicking off, give the worker a moment then refresh
      window.setTimeout(async () => {
        const [s, list] = await Promise.all([
          getRadarSummary().catch(() => null),
          getRadarItems({ category, limit: 30 }).catch(() => []),
        ]);
        setSummary(s);
        setItems(list);
        setScanning(false);
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
      setScanning(false);
    }
  }

  // Category counts for chip badges (from summary if present, else 0)
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    if (summary?.category_counts) {
      for (const c of summary.category_counts) {
        const key = (c.category || '').toLowerCase();
        map.set(key, (map.get(key) ?? 0) + Number(c.count));
      }
    }
    map.set('all', items.length);
    return map;
  }, [summary, items.length]);

  // Top 3 signals form the "morning brief" hero summary
  const briefHeadlines = items.slice(0, 3).map(i => i.title);

  function togglePlayBrief() {
    if (briefHeadlines.length === 0) return;
    if (speaking) { ttsStop(); setSpeaking(false); return; }
    if (!ttsAvailable()) return;
    const text = `Your horizon brief. ${briefHeadlines.join('. ')}.`;
    setSpeaking(true);
    void ttsSpeak(text, { onEnd: () => setSpeaking(false) });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--color-surface-alt)',
          borderBottom: '1px solid var(--color-border-soft)',
          minHeight: 44,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[var(--color-text)]"
              style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.3px' }}
            >
              Horizon Radar
            </span>
            <Ico name="radar" color="var(--color-accent)" size={14} />
          </div>
        </div>
        <button
          onClick={onScan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 disabled:opacity-50"
          style={{
            background: scanning ? 'var(--color-accent-soft)' : 'transparent',
            border: '1px solid var(--color-border)',
            fontSize: 11,
            color: 'var(--color-text-body)',
          }}
        >
          <StatusDot tone="green" pulse={scanning} size={6} />
          {scanning ? 'Scanning…' : 'Scan now'}
        </button>
      </div>

      {/* Sub-line — sources count + "scanned today" */}
      <div
        className="px-4 py-2 font-mono text-[10px] text-[var(--color-text-muted)]"
        style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border)' }}
      >
        <span style={{ color: 'var(--color-green)' }}>● LIVE</span>
        {summary?.sources_active != null && (
          <> · {summary.sources_active} sources</>
        )}
        {summary?.scanned_today != null && (
          <> · {summary.scanned_today} scanned today</>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── 3-up summary strip ────────────────────────────── */}
        {summary && (
          <div
            className="grid grid-cols-3"
            style={{
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            {[
              { n: summary.new_today,        l: 'new today',        c: 'var(--color-text)' },
              { n: summary.high_relevance,   l: 'high relevance',   c: 'var(--color-red)' },
              { n: summary.action_suggested, l: 'action suggested', c: 'var(--color-gold)' },
            ].map((s, i) => (
              <div
                key={i}
                className="px-3 py-3 text-center"
                style={{ borderRight: i < 2 ? '1px solid var(--color-border-soft)' : 'none' }}
              >
                <div
                  className="font-mono"
                  style={{ fontSize: 22, fontWeight: 700, color: s.c, letterSpacing: '-0.5px', lineHeight: 1 }}
                >
                  {s.n}
                </div>
                <div
                  className="mt-1 font-mono uppercase text-[var(--color-text-muted)]"
                  style={{ fontSize: 10, letterSpacing: '0.3px' }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Category chips ────────────────────────────────── */}
        <div
          className="flex gap-1.5 overflow-x-auto py-2.5"
          style={{
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border-soft)',
            paddingLeft: 16,
            paddingRight: 16,
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORIES.map((c, i) => {
            const isActive = c === category;
            const n = counts.get(c.toLowerCase()) ?? 0;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full font-semibold transition-colors"
                style={{
                  paddingLeft: 12,
                  paddingRight: 12,
                  paddingTop: 5,
                  paddingBottom: 5,
                  fontSize: 12,
                  background: isActive ? 'var(--color-text)'    : 'var(--color-surface-alt)',
                  color:      isActive ? 'var(--color-surface)' : 'var(--color-text-body)',
                  border: `1px solid ${isActive ? 'var(--color-text)' : 'var(--color-border)'}`,
                  // Trailing spacer so the last chip clears the screen edge
                  marginRight: i === CATEGORIES.length - 1 ? 4 : 0,
                }}
              >
                {c}
                {n > 0 && (
                  <span className="font-mono opacity-70" style={{ fontSize: 10 }}>{n}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Morning brief hero (when there's something to summarise) ── */}
        {!loading && items.length >= 3 && category === 'All' && (
          <div
            className="mx-4 mt-3 rounded-[var(--radius-r3)] p-3.5"
            style={{
              background: 'var(--color-accent-soft)',
              border: '1px solid var(--color-accent-dim)',
            }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <Ico name="sparkles" color="var(--color-accent)" size={13} />
              <span
                className="font-mono font-bold uppercase"
                style={{
                  fontSize: 10, letterSpacing: '0.5px',
                  color: 'var(--color-accent)',
                }}
              >
                Your horizon · by your ANTON
              </span>
            </div>
            <div
              className="text-[var(--color-text)]"
              style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.2px' }}
            >
              {briefHeadlines[0]}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-text-body)]">
              {briefHeadlines.slice(1).join(' · ')}
            </p>
            {ttsAvailable() && (
              <div className="mt-2.5">
                <Btn
                  size="sm"
                  variant={speaking ? 'primary' : 'secondary'}
                  onClick={togglePlayBrief}
                  icon={<Ico name={speaking ? 'x' : 'mic'} color="currentColor" size={13} />}
                >
                  {speaking ? 'Stop' : 'Play brief'}
                </Btn>
              </div>
            )}
          </div>
        )}

        {/* ── Signal cards ──────────────────────────────────── */}
        <SectionLabel className="px-4 pb-2 pt-4">Latest signals</SectionLabel>

        {error && (
          <div
            className="mx-4 mb-3 flex items-center gap-2 rounded-[var(--radius-r2)]"
            style={{
              background: 'var(--color-red-dim)',
              border: '1px solid var(--color-red-dim)',
              color: 'var(--color-red)',
              paddingLeft: 14,
              paddingRight: 14,
              paddingTop: 10,
              paddingBottom: 10,
              fontSize: 12.5,
              lineHeight: 1.4,
            }}
          >
            <span
              className="block flex-shrink-0 rounded-full"
              style={{ width: 6, height: 6, background: 'currentColor' }}
            />
            <span className="min-w-0 flex-1">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Ico name="radar" color="var(--color-text-faint)" size={32} />
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">No signals yet for this view.</p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              Tap <b>Scan now</b> to fetch fresh items, or add sources from the main ANTON UI.
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4">
            {items.map(it => (
              <div
                key={it.id}
                className="mb-2 rounded-[var(--radius-r2)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5"
              >
                {/* source row */}
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <Pill tone={pillTone(it.tone)} mono style={{ fontSize: 9 }}>
                    {it.tag}
                  </Pill>
                  <span
                    className="font-mono uppercase text-[var(--color-text-muted)]"
                    style={{ fontSize: 10, letterSpacing: '0.3px' }}
                  >
                    {it.cat} · {it.src}
                  </span>
                </div>

                {/* title */}
                <div
                  className="text-[var(--color-text)]"
                  style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.2px' }}
                >
                  {it.title}
                </div>

                {/* blurb */}
                {it.blurb && (
                  <div
                    className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-body)]"
                  >
                    {it.blurb}
                  </div>
                )}

                {/* relevance bar */}
                <div className="mt-2.5 flex items-center gap-2">
                  <span
                    className="font-mono uppercase text-[var(--color-text-muted)]"
                    style={{ fontSize: 9, letterSpacing: '0.3px', width: 54 }}
                  >
                    Relevance
                  </span>
                  <div
                    className="relative flex-1 overflow-hidden rounded-sm"
                    style={{
                      height: 4,
                      background: 'var(--color-surface-alt)',
                      border: '1px solid var(--color-border-soft)',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, it.rel))}%`,
                        height: '100%',
                        background: relBarColour(it.rel),
                      }}
                    />
                  </div>
                  <span
                    className="text-right font-mono font-bold text-[var(--color-text)]"
                    style={{ fontSize: 11, letterSpacing: '-0.2px', width: 26 }}
                  >
                    {it.rel}
                  </span>
                </div>

                {/* meta line */}
                <div
                  className="mt-1.5 font-mono text-[var(--color-text-faint)]"
                  style={{ fontSize: 10, letterSpacing: '0.2px' }}
                >
                  {it.areas.length > 0 && <>Matches: {it.areas.join(' · ')} · </>}
                  {timeAgo(it.published_at) || timeAgo(it.fetched_at)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Sources footer ────────────────────────────────── */}
        {sources.length > 0 && (
          <div
            className="mx-4 mb-5 rounded-[var(--radius-r2)] p-3"
            style={{
              background: 'var(--color-surface-alt)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <div
              className="mb-1.5 font-mono uppercase text-[var(--color-text-muted)]"
              style={{ fontSize: 10, letterSpacing: '0.5px' }}
            >
              {sources.length} source{sources.length === 1 ? '' : 's'} active · you own the list
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sources.slice(0, 12).map(s => (
                <span
                  key={s.id}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[var(--color-text-body)]"
                  style={{ fontSize: 10 }}
                >
                  {s.label}
                </span>
              ))}
              {sources.length > 12 && (
                <span
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 font-mono text-[var(--color-text-body)]"
                  style={{ fontSize: 10 }}
                >
                  + {sources.length - 12}
                </span>
              )}
            </div>
            <div
              className="mt-2 text-[var(--color-text-faint)]"
              style={{ fontSize: 10, lineHeight: 1.4 }}
            >
              Nothing is scraped without your say-so. No source sells your queries back to you.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
