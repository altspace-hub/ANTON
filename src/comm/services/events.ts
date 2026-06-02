/**
 * events.ts — Local social events for the Comm App.
 *
 * Events live entirely on-device. Invitations + RSVPs travel over the
 * existing E2E chat layer as structured messages (kind='event_invite' /
 * 'event_rsvp' / 'event_update' / 'event_cancel'). No server, no central
 * directory — each device holds its own copy of every event it created
 * or was invited to, plus the RSVP states it has heard about.
 *
 * Schema (object store 'events' in DB anton-comm, version 3):
 *   {
 *     id: string,            // ULID — creator-assigned, globally unique
 *     createdBy: string,     // contact hash of the creator
 *     title: string,
 *     eventType: EventType,
 *     startAt: string,       // ISO
 *     endAt?: string,        // ISO; optional
 *     allDay: boolean,
 *     location?: string,
 *     description?: string,
 *     invitees: string[],    // contact hashes
 *     rsvps: Record<string, RsvpStatus>,   // hash -> status
 *     myStatus: RsvpStatus,  // this device's RSVP (defaults to 'pending')
 *     createdAt: string,
 *     updatedAt: string,
 *     canceled: boolean,
 *   }
 */

import { openDb, STORE_EVENTS } from './db';

export type EventType =
  | 'dinner'
  | 'drinks'
  | 'concert'
  | 'travel'
  | 'party'
  | 'birthday'
  // B4 — additional types that reuse existing glyphs
  | 'meeting'
  | 'coffee'
  | 'sport'
  | 'game-night'
  | 'movie'
  | 'study'
  | 'wedding'
  // B5 — additional types with purpose-built glyphs.
  // NB: payment-reminder is calendar-only — it does NOT link a real
  // FutureChain transfer; it's just a reminder chip.
  | 'deadline'
  | 'payment-reminder'
  | 'gift'
  | 'appointment'
  | 'other';

// i18n keys — resolve with t() at the call site.
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  dinner: 'events.typeDinner',
  drinks: 'events.typeDrinks',
  concert: 'events.typeConcert',
  travel: 'events.typeTravel',
  party: 'events.typeParty',
  birthday: 'events.typeBirthday',
  meeting: 'events.typeMeeting',
  coffee: 'events.typeCoffee',
  sport: 'events.typeSport',
  'game-night': 'events.typeGameNight',
  movie: 'events.typeMovie',
  study: 'events.typeStudy',
  wedding: 'events.typeWedding',
  deadline: 'events.typeDeadline',
  'payment-reminder': 'events.typePaymentReminder',
  gift: 'events.typeGift',
  appointment: 'events.typeAppointment',
  other: 'events.typeOther',
};

/** Ico names — see components/Ico.tsx. Avoid emoji so glyphs render
 *  consistently across Android / iOS / web. */
export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  dinner: 'dinner',
  drinks: 'drinks',
  concert: 'concert',
  travel: 'travel',
  party: 'party',
  birthday: 'birthday',
  // B4 — reuse existing glyphs
  meeting: 'users',
  coffee: 'drinks',
  sport: 'sparkles',
  'game-night': 'grid',
  movie: 'video',
  study: 'message',
  wedding: 'sparkles',
  // B5 — new purpose-built glyphs
  deadline: 'flag',
  'payment-reminder': 'banknote',
  gift: 'gift',
  appointment: 'appointment',
  other: 'calendar',
};

export type RsvpStatus = 'pending' | 'going' | 'maybe' | 'declined';

export interface CommEvent {
  id: string;
  createdBy: string;
  title: string;
  eventType: EventType;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  invitees: string[];
  rsvps: Record<string, RsvpStatus>;
  myStatus: RsvpStatus;
  createdAt: string;
  updatedAt: string;
  canceled: boolean;
  /** R11 — minutes before startAt to fire a local notification.
   *  undefined/null = no reminder. */
  reminderMinutesBefore?: number | null;
}

// ── ID generation (ULID-ish) ─────────────────────────────────────────

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateEventId(): string {
  const ts = Date.now();
  let prefix = '';
  let n = ts;
  for (let i = 0; i < 10; i++) {
    prefix = CHARS[n & 31] + prefix;
    n = Math.floor(n / 32);
  }
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  let suffix = '';
  for (let i = 0; i < 10; i++) suffix += CHARS[rnd[i] & 31];
  return prefix + suffix;
}

// ── CRUD ─────────────────────────────────────────────────────────────

export async function listEvents(): Promise<CommEvent[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, 'readonly');
    const req = tx.objectStore(STORE_EVENTS).getAll();
    req.onsuccess = () => {
      const rows = (req.result as CommEvent[]) ?? [];
      rows.sort((a, b) => a.startAt.localeCompare(b.startAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getEvent(id: string): Promise<CommEvent | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, 'readonly');
    const req = tx.objectStore(STORE_EVENTS).get(id);
    req.onsuccess = () => resolve((req.result as CommEvent | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putEvent(event: CommEvent): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, 'readwrite');
    tx.objectStore(STORE_EVENTS).put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteEvent(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, 'readwrite');
    tx.objectStore(STORE_EVENTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── High-level operations ────────────────────────────────────────────

/**
 * Create a new event locally with the creator marked as 'going'. The
 * caller is then responsible for sending event_invite messages to each
 * invitee via chat.ts §sendEventInvite.
 */
export async function createLocalEvent(
  input: Omit<CommEvent, 'id' | 'rsvps' | 'myStatus' | 'createdAt' | 'updatedAt' | 'canceled'>,
): Promise<CommEvent> {
  const now = new Date().toISOString();
  const event: CommEvent = {
    ...input,
    id: generateEventId(),
    rsvps: { [input.createdBy]: 'going' },
    myStatus: 'going',
    createdAt: now,
    updatedAt: now,
    canceled: false,
  };
  await putEvent(event);
  return event;
}

/**
 * Apply an inbound event_invite from a peer. If the event already exists
 * (e.g. duplicate invite or update), merge; otherwise create with the
 * recipient's myStatus = 'pending'.
 */
export async function applyInboundInvite(
  payload: EventInvitePayload,
  fromHash: string,
): Promise<CommEvent> {
  const existing = await getEvent(payload.id);
  const now = new Date().toISOString();
  const merged: CommEvent = existing
    ? {
        ...existing,
        title: payload.title,
        eventType: payload.eventType,
        startAt: payload.startAt,
        endAt: payload.endAt,
        allDay: payload.allDay,
        location: payload.location,
        description: payload.description,
        invitees: payload.invitees,
        updatedAt: now,
      }
    : {
        id: payload.id,
        createdBy: fromHash,
        title: payload.title,
        eventType: payload.eventType,
        startAt: payload.startAt,
        endAt: payload.endAt,
        allDay: payload.allDay,
        location: payload.location,
        description: payload.description,
        invitees: payload.invitees,
        rsvps: { [fromHash]: 'going' },
        myStatus: 'pending',
        createdAt: now,
        updatedAt: now,
        canceled: false,
      };
  await putEvent(merged);
  return merged;
}

/** Apply an inbound RSVP from a peer. Updates `rsvps[fromHash]` only. */
export async function applyInboundRsvp(
  payload: EventRsvpPayload,
  fromHash: string,
): Promise<CommEvent | null> {
  const existing = await getEvent(payload.eventId);
  if (!existing) return null;
  const next: CommEvent = {
    ...existing,
    rsvps: { ...existing.rsvps, [fromHash]: payload.status },
    updatedAt: new Date().toISOString(),
  };
  await putEvent(next);
  return next;
}

/** Set this device's RSVP for an event. Caller sends event_rsvp message to the creator. */
export async function setMyRsvp(eventId: string, status: RsvpStatus): Promise<CommEvent | null> {
  const existing = await getEvent(eventId);
  if (!existing) return null;
  const me = existing.rsvps[existing.createdBy]
    ? existing.createdBy
    : undefined; // we set our own slot in rsvps via myStatus reflection below
  const next: CommEvent = {
    ...existing,
    myStatus: status,
    updatedAt: new Date().toISOString(),
  };
  if (me) void me; // unused; reserved for future "creator-side reflection" logic
  await putEvent(next);
  return next;
}

// ── Wire payloads for chat-layer transport ──────────────────────────

export interface EventInvitePayload {
  id: string;
  title: string;
  eventType: EventType;
  startAt: string;
  endAt?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  invitees: string[];
}

export interface EventRsvpPayload {
  eventId: string;
  status: RsvpStatus;
}

export interface EventCancelPayload {
  eventId: string;
}

export function eventToInvitePayload(event: CommEvent): EventInvitePayload {
  return {
    id: event.id,
    title: event.title,
    eventType: event.eventType,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    location: event.location,
    description: event.description,
    invitees: event.invitees,
  };
}
