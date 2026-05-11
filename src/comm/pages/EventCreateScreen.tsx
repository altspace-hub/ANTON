import { useEffect, useState } from 'react';
import {
  createLocalEvent,
  eventToInvitePayload,
  type EventType,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ICONS,
} from '../services/events';
import { listContacts, type Contact } from '../services/contacts';
import { sendEventInvite } from '../services/chat';
import { getIdentity } from '../services/identity';

interface Props {
  onCancel: () => void;
  onCreated: (eventId: string) => void;
}

const TYPES: EventType[] = ['dinner', 'drinks', 'concert', 'travel', 'party', 'birthday', 'other'];

export default function EventCreateScreen({ onCancel, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('dinner');
  const [dateStr, setDateStr] = useState(defaultDateStr());
  const [timeStr, setTimeStr] = useState('19:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listContacts().then((rows) => setContacts(rows.filter(c => !!c.publicKeyHex)));
  }, []);

  function toggleInvitee(hash: string) {
    setInvitees((prev) => prev.includes(hash) ? prev.filter(h => h !== hash) : [...prev, hash]);
  }

  async function handleCreate() {
    const me = getIdentity();
    if (!me) { setError('No identity'); return; }
    if (!title.trim()) { setError('Please enter a title'); return; }
    const startAt = buildIso(dateStr, allDay ? '00:00' : timeStr);
    if (!startAt) { setError('Please pick a valid date'); return; }

    setBusy(true);
    setError(null);
    try {
      const event = await createLocalEvent({
        createdBy: me.contactHash,
        title: title.trim(),
        eventType,
        startAt,
        endAt: undefined,
        allDay,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        invitees,
      });

      // Fan out invites to each invitee via chat layer.
      const payload = eventToInvitePayload(event);
      const sends = invitees.map(async (h) => {
        try { await sendEventInvite(h, payload); }
        catch (err) { console.warn('[event-create] invite failed for', h, err); }
      });
      await Promise.all(sends);

      onCreated(event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onCancel} className="text-sm text-[var(--color-text-muted)]" disabled={busy}>Cancel</button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">New event</h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's the occasion?"
            maxLength={120}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)] focus:outline-none focus:ring-2"
            style={{ outlineColor: 'var(--color-accent)' }}
          />
        </Field>

        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const active = t === eventType;
              return (
                <button
                  key={t}
                  onClick={() => setEventType(t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: active ? 'var(--color-accent-fg)' : 'var(--color-text)',
                    borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <span>{EVENT_TYPE_ICONS[t]}</span>
                  <span>{EVENT_TYPE_LABELS[t]}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="When">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="flex-1 px-3 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"
            />
            {!allDay && (
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-32 px-3 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"
              />
            )}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-[var(--color-text-body)]">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded"
            />
            All day
          </label>
        </Field>

        <Field label="Where (optional)">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Restaurant, address, or note"
            maxLength={200}
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"
          />
        </Field>

        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details for your guests"
            rows={3}
            maxLength={1000}
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)] resize-none"
          />
        </Field>

        <Field label={`Invite (${invitees.length}/${contacts.length})`}>
          {contacts.length === 0 ? (
            <p className="text-sm text-[var(--color-text-faint)]">
              No contacts to invite yet. Add a friend first to invite them.
            </p>
          ) : (
            <ul className="space-y-1">
              {contacts.map((c) => {
                const active = invitees.includes(c.contactHash);
                return (
                  <li key={c.contactHash}>
                    <button
                      onClick={() => toggleInvitee(c.contactHash)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors"
                      style={{ backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent' }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{
                          backgroundColor: active ? 'var(--color-accent)' : 'var(--color-accent-dim)',
                          color: active ? 'var(--color-accent-fg)' : 'var(--color-accent-dark)',
                        }}
                      >
                        {active ? '✓' : c.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm font-medium text-[var(--color-text)] truncate">
                        {c.displayName}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Field>

        {error && (
          <p className="text-xs text-[var(--color-red)]">{error}</p>
        )}
      </div>

      <div className="p-4 border-t border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button
          onClick={() => void handleCreate()}
          disabled={busy || !title.trim()}
          className="w-full py-4 rounded-2xl text-base font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          {busy ? 'Creating…' : `Create${invitees.length > 0 ? ` & invite ${invitees.length}` : ''}`}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function defaultDateStr(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function buildIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr) return null;
  const dt = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}
