/**
 * secure-store.test.ts — the Companion app's web ('PWA') storage tier.
 *
 * Everything routed through this store is a live credential: the Ed25519 device
 * private key that signs enrollment and approval envelopes, per-instance session
 * tokens, and device certificates. The tier used to write them to IndexedDB in
 * the clear, so the tests that matter are the ones asserting what a reader of
 * the raw IDB actually sees.
 *
 * The store is deliberately probed at the RAW IndexedDB level rather than
 * through its own getSecure — a round trip through the module would pass just as
 * happily if nothing were encrypted at all.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Force the browser path. Without this the ladder probes the Capacitor plugin.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

import {
  setSecure, getSecure, removeSecure, getStorageTier,
} from '../services/secure-store';

const DB_NAME = 'anton-companion-secure';
const DB_STORE = 'kv';
const PRIVKEY = 'identity-private-key';
/** A realistic payload: 32-byte Ed25519 private key as hex. */
const SECRET = 'a3f1'.repeat(16);

function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** What someone dumping the origin's IndexedDB would actually get. */
async function rawRead(key: string): Promise<unknown> {
  const db = await openRaw();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function rawWrite(key: string, value: unknown): Promise<void> {
  const db = await openRaw();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear VALUE rows only, preserving `__wrap_key__`.
 *
 * The module memoizes the wrap key, so wiping the row while that cache is warm
 * would leave the two out of sync — an artificial state the app never reaches
 * (clearing site data drops the cache along with the rows) that would otherwise
 * make the non-extractability test read `undefined`.
 */
beforeEach(async () => {
  const db = await openRaw();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const req = store.getAllKeys();
    req.onsuccess = () => {
      for (const k of req.result) if (k !== '__wrap_key__') store.delete(k);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
});

describe('the browser tier is resolved honestly', () => {
  it('never claims native off-device', async () => {
    // The Capacitor plugin registers a WEB implementation backed by literal
    // localStorage calls, so a successful probe does NOT prove a Keystore.
    expect(await getStorageTier()).toBe('web');
  });
});

describe('secrets are not readable from raw IndexedDB', () => {
  it('stores ciphertext, not the value', async () => {
    await setSecure(PRIVKEY, SECRET);
    const raw = await rawRead(PRIVKEY);
    expect(typeof raw).toBe('string');
    expect(raw).not.toContain(SECRET);
    // ...and it is the versioned envelope, not some other encoding of the same
    // bytes (base64 of the secret would also "not contain" it).
    const env = JSON.parse(raw as string) as { v: number; iv: string; ct: string };
    expect(env.v).toBe(1);
    expect(env.iv).toBeTruthy();
    expect(env.ct).toBeTruthy();
    expect(atob(env.ct)).not.toContain(SECRET);
  });

  it('round-trips correctly despite the wrapping', async () => {
    await setSecure(PRIVKEY, SECRET);
    expect(await getSecure(PRIVKEY)).toBe(SECRET);
  });

  it('uses a fresh IV per write, so equal values do not produce equal ciphertext', async () => {
    await setSecure('a', SECRET);
    const first = await rawRead('a');
    await setSecure('b', SECRET);
    const second = await rawRead('b');
    expect(first).not.toBe(second);
  });

  it('keeps the wrap key non-extractable, so the raw bytes cannot be lifted', async () => {
    await setSecure(PRIVKEY, SECRET);
    const key = await rawRead('__wrap_key__') as CryptoKey;
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toBeTruthy();
  });

  it('removeSecure deletes the row', async () => {
    await setSecure(PRIVKEY, SECRET);
    await removeSecure(PRIVKEY);
    expect(await rawRead(PRIVKEY)).toBeUndefined();
    expect(await getSecure(PRIVKEY)).toBeNull();
  });

  it('returns null for an absent key', async () => {
    expect(await getSecure('never-written')).toBeNull();
  });
});

describe('migrating an already-paired device', () => {
  it('reads a pre-wrap plaintext value instead of losing it', async () => {
    // A device paired before the wrap landed has a bare string in IDB. Failing
    // to read it would lock the user out of their own identity key.
    await rawWrite(PRIVKEY, SECRET);
    expect(await getSecure(PRIVKEY)).toBe(SECRET);
  });

  it('REWRAPS it on that first read rather than deferring to a future write', async () => {
    // The load-bearing case. identity-private-key is written once at pairing and
    // thereafter only read, so a "rewrap on next setSecure" policy would leave an
    // existing install in the clear permanently.
    await rawWrite(PRIVKEY, SECRET);
    expect(await rawRead(PRIVKEY)).toBe(SECRET);   // precondition: really plaintext

    await getSecure(PRIVKEY);

    const raw = await rawRead(PRIVKEY);
    expect(raw).not.toBe(SECRET);
    expect(JSON.parse(raw as string).v).toBe(1);
    // ...and it still reads back correctly afterwards.
    expect(await getSecure(PRIVKEY)).toBe(SECRET);
  });

  it('does not mistake a legacy value that merely looks like JSON for an envelope', async () => {
    await rawWrite('odd', '{"hello":"world"}');
    expect(await getSecure('odd')).toBe('{"hello":"world"}');
  });
});

describe('the wrap-key row is reserved', () => {
  it('refuses reads, writes and deletes of it through the public API', async () => {
    // It shares the value store, so an unguarded removeSecure would orphan every
    // wrapped secret, and getSecure would hand back a CryptoKey as a string.
    await expect(setSecure('__wrap_key__', 'x')).rejects.toThrow(/reserved/);
    await expect(getSecure('__wrap_key__')).rejects.toThrow(/reserved/);
    await expect(removeSecure('__wrap_key__')).rejects.toThrow(/reserved/);
  });

  it('survives a value round trip after the guard fires', async () => {
    await setSecure(PRIVKEY, SECRET);
    await expect(removeSecure('__wrap_key__')).rejects.toThrow();
    expect(await getSecure(PRIVKEY)).toBe(SECRET);
  });
});
