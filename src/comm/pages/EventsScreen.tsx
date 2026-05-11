import { useEffect, useState } from 'react';
import { listEvents, type CommEvent, EVENT_TYPE_ICONS } from '../services/events';

interface Props {
  onCreate: () => void;
  onOpenEvent: (id: string) => void;
  refreshKey?: number;
}

type Tab = 'today' | 'upcoming' | 'past';

export default function EventsScreen({ onCreate, onOpenEvent, refreshKey }: Props) {
  const [events, setEvents] = useState<CommEvent[]>([]);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listEvents()
      .then((rows) => { if (!cancelled) { setEvents(rows); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

  const filtered = events.filter((e) => {
    if (e.canceled) return false;
    const start = new Date(e.startAt);
    if (tab === 'today') return start >= startOfDay && start <= endOfDay;
    if (tab === 'upcoming') return start > endOfDay || (start >= startOfDay && start <= endOfDay);
    return start < startOfDay;
  });

  if (tab === 'past') filtered.reverse(); // most recent past first

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Events</h1>
        <button
          onClick={onCreate}
          aria-label="Create event"
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-medium"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          +
        </button>
      </div>

      <div className="flex border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2">
        <TabButton active={tab === 'today'} onClick={() => setTab('today')}>Today</TabButton>
        <TabButton active={tab === 'upcoming'} onClick={() => setTab('upcoming')}>Upcoming</TabButton>
        <TabButton active={tab === 'past'} onClick={() => setTab('past')}>Past</TabButton>
      </div>

      {!loaded ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="px-5 mt-6">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">
              {tab === 'today' ? 'Nothing on the calendar for today.'
                : tab === 'upcoming' ? 'No upcoming events.'
                : 'No past events.'}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              Tap + to create one and invite friends.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {filtered.map((e) => <EventRow key={e.id} event={e} onClick={() => onOpenEvent(e.id)} />)}
        </ul>
      )}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-3 text-sm font-medium relative"
      style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-t"
              style={{ backgroundColor: 'var(--color-accent)' }} />
      )}
    </button>
  );
}

function EventRow({ event, onClick }: { event: CommEvent; onClick: () => void }) {
  const start = new Date(event.startAt);
  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeLabel = event.allDay
    ? 'All day'
    : start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const goingCount = Object.values(event.rsvps).filter(s => s === 'going').length;

  return (
    <li>
      <button onClick={onClick}
              className="w-full flex items-center gap-3 px-5 py-3 text-left active:bg-[var(--color-surface-muted)]">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ backgroundColor: 'var(--color-accent-dim)' }}
        >
          {EVENT_TYPE_ICONS[event.eventType]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-[var(--color-text)] truncate">{event.title}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {dateLabel} · {timeLabel}
            {event.location && <span className="ml-1">· {event.location}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {event.myStatus === 'going' && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--color-green-dim)', color: 'var(--color-green)' }}>
              Going
            </span>
          )}
          {event.myStatus === 'pending' && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'var(--color-gold-dim)', color: 'var(--color-gold)' }}>
              Reply
            </span>
          )}
          <span className="text-[10px] text-[var(--color-text-faint)]">{goingCount} going</span>
        </div>
      </button>
    </li>
  );
}
