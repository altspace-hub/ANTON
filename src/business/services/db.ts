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
/** v1: receipts. v2: + fc_contacts (FC payment address book — used
 *  by the address-poisoning defense on the merchant's own outgoing
 *  payment surface, when that arrives). */
export const DB_VERSION = 2;

export const STORE_RECEIPTS = 'receipts';
export const STORE_FC_CONTACTS = 'fc_contacts';

export const INDEX_RECEIPTS_BY_CREATED = 'by_created';
export const INDEX_RECEIPTS_BY_STATUS = 'by_status';

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
