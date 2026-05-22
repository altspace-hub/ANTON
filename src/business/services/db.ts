/**
 * db.ts — single source of the Business app's IndexedDB schema.
 *
 * Replaces the Expo project's expo-sqlite store (which can't run in
 * a Capacitor WebView). Same logical schema as the original receipts
 * table: kvitto_number is the primary key (gap-free per Bokföringslagen),
 * with secondary indexes by createdAt (for descending list) and status
 * (for filtering pending/voided rows).
 *
 * Indexed columns are pulled onto the stored row as top-level fields
 * so IDB can index them — the rest of the receipt's data is just the
 * normal Receipt shape.
 */

export const DB_NAME = 'anton-business';
/** v1: receipts. v2: + fc_contacts. v3: + refunds (kreditnotor) +
 *  z_reports (daily close). v4: + stock_movements (Wave 12 inventory
 *  — append-only audit log of every stock change). Bokföringslagen 5
 *  kap requires the refund chain to be a separate sequenced document;
 *  SKVFS 2021:17 requires the Z-rapport for kassaregister. */
export const DB_VERSION = 4;

export const STORE_RECEIPTS = 'receipts';
export const STORE_FC_CONTACTS = 'fc_contacts';
export const STORE_REFUNDS = 'refunds';
export const STORE_Z_REPORTS = 'z_reports';
export const STORE_STOCK_MOVEMENTS = 'stock_movements';

export const INDEX_RECEIPTS_BY_CREATED = 'by_created';
export const INDEX_RECEIPTS_BY_STATUS = 'by_status';
export const INDEX_REFUNDS_BY_ORIGINAL = 'by_original';
export const INDEX_REFUNDS_BY_CREATED = 'by_created';
export const INDEX_ZREPORTS_BY_CLOSED = 'by_closed';
export const INDEX_STOCK_BY_ITEM = 'by_item';
export const INDEX_STOCK_BY_CREATED = 'by_created';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECEIPTS)) {
        const store = db.createObjectStore(STORE_RECEIPTS, { keyPath: 'kvittoNumber' });
        store.createIndex(INDEX_RECEIPTS_BY_CREATED, 'createdAt', { unique: false });
        store.createIndex(INDEX_RECEIPTS_BY_STATUS, 'status', { unique: false });
      }
      // v2 — FC address book (payment recipient contacts). Used by
      // findSimilarContacts() for the address-poisoning defense.
      if (!db.objectStoreNames.contains(STORE_FC_CONTACTS)) {
        const store = db.createObjectStore(STORE_FC_CONTACTS, { keyPath: 'id' });
        store.createIndex('byAddress', 'address', { unique: false });
      }
      // v3 — credit notes (kreditnotor). Own gap-free sequence per
      // Bokföringslagen 5 kap. originalKvittoNumber is the FK back
      // to the kvitto being corrected.
      if (!db.objectStoreNames.contains(STORE_REFUNDS)) {
        const store = db.createObjectStore(STORE_REFUNDS, { keyPath: 'kreditNumber' });
        store.createIndex(INDEX_REFUNDS_BY_ORIGINAL, 'originalKvittoNumber', { unique: false });
        store.createIndex(INDEX_REFUNDS_BY_CREATED, 'createdAt', { unique: false });
      }
      // v3 — Z reports (daily close). Each holds a hash chain back
      // to the previous Z plus an Ed25519 signature by the merchant's
      // active wallet.
      if (!db.objectStoreNames.contains(STORE_Z_REPORTS)) {
        const store = db.createObjectStore(STORE_Z_REPORTS, { keyPath: 'zNumber' });
        store.createIndex(INDEX_ZREPORTS_BY_CLOSED, 'closedAt', { unique: false });
      }
      // v4 — stock movements (Wave 12 inventory). Append-only audit
      // log: every sale / restock / adjustment / wastage / initial
      // count is one immutable row. Current stock = initial + Σdelta.
      // `id` is a generated string; indexed by itemId (per-item
      // history) and createdAt (chronological list).
      if (!db.objectStoreNames.contains(STORE_STOCK_MOVEMENTS)) {
        const store = db.createObjectStore(STORE_STOCK_MOVEMENTS, { keyPath: 'id' });
        store.createIndex(INDEX_STOCK_BY_ITEM, 'itemId', { unique: false });
        store.createIndex(INDEX_STOCK_BY_CREATED, 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  return dbPromise;
}

/** For tests + dev reset only. */
export async function wipeReceipts(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECEIPTS, 'readwrite');
    tx.objectStore(STORE_RECEIPTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
