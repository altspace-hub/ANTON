/**
 * messages.ts — IDB-backed message store for the Comm App.
 *
 * Schema (object store 'messages'):
 *   {
 *     id: string,           // ULID-ish — sortable by time
 *     threadHash: string,   // the OTHER party's contact hash (1:1 only for now)
 *     fromHash: string,
 *     toHash: string,
 *     direction: 'out' | 'in',
 *     plaintext: string,    // decrypted body, plaintext at rest in IDB
 *     ts: string,           // ISO timestamp the message was created/received
 *     status: 'queued' | 'sent' | 'delivered' | 'failed' | 'received',
 *   }
 *
 * Indexes:
 *   'by_thread'  — (threadHash, ts)  for fast thread paging
 *   'by_status'  — (status)          for the outbox queue
 *
 * The store sits next to the contacts store in the same IDB database so
 * a single migration handles both. Phase 1C-2 will add the relay-transport
 * outbox flush + inbound receive path; this file is the persistence layer
 * underneath that.
 */

const DB_NAME = 'anton-comm';
const DB_VERSION = 2; // bumped from contacts.ts's v1
const STORE_CONTACTS = 'contacts';
const STORE_MESSAGES = 'messages';
const INDEX_BY_THREAD = 'by_thread';
const INDEX_BY_STATUS = 'by_status';

export type MessageDirection = 'out' | 'in';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received';

export interface ChatMessage {
  id: string;
  threadHash: string;
  fromHash: string;
  toHash: string;
  direction: MessageDirection;
  plaintext: string;
  ts: string;
  status: MessageStatus;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      // From v0 to v1: contacts store
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        db.createObjectStore(STORE_CONTACTS, { keyPath: 'contactHash' });
      }
      // From v1 to v2: messages store
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
        store.createIndex(INDEX_BY_THREAD, ['threadHash', 'ts'], { unique: false });
        store.createIndex(INDEX_BY_STATUS, 'status', { unique: false });
      }
      // Migration touch — silence the unused-var lint
      void ev;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ── ID generation ───────────────────────────────────────────────────────
// Lexicographically sortable: <timestamp_ms_base32><random_base32>
// Not a real ULID (no monotonic guarantee inside the same millisecond) but
// good enough for ordering within a chat thread.

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648, but uppercase)

function generateId(): string {
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

// ── CRUD ────────────────────────────────────────────────────────────────

export async function appendMessage(
  input: Omit<ChatMessage, 'id' | 'ts'> & { id?: string; ts?: string },
): Promise<ChatMessage> {
  const record: ChatMessage = {
    id: input.id ?? generateId(),
    ts: input.ts ?? new Date().toISOString(),
    threadHash: input.threadHash,
    fromHash: input.fromHash,
    toHash: input.toHash,
    direction: input.direction,
    plaintext: input.plaintext,
    status: input.status,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    tx.objectStore(STORE_MESSAGES).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return record;
}

export async function listThread(threadHash: string, limit = 200): Promise<ChatMessage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const index = tx.objectStore(STORE_MESSAGES).index(INDEX_BY_THREAD);
    const range = IDBKeyRange.bound([threadHash, ''], [threadHash, '￿']);
    const req = index.getAll(range, limit);
    req.onsuccess = () => {
      const rows = (req.result as ChatMessage[]) ?? [];
      rows.sort((a, b) => a.ts.localeCompare(b.ts));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getLatestPerThread(): Promise<Map<string, ChatMessage>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const req = tx.objectStore(STORE_MESSAGES).getAll();
    req.onsuccess = () => {
      const rows = (req.result as ChatMessage[]) ?? [];
      const map = new Map<string, ChatMessage>();
      for (const m of rows) {
        const existing = map.get(m.threadHash);
        if (!existing || m.ts > existing.ts) map.set(m.threadHash, m);
      }
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateStatus(id: string, status: MessageStatus): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row) { resolve(); return; }
      row.status = status;
      store.put(row);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueued(): Promise<ChatMessage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const index = tx.objectStore(STORE_MESSAGES).index(INDEX_BY_STATUS);
    const req = index.getAll('queued');
    req.onsuccess = () => resolve((req.result as ChatMessage[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteThread(threadHash: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index(INDEX_BY_THREAD);
    const range = IDBKeyRange.bound([threadHash, ''], [threadHash, '￿']);
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
