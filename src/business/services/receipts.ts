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
import { openDb, STORE_RECEIPTS, INDEX_RECEIPTS_BY_CREATED } from './db';
import { consumeKvittoNumber, loadConfig } from './merchant';
import type { NewReceiptInput, Receipt } from './types';

export type { Receipt, NewReceiptInput, ReceiptMode, ReceiptStatus, KvittoRenderModel } from './types';
export { formatKvittoNumber } from './types';

/** Allocate the next kvitto number from the merchant config + persist
 *  the receipt row. Returns the inserted Receipt. */
export async function persistReceipt(input: NewReceiptInput): Promise<Receipt> {
  const config = await loadConfig();
  if (!config) throw new Error('persistReceipt: merchant not configured');
  const kvittoNumber = await consumeKvittoNumber(config);
  const now = Date.now();
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
