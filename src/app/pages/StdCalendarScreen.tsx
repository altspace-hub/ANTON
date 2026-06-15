/**
 * StdCalendarScreen — Standard mode "Today" (Evolution design).
 *
 * Per design/screens-standard.jsx StdCalendarScreen:
 *   • "Today" 24px title + day-of-week sub
 *   • Weekday strip — 7 buttons, today highlighted with accent fill
 *   • Big event cards — 5px source-coloured left border, 20px event title,
 *     14px location, optional ANTON prep note
 *
 * Same data as the Pro CalendarScreen — getCalendarToday(orgId).
 */

import { useEffect, useMemo, useState } from 'react';
import { Ico, Spinner } from '../components/ui';
import { getCalendarToday, type CalendarToday, type CalendarColor } from '../services/calendar';
import CalendarEventSheet from '../components/CalendarEventSheet';

interface Props {
  orgId: string;
  onBack: () => void;
}

const COLOR_VAR: Record<CalendarColor, string> = {
  teal: 'var(--color-accent)',
  blue: 'var(--color-blue)',
  gold: 'var(--color-gold)',
  plum: 'var(--color-plum)',
  red:  'var(--color-red)',
};

function buildWeek(reference: Date): Array<{ d: string; n: number; iso: string; isToday: boolean }> {
  const ref = new Date(reference);
  const day = ref.getDay();
  const offsetToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref); monday.setDate(ref.getDate() + offsetToMon);
  const today = new Date();
  const todayKey = today.toDateString();
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return labels.map((l, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return { d: l, n: d.getDate(), iso: d.toISOString().slice(0, 10), isToday: d.toDateString() === todayKey };
  });
}

export default function StdCalendarScreen({ orgId, onBack }: Props): JSX.Element {
  const [today,   setToday]   = useState<CalendarToday | null>(null);
  const [date,    setDate]    = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

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
  }, [orgId, date, refreshTick]);

  const week = useMemo(() => buildWeek(date ? new Date(date) : new Date()), [date]);
  const headerSub = useMemo(() => {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }, [date]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-start gap-3 px-[18px] py-3"
        style={{ background: 'var(--color-bg)' }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="-ml-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center"
        >
          <Ico name="chevronLeft" color="var(--color-text)" size={26} />
        </button>
        <div className="flex-1">
          <div
            className="text-[var(--color-text)]"
            style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.1 }}
          >
            Today
          </div>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">{headerSub}</div>
        </div>
        <button
          aria-label="Add event"
          onClick={() => setSheetOpen(true)}
          className="-mr-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center"
        >
          <Ico name="plus" color="var(--color-text)" size={24} />
        </button>
      </div>

      {/* Weekday strip */}
      <div className="flex gap-1.5 px-3.5 pb-3.5">
        {week.map(d => (
          <button
            key={d.iso}
            onClick={() => setDate(d.iso)}
            className="flex-1 rounded-[12px] py-2 text-center"
            style={{
              background: d.isToday ? 'var(--color-accent)' : 'transparent',
              color: d.isToday ? '#fff' : 'var(--color-text-body)',
            }}
          >
            <div className="text-[0.6875rem] opacity-80">{d.d}</div>
            <div className="mt-0.5 text-lg font-bold">{d.n}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : today && today.events.length > 0 ? (
          today.events.map(e => (
            <div
              key={e.id}
              className="mb-2.5 rounded-[var(--radius-r3)] p-4"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderLeft: `5px solid ${COLOR_VAR[e.color]}`,
              }}
            >
              <div
                className="font-bold"
                style={{ fontSize: '0.8125rem', color: COLOR_VAR[e.color], marginBottom: 4 }}
              >
                {e.time}
              </div>
              <div
                className="text-[var(--color-text)]"
                style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.2 }}
              >
                {e.title}
              </div>
              <div className="mt-1 text-sm text-[var(--color-text-muted)]">{e.location}</div>
              {e.anton_prep && (
                <div
                  className="mt-2.5 flex items-center gap-1.5 rounded-[var(--radius-r2)] px-3 py-2.5"
                  style={{ background: 'var(--color-accent-soft)' }}
                >
                  <Ico name="sparkles" color="var(--color-accent)" size={14} />
                  <span className="text-sm text-[var(--color-text)]">{e.anton_prep}</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="px-2 py-12 text-center">
            <Ico name="check" color="var(--color-green)" size={32} />
            <p className="mt-3 text-base text-[var(--color-text)]">Nothing on the calendar today.</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Enjoy your day. ANTON will remind you when something needs your attention.
            </p>
          </div>
        )}
      </div>

      <CalendarEventSheet
        open={sheetOpen}
        orgId={orgId}
        defaultDate={date}
        onClose={() => setSheetOpen(false)}
        onCreated={() => setRefreshTick(t => t + 1)}
      />
    </div>
  );
}
