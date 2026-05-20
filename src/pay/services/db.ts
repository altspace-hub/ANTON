/**
 * db.ts — IndexedDB store for the customer's payment records.
 *
 * One object store keyed by the payment id. Records are written by
 * services/payment.ts when the customer confirms a payment, and read
 * back by the Home + History screens. Records hold a `bigint`
 * (amountMicroFtc) — IndexedDB's structured clone preserves BigInt, so
 * records are stored as-is with no serialisation step.
 */
import type { PaymentRecord } from './types';

const DB_NAME = 'anton-pay';
const DB_VERSION = 1;
const STORE = 'payments';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Insert (or replace) a payment record. */
export async function putPayment(record: PaymentRecord): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Fetch a single payment record by id, or null if not found. */
export async function getPayment(id: string): Promise<PaymentRecord | null> {
  const db = await open();
  const row = await new Promise<PaymentRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as PaymentRecord | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row;
}

/** All payment records, newest first. */
export async function getAllPayments(): Promise<PaymentRecord[]> {
  const db = await open();
  const rows = await new Promise<PaymentRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PaymentRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => b.paidAt - a.paidAt);
}

/** Erase every payment record (Settings → Reset app). */
export async function wipePayments(): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
