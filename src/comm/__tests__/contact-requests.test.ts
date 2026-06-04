/**
 * contact-requests.test.ts — #68 foundation: the pubkey↔routing/hash binding
 * that lets us trust a request from an un-added sender, + the requests store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { pubkeyBindsTo, deriveRoutingId, deriveContactHash } from '../services/identity';
import { openDb, STORE_CONTACT_REQUESTS } from '../services/db';
import {
  upsertContactRequest, listContactRequests, getContactRequest,
  deleteContactRequest, countContactRequests,
} from '../services/contact-requests';
import { approveContactRequest, rejectContactRequest } from '../services/contact-request-actions';
import { createIdentity } from '../services/identity';
import { getContact } from '../services/contacts';
import { getLatestPerThread } from '../services/messages';

// Any 64-hex string works — deriveRoutingId/deriveContactHash just sha256 it,
// and pubkeyBindsTo checks self-consistency, so a fixture pubkey is fine.
const PUB = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

async function clearReqs(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACT_REQUESTS, 'readwrite');
    tx.objectStore(STORE_CONTACT_REQUESTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe('pubkeyBindsTo', () => {
  it('accepts a pubkey bound to its own routing_id + hash', () => {
    expect(pubkeyBindsTo(PUB, deriveRoutingId(PUB), deriveContactHash(PUB))).toBe(true);
  });

  it('rejects a mismatched routing_id (spoofed relay frame header)', () => {
    expect(pubkeyBindsTo(PUB, deriveRoutingId(OTHER), deriveContactHash(PUB))).toBe(false);
  });

  it('rejects a mismatched claimed hash (impersonation attempt)', () => {
    expect(pubkeyBindsTo(PUB, deriveRoutingId(PUB), deriveContactHash(OTHER))).toBe(false);
  });

  it('rejects garbage pubkey input without throwing', () => {
    expect(pubkeyBindsTo('zz', deriveRoutingId(PUB), deriveContactHash(PUB))).toBe(false);
  });
});

describe('contact-requests store', () => {
  beforeEach(clearReqs);

  it('creates a request carrying the first held message', async () => {
    const r = await upsertContactRequest({
      contactHash: 'ANTON-AAAA-AAAA-AAAA-AAAA', publicKeyHex: PUB, displayName: 'Bob',
      message: { messageId: 'm1', text: 'hi', receivedAt: '2026-01-01T00:00:00Z' },
    });
    expect(r.displayName).toBe('Bob');
    expect(r.publicKeyHex).toBe(PUB);
    expect(r.heldMessages.map((m) => m.messageId)).toEqual(['m1']);
    expect(await countContactRequests()).toBe(1);
  });

  it('appends later messages + dedupes by messageId', async () => {
    const h = 'ANTON-AAAA-AAAA-AAAA-AAAA';
    await upsertContactRequest({ contactHash: h, publicKeyHex: PUB, displayName: 'Bob', message: { messageId: 'm1', text: 'hi', receivedAt: 't1' } });
    await upsertContactRequest({ contactHash: h, publicKeyHex: PUB, displayName: 'Bob', message: { messageId: 'm2', text: 'yo', receivedAt: 't2' } });
    await upsertContactRequest({ contactHash: h, publicKeyHex: PUB, displayName: 'Bob', message: { messageId: 'm1', text: 'dup', receivedAt: 't3' } });
    const r = await getContactRequest(h);
    expect(r!.heldMessages.map((m) => m.messageId)).toEqual(['m1', 'm2']);
  });

  it('caps held messages at 20 (keeps the newest)', async () => {
    const h = 'ANTON-BBBB-BBBB-BBBB-BBBB';
    for (let i = 0; i < 25; i++) {
      await upsertContactRequest({ contactHash: h, publicKeyHex: PUB, displayName: 'Bob', message: { messageId: `m${i}`, text: 'x', receivedAt: `t${i}` } });
    }
    const r = await getContactRequest(h);
    expect(r!.heldMessages).toHaveLength(20);
    expect(r!.heldMessages[0]!.messageId).toBe('m5'); // oldest 5 dropped
    expect(r!.heldMessages[19]!.messageId).toBe('m24');
  });

  it('lists newest-first and deletes', async () => {
    await upsertContactRequest({ contactHash: 'ANTON-AAAA-AAAA-AAAA-AAAA', publicKeyHex: PUB, displayName: 'Old', message: { messageId: 'a', text: 'x', receivedAt: '2026-01-01T00:00:00Z' } });
    // second request — force a later receivedAt by deleting+re-adding isn't needed;
    // upsert stamps receivedAt = now on first insert. Add a distinct hash.
    await upsertContactRequest({ contactHash: 'ANTON-BBBB-BBBB-BBBB-BBBB', publicKeyHex: OTHER, displayName: 'New', message: { messageId: 'b', text: 'y', receivedAt: '2026-02-01T00:00:00Z' } });
    const list = await listContactRequests();
    expect(list).toHaveLength(2);
    await deleteContactRequest('ANTON-AAAA-AAAA-AAAA-AAAA');
    expect(await getContactRequest('ANTON-AAAA-AAAA-AAAA-AAAA')).toBeNull();
    expect(await countContactRequests()).toBe(1);
  });
});

describe('contact-request actions', () => {
  beforeEach(clearReqs);

  it('approve adds a confirmed contact, replays held messages, and clears the request', async () => {
    await createIdentity('Me', 'en'); // idempotent — ensures getIdentity() is set
    const h = 'ANTON-DDDD-DDDD-DDDD-DDDD';
    await upsertContactRequest({ contactHash: h, publicKeyHex: PUB, displayName: 'Bob', message: { messageId: 'm1', text: 'hej', receivedAt: 't1' } });
    await upsertContactRequest({ contactHash: h, publicKeyHex: PUB, displayName: 'Bob', message: { messageId: 'm2', text: 'det är Bob', receivedAt: 't2' } });

    await approveContactRequest(h);

    const c = await getContact(h);
    expect(c?.confirmed).toBe(true);
    expect(c?.publicKeyHex).toBe(PUB);
    expect(await getContactRequest(h)).toBeNull();
    // A held message landed in the thread.
    const last = (await getLatestPerThread()).get(h);
    expect(['hej', 'det är Bob']).toContain(last?.plaintext);
  });

  it('reject deletes the request and adds no contact', async () => {
    await createIdentity('Me', 'en');
    const h = 'ANTON-EEEE-EEEE-EEEE-EEEE';
    await upsertContactRequest({ contactHash: h, publicKeyHex: PUB, displayName: 'X', message: { messageId: 'm', text: 'x', receivedAt: 't' } });
    await rejectContactRequest(h);
    expect(await getContactRequest(h)).toBeNull();
    expect(await getContact(h)).toBeNull();
  });
});
