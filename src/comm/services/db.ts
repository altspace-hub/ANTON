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
export const DB_VERSION = 6;

export const STORE_CONTACTS = 'contacts';
export const STORE_MESSAGES = 'messages';
export const STORE_EVENTS = 'events';
export const STORE_WASSUP_POSTS = 'wassup_posts';
export const STORE_WASSUP_INTERACTIONS = 'wassup_interactions';
/** v5 — persistent queue for ephemeral inline wires (edit/delete/poll_vote)
 *  so they survive an offline peer + reconnect (Phase 2 audit fix). */
export const STORE_INLINE_OUTBOX = 'inline_outbox';
/** v6 — Portals offline cache (Phase 5 of in-app viewer plan). Stores
 *  descriptors, page lists, and individual page HTML keyed by kind+address
 *  so a flaky network falls back to the last good copy instead of an
 *  empty viewer. */
export const STORE_PORTAL_CACHE = 'portal_cache';

export const INDEX_MSG_BY_THREAD = 'by_thread';
export const INDEX_MSG_BY_STATUS = 'by_status';
export const INDEX_EVT_BY_START = 'by_start';
export const INDEX_POST_BY_CREATED = 'by_created';
export const INDEX_POST_BY_EXPIRES = 'by_expires';
export const INDEX_INT_BY_POST = 'by_post';
export const INDEX_INLINE_BY_PEER = 'by_peer';
export const INDEX_PORTAL_BY_CACHED_AT = 'by_cached_at';

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
      // v4 — Wassup (R3): posts + interactions (likes + comments)
      if (!db.objectStoreNames.contains(STORE_WASSUP_POSTS)) {
        const store = db.createObjectStore(STORE_WASSUP_POSTS, { keyPath: 'id' });
        store.createIndex(INDEX_POST_BY_CREATED, 'createdAt', { unique: false });
        store.createIndex(INDEX_POST_BY_EXPIRES, 'expiresAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_WASSUP_INTERACTIONS)) {
        const store = db.createObjectStore(STORE_WASSUP_INTERACTIONS, { keyPath: 'id' });
        store.createIndex(INDEX_INT_BY_POST, 'postId', { unique: false });
      }
      // v5 — inline outbox (Phase 2): persistent queue for ephemeral
      // wire kinds (edit / delete / poll_vote / wassup_*) so they don't
      // silently drop when the peer is offline at send time.
      if (!db.objectStoreNames.contains(STORE_INLINE_OUTBOX)) {
        const store = db.createObjectStore(STORE_INLINE_OUTBOX, { keyPath: 'id' });
        store.createIndex(INDEX_INLINE_BY_PEER, 'peerContactHash', { unique: false });
      }
      // v6 — Portals offline cache. Keys are namespaced
      // (`desc:<addr>` / `pages:<addr>` / `page:<addr>:<path>`); the
      // cachedAt index drives TTL eviction.
      if (!db.objectStoreNames.contains(STORE_PORTAL_CACHE)) {
        const store = db.createObjectStore(STORE_PORTAL_CACHE, { keyPath: 'key' });
        store.createIndex(INDEX_PORTAL_BY_CACHED_AT, 'cachedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked — another tab holds an older connection'));
  });
  return dbPromise;
}
