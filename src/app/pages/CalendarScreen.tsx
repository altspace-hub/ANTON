/**
 * CalendarScreen — companion-app Unified Calendar (Evolution design).
 *
 * Per design/screens-modules.jsx UnifiedCalendarScreen:
 *   • Top bar — "Calendar · Thu · 17 April · N sources"
 *   • Source legend chips — coloured dot + label + count
 *   • Week strip — 7 days with dots indicating activity, today highlighted
 *   • ANTON prep banner — accent-soft strip when something is prepped
 *   • Timeline — gutter with mono time + duration, source-coloured event cards
 */

import { useEffect, useMemo, useState } from 'react';
import { Pill, Ico } from '../components/ui';
import {
  getCalendarToday,
  type CalendarToday, type CalendarColor,
} from '../services/calendar';

interface Props {
  orgId: string;
  onNavigate: (tab: string) => void;
}

const COLOR_VAR: Record<CalendarColor, string> = {
  teal: 'var(--color-accent)',
  blue: 'var(--color-blue)',
  gold: 'var(--color-gold)',
  plum: '#6A3E8F',
  red:  'var(--color-red)',
};

const COLOR_DIM: Record<CalendarColor, string> = {
  teal: 'var(--color-accent-soft)',
  blue: 'var(--color-blue-dim)',
  gold: 'var(--color-gold-dim)',
  plum: '#EEE3F5',
  red:  'var(--color-red-dim)',
};

function buildWeek(reference: Date): Array<{ d: string; n: number; iso: string; isToday: boolean }> {
  // Build Mon..Sun including reference day; treat Mon as week start
  const ref = new Date(reference);
  const day = ref.getDay();              // 0 = Sun
  const offsetToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref); monday.setDate(ref.getDate() + offsetToMon);
  const today = new Date();
  const todayKey = today.toDateString();
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return labels.map((l, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return {
      d: l,
      n: d.getDate(),
      iso: d.toISOString().slice(0, 10),
      isToday: d.toDateString() === todayKey,
    };
  });
}

export default function CalendarScreen({ orgId, onNavigate }: Props): JSX.Element {
  const [today,   setToday]   = useState<CalendarToday | null>(null);
  const [date,    setDate]    = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const t = await getCalendarToday(orgId, date);
        if (!cancelled) setToday(t);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, date]);

  const week = useMemo(() => buildWeek(date ? new Date(date) : new Date()), [date]);
  const headerDate = useMemo(() => {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
  }, [date]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--color-surface-alt)', minHeight: 44 }}
      >
        <div>
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.05 }}
          >
            Calendar
          </div>
          <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
            {headerDate}{today && ` · ${today.sources.length} sources`}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Ico name="search" color="var(--color-text-muted)" size={18} />
          <Ico name="plus"   color="var(--color-text)"       size={20} />
        </div>
      </div>

      {/* Source legend */}
      {today && (
        <div className="flex gap-1.5 overflow-x-auto px-3.5 pb-2 pt-1">
          {today.sources.map(s => (
            <div
              key={s.id}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text-body)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span
                className="block rounded-full"
                style={{ width: 7, height: 7, background: COLOR_VAR[s.color] }}
              />
              {s.label}
              <span
                className="font-mono text-[var(--color-text-faint)]"
                style={{ fontSize: 10 }}
              >
                {s.count}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Week strip */}
      <div
        className="flex gap-1 px-2 pb-2.5 pt-0.5"
        style={{ borderBottom: '1px solid var(--color-border-soft)' }}
      >
        {week.map(d => (
          <button
            key={d.iso}
            onClick={() => setDate(d.iso)}
            className="flex-1 rounded-[9px] py-1.5 text-center"
            style={{
              background: d.isToday ? 'var(--color-text)' : 'transparent',
              color: d.isToday ? 'var(--color-surface)' : 'var(--color-text-body)',
            }}
          >
            <div className="text-[9px] font-medium opacity-70">{d.d}</div>
            <div className="text-[14px] font-bold">{d.n}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ANTON prep banner */}
        {today?.prep && (
          <div
            className="mx-3.5 mt-2.5 mb-1 flex items-center gap-2 rounded-[var(--radius-r2)] p-2.5"
            style={{ background: 'var(--color-accent-soft)' }}
          >
            <Ico name="sparkles" color="var(--color-accent)" size={14} />
            <div className="flex-1 text-[12px] leading-snug text-[var(--color-text)]">
              <b>ANTON prepped</b> {today.prep.title}{today.prep.note && <> — {today.prep.note}</>}
            </div>
            <Pill tone="teal" style={{ fontSize: 10 }}>READY</Pill>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <span
              className="block h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : today && today.events.length > 0 ? (
          <div className="px-3.5 pb-4 pt-2">
            {today.events.map(e => (
              <div key={e.id} className="mb-2 flex gap-2.5">
                <div
                  className="flex-shrink-0 pt-1.5 text-right"
                  style={{ width: 44 }}
                >
                  <div
                    className="font-mono font-bold text-[var(--color-text)]"
                    style={{ fontSize: 12 }}
                  >
                    {e.time}
                  </div>
                  <div
                    className="font-mono text-[var(--color-text-muted)]"
                    style={{ fontSize: 10 }}
                  >
                    {e.duration_minutes}m
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (e.deep_link?.startsWith('/approvals')) onNavigate('approvals');
                  }}
                  className="flex-1 px-3 py-2.5 text-left"
                  style={{
                    background: COLOR_DIM[e.color],
                    borderLeft: `4px solid ${COLOR_VAR[e.color]}`,
                    borderRadius: '4px var(--radius-r2) var(--radius-r2) 4px',
                  }}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className="text-[var(--color-text)]"
                      style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}
                    >
                      {e.title}
                    </span>
                    {e.anton && <Pill tone="teal" style={{ fontSize: 9 }}>ANTON</Pill>}
                    {e.ext && <Pill tone="gold" style={{ fontSize: 9 }}>EXT</Pill>}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">
                    {e.location}
                  </div>
                  {e.anton_prep && (
                    <div
                      className="mt-1 flex items-center gap-1"
                      style={{ color: 'var(--color-accent)', fontSize: 11, fontWeight: 600 }}
                    >
                      <Ico name="sparkles" color="var(--color-accent)" size={11} />
                      {e.anton_prep}
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <Ico name="check" color="var(--color-green)" size={32} />
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">No events today.</p>
            <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
              Connect a work calendar from <b>Mail → Setup</b> to merge external events here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
