/**
 * recipients.ts — the "people you pay" model behind the Comm Send picker (#93).
 *
 * Ported from src/pay/services/recipients.ts, adapted to Comm's ledger. A
 * Recipient is one address you can pay, assembled from two sources:
 *   1. Saved contacts (services/address-book.ts `fc_contacts`) — explicit
 *      friends with a name, optionally ⭐ starred.
 *   2. Your own SENT wallet history (services/transactions.ts `listTxs`,
 *      filtered to kind==='send') — everyone you've actually paid, with a send
 *      count + last-sent time and the recipient's name/country recovered from
 *      the stored PACS.008 creditor party.
 *
 * ANTI-POISONING — DELIBERATE: recents/frequent come ONLY from payments you
 * SENT (each one a vetted, user-confirmed destination). We NEVER mine inbound
 * (kind==='receive') rows for recipients — that's the exact channel
 * address-poisoning dust arrives on (see services/address-book.ts header). A
 * stranger who dusts you must never surface here as someone to "pay back".
 *
 * The picker groups recipients into Starred / Frequent / Recent / Friends,
 * de-duplicated so each person shows in exactly one section (highest first).
 *
 * COMM DELTA vs Pay: the SENT ledger is WalletTx (counterparty = to-address,
 * ts = timestamp, pacs008.creditor = name/country) not PaymentRecord, and
 * Comm WalletTx has no `merchantId` — so the name precedence collapses to
 * contact label → creditor name → abbreviated address.
 */
import {
  listContacts, addContact, setContactStarred, type Contact,
} from './address-book';
import { listSentTxs, type WalletTx } from './transactions';

export interface Recipient {
  /** Canonical fc_… address. The picker's stable key. */
  address: string;
  /** Best-known display name: saved contact label → last payment's creditor
   *  name → abbreviated address. Never the empty string. */
  name: string;
  /** False when `name` is only the abbreviated-address fallback (no real
   *  name was ever known). The compose form then leaves the creditor-name
   *  field BLANK so the user types a real name, rather than shipping
   *  "fc_AAA…AAA" as the PACS.008 cn. */
  nameIsReal: boolean;
  /** ISO-3166 alpha-2 country recovered from the most recent payment's
   *  creditor party. Undefined when only a friend (no payment) is known. */
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

interface SendAgg {
  address: string;
  sendCount: number;
  lastSentAt: number;
  /** Most-recent REAL creditor name. */
  name?: string;
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
 * Fold the SENT wallet ledger into one aggregate per destination address.
 * Only `kind === 'send'` rows are considered — inbound rows are NEVER mined
 * (anti-poisoning). Iterated oldest→newest so the MOST RECENT send's creditor
 * name/country win (later writes overwrite). Recipient identity comes from the
 * stored `pacs008.creditor` party.
 */
function aggregateSends(txs: WalletTx[]): Map<string, SendAgg> {
  const byAddr = new Map<string, SendAgg>();
  const sends = txs.filter((t) => t.kind === 'send');
  const sorted = [...sends].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  for (const t of sorted) {
    const addr = t.counterparty;
    if (!addr) continue;
    const prev = byAddr.get(addr);
    const cred = t.pacs008?.creditor;
    const credName = cred?.name?.trim() || undefined;
    const country = cred?.country?.trim().toUpperCase() || undefined;
    byAddr.set(addr, {
      address: addr,
      sendCount: (prev?.sendCount ?? 0) + 1,
      lastSentAt: Math.max(prev?.lastSentAt ?? 0, t.ts ?? 0),
      // Most-recent-wins; a missing name keeps the earlier known name.
      name: credName ?? prev?.name,
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
 * separately from the IO wrapper so it's unit-testable without IndexedDB.
 */
export function computeRecipientSections(
  txs: WalletTx[],
  contacts: Contact[],
  opts: ComputeOptions = {},
): RecipientSections {
  const frequentThreshold = opts.frequentThreshold ?? 2;
  const sectionLimit = opts.sectionLimit ?? 8;

  const aggByAddr = aggregateSends(txs);
  const contactByAddr = new Map<string, Contact>();
  for (const c of contacts) contactByAddr.set(c.address, c);

  const addresses = new Set<string>([...aggByAddr.keys(), ...contactByAddr.keys()]);
  const recipients: Recipient[] = [];
  for (const addr of addresses) {
    const agg = aggByAddr.get(addr);
    const c = contactByAddr.get(addr);
    // Real name precedence: contact label → creditor name. Only when both are
    // absent do we fall back to the abbreviated address, flagged so the
    // compose form won't ship it as the cn.
    const realName = c?.label?.trim() || agg?.name;
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
    // never dropped from view even if its ts was 0/missing — byRecent still
    // sorts a 0-timestamp row to the bottom.
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

/** IO wrapper — read both stores then derive the sections. Uses listSentTxs
 *  (a sends-only cursor) so heavy receive volume can't starve genuine send
 *  history out of the window; computeRecipientSections re-filters defensively. */
export async function buildRecipientSections(opts?: ComputeOptions): Promise<RecipientSections> {
  const [txs, contacts] = await Promise.all([listSentTxs(500), listContacts()]);
  return computeRecipientSections(txs, contacts, opts);
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
  // Only save a REAL name as the label — never the abbreviated-address
  // fallback (addContact turns '' into 'Unnamed' rather than 'fc_AAA…AAA').
  const created = await addContact(r.nameIsReal ? r.name : '', r.address);
  await setContactStarred(created.id, true);
}

/**
 * Save a payment-history recipient as a friend WITHOUT starring (the "+
 * Friend" affordance). Returns the new contact. Throws via addContact on an
 * exact duplicate or a look-alike address.
 */
export async function saveAsFriend(r: Recipient): Promise<Contact> {
  return addContact(r.nameIsReal ? r.name : '', r.address);
}
