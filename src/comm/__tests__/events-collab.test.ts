/**
 * events-collab.test.ts — inbound apply-paths for the event-collaboration
 * wires (#81): event_update (amend / add participants), event_proposal
 * (time/place counter-offer), event_note (in-event discussion).
 *
 * These mirror the anti-spoof + create-or-merge guarantees the dispatch
 * switch relies on. Each test uses a fresh event id so cases don't collide.
 */
import { describe, it, expect } from 'vitest';
import {
  createLocalEvent,
  getEvent,
  applyInboundUpdate,
  applyInboundProposal,
  applyInboundEventNote,
  addProposalToEvent,
  resolveProposal,
  listEventNotes,
  newProposalId,
  newNoteId,
  type EventUpdatePayload,
  type EventProposal,
} from '../services/events';

const ALICE = 'ANTON-AAAA-AAAA-AAAA-AAAA';
const BOB = 'ANTON-BBBB-BBBB-BBBB-BBBB';
const MALLORY = 'ANTON-MMMM-MMMM-MMMM-MMMM';

function updatePayload(id: string, over: Partial<EventUpdatePayload> = {}): EventUpdatePayload {
  return {
    id,
    title: 'Dinner',
    eventType: 'dinner',
    startAt: '2026-07-01T18:00:00.000Z',
    allDay: false,
    invitees: [ALICE, BOB],
    updatedBy: ALICE,
    ...over,
  };
}

function proposal(over: Partial<EventProposal> = {}): EventProposal {
  return {
    id: newProposalId(),
    fromHash: BOB,
    fromName: 'Bob',
    proposedStartAt: '2026-07-02T19:00:00.000Z',
    note: 'a day later works better',
    ts: new Date().toISOString(),
    status: 'open',
    ...over,
  };
}

describe('applyInboundUpdate (event_update)', () => {
  it('creates the event locally for a late-added participant', async () => {
    const id = 'EVT' + newNoteId();
    const ev = await applyInboundUpdate(updatePayload(id, { title: 'Surprise party' }), ALICE);
    expect(ev.title).toBe('Surprise party');
    expect(ev.createdBy).toBe(ALICE);
    expect(ev.myStatus).toBe('pending'); // we were just added
    expect(ev.lastUpdatedBy).toBe(ALICE);
  });

  it('merges an amend without clobbering my own RSVP', async () => {
    const created = await createLocalEvent({
      createdBy: BOB, title: 'Old', eventType: 'dinner',
      startAt: '2026-07-01T18:00:00.000Z', allDay: false, invitees: [BOB],
    });
    // I (this device) am the creator here; set a distinctive myStatus first.
    const ev0 = await getEvent(created.id);
    expect(ev0?.myStatus).toBe('going');
    const ev = await applyInboundUpdate(
      updatePayload(created.id, { title: 'New title', startAt: '2026-07-05T20:00:00.000Z', invitees: [BOB, ALICE] }),
      BOB,
    );
    expect(ev.title).toBe('New title');
    expect(ev.startAt).toBe('2026-07-05T20:00:00.000Z');
    expect(ev.invitees).toContain(ALICE);
    expect(ev.myStatus).toBe('going'); // preserved
  });

  it('carries proposals through and keeps resolved statuses sticky', async () => {
    const id = 'EVT' + newNoteId();
    const p = proposal({ status: 'accepted' });
    await applyInboundUpdate(updatePayload(id, { proposals: [p] }), ALICE);
    // A later 'open' copy of the same proposal must not un-resolve it.
    const ev = await applyInboundUpdate(updatePayload(id, { proposals: [{ ...p, status: 'open' }] }), ALICE);
    expect(ev.proposals?.find((x) => x.id === p.id)?.status).toBe('accepted');
  });
});

describe('applyInboundProposal (event_proposal)', () => {
  it('appends a proposal and anti-spoofs the proposer hash', async () => {
    const created = await createLocalEvent({
      createdBy: ALICE, title: 'Trip', eventType: 'travel',
      startAt: '2026-08-01T08:00:00.000Z', allDay: false, invitees: [ALICE, BOB],
    });
    // Mallory sends a proposal but claims fromHash=BOB; the relay-stamped
    // sender (MALLORY) must win.
    const ev = await applyInboundProposal(
      { eventId: created.id, proposal: proposal({ fromHash: BOB }) },
      MALLORY,
    );
    expect(ev?.proposals?.length).toBe(1);
    expect(ev?.proposals?.[0].fromHash).toBe(MALLORY);
  });

  it('resolveProposal flips the creator-side status', async () => {
    const created = await createLocalEvent({
      createdBy: ALICE, title: 'Trip', eventType: 'travel',
      startAt: '2026-08-01T08:00:00.000Z', allDay: false, invitees: [ALICE, BOB],
    });
    const p = proposal();
    await addProposalToEvent(created.id, p);
    const ev = await resolveProposal(created.id, p.id, 'declined');
    expect(ev?.proposals?.find((x) => x.id === p.id)?.status).toBe('declined');
  });
});

describe('applyInboundEventNote (event_note)', () => {
  it('stores a note under its event and anti-spoofs the author', async () => {
    const eventId = 'EVT' + newNoteId();
    const noteId = newNoteId();
    await applyInboundEventNote(
      { eventId, noteId, fromHash: BOB, fromName: 'Bob', text: 'who brings dessert?', ts: new Date().toISOString() },
      BOB,
    );
    const notes = await listEventNotes(eventId);
    expect(notes.length).toBe(1);
    expect(notes[0].text).toBe('who brings dessert?');
    expect(notes[0].fromHash).toBe(BOB);
  });

  it('orders notes chronologically by ts', async () => {
    const eventId = 'EVT' + newNoteId();
    await applyInboundEventNote({ eventId, noteId: newNoteId(), fromHash: BOB, fromName: 'Bob', text: 'second', ts: '2026-07-01T10:00:00.000Z' }, BOB);
    await applyInboundEventNote({ eventId, noteId: newNoteId(), fromHash: ALICE, fromName: 'Alice', text: 'first', ts: '2026-07-01T09:00:00.000Z' }, ALICE);
    const notes = await listEventNotes(eventId);
    expect(notes.map((n) => n.text)).toEqual(['first', 'second']);
  });
});
