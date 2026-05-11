/**
 * db.ts — single source of the Comm App's IndexedDB schema.
 *
 * Each feature module (contacts, messages, events) previously opened the
 * same database independently with its own DB_VERSION and its own
 * onupgradeneeded handler. That race-conditioned the first-load — if
 * contacts opened at v1 before messages opened at v3, the v3 upgrade was
 * blocked while contacts held its v1 connection, and the chat list hung
 * on "Loading..." forever.
 *
 * Now there's ONE openDb() and ONE schema. Bumps go here; feature
 * modules import this and never call indexedDB.open directly.
 */

export const DB_NAME = 'anton-comm';
export const DB_VERSION = 3;

export const STORE_CONTACTS = 'contacts';
export const STORE_MESSAGES = 'messages';
export const STORE_EVENTS = 'events';

export const INDEX_MSG_BY_THREAD = 'by_thread';
export const INDEX_MSG_BY_STATUS = 'by_status';
export const INDEX_EVT_BY_START = 'by_start';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 — contacts
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        db.createObjectStore(STORE_CONTACTS, { keyPath: 'contactHash' });
      }
      // v2 — messages
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        store.createIndex(INDEX_MSG_BY_THREAD, ['threadHash', 'ts'], { unique: false });
        store.createIndex(INDEX_MSG_BY_STATUS, 'status', { unique: false });
      }
      // v3 — events
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const store = db.createObjectStore(STORE_EVENTS, { keyPath: 'id' });
        store.createIndex(INDEX_EVT_BY_START, 'startAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked — another tab holds an older connection'));
  });
  return dbPromise;
}
