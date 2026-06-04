/**
 * contact-requests.ts — the "message request" inbox (#68).
 *
 * When a DELIVER_COMM frame arrives from a sender we have NOT added, the relay
 * client (handleDeliverComm) can still decrypt it IF the sender attached their
 * Ed25519 pubkey in cleartext on the envelope (only done while a contact is
 * unconfirmed). The decrypted `contact_request` wire carries the sender's name
 * + their first message; we stash it here as a pending request instead of
 * silently dropping it (the v0.1 behaviour).
 *
 * The user reviews the Requests tray and either:
 *   - Approves → the sender becomes a mutual contact (addContact) and the held
 *     first message(s) are replayed into the chat thread.
 *   - Rejects → the request is discarded.
 *
 * Security: the sender's pubkey is bound to BOTH the relay routing_id (the
 * frame header) AND the claimed contactHash before a request is ever written —
 * see relay-client.ts. So a record here always has a verified pubkey.
 */
import { openDb, STORE_CONTACT_REQUESTS } from './db';

/** Global ceiling on DISTINCT pending requests — a flood of throwaway
 *  identities can't grow the store unbounded (the per-sender heldMessages cap
 *  only bounds one sender). Oldest-by-receivedAt are evicted past this. */
const MAX_REQUESTS = 100;

/** A first message held until the request is approved. v0.2 holds text only;
 *  richer kinds are dropped at decrypt time (they aren't accepted from an
 *  un-approved sender). */
export interface HeldMessage {
  messageId: string;
  text: string;
  receivedAt: string; // ISO
}

export interface ContactRequest {
  /** Sender's ANTON-XXXX-… hash (primary key) — derived from + bound to pub. */
  contactHash: string;
  /** Sender's Ed25519 pubkey hex (verified against routing_id + hash). */
  publicKeyHex: string;
  /** Sender's self-declared display name. */
  displayName: string;
  avatarImage?: string;
  avatarMime?: string;
  /** First message(s) shown as a preview + replayed into the chat on approve. */
  heldMessages: HeldMessage[];
  /** ISO of the first request from this sender. */
  receivedAt: string;
  /** ISO of the most recent update (new held message). */
  updatedAt: string;
}

export async function listContactRequests(): Promise<ContactRequest[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACT_REQUESTS, 'readonly');
    const req = tx.objectStore(STORE_CONTACT_REQUESTS).getAll();
    req.onsuccess = () => {
      const rows = (req.result as ContactRequest[]) ?? [];
      // Newest first.
      rows.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getContactRequest(contactHash: string): Promise<ContactRequest | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACT_REQUESTS, 'readonly');
    const req = tx.objectStore(STORE_CONTACT_REQUESTS).get(contactHash);
    req.onsuccess = () => resolve((req.result as ContactRequest | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function countContactRequests(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACT_REQUESTS, 'readonly');
    const req = tx.objectStore(STORE_CONTACT_REQUESTS).count();
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Insert a new request, or append a held message to an existing one (a sender
 * who messages again before you approve). Identity fields (name/avatar/pub)
 * are refreshed from the latest request; held messages accumulate (deduped by
 * messageId, capped so a flood can't bloat the store).
 */
export async function upsertContactRequest(
  input: {
    contactHash: string;
    publicKeyHex: string;
    displayName: string;
    avatarImage?: string;
    avatarMime?: string;
    message?: HeldMessage;
  },
): Promise<ContactRequest> {
  const now = new Date().toISOString();
  const existing = await getContactRequest(input.contactHash);

  const heldMessages = existing ? [...existing.heldMessages] : [];
  if (input.message && !heldMessages.some((m) => m.messageId === input.message!.messageId)) {
    heldMessages.push(input.message);
    // Cap the held preview at 20 messages — a request is a preview, not a
    // full mailbox; a spammer can't grow this unbounded.
    if (heldMessages.length > 20) heldMessages.splice(0, heldMessages.length - 20);
  }

  const record: ContactRequest = {
    contactHash: input.contactHash,
    publicKeyHex: input.publicKeyHex,
    displayName: input.displayName,
    avatarImage: input.avatarImage,
    avatarMime: input.avatarMime,
    heldMessages,
    receivedAt: existing?.receivedAt ?? now,
    updatedAt: now,
  };

  // Global ceiling: when a NEW sender pushes us over the cap, evict the
  // oldest rows (listContactRequests is newest-first) to make room.
  if (!existing) {
    const all = await listContactRequests();
    if (all.length >= MAX_REQUESTS) {
      for (const old of all.slice(MAX_REQUESTS - 1)) {
        await deleteContactRequest(old.contactHash);
      }
    }
  }

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACT_REQUESTS, 'readwrite');
    tx.objectStore(STORE_CONTACT_REQUESTS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return record;
}

export async function deleteContactRequest(contactHash: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACT_REQUESTS, 'readwrite');
    tx.objectStore(STORE_CONTACT_REQUESTS).delete(contactHash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
