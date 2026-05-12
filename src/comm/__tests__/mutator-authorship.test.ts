/**
 * mutator-authorship.test.ts — pins Phase 1's B1+B2 audit fix in place.
 *
 * Every per-message mutator (applyEdit, applyDeleteForEveryone,
 * applyLocationUpdate, markViewed, markReadUpTo) takes an optional
 * expectedOwnerHash / expectedViewerHash / expectedReaderHash guard.
 * Inbound branches in chat.ts pass the relay-stamped `fromHash` so a
 * malicious peer can't rewrite / delete / burn-view another peer's
 * bubble by guessing an id.
 *
 * These tests assert each guard refuses the mismatch (returning null /
 * a no-op count of 0) and accepts the match.
 */
import { describe, it, expect } from 'vitest';
import {
  appendMessage,
  applyEdit,
  applyDeleteForEveryone,
  applyLocationUpdate,
  markViewed,
  markReadUpTo,
  getMessage,
  type ChatMessage,
} from '../services/messages';

const ALICE = 'ANTON-AAAA-AAAA-AAAA-AAAA';
const BOB = 'ANTON-BBBB-BBBB-BBBB-BBBB';
const MALLORY = 'ANTON-MMMM-MMMM-MMMM-MMMM';

// Each test allocates its own threadHash so concurrent cases inside
// the same IDB instance don't read each other's seed rows. The
// afterEach IDB-wipe hook doesn't fire reliably across all
// fake-indexeddb code paths.
let threadCounter = 0;
function uniqueThread(): string {
  threadCounter++;
  return `THREAD-${threadCounter.toString().padStart(6, '0')}`;
}

async function seedText(thread: string, input: Partial<ChatMessage> = {}): Promise<ChatMessage> {
  return appendMessage({
    threadHash: thread,
    fromHash: ALICE,
    toHash: BOB,
    direction: 'out',
    plaintext: 'original text',
    status: 'sent',
    kind: 'text',
    ...input,
  });
}

describe('applyEdit authorship guard', () => {
  it('accepts an edit whose expectedOwnerHash matches the message sender', async () => {
    const msg = await seedText(uniqueThread());
    const updated = await applyEdit(msg.id, 'new text', ALICE);
    expect(updated?.plaintext).toBe('new text');
    const persisted = await getMessage(msg.id);
    expect(persisted?.plaintext).toBe('new text');
  });

  it('refuses an edit whose expectedOwnerHash is not the original sender', async () => {
    const msg = await seedText(uniqueThread());
    const updated = await applyEdit(msg.id, 'tampered', MALLORY);
    expect(updated).toBeNull();
    const persisted = await getMessage(msg.id);
    expect(persisted?.plaintext).toBe('original text');
  });

  it('refuses to edit a non-text kind', async () => {
    const msg = await seedText(uniqueThread(), { kind: 'image', plaintext: '{"data":"..."}' });
    const updated = await applyEdit(msg.id, 'should not apply', ALICE);
    expect(updated).toBeNull();
  });
});

describe('applyDeleteForEveryone authorship guard', () => {
  it('clears plaintext + reactions + replyTo when the owner deletes', async () => {
    const msg = await seedText(uniqueThread(), { reactions: { '👍': [BOB] } });
    const updated = await applyDeleteForEveryone(msg.id, ALICE);
    expect(updated?.deletedForEveryone).toBe(true);
    expect(updated?.plaintext).toBe('');
    expect(updated?.reactions).toBeUndefined();
  });

  it('refuses a delete from someone other than the original sender', async () => {
    const msg = await seedText(uniqueThread());
    const updated = await applyDeleteForEveryone(msg.id, MALLORY);
    expect(updated).toBeNull();
    const persisted = await getMessage(msg.id);
    expect(persisted?.deletedForEveryone).toBeFalsy();
    expect(persisted?.plaintext).toBe('original text');
  });
});

describe('applyLocationUpdate authorship guard', () => {
  async function seedLocation(thread: string): Promise<ChatMessage> {
    return appendMessage({
      threadHash: thread,
      fromHash: ALICE,
      toHash: BOB,
      direction: 'out',
      plaintext: JSON.stringify({ lat: 0, lng: 0, accuracyM: 0, lastUpdateAt: '' }),
      status: 'sent',
      kind: 'location',
    });
  }

  it('updates lat/lng when the live-share parent owner matches', async () => {
    const msg = await seedLocation(uniqueThread());
    const updated = await applyLocationUpdate(msg.id, { lat: 59.3, lng: 18, accuracyM: 10, ts: '2026-05-12T20:00:00Z' }, ALICE);
    const parsed = JSON.parse(updated!.plaintext);
    expect(parsed.lat).toBe(59.3);
    expect(parsed.accuracyM).toBe(10);
  });

  it('refuses to update someone else\'s live share', async () => {
    const msg = await seedLocation(uniqueThread());
    const updated = await applyLocationUpdate(msg.id, { lat: 100, lng: 100, accuracyM: 1, ts: '2026-05-12T20:00:00Z' }, MALLORY);
    expect(updated).toBeNull();
    const persisted = await getMessage(msg.id);
    const parsed = JSON.parse(persisted!.plaintext);
    expect(parsed.lat).toBe(0);
  });
});

describe('markViewed authorship guard', () => {
  async function seedViewOnceFromAliceToBob(thread: string): Promise<ChatMessage> {
    return appendMessage({
      threadHash: thread,
      fromHash: ALICE,
      toHash: BOB,
      direction: 'out',
      plaintext: JSON.stringify({ data: 'imgdata', mimeType: 'image/png' }),
      status: 'sent',
      kind: 'image',
    });
  }

  it('marks viewed when the recipient hash matches toHash', async () => {
    const msg = await seedViewOnceFromAliceToBob(uniqueThread());
    const updated = await markViewed(msg.id, BOB);
    expect(updated?.viewed).toBe(true);
  });

  it('refuses when the claimed viewer is not the recipient', async () => {
    const msg = await seedViewOnceFromAliceToBob(uniqueThread());
    const updated = await markViewed(msg.id, MALLORY);
    expect(updated).toBeNull();
    const persisted = await getMessage(msg.id);
    expect(persisted?.viewed).toBeFalsy();
  });
});

describe('markReadUpTo authorship guard', () => {
  it('flips outbound rows when the reader hash matches toHash', async () => {
    const thread = uniqueThread();
    const m1 = await seedText(thread, { status: 'sent' });
    const flipped = await markReadUpTo(thread, m1.id, BOB);
    expect(flipped).toBe(1);
    const persisted = await getMessage(m1.id);
    expect(persisted?.status).toBe('read');
  });

  it('refuses to flip rows when reader hash mismatches toHash', async () => {
    const thread = uniqueThread();
    const m1 = await seedText(thread, { status: 'sent' });
    const flipped = await markReadUpTo(thread, m1.id, MALLORY);
    expect(flipped).toBe(0);
    const persisted = await getMessage(m1.id);
    expect(persisted?.status).toBe('sent');
  });
});
