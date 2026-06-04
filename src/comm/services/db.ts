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
export const DB_VERSION = 11;

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
/** v7 — FutureChain wallet transaction ledger. Every FTC transaction
 *  the user makes (send / receive / swap / refund) lands here so the
 *  tax engine in @futurechain/sdk/tax (Phase 1+) can compute the
 *  per-tx ledger + annual position. Per FUTURECHAIN_TAX_RULES.md the
 *  ledger MUST stay on-device — no syncing to the server side. */
export const STORE_WALLET_TXS = 'wallet_txs';
/** v8 — FC address book. Distinct from chat contacts (which are
 *  keyed by contactHash and serve E2E chat). These are FC payment
 *  addresses the user has explicitly added — used by the address-
 *  poisoning defense to recognise known payees on send. */
export const STORE_FC_CONTACTS = 'fc_contacts';
/** v9 — scheduled / recurring payment reminders (#79 Phase 6 wallet
 *  parity). Self-custody-safe "reminder + same-tap signing": a local
 *  notification fires at the chosen time; tapping it opens the prefilled
 *  send flow and the user biometric-confirms. We never auto-sign /
 *  pre-sign. by_next powers reconcile + the chronological list. */
export const STORE_SCHEDULES = 'schedules';
/** v10 — in-event discussion notes (event collaboration). Kept in a
 *  dedicated store (not the 1:1 messages store) so event planning chatter
 *  never clutters the direct-chat thread. Indexed by eventId. */
export const STORE_EVENT_NOTES = 'event_notes';

/** v11 — incoming contact requests (#68). When a DELIVER_COMM arrives from a
 *  sender we haven't added (their pubkey rode in cleartext on the envelope),
 *  the decrypted contact_request lands here as a pending "message request"
 *  rather than being dropped. Keyed by the sender's contactHash. */
export const STORE_CONTACT_REQUESTS = 'contact_requests';

export const INDEX_MSG_BY_THREAD = 'by_thread';
export const INDEX_MSG_BY_STATUS = 'by_status';
export const INDEX_EVT_BY_START = 'by_start';
export const INDEX_POST_BY_CREATED = 'by_created';
export const INDEX_POST_BY_EXPIRES = 'by_expires';
export const INDEX_INT_BY_POST = 'by_post';
export const INDEX_INLINE_BY_PEER = 'by_peer';
export const INDEX_PORTAL_BY_CACHED_AT = 'by_cached_at';
export const INDEX_WALLET_BY_TS = 'by_ts';
export const INDEX_WALLET_BY_REF = 'by_ref';
export const INDEX_SCHED_BY_NEXT = 'by_next';
export const INDEX_EVENT_NOTE_BY_EVENT = 'by_event';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  // Return the cached connection only if it's still live. A connection
  // that has begun closing — a versionchange during a schema bump, or an
  // abnormal WebView close — throws InvalidStateError on `.transaction()`
  // ("the database connection is closing"). Probe with a throwaway
  // readonly transaction and transparently reopen on failure so callers
  // never receive a dead handle (which would surface to the user as a
  // failed write). STORE_CONTACTS exists since v1, so the probe is always
  // valid; .abort() cancels it immediately with no real work.
  if (dbPromise) {
    return dbPromise.then(
      (db) => {
        try {
          db.transaction(STORE_CONTACTS, 'readonly').abort();
          return db;
        } catch {
          dbPromise = null;
          return openDb();
        }
      },
      () => { dbPromise = null; return openDb(); },
    );
  }
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
      // v7 — wallet transaction ledger. Primary key is the generated
      // tx id; by_ts powers the chronological history; by_ref lets the
      // tax engine link an FTC payment to its merchant order ref.
      if (!db.objectStoreNames.contains(STORE_WALLET_TXS)) {
        const store = db.createObjectStore(STORE_WALLET_TXS, { keyPath: 'id' });
        store.createIndex(INDEX_WALLET_BY_TS, 'ts', { unique: false });
        store.createIndex(INDEX_WALLET_BY_REF, 'ref', { unique: false });
      }
      // v8 — FC address book (payment recipients, distinct from chat
      // contacts above). byAddress index drives findSimilarContacts
      // for address-poisoning detection.
      if (!db.objectStoreNames.contains(STORE_FC_CONTACTS)) {
        const store = db.createObjectStore(STORE_FC_CONTACTS, { keyPath: 'id' });
        store.createIndex('byAddress', 'address', { unique: false });
      }
      // v9 — scheduled-payment reminders. Primary key is the generated
      // schedule id; by_next sorts the list + drives notification
      // reconcile on app start.
      if (!db.objectStoreNames.contains(STORE_SCHEDULES)) {
        const store = db.createObjectStore(STORE_SCHEDULES, { keyPath: 'id' });
        store.createIndex(INDEX_SCHED_BY_NEXT, 'nextFireAt', { unique: false });
      }
      // v10 — in-event discussion notes. Primary key is the note id;
      // by_event groups a thread of notes under one event.
      if (!db.objectStoreNames.contains(STORE_EVENT_NOTES)) {
        const store = db.createObjectStore(STORE_EVENT_NOTES, { keyPath: 'id' });
        store.createIndex(INDEX_EVENT_NOTE_BY_EVENT, 'eventId', { unique: false });
      }
      // v11 — incoming contact requests (#68). Keyed by sender contactHash;
      // additive store, no migration of existing data.
      if (!db.objectStoreNames.contains(STORE_CONTACT_REQUESTS)) {
        db.createObjectStore(STORE_CONTACT_REQUESTS, { keyPath: 'contactHash' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Self-healing singleton: if this connection is ever force-closed
      // (a versionchange from a newer page during a schema bump, or an
      // abnormal close), drop the cached promise so the next openDb()
      // re-opens a fresh connection instead of handing back a dead one
      // (which throws "the database connection is closing" on .transaction()).
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    // On a failed/blocked open, clear the cached promise so a later call
    // can retry rather than re-await a permanently-rejected promise.
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => { dbPromise = null; reject(new Error('IndexedDB open blocked — another tab holds an older connection')); };
  });
  return dbPromise;
}
