/**
 * Tests for the offline message queue (offline.ts) — the persistence layer
 * the C3 reconnect-drain relies on. Verifies enqueue / read / per-item remove
 * / clear semantics against localStorage (jsdom).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { queueMessage, getQueue, removeFromQueue, clearQueue, type QueuedMessage } from '../offline';

function mk(id: string, message = 'hi'): QueuedMessage {
  return { id, orgId: 'org1', sessionId: null, message, timestamp: Date.now() };
}

describe('offline message queue', () => {
  beforeEach(() => { localStorage.clear(); });

  it('starts empty', () => {
    expect(getQueue()).toEqual([]);
  });

  it('enqueues in order and reads back', () => {
    queueMessage(mk('a'));
    queueMessage(mk('b'));
    const q = getQueue();
    expect(q.map(m => m.id)).toEqual(['a', 'b']);
  });

  it('removes a single item by id, leaving the rest', () => {
    queueMessage(mk('a'));
    queueMessage(mk('b'));
    queueMessage(mk('c'));
    removeFromQueue('b');
    expect(getQueue().map(m => m.id)).toEqual(['a', 'c']);
  });

  it('clearQueue empties everything', () => {
    queueMessage(mk('a'));
    clearQueue();
    expect(getQueue()).toEqual([]);
  });

  it('simulates a full drain: each delivered item is removed', () => {
    queueMessage(mk('a'));
    queueMessage(mk('b'));
    // Drain loop mirrors useOfflineQueueFlush: iterate, deliver, remove.
    for (const msg of getQueue()) {
      removeFromQueue(msg.id);
    }
    expect(getQueue()).toEqual([]);
  });

  it('keeps later items queued when drain stops early on failure', () => {
    queueMessage(mk('a'));
    queueMessage(mk('b'));
    queueMessage(mk('c'));
    // Deliver 'a', then 'b' "fails" → stop. 'b' and 'c' remain.
    const queue = getQueue();
    for (const msg of queue) {
      const delivered = msg.id === 'a';
      if (delivered) removeFromQueue(msg.id);
      else break;
    }
    expect(getQueue().map(m => m.id)).toEqual(['b', 'c']);
  });
});
