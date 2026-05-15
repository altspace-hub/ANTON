import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  getEvent,
  putEvent,
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
import { scheduleEventReminder, cancelEventReminder, ensureNotificationPermission } from '../services/event-reminders';

interface Props {
  eventId: string;
  onBack: () => void;
}

export default function EventDetailScreen({ eventId, onBack }: Props) {
  const { t } = useTranslation();
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

  /**
   * R11 — set the lead-time in minutes. 0 / null disables. If the chosen
   * lead-time is longer than the actual time-to-event we clamp to "1 min
   * before" so the user still gets a notification (otherwise the trigger
   * would be in the past and silently never fire — the R11 acceptance
   * test "5-min-out event reminds 1 min before" used to fail this way).
   */
  async function handleSetReminder(rawMinutesBefore: number | null) {
    if (!event) return;
    let minutesBefore = rawMinutesBefore;
    if (minutesBefore && minutesBefore > 0) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setError(t('events.errNotifOff'));
        return;
      }
      const minutesToEvent = Math.floor((new Date(event.startAt).getTime() - Date.now()) / 60_000);
      if (minutesBefore >= minutesToEvent) {
        // Clamp to the latest sensible value: 1 min before the start.
        minutesBefore = Math.max(1, minutesToEvent - 1);
      }
    } else {
      minutesBefore = null;
    }
    const next: CommEvent = {
      ...event,
      reminderMinutesBefore: minutesBefore,
      updatedAt: new Date().toISOString(),
    };
    await putEvent(next);
    setEvent(next);
    if (minutesBefore && minutesBefore > 0) await scheduleEventReminder(next);
    else await cancelEventReminder(next.id);
  }

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
      setError(err instanceof Error ? err.message : t('events.errRsvpFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!event) {
    return (
      <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
        <header className="flex items-center gap-3 h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
          <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">← {t('common.back')}</button>
        </header>
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-faint)]">
          {t('events.eventNotFound')}
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
    ? t('events.allDay')
    : start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const goingHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'going').map(([h]) => h);
  const maybeHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'maybe').map(([h]) => h);
  const declinedHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'declined').map(([h]) => h);
  const pendingHashes = event.invitees.filter(h => !event.rsvps[h]);

  return (
    <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">← {t('common.back')}</button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">{t('events.event')}</h1>
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
              {t('events.yourRsvp')}
            </p>
            <div className="flex gap-2">
              <RsvpButton label={t('events.rsvpGoing')} active={event.myStatus === 'going'} onClick={() => void handleRsvp('going')} disabled={busy} />
              <RsvpButton label={t('events.rsvpMaybe')} active={event.myStatus === 'maybe'} onClick={() => void handleRsvp('maybe')} disabled={busy} />
              <RsvpButton label={t('events.rsvpCantGo')} active={event.myStatus === 'declined'} onClick={() => void handleRsvp('declined')} disabled={busy} />
            </div>
            {error && <p className="mt-2 text-xs text-[var(--color-red)]">{error}</p>}
          </div>
        )}

        {!event.canceled && new Date(event.startAt).getTime() > Date.now() && (
          <div className="px-5 py-5 border-b border-[var(--color-border-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
              {t('events.reminder')}
            </p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((opt) => {
                const active = (event.reminderMinutesBefore ?? null) === opt.value;
                return (
                  <button
                    key={opt.label}
                    onClick={() => void handleSetReminder(opt.value)}
                    aria-pressed={active}
                    className="px-3 py-1.5 rounded-full text-[13px] font-medium border"
                    style={{
                      borderColor: active ? 'var(--color-accent)' : 'var(--color-border-soft)',
                      backgroundColor: active ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                      color: active ? 'var(--color-accent-dark)' : 'var(--color-text)',
                    }}
                  >
                    {t(opt.label)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              {event.reminderMinutesBefore
                ? t('events.reminderSet', { lead: formatLead(event.reminderMinutesBefore, t) })
                : t('events.reminderUnset')}
            </p>
          </div>
        )}

        <div className="px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
            {t('events.attendees')}
          </p>
          <AttendeeSection title={t('events.attGoing')} hashes={goingHashes} contacts={contacts} color="green" me={me?.contactHash} />
          {maybeHashes.length > 0 && <AttendeeSection title={t('events.attMaybe')} hashes={maybeHashes} contacts={contacts} color="gold" me={me?.contactHash} />}
          {declinedHashes.length > 0 && <AttendeeSection title={t('events.attCantGo')} hashes={declinedHashes} contacts={contacts} color="muted" me={me?.contactHash} />}
          {pendingHashes.length > 0 && <AttendeeSection title={t('events.attNoReply')} hashes={pendingHashes} contacts={contacts} color="faint" me={me?.contactHash} />}
        </div>
      </div>
    </section>
  );
}

// R11 — reminder lead-time presets. null = Off; clamp-to-1-min logic in
// handleSetReminder handles "5 min before" being chosen on a 3-min-out event.
const REMINDER_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'events.reminderOff', value: null },
  { label: 'events.reminder5',   value: 5 },
  { label: 'events.reminder15',  value: 15 },
  { label: 'events.reminder30',  value: 30 },
  { label: 'events.reminder1h',  value: 60 },
  { label: 'events.reminder1d',  value: 60 * 24 },
];

function formatLead(min: number, t: TFunction): string {
  if (min < 60) return t('events.leadMin', { n: min });
  if (min < 60 * 24) return t('events.leadHr', { n: Math.round(min / 60) });
  return t('events.leadDay', { n: Math.round(min / (60 * 24)) });
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
  const { t } = useTranslation();
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
          const label = h === me ? t('events.you') : (c?.displayName ?? h);
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
