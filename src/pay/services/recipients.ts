/**
 * recipients.ts — the "people you pay" model behind the Send picker (#89).
 *
 * A Recipient is one address you can pay, assembled from two sources:
 *   1. Saved contacts (services/address-book.ts `fc_contacts`) — explicit
 *      friends with a name, optionally ⭐ starred.
 *   2. Your own SENT payment history (services/payment.ts `listPayments`) —
 *      everyone you've actually paid, with a send count + last-sent time and
 *      the recipient's name/country recovered from the stored PACS.008 draft.
 *
 * ANTI-POISONING — DELIBERATE: recents/frequent come ONLY from payments you
 * SENT (each one a vetted, user-confirmed destination). We NEVER mine the
 * received ledger (listReceived) for recipients — that's the exact channel
 * address-poisoning dust arrives on (see services/address-book.ts header). A
 * stranger who dusts you must never surface here as someone to "pay back".
 *
 * The picker groups recipients into Starred / Frequent / Recent / Friends,
 * de-duplicated so each person shows in exactly one section (highest first).
 */
import {
  listContacts, addContact, setContactStarred, type Contact,
} from './address-book';
import { listPayments } from './payment';
import type { PaymentRecord } from './types';

export interface Recipient {
  /** Canonical fc_… address. The picker's stable key. */
  address: string;
  /** Best-known display name: saved contact label → last payment's creditor
   *  name → merchant id → abbreviated address. Never the empty string. */
  name: string;
  /** False when `name` is only the abbreviated-address fallback (no real
   *  name was ever known). The compose screen then leaves the creditor-name
   *  field BLANK so the user types a real name, rather than shipping
   *  "fc_AAA…AAA" as the PACS.008 cn. */
  nameIsReal: boolean;
  /** ISO-3166 alpha-2 country recovered from the most recent payment's
   *  creditor party. Undefined when only a friend (no payment) is known —
   *  the compose form then asks for it. */
  country?: string;
  city?: string;
  street?: string;
  postcode?: string;
  /** ⭐ — a saved contact the user marked favourite. */
  starred: boolean;
  /** True when this address is a saved contact (vs. payment-history-only). */
  isFriend: boolean;
  /** Contact id when `isFriend`; lets the star toggle target the row. */
  contactId?: string;
  /** Number of payments SENT to this address. 0 for a friend never paid. */
  sendCount: number;
  /** Epoch-ms of the most recent SENT payment. 0 when never paid. */
  lastSentAt: number;
}

export interface RecipientSections {
  /** ⭐ favourites — always on top. */
  starred: Recipient[];
  /** 🔥 used a lot — sendCount ≥ threshold, not already starred. */
  frequent: Recipient[];
  /** 🕘 recently paid — not starred, not frequent. */
  recent: Recipient[];
  /** 👥 saved friends not surfaced above (incl. ones never paid). */
  friends: Recipient[];
  /** Flat union sorted by name — the search corpus. */
  all: Recipient[];
}

interface PayAgg {
  address: string;
  sendCount: number;
  lastSentAt: number;
  /** Most-recent REAL creditor name (never the merchant-id fallback). */
  name?: string;
  /** Most-recent merchant id — a separate, lower-priority name source so a
   *  later merchant-coded payment can't clobber an earlier human name. */
  merchantId?: string;
  country?: string;
  city?: string;
  street?: string;
  postcode?: string;
}

/** head…tail abbreviation used as the last-resort display name. */
function abbreviate(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

/**
 * Fold the SENT payment ledger into one aggregate per destination address.
 * Iterated oldest→newest so the MOST RECENT payment's creditor name/country
 * win (later writes overwrite). Pulls recipient identity from the stored
 * `pacs008.creditor` draft, falling back to the merchant id for the name.
 */
function aggregatePayments(payments: PaymentRecord[]): Map<string, PayAgg> {
  const byAddr = new Map<string, PayAgg>();
  const sorted = [...payments].sort((a, b) => (a.paidAt ?? 0) - (b.paidAt ?? 0));
  for (const p of sorted) {
    const addr = p.toAddress;
    if (!addr) continue;
    const prev = byAddr.get(addr);
    const cred = p.pacs008?.creditor;
    const credName = cred?.name?.trim() || undefined;
    const merchId = p.merchantId?.trim() || undefined;
    const country = cred?.country?.trim().toUpperCase() || undefined;
    byAddr.set(addr, {
      address: addr,
      sendCount: (prev?.sendCount ?? 0) + 1,
      lastSentAt: Math.max(prev?.lastSentAt ?? 0, p.paidAt ?? 0),
      // Most-recent-wins, but real creditor names and merchant ids compete in
      // SEPARATE lanes — a later merchant-coded payment must not overwrite an
      // earlier human creditor name (a real name always outranks a code).
      name: credName ?? prev?.name,
      merchantId: merchId ?? prev?.merchantId,
      country: country ?? prev?.country,
      city: cred?.city?.trim() || prev?.city,
      street: cred?.street?.trim() || prev?.street,
      postcode: cred?.postcode?.trim() || prev?.postcode,
    });
  }
  return byAddr;
}

export interface ComputeOptions {
  /** sendCount at/above which a recipient is "frequent". Default 2. */
  frequentThreshold?: number;
  /** Max rows per Frequent / Recent section. Default 8. */
  sectionLimit?: number;
}

/**
 * Pure core — given the raw sent ledger + saved contacts, build the four
 * de-duplicated picker sections plus the flat search corpus. Exported
 * separately from the IO wrapper so it's unit-testable without IndexedDB
 * (mirrors activity.ts `activityForWallet`).
 */
export function computeRecipientSections(
  payments: PaymentRecord[],
  contacts: Contact[],
  opts: ComputeOptions = {},
): RecipientSections {
  const frequentThreshold = opts.frequentThreshold ?? 2;
  const sectionLimit = opts.sectionLimit ?? 8;

  const aggByAddr = aggregatePayments(payments);
  const contactByAddr = new Map<string, Contact>();
  for (const c of contacts) contactByAddr.set(c.address, c);

  const addresses = new Set<string>([...aggByAddr.keys(), ...contactByAddr.keys()]);
  const recipients: Recipient[] = [];
  for (const addr of addresses) {
    const agg = aggByAddr.get(addr);
    const c = contactByAddr.get(addr);
    // Real name precedence: contact label → creditor name → merchant id.
    // Only when ALL are absent do we fall back to the abbreviated address,
    // and we flag that so the compose form won't ship it as the cn.
    const realName = c?.label?.trim() || agg?.name || agg?.merchantId;
    const name = realName || abbreviate(addr);
    recipients.push({
      address: addr,
      name,
      nameIsReal: !!realName,
      country: agg?.country,
      city: agg?.city,
      street: agg?.street,
      postcode: agg?.postcode,
      starred: c?.starred ?? false,
      isFriend: !!c,
      contactId: c?.id,
      sendCount: agg?.sendCount ?? 0,
      lastSentAt: agg?.lastSentAt ?? 0,
    });
  }

  const byRecent = (a: Recipient, b: Recipient) =>
    b.lastSentAt - a.lastSentAt || a.name.localeCompare(b.name);
  const bySendCount = (a: Recipient, b: Recipient) =>
    b.sendCount - a.sendCount || b.lastSentAt - a.lastSentAt || a.name.localeCompare(b.name);
  const byName = (a: Recipient, b: Recipient) => a.name.localeCompare(b.name);

  // De-dup across sections — each person appears in exactly one, highest
  // priority first: Starred → Frequent → Recent → Friends.
  const shown = new Set<string>();
  const claim = (list: Recipient[]) => {
    for (const r of list) shown.add(r.address);
    return list;
  };

  const starred = claim(recipients.filter((r) => r.starred).sort(byRecent));
  const frequent = claim(
    recipients
      .filter((r) => !shown.has(r.address) && r.sendCount >= frequentThreshold)
      .sort(bySendCount)
      .slice(0, sectionLimit),
  );
  const recent = claim(
    // Keyed on sendCount (≥1 for any paid recipient) so a real payment is
    // never dropped from view even if its paidAt timestamp was 0/missing —
    // byRecent still sorts a 0-timestamp row to the bottom.
    recipients
      .filter((r) => !shown.has(r.address) && r.sendCount > 0)
      .sort(byRecent)
      .slice(0, sectionLimit),
  );
  const friends = claim(
    recipients.filter((r) => !shown.has(r.address) && r.isFriend).sort(byName),
  );
  const all = [...recipients].sort(byName);

  return { starred, frequent, recent, friends, all };
}

/** IO wrapper — read both stores then derive the sections. */
export async function buildRecipientSections(opts?: ComputeOptions): Promise<RecipientSections> {
  const [payments, contacts] = await Promise.all([listPayments(), listContacts()]);
  return computeRecipientSections(payments, contacts, opts);
}

/**
 * Toggle the ⭐ on a recipient. A saved friend just flips its flag; a
 * payment-history-only recipient is PROMOTED — saved as a friend (using the
 * best-known name) and starred in one step. addContact still runs the
 * look-alike (Levenshtein) guard, so starring a near-miss address throws —
 * the caller surfaces that message rather than silently trusting it.
 */
export async function toggleStar(r: Recipient): Promise<void> {
  if (r.contactId) {
    await setContactStarred(r.contactId, !r.starred);
    return;
  }
  const created = await addContact(r.name, r.address);
  await setContactStarred(created.id, true);
}

/**
 * Save a payment-history recipient as a friend WITHOUT starring (the "+
 * Friend" affordance). Returns the new contact. Throws via addContact on an
 * exact duplicate or a look-alike address.
 */
export async function saveAsFriend(r: Recipient): Promise<Contact> {
  return addContact(r.name, r.address);
}
