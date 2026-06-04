import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  getEvent,
  putEvent,
  deleteEvent,
  setMyRsvp,
  eventToInvitePayload,
  eventToUpdatePayload,
  addProposalToEvent,
  resolveProposal,
  newProposalId,
  listEventNotes,
  addEventNote,
  newNoteId,
  type CommEvent,
  type RsvpStatus,
  type EventProposal,
  type EventNote,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_ICONS,
} from '../services/events';
import { Ico, type IcoName } from '../components/Ico';
import AvatarCircle from '../components/AvatarCircle';
import {
  sendEventRsvp, sendEventInvite, sendEventUpdate, sendEventCancel,
  sendEventProposal, sendEventNote,
} from '../services/chat';
import { getIdentity } from '../services/identity';
import { listContacts, type Contact } from '../services/contacts';
import { scheduleEventReminder, cancelEventReminder, ensureNotificationPermission } from '../services/event-reminders';

interface Props {
  eventId: string;
  onBack: () => void;
}

/** Everyone who should hear about a change: creator + invitees, minus me. */
function recipientsOf(event: CommEvent, meHash: string): string[] {
  return [...new Set([event.createdBy, ...event.invitees])].filter((h) => h && h !== meHash);
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(val: string): string {
  return new Date(val).toISOString();
}

export default function EventDetailScreen({ eventId, onBack }: Props) {
  const { t } = useTranslation();
  const [event, setEvent] = useState<CommEvent | null>(null);
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map());
  const [notes, setNotes] = useState<EventNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal flags
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [proposing, setProposing] = useState(false);

  const me = getIdentity();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvent(eventId), listContacts(), listEventNotes(eventId)])
      .then(([ev, cs, ns]) => {
        if (cancelled) return;
        setEvent(ev);
        const map = new Map<string, Contact>();
        for (const c of cs) map.set(c.contactHash, c);
        setContacts(map);
        setNotes(ns);
      })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, [eventId]);

  /** Broadcast the current event snapshot to every participant. */
  async function broadcast(ev: CommEvent) {
    if (!me) return;
    const payload = eventToUpdatePayload(ev, me.contactHash);
    await Promise.allSettled(
      recipientsOf(ev, me.contactHash).map((h) => sendEventUpdate(h, payload)),
    );
  }

  async function handleSetReminder(rawMinutesBefore: number | null) {
    if (!event) return;
    let minutesBefore = rawMinutesBefore;
    if (minutesBefore && minutesBefore > 0) {
      const granted = await ensureNotificationPermission();
      if (!granted) { setError(t('events.errNotifOff')); return; }
      const minutesToEvent = Math.floor((new Date(event.startAt).getTime() - Date.now()) / 60_000);
      if (minutesBefore >= minutesToEvent) minutesBefore = Math.max(1, minutesToEvent - 1);
    } else {
      minutesBefore = null;
    }
    const next: CommEvent = { ...event, reminderMinutesBefore: minutesBefore, updatedAt: new Date().toISOString() };
    await putEvent(next);
    setEvent(next);
    if (minutesBefore && minutesBefore > 0) await scheduleEventReminder(next);
    else await cancelEventReminder(next.id);
  }

  async function handleRsvp(status: RsvpStatus) {
    if (!event || !me) return;
    setBusy(true); setError(null);
    try {
      const updated = await setMyRsvp(event.id, status);
      setEvent(updated);
      if (event.createdBy !== me.contactHash) {
        try { await sendEventRsvp(event.createdBy, { eventId: event.id, status }); }
        catch (err) { console.warn('[event-detail] rsvp send failed', err); }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('events.errRsvpFailed'));
    } finally { setBusy(false); }
  }

  // ── Amend (creator) ────────────────────────────────────────────────
  async function handleEditSave(patch: Pick<CommEvent, 'title' | 'startAt' | 'allDay' | 'location' | 'description'>) {
    if (!event) return;
    setBusy(true); setError(null);
    try {
      const next: CommEvent = { ...event, ...patch, lastUpdatedBy: me?.contactHash, updatedAt: new Date().toISOString() };
      await putEvent(next);
      setEvent(next);
      setEditing(false);
      await broadcast(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  // ── Add people / forward (anyone; creator updates the canonical list) ─
  async function handleInvite(hashes: string[]) {
    if (!event || !me || hashes.length === 0) { setPicking(false); return; }
    setBusy(true); setError(null);
    try {
      const isCreator = event.createdBy === me.contactHash;
      let next = event;
      if (isCreator) {
        const invitees = [...new Set([...event.invitees, ...hashes])];
        next = { ...event, invitees, lastUpdatedBy: me.contactHash, updatedAt: new Date().toISOString() };
        await putEvent(next);
        setEvent(next);
      }
      // Send a fresh invite to each newly-added contact so they materialise
      // the event locally, then sync the (possibly new) invitee list to all.
      const invitePayload = eventToInvitePayload(next);
      await Promise.allSettled(hashes.map((h) => sendEventInvite(h, invitePayload)));
      if (isCreator) await broadcast(next);
      setPicking(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  // ── Cancel (creator) ───────────────────────────────────────────────
  async function handleCancelEvent() {
    if (!event || !me) return;
    if (!window.confirm(t('events.cancelConfirm', 'Cancel this event for everyone? Invitees will be notified.'))) return;
    setBusy(true); setError(null);
    try {
      const next: CommEvent = { ...event, canceled: true, lastUpdatedBy: me.contactHash, updatedAt: new Date().toISOString() };
      await putEvent(next);
      setEvent(next);
      await cancelEventReminder(next.id);
      const recips = recipientsOf(next, me.contactHash);
      await Promise.allSettled(recips.map((h) => sendEventCancel(h, { eventId: next.id })));
      await broadcast(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function handleDeleteLocal() {
    if (!event) return;
    if (!window.confirm(t('events.deleteConfirm', 'Remove this event from your device?'))) return;
    await deleteEvent(event.id);
    onBack();
  }

  // ── Propose new time/place (invitees) ──────────────────────────────
  async function handlePropose(input: { startAt?: string; location?: string; note?: string }) {
    if (!event || !me) return;
    setBusy(true); setError(null);
    try {
      const proposal: EventProposal = {
        id: newProposalId(),
        fromHash: me.contactHash,
        fromName: me.displayName || t('events.you'),
        proposedStartAt: input.startAt,
        proposedLocation: input.location,
        note: input.note,
        ts: new Date().toISOString(),
        status: 'open',
      };
      const next = await addProposalToEvent(event.id, proposal);
      if (next) setEvent(next);
      await Promise.allSettled(
        recipientsOf(event, me.contactHash).map((h) => sendEventProposal(h, { eventId: event.id, proposal })),
      );
      setProposing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  async function handleResolveProposal(p: EventProposal, accept: boolean) {
    if (!event || !me) return;
    setBusy(true); setError(null);
    try {
      let next = await resolveProposal(event.id, p.id, accept ? 'accepted' : 'declined');
      if (next && accept) {
        // Apply the proposed time / place to the event itself.
        next = {
          ...next,
          startAt: p.proposedStartAt ?? next.startAt,
          endAt: p.proposedEndAt ?? next.endAt,
          location: p.proposedLocation ?? next.location,
          lastUpdatedBy: me.contactHash,
          updatedAt: new Date().toISOString(),
        };
        await putEvent(next);
      }
      if (next) { setEvent(next); await broadcast(next); }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  // ── In-event notes ─────────────────────────────────────────────────
  async function handleSendNote(text: string) {
    if (!event || !me || !text.trim()) return;
    const note: EventNote = {
      id: newNoteId(),
      eventId: event.id,
      fromHash: me.contactHash,
      fromName: me.displayName || t('events.you'),
      text: text.trim(),
      ts: new Date().toISOString(),
    };
    await addEventNote(note);
    setNotes((ns) => [...ns, note]);
    await Promise.allSettled(
      recipientsOf(event, me.contactHash).map((h) =>
        sendEventNote(h, { eventId: event.id, noteId: note.id, fromHash: me.contactHash, fromName: note.fromName, text: note.text, ts: note.ts })),
    );
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

  const isCreator = me?.contactHash === event.createdBy;
  const start = new Date(event.startAt);
  const dateLabel = start.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeLabel = event.allDay ? t('events.allDay') : start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const upcoming = !event.canceled && start.getTime() > Date.now();

  const goingHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'going').map(([h]) => h);
  const maybeHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'maybe').map(([h]) => h);
  const declinedHashes = Object.entries(event.rsvps).filter(([, s]) => s === 'declined').map(([h]) => h);
  const pendingHashes = event.invitees.filter((h) => !event.rsvps[h]);

  const openProposals = (event.proposals ?? []).filter((p) => p.status === 'open');
  const resolvedProposals = (event.proposals ?? []).filter((p) => p.status !== 'open');

  return (
    <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">← {t('common.back')}</button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">{t('events.event')}</h1>
        <span className="w-12" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-8 text-center" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-2"
               style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-accent-dark)' }}>
            <Ico name={EVENT_TYPE_ICONS[event.eventType] as IcoName} size={32} />
          </div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            {t(EVENT_TYPE_LABELS[event.eventType])}
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{event.title}</h2>
          {event.canceled && (
            <div className="mt-2 inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                 style={{ backgroundColor: 'var(--color-red-dim, rgba(231,76,60,0.12))', color: 'var(--color-red)' }}>
              {t('events.canceledTag', 'Canceled')}
            </div>
          )}
          <p className="mt-3 text-sm text-[var(--color-text-body)]">{dateLabel} · {timeLabel}</p>
          {event.location && <p className="mt-1 text-sm text-[var(--color-text-muted)]">{event.location}</p>}
          {event.geo && (
            <a
              href={`geo:${event.geo.lat},${event.geo.lng}?q=${event.geo.lat},${event.geo.lng}${event.location ? `(${encodeURIComponent(event.location)})` : ''}`}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              <Ico name="mapPin" size={14} color="var(--color-accent)" />
              {t('events.openInMaps', 'Open in maps')}
              <span className="font-mono text-xs text-[var(--color-text-faint)]">
                {event.geo.lat.toFixed(4)}, {event.geo.lng.toFixed(4)}
              </span>
            </a>
          )}
          {event.lastUpdatedBy && event.lastUpdatedBy !== event.createdBy && (
            <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
              {t('events.updatedBy', { name: contacts.get(event.lastUpdatedBy)?.displayName ?? t('events.someone', 'someone') })}
            </p>
          )}
        </div>

        {/* Action bar */}
        {!event.canceled && (
          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-[var(--color-border-soft)]">
            {isCreator && <ActionChip icon="edit" label={t('events.edit', 'Edit')} onClick={() => setEditing(true)} />}
            <ActionChip icon="users" label={isCreator ? t('events.addPeople', 'Add people') : t('events.forward', 'Forward')} onClick={() => setPicking(true)} />
            {!isCreator && <ActionChip icon="calendar" label={t('events.propose', 'Propose time/place')} onClick={() => setProposing(true)} />}
            {isCreator && <ActionChip icon="flag" label={t('events.cancelEvent', 'Cancel event')} danger onClick={() => void handleCancelEvent()} />}
          </div>
        )}
        {event.canceled && (
          <div className="px-5 py-3 border-b border-[var(--color-border-soft)]">
            <ActionChip icon="flag" label={t('events.removeLocal', 'Remove from my device')} danger onClick={() => void handleDeleteLocal()} />
          </div>
        )}

        {event.description && (
          <div className="px-5 py-4 border-b border-[var(--color-border-soft)]">
            <p className="text-sm text-[var(--color-text-body)] whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        {!isCreator && !event.canceled && (
          <div className="px-5 py-5 border-b border-[var(--color-border-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">{t('events.yourRsvp')}</p>
            <div className="flex gap-2">
              <RsvpButton label={t('events.rsvpGoing')} active={event.myStatus === 'going'} onClick={() => void handleRsvp('going')} disabled={busy} />
              <RsvpButton label={t('events.rsvpMaybe')} active={event.myStatus === 'maybe'} onClick={() => void handleRsvp('maybe')} disabled={busy} />
              <RsvpButton label={t('events.rsvpCantGo')} active={event.myStatus === 'declined'} onClick={() => void handleRsvp('declined')} disabled={busy} />
            </div>
            {error && <p className="mt-2 text-xs text-[var(--color-red)]">{error}</p>}
          </div>
        )}

        {/* Proposals */}
        {(openProposals.length > 0 || resolvedProposals.length > 0) && (
          <div className="px-5 py-5 border-b border-[var(--color-border-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">{t('events.proposals', 'Suggestions')}</p>
            <div className="space-y-2">
              {openProposals.map((p) => (
                <ProposalCard key={p.id} p={p} t={t} isCreator={isCreator} busy={busy}
                  onAccept={() => void handleResolveProposal(p, true)}
                  onDecline={() => void handleResolveProposal(p, false)} />
              ))}
              {resolvedProposals.map((p) => (
                <ProposalCard key={p.id} p={p} t={t} isCreator={false} busy={busy} onAccept={() => {}} onDecline={() => {}} />
              ))}
            </div>
          </div>
        )}

        {upcoming && (
          <div className="px-5 py-5 border-b border-[var(--color-border-soft)]">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">{t('events.reminder')}</p>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((opt) => {
                const active = (event.reminderMinutesBefore ?? null) === opt.value;
                return (
                  <button key={opt.label} onClick={() => void handleSetReminder(opt.value)} aria-pressed={active}
                    className="px-3 py-1.5 rounded-full text-[13px] font-medium border"
                    style={{ borderColor: active ? 'var(--color-accent)' : 'var(--color-border-soft)',
                             backgroundColor: active ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                             color: active ? 'var(--color-accent-dark)' : 'var(--color-text)' }}>
                    {t(opt.label)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              {event.reminderMinutesBefore ? t('events.reminderSet', { lead: formatLead(event.reminderMinutesBefore, t) }) : t('events.reminderUnset')}
            </p>
          </div>
        )}

        {/* Attendees */}
        <div className="px-5 py-5 border-b border-[var(--color-border-soft)]">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">{t('events.attendees')}</p>
          <AttendeeSection title={t('events.attGoing')} hashes={goingHashes} contacts={contacts} color="green" me={me?.contactHash} />
          {maybeHashes.length > 0 && <AttendeeSection title={t('events.attMaybe')} hashes={maybeHashes} contacts={contacts} color="gold" me={me?.contactHash} />}
          {declinedHashes.length > 0 && <AttendeeSection title={t('events.attCantGo')} hashes={declinedHashes} contacts={contacts} color="muted" me={me?.contactHash} />}
          {pendingHashes.length > 0 && <AttendeeSection title={t('events.attNoReply')} hashes={pendingHashes} contacts={contacts} color="faint" me={me?.contactHash} />}
        </div>

        {/* Notes / discussion */}
        <NotesSection notes={notes} contacts={contacts} me={me?.contactHash} t={t} onSend={handleSendNote} />
      </div>

      {editing && <EditModal event={event} t={t} busy={busy} onCancel={() => setEditing(false)} onSave={handleEditSave} />}
      {picking && (
        <ContactPickerModal t={t} busy={busy}
          title={isCreator ? t('events.addPeople', 'Add people') : t('events.forward', 'Forward')}
          contacts={[...contacts.values()].filter((c) => !event.invitees.includes(c.contactHash) && c.contactHash !== me?.contactHash)}
          onCancel={() => setPicking(false)} onConfirm={handleInvite} />
      )}
      {proposing && <ProposeModal event={event} t={t} busy={busy} onCancel={() => setProposing(false)} onSubmit={handlePropose} />}
    </section>
  );
}

// ── Reminder presets ──────────────────────────────────────────────────
const REMINDER_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'events.reminderOff', value: null },
  { label: 'events.reminder5', value: 5 },
  { label: 'events.reminder15', value: 15 },
  { label: 'events.reminder30', value: 30 },
  { label: 'events.reminder1h', value: 60 },
  { label: 'events.reminder1d', value: 60 * 24 },
];
function formatLead(min: number, t: TFunction): string {
  if (min < 60) return t('events.leadMin', { n: min });
  if (min < 60 * 24) return t('events.leadHr', { n: Math.round(min / 60) });
  return t('events.leadDay', { n: Math.round(min / (60 * 24)) });
}

// ── Small presentational pieces ───────────────────────────────────────
function ActionChip({ icon, label, onClick, danger }: { icon: IcoName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border"
      style={{ borderColor: danger ? 'var(--color-red)' : 'var(--color-border)',
               backgroundColor: 'var(--color-surface)', color: danger ? 'var(--color-red)' : 'var(--color-text)' }}>
      <Ico name={icon} size={15} /> {label}
    </button>
  );
}

function RsvpButton({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex-1 py-3 rounded-xl text-sm font-medium border disabled:opacity-50"
      style={{ backgroundColor: active ? 'var(--color-accent)' : 'var(--color-surface)',
               color: active ? 'var(--color-accent-fg)' : 'var(--color-text)',
               borderColor: active ? 'var(--color-accent)' : 'var(--color-border)' }}>
      {label}
    </button>
  );
}

function AttendeeSection({ title, hashes, contacts, color, me }: {
  title: string; hashes: string[]; contacts: Map<string, Contact>; color: 'green' | 'gold' | 'muted' | 'faint'; me?: string;
}) {
  const { t } = useTranslation();
  const colors = { green: 'var(--color-green)', gold: 'var(--color-gold)', muted: 'var(--color-text-muted)', faint: 'var(--color-text-faint)' };
  return (
    <div className="mb-4">
      <p className="text-xs font-medium" style={{ color: colors[color] }}>{title} · {hashes.length}</p>
      <ul className="mt-1.5 space-y-1">
        {hashes.map((h) => {
          const c = contacts.get(h);
          const label = h === me ? t('events.you') : (c?.displayName ?? h);
          return (
            <li key={h} className="flex items-center gap-2 text-sm text-[var(--color-text-body)]">
              <AvatarCircle name={label} avatarImage={c?.avatarImage} avatarMime={c?.avatarMime} size={24} />
              <span className="truncate">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProposalCard({ p, t, isCreator, busy, onAccept, onDecline }: {
  p: EventProposal; t: TFunction; isCreator: boolean; busy: boolean; onAccept: () => void; onDecline: () => void;
}) {
  const when = p.proposedStartAt ? new Date(p.proposedStartAt).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor: 'var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">{p.fromName}</span>
        {p.status !== 'open' && (
          <span className="text-[11px] font-semibold" style={{ color: p.status === 'accepted' ? 'var(--color-green)' : 'var(--color-text-faint)' }}>
            {p.status === 'accepted' ? t('events.proposalAccepted', 'Accepted') : t('events.proposalDeclined', 'Declined')}
          </span>
        )}
      </div>
      {when && <p className="mt-1 text-sm text-[var(--color-text-body)]">🕑 {when}</p>}
      {p.proposedLocation && <p className="mt-0.5 text-sm text-[var(--color-text-body)]">📍 {p.proposedLocation}</p>}
      {p.note && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{p.note}</p>}
      {isCreator && p.status === 'open' && (
        <div className="mt-2 flex gap-2">
          <button onClick={onAccept} disabled={busy} className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
            {t('events.proposalAccept', 'Accept')}
          </button>
          <button onClick={onDecline} disabled={busy} className="flex-1 py-2 rounded-lg text-sm font-semibold border disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            {t('events.proposalDecline', 'Decline')}
          </button>
        </div>
      )}
    </div>
  );
}

function NotesSection({ notes, contacts, me, t, onSend }: {
  notes: EventNote[]; contacts: Map<string, Contact>; me?: string; t: TFunction; onSend: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setDraft('');
    try { await onSend(text); } finally { setSending(false); }
  }
  return (
    <div className="px-5 py-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">{t('events.notes', 'Planning notes')}</p>
      {notes.length === 0 ? (
        <p className="text-xs text-[var(--color-text-faint)] mb-3">{t('events.notesEmpty', 'No notes yet. Start the conversation.')}</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {notes.map((n) => {
            const mine = n.fromHash === me;
            const name = mine ? t('events.you') : (contacts.get(n.fromHash)?.displayName ?? n.fromName);
            return (
              <li key={n.id} className="flex flex-col rounded-xl px-3 py-2"
                  style={{ backgroundColor: mine ? 'var(--color-accent-soft)' : 'var(--color-surface)', border: '1px solid var(--color-border-soft)' }}>
                <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">{name}</span>
                <span className="text-sm text-[var(--color-text-body)] whitespace-pre-wrap break-words">{n.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
          placeholder={t('events.notePlaceholder', 'Add a note…')}
          className="flex-1 px-3 py-2 rounded-xl border resize-none text-sm bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]" />
        <button onClick={() => void submit()} disabled={sending || !draft.trim()}
          className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
          {t('events.noteSend', 'Send')}
        </button>
      </div>
    </div>
  );
}

// ── Modals ────────────────────────────────────────────────────────────
function ModalShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onCancel}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 safe-bottom max-h-[85vh] overflow-y-auto"
           style={{ backgroundColor: 'var(--color-bg)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[var(--color-text)] mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function EditModal({ event, t, busy, onCancel, onSave }: {
  event: CommEvent; t: TFunction; busy: boolean; onCancel: () => void;
  onSave: (p: Pick<CommEvent, 'title' | 'startAt' | 'allDay' | 'location' | 'description'>) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [when, setWhen] = useState(isoToLocalInput(event.startAt));
  const [allDay, setAllDay] = useState(event.allDay);
  const [location, setLocation] = useState(event.location ?? '');
  const [description, setDescription] = useState(event.description ?? '');
  return (
    <ModalShell title={t('events.editTitle', 'Edit event')} onCancel={onCancel}>
      <Labeled label={t('events.fieldTitle', 'Title')}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </Labeled>
      <Labeled label={t('events.fieldWhen', 'When')}>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
      </Labeled>
      <label className="flex items-center gap-2 mb-3 text-sm text-[var(--color-text)]">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> {t('events.allDay')}
      </label>
      <Labeled label={t('events.fieldLocation', 'Location')}>
        <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
      </Labeled>
      <Labeled label={t('events.fieldDescription', 'Description')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
      </Labeled>
      <ModalButtons t={t} busy={busy} onCancel={onCancel}
        onConfirm={() => onSave({ title: title.trim() || event.title, startAt: localInputToIso(when), allDay, location: location.trim() || undefined, description: description.trim() || undefined })}
        confirmLabel={t('events.save', 'Save')} />
    </ModalShell>
  );
}

function ContactPickerModal({ title, contacts, t, busy, onCancel, onConfirm }: {
  title: string; contacts: Contact[]; t: TFunction; busy: boolean; onCancel: () => void; onConfirm: (hashes: string[]) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  function toggle(h: string) { setSel((s) => { const n = new Set(s); n.has(h) ? n.delete(h) : n.add(h); return n; }); }
  return (
    <ModalShell title={title} onCancel={onCancel}>
      {contacts.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] mb-4">{t('events.noMoreContacts', 'No more contacts to add.')}</p>
      ) : (
        <ul className="space-y-1 mb-4">
          {contacts.map((c) => {
            const on = sel.has(c.contactHash);
            return (
              <li key={c.contactHash}>
                <button onClick={() => toggle(c.contactHash)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left"
                  style={{ borderColor: on ? 'var(--color-accent)' : 'var(--color-border-soft)', backgroundColor: on ? 'var(--color-accent-soft)' : 'var(--color-surface)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                       style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}>
                    {c.displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm text-[var(--color-text)] truncate">{c.displayName}</span>
                  {on && <Ico name="check" size={18} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ModalButtons t={t} busy={busy} onCancel={onCancel} onConfirm={() => onConfirm([...sel])}
        confirmDisabled={sel.size === 0} confirmLabel={t('events.invite', 'Invite')} />
    </ModalShell>
  );
}

function ProposeModal({ event, t, busy, onCancel, onSubmit }: {
  event: CommEvent; t: TFunction; busy: boolean; onCancel: () => void;
  onSubmit: (input: { startAt?: string; location?: string; note?: string }) => void;
}) {
  const [when, setWhen] = useState(isoToLocalInput(event.startAt));
  const [changeTime, setChangeTime] = useState(true);
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  return (
    <ModalShell title={t('events.proposeTitle', 'Propose a change')} onCancel={onCancel}>
      <label className="flex items-center gap-2 mb-2 text-sm text-[var(--color-text)]">
        <input type="checkbox" checked={changeTime} onChange={(e) => setChangeTime(e.target.checked)} /> {t('events.proposeNewTime', 'Suggest a new time')}
      </label>
      {changeTime && (
        <Labeled label={t('events.fieldWhen', 'When')}>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={inputCls} />
        </Labeled>
      )}
      <Labeled label={t('events.proposeNewPlace', 'Suggest a place (optional)')}>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={event.location ?? ''} className={inputCls} />
      </Labeled>
      <Labeled label={t('events.proposeNote', 'Note (optional)')}>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
      </Labeled>
      <ModalButtons t={t} busy={busy} onCancel={onCancel}
        onConfirm={() => onSubmit({ startAt: changeTime ? localInputToIso(when) : undefined, location: location.trim() || undefined, note: note.trim() || undefined })}
        confirmDisabled={!changeTime && !location.trim() && !note.trim()} confirmLabel={t('events.proposeSend', 'Send suggestion')} />
    </ModalShell>
  );
}

const inputCls = 'w-full px-3 py-2.5 rounded-lg border text-base bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]';
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-1 block">{label}</span>
      {children}
    </label>
  );
}
function ModalButtons({ t, busy, onCancel, onConfirm, confirmLabel, confirmDisabled }: {
  t: TFunction; busy: boolean; onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2 mt-2">
      <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-semibold border"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
        {t('common.cancel')}
      </button>
      <button onClick={onConfirm} disabled={busy || confirmDisabled}
        className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
        {confirmLabel}
      </button>
    </div>
  );
}
