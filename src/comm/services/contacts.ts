/**
 * contacts.ts — IndexedDB-backed contact store for the Comm App.
 *
 * Contacts are addressed by their ANTON-XXXX-XXXX-XXXX-XXXX hash. Each
 * record also carries the peer's Ed25519 public key (required for E2E
 * crypto in Phase 1C) and a user-set display name.
 *
 * The user can add a contact in two ways:
 *   1. Scan the peer's QR (which encodes a JSON share payload from
 *      ProfileScreen — includes hash + name + pubkey)
 *   2. Type or paste the contact hash directly (no pubkey available;
 *      Phase 1C will fetch it from the relay on first message)
 *
 * The store is intentionally minimal — no server sync, no directory
 * lookup. Future work: optional verified-link to a Companion App
 * identity (Phase 2+).
 */

import { openDb, STORE_CONTACTS } from './db';

export interface Contact {
  contactHash: string;        // ANTON-XXXX-XXXX-XXXX-XXXX (primary key)
  displayName: string;        // User-set label, defaults to peer's self-declared name
  publicKeyHex: string | null; // 64 hex chars when known, null until we receive it via mesh
  source: 'qr' | 'manual';    // how the contact was added
  addedAt: string;            // ISO timestamp
  note?: string;              // user note (e.g. "Anna from work")
  /** R5 — per-chat disappearing-message timer in seconds. 0 / undefined = Off. */
  disappearingTimerSec?: number;
}

export async function listContacts(): Promise<Contact[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACTS, 'readonly');
    const req = tx.objectStore(STORE_CONTACTS).getAll();
    req.onsuccess = () => {
      const rows = (req.result as Contact[]) ?? [];
      rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getContact(contactHash: string): Promise<Contact | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACTS, 'readonly');
    const req = tx.objectStore(STORE_CONTACTS).get(contactHash);
    req.onsuccess = () => resolve((req.result as Contact | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function addContact(input: Omit<Contact, 'addedAt'>): Promise<Contact> {
  const db = await openDb();
  const existing = await getContact(input.contactHash);
  if (existing) {
    // Idempotent: don't overwrite an existing contact's display name or note,
    // but upgrade the pubkey if we got one through a QR scan after a manual add.
    if (!existing.publicKeyHex && input.publicKeyHex) {
      const upgraded: Contact = { ...existing, publicKeyHex: input.publicKeyHex, source: input.source };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CONTACTS, 'readwrite');
        tx.objectStore(STORE_CONTACTS).put(upgraded);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return upgraded;
    }
    return existing;
  }
  const record: Contact = { ...input, addedAt: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACTS, 'readwrite');
    tx.objectStore(STORE_CONTACTS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return record;
}

export async function updateContact(
  contactHash: string,
  patch: Partial<Pick<Contact, 'displayName' | 'note' | 'publicKeyHex' | 'disappearingTimerSec'>>
): Promise<Contact | null> {
  const existing = await getContact(contactHash);
  if (!existing) return null;
  const next: Contact = { ...existing, ...patch };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACTS, 'readwrite');
    tx.objectStore(STORE_CONTACTS).put(next);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return next;
}

export async function removeContact(contactHash: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACTS, 'readwrite');
    tx.objectStore(STORE_CONTACTS).delete(contactHash);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Share-payload parsing ──────────────────────────────────────────────
// ProfileScreen.tsx writes this JSON into the QR code. Other Comm App
// instances scan it here.

export interface ContactSharePayload {
  v: 1;
  t: 'anton-comm-contact';
  hash: string;
  name: string;
  pub: string;
}

export function parseSharePayload(raw: string): ContactSharePayload | null {
  try {
    const obj = JSON.parse(raw) as Partial<ContactSharePayload>;
    if (obj.v !== 1) return null;
    if (obj.t !== 'anton-comm-contact') return null;
    if (typeof obj.hash !== 'string') return null;
    if (typeof obj.name !== 'string') return null;
    if (typeof obj.pub !== 'string') return null;
    return obj as ContactSharePayload;
  } catch {
    return null;
  }
}
