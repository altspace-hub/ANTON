import { useEffect, useState } from 'react';
import {
  getEvent,
  setMyRsvp,
  type CommEvent,
  type RsvpStatus,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ICONS,
} from '../services/events';
import { Ico, type IcoName } from '../components/Ico';
import { sendEventRsvp } from '../services/chat';
import { getIdentity } from '../services/identity';
import { listContacts, type Contact } from '../services/contacts';

interface Props {
  eventId: string;
  onBack: () => void;
}

export default function EventDetailScreen({ eventId, onBack }: Props) {
  const [event, setEvent] = useState<CommEvent | null>(null);
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvent(eventId), listContacts()])
      .then(([ev, cs]) => {
        if (cancelled) return;
        setEvent(ev);
        const map = new Map<string, Contact>();
        for (const c of cs) map.set(c.contactHash, c);
        setContacts(map);
      })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, [eventId]);

  async function handleRsvp(status: RsvpStatus) {
    if (!event) return;
    const me = getIdentity();
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await setMyRsvp(event.id, status);
      setEvent(updated);
      // Notify the creator (unless I am the creator).
      if (event.createdBy !== me.contactHash) {
        try { await sendEventRsvp(event.createdBy, { eventId: event.id, status }); }
        catch (err) { console.warn('[event-detail] rsvp send failed', err); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update RSVP');
    } finally {
      setBusy(false);
    }
  }

  if (!event) {
    return (
      <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
        <header className="flex items-center gap-3 h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
          <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">← Back</button>
        </header>
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-faint)]">
          Event not found.
        </div>
      </section>
    );
  }

  const me = getIdentity();
  const isCreator = me?.contactHash === event.createdBy;
  const start = new Date(event.startAt);
  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeLabel = event.allDay
    ? 'All day'
    : start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const goingHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'going').map(([h]) => h);
  const maybeHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'maybe').map(([h]) => h);
  const declinedHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'declined').map(([h]) => h);
  const pendingHashes = event.invitees.filter(h => !event.rsvps[h]);

  return (
    <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">← Back</button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">Event</h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div
          className="px-6 py-8 text-center"
          style={{ backgroundColor: 'var(--color-accent-soft)' }}
        >
          <div
            className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-2"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-accent-dark)' }}
          >
            <Ico name={EVENT_TYPE_ICONS[event.eventType] as IcoName} size={32} />
          </div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            {EVENT_TYPE_LABELS[event.eventType]}
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{event.title}</h2>
          <p className="mt-3 text-sm text-[var(--color-text-body)]">
            {dateLabel} · {timeLabel}
          </p>
          {event.location && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{event.location}</p>
          )}
        </div>

        {event.description && (
          <div className="px-5 py-4 border-b border-[var(--color-border-soft)]">
            <p className="text-sm text-[var(--color-text-body)] whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        {!isCreator && (
          <div className="px-5 py-5 border-b border-[var(--color-border-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
              Your RSVP
            </p>
            <div className="flex gap-2">
              <RsvpButton label="Going" active={event.myStatus === 'going'} onClick={() => void handleRsvp('going')} disabled={busy} />
              <RsvpButton label="Maybe" active={event.myStatus === 'maybe'} onClick={() => void handleRsvp('maybe')} disabled={busy} />
              <RsvpButton label="Can't go" active={event.myStatus === 'declined'} onClick={() => void handleRsvp('declined')} disabled={busy} />
            </div>
            {error && <p className="mt-2 text-xs text-[var(--color-red)]">{error}</p>}
          </div>
        )}

        <div className="px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
            Attendees
          </p>
          <AttendeeSection title="Going" hashes={goingHashes} contacts={contacts} color="green" me={me?.contactHash} />
          {maybeHashes.length > 0 && <AttendeeSection title="Maybe" hashes={maybeHashes} contacts={contacts} color="gold" me={me?.contactHash} />}
          {declinedHashes.length > 0 && <AttendeeSection title="Can't go" hashes={declinedHashes} contacts={contacts} color="muted" me={me?.contactHash} />}
          {pendingHashes.length > 0 && <AttendeeSection title="No reply yet" hashes={pendingHashes} contacts={contacts} color="faint" me={me?.contactHash} />}
        </div>
      </div>
    </section>
  );
}

function RsvpButton({ label, active, onClick, disabled }: {
  label: string; active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-3 rounded-xl text-sm font-medium border disabled:opacity-50"
      style={{
        backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
        color: active ? 'var(--color-accent-fg)' : 'var(--color-text)',
        borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      {label}
    </button>
  );
}

function AttendeeSection({
  title, hashes, contacts, color, me,
}: {
  title: string;
  hashes: string[];
  contacts: Map<string, Contact>;
  color: 'green' | 'gold' | 'muted' | 'faint';
  me?: string;
}) {
  const colors = {
    green: 'var(--color-green)',
    gold: 'var(--color-gold)',
    muted: 'var(--color-text-muted)',
    faint: 'var(--color-text-faint)',
  };
  return (
    <div className="mb-4">
      <p className="text-xs font-medium" style={{ color: colors[color] }}>
        {title} · {hashes.length}
      </p>
      <ul className="mt-1.5 space-y-1">
        {hashes.map((h) => {
          const c = contacts.get(h);
          const label = h === me ? 'You' : (c?.displayName ?? h);
          return (
            <li key={h} className="flex items-center gap-2 text-sm text-[var(--color-text-body)]">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
              >
                {label.slice(0, 1).toUpperCase()}
              </div>
              <span className="truncate">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
