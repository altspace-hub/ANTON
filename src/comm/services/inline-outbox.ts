/**
 * inline-outbox.ts — persistent queue for ephemeral wire payloads.
 *
 * Until Phase 2, edit / delete / poll_vote / view_once_viewed / wassup_*
 * went out via relay-client.sendInlinePayload() with no retry: if the
 * peer (or our own connection) was offline, the wire was silently
 * dropped. After this fix, the same calls enqueue to the inline outbox
 * if not connected; flushInlineOutbox runs on register + every 20s
 * alongside the normal flushOutbox.
 *
 * Rows live in STORE_INLINE_OUTBOX. id is a stable hash of
 * (peerContactHash, kind, wireJson) so re-enqueueing the same logical
 * operation is idempotent. attempts is bumped on each failed flush; we
 * give up after MAX_ATTEMPTS to stop the queue growing forever when a
 * contact has truly vanished.
 *
 * Presence wires (read receipts + typing indicators) are deliberately
 * NOT queued — they're best-effort by design and stale presence info
 * is worse than no info.
 */
import { openDb, STORE_INLINE_OUTBOX, INDEX_INLINE_BY_PEER } from './db';

export interface InlineOutboxRow {
  /** Stable hash of (peer + wire body) so dupes coalesce. */
  id: string;
  peerContactHash: string;
  wireJson: string;
  attempts: number;
  /** ISO of last attempt; informs backoff. */
  lastAttemptAt?: string;
  /** ISO of original enqueue. */
  createdAt: string;
}

const MAX_ATTEMPTS = 8;
/** Skip rows whose lastAttemptAt is less than this many ms ago. */
const MIN_BACKOFF_MS = 5_000;

const enc = new TextEncoder();

async function stableId(peerContactHash: string, wireJson: string): Promise<string> {
  const bytes = enc.encode(`${peerContactHash}|${wireJson}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(hash);
  let s = '';
  for (let i = 0; i < 16; i++) s += view[i].toString(16).padStart(2, '0');
  return s;
}

export async function enqueueInline(peerContactHash: string, wireJson: string): Promise<void> {
  const db = await openDb();
  const id = await stableId(peerContactHash, wireJson);
  const row: InlineOutboxRow = {
    id, peerContactHash, wireJson,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_INLINE_OUTBOX, 'readwrite');
    const store = tx.objectStore(STORE_INLINE_OUTBOX);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      // Re-enqueue idempotently: keep prior attempt count so backoff
      // continues. Refresh lastAttemptAt to encourage another attempt.
      const existing = getReq.result as InlineOutboxRow | undefined;
      if (existing) {
        existing.lastAttemptAt = undefined;
        store.put(existing);
      } else {
        store.put(row);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listReadyInline(): Promise<InlineOutboxRow[]> {
  const db = await openDb();
  const all = await new Promise<InlineOutboxRow[]>((resolve, reject) => {
    const tx = db.transaction(STORE_INLINE_OUTBOX, 'readonly');
    const req = tx.objectStore(STORE_INLINE_OUTBOX).getAll();
    req.onsuccess = () => resolve((req.result as InlineOutboxRow[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  const now = Date.now();
  return all.filter((r) => {
    if (r.attempts >= MAX_ATTEMPTS) return false;
    if (!r.lastAttemptAt) return true;
    const last = new Date(r.lastAttemptAt).getTime();
    // Exponential-ish backoff: 5s, 10s, 20s, 40s, 80s, 160s, 320s, 640s.
    const wait = MIN_BACKOFF_MS * Math.pow(2, Math.min(r.attempts, 7));
    return now - last >= wait;
  });
}

export async function markInlineAttempt(id: string, success: boolean): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_INLINE_OUTBOX, 'readwrite');
    const store = tx.objectStore(STORE_INLINE_OUTBOX);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as InlineOutboxRow | undefined;
      if (!row) return;
      if (success) {
        store.delete(id);
      } else {
        row.attempts++;
        row.lastAttemptAt = new Date().toISOString();
        store.put(row);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Drop everything queued for a given peer (e.g. on contact removal). */
export async function dropInlineForPeer(peerContactHash: string): Promise<number> {
  const db = await openDb();
  let dropped = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_INLINE_OUTBOX, 'readwrite');
    const store = tx.objectStore(STORE_INLINE_OUTBOX);
    const index = store.index(INDEX_INLINE_BY_PEER);
    const req = index.openCursor(peerContactHash);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      cursor.delete();
      dropped++;
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return dropped;
}
