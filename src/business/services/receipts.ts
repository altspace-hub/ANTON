/**
 * receipts.ts — persistence for the merchant's kvittos.
 *
 * Same surface as the Expo project's receipts.ts; switched from
 * expo-sqlite to IndexedDB via db.ts. kvittoNumber is the gap-free
 * Bokföringslagen 5 kap. sequence — allocation runs through
 * consumeKvittoNumber on the merchant config, same as before.
 *
 * Status flow ('pending' → 'confirmed' / 'voided') is unchanged.
 */
import { sha256 } from '@noble/hashes/sha2';
import { openDb, STORE_RECEIPTS, INDEX_RECEIPTS_BY_CREATED } from './db';
import { consumeKvittoNumber, loadConfig } from './merchant';
import type { NewReceiptInput, Receipt } from './types';

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (const byte of b) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Deterministic JSON of a Receipt minus its own prevHash — the
 *  hash a SUBSEQUENT kvitto stores in its `prevHash` field. */
function canonicalizeReceipt(r: Receipt): string {
  const { prevHash: _ignore, ...rest } = r;
  const obj: Record<string, unknown> = { ...rest };
  obj.amountMicroFtc = r.amountMicroFtc.toString();
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

function hashReceipt(r: Receipt): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalizeReceipt(r))));
}

export type { Receipt, NewReceiptInput, ReceiptMode, ReceiptStatus, KvittoRenderModel } from './types';
export { formatKvittoNumber } from './types';

/** Allocate the next kvitto number from the merchant config + persist
 *  the receipt row. Returns the inserted Receipt.
 *
 *  Wave 5: stamps `prevHash` = SHA-256 of the immediately previous
 *  kvitto's canonical JSON. Forms a tamper-evident chain across the
 *  whole receipts table. Combined with the Z-rapport signature, this
 *  is court-defensible audit evidence — editing any past kvitto
 *  breaks the prevHash on its successor, which breaks the Z-rapport
 *  reconciliation, which fails the bookkeeping audit. */
export async function persistReceipt(input: NewReceiptInput): Promise<Receipt> {
  const config = await loadConfig();
  if (!config) throw new Error('persistReceipt: merchant not configured');
  const kvittoNumber = await consumeKvittoNumber(config);
  const now = Date.now();
  // Find the immediately-previous kvitto so we can chain its hash in.
  const prev = kvittoNumber > 1 ? await getReceipt(kvittoNumber - 1) : null;
  const prevHash = prev ? hashReceipt(prev) : undefined;
  const row: Receipt = {
    kvittoNumber,
    orderId: input.orderId,
    merchantId: input.merchantId,
    mode: input.mode,
    purpose: input.purpose,
    amountSek: input.amountSek,
    amountMicroFtc: input.amountMicroFtc,
    ftcPerSek: input.ftcPerSek,
    vatSek: input.vatSek ?? 0,
    discountSek: input.discountSek ?? 0,
    itemCount: input.itemCount ?? 1,
    lines: input.lines ?? null,
    vatBreakdown: input.vatBreakdown,
    qrUri: input.qrUri,
    ref: input.ref,
    uetr: null,
    status: input.status,
    createdAt: now,
    confirmedAt: input.status === 'confirmed' ? now : null,
    txHash: null,
    receivingAddress: input.receivingAddress,
    prevHash,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECEIPTS, 'readwrite');
    // IDB doesn't natively store bigint values — serialize to string at
    // the boundary, hydrate back on read.
    tx.objectStore(STORE_RECEIPTS).put(serializeForIdb(row));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return row;
}

export async function getReceipt(kvittoNumber: number): Promise<Receipt | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECEIPTS, 'readonly');
    const req = tx.objectStore(STORE_RECEIPTS).get(kvittoNumber);
    req.onsuccess = () => {
      const stored = req.result as IdbReceipt | undefined;
      resolve(stored ? hydrate(stored) : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listReceipts(limit = 100): Promise<Receipt[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECEIPTS, 'readonly');
    const idx = tx.objectStore(STORE_RECEIPTS).index(INDEX_RECEIPTS_BY_CREATED);
    const req = idx.openCursor(null, 'prev');
    const out: Receipt[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && out.length < limit) {
        out.push(hydrate(cursor.value as IdbReceipt));
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Find a pending receipt that matches an inbound chain transaction
 * and flip it to `confirmed`. Matching is conservative: amount must
 * match exactly (after the satoshi → micro-FTC conversion in the
 * caller); ref must contain the receipt's ref string (a SUBSTRING
 * match because the chain may wrap the ADR-004 reference inside other
 * remittance text); receiving address must match if both sides have
 * it. Returns the confirmed receipt, or null when no match.
 *
 * Multi-match guard: if more than one pending receipt has the same
 * amount + ref, we refuse to auto-confirm and return null — the
 * merchant has to reconcile manually. Same-amount-and-ref collisions
 * are vanishingly rare in practice but we'd rather surface the
 * ambiguity than guess.
 */
export async function confirmReceiptByMatch(opts: {
  amountMicroFtc: bigint;
  ref: string;
  txHash: string;
  receivingAddress: string;
  /** Wave 10 — structured remittance the customer attached, decoded
   *  from the on-chain PACS.008 RmtInf. Persisted onto the confirmed
   *  receipt so the merchant can read the customer's note / terms. */
  customerRemittance?: Receipt['customerRemittance'];
}): Promise<Receipt | null> {
  const pending = (await listReceipts(500)).filter(r => r.status === 'pending');
  const matches = pending.filter(r =>
    r.amountMicroFtc === opts.amountMicroFtc &&
    (opts.ref === '' || r.ref === opts.ref || opts.ref.includes(r.ref)) &&
    (!r.receivingAddress || r.receivingAddress === opts.receivingAddress)
  );
  if (matches.length !== 1) return null;
  const receipt = matches[0];
  const db = await openDb();
  const updated: Receipt = {
    ...receipt,
    status: 'confirmed',
    confirmedAt: Date.now(),
    txHash: opts.txHash,
    ...(opts.customerRemittance ? { customerRemittance: opts.customerRemittance } : {}),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECEIPTS, 'readwrite');
    tx.objectStore(STORE_RECEIPTS).put(serializeForIdb(updated));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return updated;
}

export async function voidReceipt(kvittoNumber: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECEIPTS, 'readwrite');
    const store = tx.objectStore(STORE_RECEIPTS);
    const getReq = store.get(kvittoNumber);
    getReq.onsuccess = () => {
      const row = getReq.result as IdbReceipt | undefined;
      if (!row) {
        resolve();
        return;
      }
      store.put({ ...row, status: 'voided' });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── IDB serialization helpers ────────────────────────────────────────
//
// bigint can't be structured-cloned into IDB (browsers throw
// DataCloneError on some versions; even where it works, indexes can't
// span bigint keys). Serialize amountMicroFtc as a decimal string on
// store, hydrate on read.

interface IdbReceipt extends Omit<Receipt, 'amountMicroFtc'> {
  amountMicroFtc: string;
}

function serializeForIdb(r: Receipt): IdbReceipt {
  return { ...r, amountMicroFtc: r.amountMicroFtc.toString() };
}

function hydrate(r: IdbReceipt): Receipt {
  return { ...r, amountMicroFtc: BigInt(r.amountMicroFtc) };
}
