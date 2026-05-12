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

import {
  openDb,
  STORE_MESSAGES,
  INDEX_MSG_BY_THREAD as INDEX_BY_THREAD,
  INDEX_MSG_BY_STATUS as INDEX_BY_STATUS,
} from './db';

export type MessageDirection = 'out' | 'in';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received' | 'read';

/**
 * Kind of payload carried in `plaintext`:
 *   - 'text'                 : plain user text
 *   - 'image'                : plaintext is JSON of MediaPayload (base64 + mime + dims)
 *   - 'video'                : plaintext is JSON of MediaPayload
 *   - 'voice'                : plaintext is JSON of VoicePayload (R4)
 *   - 'event_invite'         : plaintext is JSON of EventInvitePayload (events.ts)
 *   - 'event_rsvp'           : plaintext is JSON of EventRsvpPayload
 *   - 'event_cancel'         : plaintext is JSON of EventCancelPayload
 *   - 'system_timer_change'  : R5 — plaintext is JSON { timerSec }, rendered as a centered chip
 *
 * Old messages without a `kind` field are treated as 'text'.
 */
export type ContentKind = 'text' | 'image' | 'video' | 'voice' | 'event_invite' | 'event_rsvp' | 'event_cancel' | 'system_timer_change' | 'poll' | 'location';

/** R1 — quoted-reply context, attached to text/image/video messages. */
export interface ReplyContext {
  msgId: string;
  /** Snippet of the original ≤80 chars for display without re-fetching */
  snippet: string;
  kind: ContentKind;
  /** From-hash of the original author (for "Replying to {name}" header) */
  fromHash: string;
}

/** R2 — reactions map: emoji → list of contact-hashes who reacted with it. */
export type ReactionsMap = Record<string, string[]>;

export interface ChatMessage {
  id: string;
  threadHash: string;
  fromHash: string;
  toHash: string;
  direction: MessageDirection;
  plaintext: string;
  ts: string;
  status: MessageStatus;
  kind?: ContentKind;
  /** R1 — quoted-reply context if this message was sent as a reply */
  replyTo?: ReplyContext;
  /** R2 — reactions on this message (emoji → reactor contact-hashes) */
  reactions?: ReactionsMap;
  /** R5 — ISO timestamp when this message should be locally deleted. */
  disappearsAt?: string;
  /** R6 — sender-side marker that the recipient has viewed a view-once
   *  media message. Recipients delete the message locally on view, so on
   *  their side this field is irrelevant. */
  viewed?: boolean;
  /** R8 — ISO timestamp of the last text-message edit. Present on both
   *  sides after an edit round-trip. */
  editedAt?: string;
  /** R8 — set by delete-for-everyone. plaintext is cleared; reactions /
   *  replyTo are dropped so the placeholder renders cleanly. */
  deletedForEveryone?: boolean;
  /** R10 — ISO timestamp when a queued message should be released to the
   *  transport. While `scheduledFor > now`, the relay client's flush
   *  skips this row; once the time arrives, the next flush picks it up. */
  scheduledFor?: string;
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
    kind: input.kind ?? 'text',
    replyTo: input.replyTo,
    reactions: input.reactions,
    disappearsAt: input.disappearsAt,
    viewed: input.viewed,
    editedAt: input.editedAt,
    deletedForEveryone: input.deletedForEveryone,
    scheduledFor: input.scheduledFor,
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

/** Look up a single message by id. Used by R8 forward to read the
 *  source payload and by other helpers. */
export async function getMessage(id: string): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readonly');
    const req = tx.objectStore(STORE_MESSAGES).get(id);
    req.onsuccess = () => resolve((req.result as ChatMessage | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
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

/**
 * R2 — apply a reaction add/remove from a peer.
 * Updates the target message's `reactions` map. No-op if the target id
 * isn't in this device's store (we may have purged it, or never received it).
 */
export async function applyReaction(
  targetMsgId: string,
  emoji: string,
  reactorHash: string,
  op: 'add' | 'remove',
): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(targetMsgId);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row) { resolve(null); return; }
      const reactions: ReactionsMap = { ...(row.reactions ?? {}) };
      const list = reactions[emoji] ? [...reactions[emoji]] : [];
      const idx = list.indexOf(reactorHash);
      if (op === 'add' && idx === -1) list.push(reactorHash);
      if (op === 'remove' && idx >= 0) list.splice(idx, 1);
      if (list.length > 0) reactions[emoji] = list;
      else delete reactions[emoji];
      row.reactions = reactions;
      store.put(row);
      resolve(row);
    };
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

/**
 * R13 — apply an inbound location_update to the parent location message.
 * Mutates the stored lat / lng / accuracyM / lastUpdateAt in the parent
 * row's plaintext JSON. No-op if the parent isn't found or isn't a
 * location message.
 */
export async function applyLocationUpdate(
  parentMsgId: string,
  patch: { lat: number; lng: number; accuracyM: number; ts: string },
): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(parentMsgId);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row || row.kind !== 'location') { resolve(null); return; }
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(row.plaintext); } catch { parsed = {}; }
      parsed.lat = patch.lat;
      parsed.lng = patch.lng;
      parsed.accuracyM = patch.accuracyM;
      parsed.lastUpdateAt = patch.ts;
      row.plaintext = JSON.stringify(parsed);
      store.put(row);
      resolve(row);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * R7 — apply a poll vote from a peer (or self). Looks up the persisted
 * poll message by id, parses its plaintext, mutates the `votes` map under
 * a voter-contact-hash key, persists. The bubble renders directly off
 * this state.
 *
 * Returns the updated message, or null if no poll with that id is stored.
 */
export async function applyPollVote(
  pollId: string,
  voterHash: string,
  optionIdx: number[],
): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(pollId);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row || row.kind !== 'poll') { resolve(null); return; }
      let parsed: { votes?: Record<string, number[]> } & Record<string, unknown> = {};
      try { parsed = JSON.parse(row.plaintext); } catch { parsed = {}; }
      const votes = { ...(parsed.votes ?? {}) };
      if (optionIdx.length === 0) delete votes[voterHash];
      else votes[voterHash] = optionIdx.slice();
      parsed.votes = votes;
      row.plaintext = JSON.stringify(parsed);
      store.put(row);
      resolve(row);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * R10 — list pending scheduled messages for a thread (scheduledFor > now,
 * status='queued'). Used by the badge + Scheduled list sheet.
 */
export async function listScheduled(threadHash: string): Promise<ChatMessage[]> {
  const all = await listThread(threadHash);
  const now = new Date().toISOString();
  return all.filter((m) => m.scheduledFor && m.scheduledFor > now && m.status === 'queued');
}

/** R10 — cancel a scheduled send by deleting the row from the queue. */
export async function cancelScheduled(id: string): Promise<void> {
  return deleteMessage(id);
}

/** R10 — change the scheduledFor on a pending scheduled message. */
export async function rescheduleMessage(id: string, newScheduledFor: string): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row || row.status !== 'queued') { resolve(null); return; }
      row.scheduledFor = newScheduledFor;
      store.put(row);
      resolve(row);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * R9 — mark outbound messages in this thread as read up to and
 * including `lastMsgId`. Bumps status to 'read' on any out-direction
 * messages with id ≤ lastMsgId that are currently 'sent' or 'delivered'.
 * Returns the count that flipped.
 */
export async function markReadUpTo(threadHash: string, lastMsgId: string): Promise<number> {
  const db = await openDb();
  let flipped = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index(INDEX_BY_THREAD);
    const range = IDBKeyRange.bound([threadHash, ''], [threadHash, '￿']);
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const row = cursor.value as ChatMessage;
      if (row.direction === 'out' && row.id <= lastMsgId
          && (row.status === 'sent' || row.status === 'delivered' || row.status === 'queued')) {
        row.status = 'read';
        cursor.update(row);
        flipped++;
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return flipped;
}

/**
 * R8 — apply an edit to a text message. Updates the plaintext + stamps
 * editedAt. No-op if the target id isn't in the store or it isn't a
 * text message (edits only target plain text per the spec).
 */
export async function applyEdit(targetMsgId: string, newText: string): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(targetMsgId);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row || (row.kind && row.kind !== 'text')) { resolve(null); return; }
      row.plaintext = newText;
      row.editedAt = new Date().toISOString();
      store.put(row);
      resolve(row);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * R8 — apply delete-for-everyone to a target message. Clears plaintext +
 * reactions + replyTo and flags `deletedForEveryone`. Bubble renderer
 * then shows a placeholder.
 */
export async function applyDeleteForEveryone(targetMsgId: string): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(targetMsgId);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row) { resolve(null); return; }
      row.deletedForEveryone = true;
      row.plaintext = '';
      row.reactions = undefined;
      row.replyTo = undefined;
      store.put(row);
      resolve(row);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * R6 — mark a sent view-once message as viewed (sender-side). Called when
 * the recipient's `view_once_viewed` signal arrives. Returns the updated
 * message, or null if the id wasn't found.
 */
export async function markViewed(id: string): Promise<ChatMessage | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as ChatMessage | undefined;
      if (!row) { resolve(null); return; }
      row.viewed = true;
      // Strip the media bytes — sender has confirmation, no need to keep
      // the encrypted payload around once viewed. Keep the kind so the
      // bubble still renders the "Viewed" placeholder.
      try {
        const parsed = JSON.parse(row.plaintext) as Record<string, unknown>;
        if ('data' in parsed && typeof parsed.data === 'string') {
          row.plaintext = JSON.stringify({ ...parsed, data: '' });
        }
      } catch { /* ignore non-JSON plaintexts */ }
      store.put(row);
      resolve(row);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** R6 — delete a single message by id (used after recipient views a view-once). */
export async function deleteMessage(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    tx.objectStore(STORE_MESSAGES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * R5 — sweep messages in this thread whose `disappearsAt` has passed.
 * Returns the number of messages deleted so the caller can decide whether
 * to re-render. Idempotent and safe to call frequently.
 */
export async function sweepExpiredInThread(threadHash: string): Promise<number> {
  const db = await openDb();
  const nowIso = new Date().toISOString();
  let deleted = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);
    const index = store.index(INDEX_BY_THREAD);
    const range = IDBKeyRange.bound([threadHash, ''], [threadHash, '￿']);
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const row = cursor.value as ChatMessage;
      if (row.disappearsAt && row.disappearsAt <= nowIso) {
        cursor.delete();
        deleted++;
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return deleted;
}
