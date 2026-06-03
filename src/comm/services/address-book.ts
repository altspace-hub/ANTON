/**
 * address-book.ts — explicit contact registry + address-poisoning defense.
 *
 * Why explicit-only: address-poisoning losses crossed USD 1.2bn
 * cumulative by 2024 (Chainalysis Crypto Crime Report) — bots watch
 * the mempool, grind vanity addresses matching the first/last 4-6
 * chars of your frequent counterparties, then dust your wallet so
 * their address shows up in your transaction history. The user goes
 * to "copy from history" and sends real funds to a near-look-alike.
 *
 * Defense:
 *   • Contacts are added EXPLICITLY by the user — never auto-populated
 *     from received transactions. MetaMask (v11.13, 2023) and Phantom
 *     ("Spam burn", Jan 2024) both moved to this model.
 *   • findSimilarContacts() does a full-string Levenshtein check on
 *     paste/scan — if the typed address has a low edit distance to a
 *     known contact but is NOT exactly that contact, the UI raises a
 *     hard warning ("This looks similar to <name> — confirm it's
 *     different").
 *   • Rendering helpers group the address into 4-char chunks with the
 *     MIDDLE 8 chars highlighted — the part attackers can't easily
 *     grind for collisions (Rabby pattern).
 *
 * Storage: contacts live in IndexedDB (small, structured, queryable),
 * not secure-store — they're not sensitive in the same way a priv key
 * is, and the contact list will eventually grow large enough that the
 * KV-shaped secure store gets clumsy.
 */

import { openDb } from './db';

/** Distinct from chat contacts — these are FC payment addresses
 *  the user has explicitly added. Comm's chat-contacts store is
 *  keyed by contactHash and lives in a different store name. */
const STORE = 'fc_contacts';

export interface Contact {
  id: string;
  /** User-chosen display name. Required, but can be the empty string
   *  on first add; the UI surfaces a "label this contact" prompt. */
  label: string;
  /** Full fc_… Base58 address. Canonical form, not abbreviated. */
  address: string;
  /** When the user explicitly added this contact. */
  addedAt: number;
  /** Optional free-text note from the user. */
  note?: string;
}

// IDB opener is owned by db.ts so version bumps stay monotonic.
const open = openDb;

function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function listContacts(): Promise<Contact[]> {
  const db = await open();
  const rows = await new Promise<Contact[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as Contact[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => b.addedAt - a.addedAt);
}

export async function addContact(label: string, address: string, note?: string): Promise<Contact> {
  // Refuse duplicates — same address, different label gets a rename
  // prompt at the UI layer.
  const existing = await getContactByAddress(address);
  if (existing) {
    throw new Error('That address is already in your contacts.');
  }
  const c: Contact = {
    id: newId(),
    label: label.trim() || 'Unnamed',
    address,
    addedAt: Date.now(),
    note,
  };
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(c);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return c;
}

export async function getContactByAddress(address: string): Promise<Contact | null> {
  const db = await open();
  const row = await new Promise<Contact | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('byAddress').get(address);
    req.onsuccess = () => resolve((req.result as Contact | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row;
}

export async function deleteContact(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function renameContact(id: string, label: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const row = req.result as Contact | undefined;
      if (!row) { resolve(); return; }
      store.put({ ...row, label: label.trim() || row.label });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ── Friend-name resolution ──────────────────────────────────────────

/**
 * Build an `address → contact label` lookup from the full contact
 * list. Index ONCE per screen render and reuse for every row —
 * cheaper than an async getContactByAddress() per activity row.
 * Empty-label contacts are skipped so we never resolve a name to the
 * empty string (the row template then falls back to the abbreviated
 * address). Returns a plain object keyed by canonical fc_… address.
 *
 * Ported from src/pay/services/address-book.ts (#86 wallet parity).
 */
export function buildContactNameMap(contacts: Contact[]): Record<string, string> {
  const byAddr: Record<string, string> = {};
  for (const c of contacts) {
    const label = c.label.trim();
    if (label) byAddr[c.address] = label;
  }
  return byAddr;
}

/**
 * Resolve a counterparty address to its saved friend label, or null
 * when the address is empty / not a known contact. The caller decides
 * the fallback (usually the abbreviated address). Prefer the saved
 * label over the raw fc_… address everywhere a counterparty is shown.
 */
export function resolveName(
  address: string | undefined,
  byAddr: Record<string, string>,
): string | null {
  if (!address) return null;
  return byAddr[address] ?? null;
}

// ── Address-poisoning detection ─────────────────────────────────────

/**
 * Levenshtein edit distance between two strings. Standard DP
 * implementation; we only call it on 30-50 char addresses so the
 * O(n*m) cost is fine.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1,           // deletion
        cur[j - 1] + 1,        // insertion
        prev[j - 1] + cost,    // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export interface SimilarityWarning {
  contact: Contact;
  /** The number of single-character changes separating the typed
   *  address from the known contact's address. 0 = exact match;
   *  1-5 = the danger zone where vanity-grinding attackers operate. */
  editDistance: number;
  /** True when the first 6 and last 6 chars match — the strongest
   *  signal of an active poisoning attack. */
  matchesEnds: boolean;
}

/**
 * Find contacts whose address is close-but-not-equal to the given
 * address. Used at paste/scan time. Empty array = safe (no contact
 * looks like this address); the caller renders a "to a new address"
 * confirmation. A non-empty array MUST gate signing behind an
 * explicit "I confirm this is NOT <contact>" tap.
 *
 * Default `threshold = 5` — Wintermute's USD 24M loss in May 2024
 * involved a 5-char-vanity-suffix attack; tighter than this catches
 * the common attacks without flooding the user with false positives.
 */
export async function findSimilarContacts(
  address: string,
  threshold = 5,
): Promise<SimilarityWarning[]> {
  if (!address) return [];
  const all = await listContacts();
  const out: SimilarityWarning[] = [];
  for (const c of all) {
    if (c.address === address) continue; // exact match — not a warning
    const dist = levenshtein(c.address, address);
    if (dist === 0 || dist > threshold) continue;
    const matchesEnds =
      c.address.slice(0, 6) === address.slice(0, 6) &&
      c.address.slice(-6) === address.slice(-6);
    out.push({ contact: c, editDistance: dist, matchesEnds });
  }
  // Sort by danger: matches-both-ends first, then smallest edit distance.
  out.sort((a, b) => {
    if (a.matchesEnds !== b.matchesEnds) return a.matchesEnds ? -1 : 1;
    return a.editDistance - b.editDistance;
  });
  return out;
}

// ── Dust hiding ─────────────────────────────────────────────────────

/**
 * Default dust threshold (micro-FTC). Set to 0 so EVERY incoming
 * transfer shows in the activity list — small real payments (e.g.
 * 0.01 FTC) were previously hidden. Raise this (or wire a
 * Settings → Activity control) to re-enable address-poisoning dust
 * hiding for tiny lookalike-address spam.
 */
export const DEFAULT_DUST_THRESHOLD_MICRO_FTC = 0n;

/** Predicate used by the activity view to filter dust. The threshold
 *  is configurable from Settings (future work); for now it's a
 *  constant. */
export function isDust(amountMicroFtc: bigint, threshold = DEFAULT_DUST_THRESHOLD_MICRO_FTC): boolean {
  return amountMicroFtc < threshold;
}

// ── Display helpers ─────────────────────────────────────────────────

/**
 * Render an address as 4-char groups for readability, with the
 * middle 8 chars marked as "secure" (the segment attackers can't
 * grind for vanity matches). Returns the segments + a flag per
 * segment for the UI to colour differently.
 */
export function renderAddressSegments(address: string): { text: string; secure: boolean }[] {
  if (address.length < 16) return [{ text: address, secure: false }];
  // The fc_ prefix + first/last 6 chars are attackable; the middle is
  // safe. Split into 4-char chunks for readability.
  const segments: { text: string; secure: boolean }[] = [];
  // First half (head — vulnerable to grinding):
  const head = address.slice(0, 6);
  for (let i = 0; i < head.length; i += 4) {
    segments.push({ text: head.slice(i, i + 4), secure: false });
  }
  // Middle (safe):
  const mid = address.slice(6, -6);
  for (let i = 0; i < mid.length; i += 4) {
    segments.push({ text: mid.slice(i, i + 4), secure: true });
  }
  // Tail (vulnerable):
  const tail = address.slice(-6);
  for (let i = 0; i < tail.length; i += 4) {
    segments.push({ text: tail.slice(i, i + 4), secure: false });
  }
  return segments;
}
