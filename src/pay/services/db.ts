/**
 * db.ts — IndexedDB store for outgoing and incoming transactions.
 *
 * Two object stores:
 *   - `payments` — outgoing PaymentRecord rows (services/payment.ts)
 *   - `received` — inbound ReceivedRecord rows (services/received.ts)
 *
 * Both records hold `bigint` (amountMicroFtc) — IndexedDB's structured
 * clone preserves BigInt, so records are stored as-is with no
 * serialisation step.
 *
 * v1 → v2 (2026-05-21): added the `received` store. The migration
 * inside `onupgradeneeded` is idempotent and survives downgrades on
 * the same physical device because the old store keeps its data.
 */
import type { PaymentRecord, ReceivedRecord } from './types';

const DB_NAME = 'anton-pay';
const DB_VERSION = 2;
const STORE = 'payments';
const RECEIVED_STORE = 'received';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RECEIVED_STORE)) {
        db.createObjectStore(RECEIVED_STORE, { keyPath: 'txId' });
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

// ── Inbound (received) transaction store ────────────────────────────

/** Persist a received record. Keyed by `txId` — re-puts on the same
 *  id overwrite, which is what we want when block_height / timestamp
 *  fills in on a later poll. */
export async function putReceived(record: ReceivedRecord): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECEIVED_STORE, 'readwrite');
    tx.objectStore(RECEIVED_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Cheap existence check used by the poller's dedupe loop. */
export async function hasReceivedTxId(txId: string): Promise<boolean> {
  const db = await open();
  const row = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(RECEIVED_STORE, 'readonly');
    const req = tx.objectStore(RECEIVED_STORE).getKey(txId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return row !== undefined;
}

/** All received records, newest first. */
export async function getAllReceived(): Promise<ReceivedRecord[]> {
  const db = await open();
  const rows = await new Promise<ReceivedRecord[]>((resolve, reject) => {
    const tx = db.transaction(RECEIVED_STORE, 'readonly');
    const req = tx.objectStore(RECEIVED_STORE).getAll();
    req.onsuccess = () => resolve((req.result as ReceivedRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => b.receivedAt - a.receivedAt);
}

/** Erase every received record. Pairs with wipePayments() on a full
 *  app reset. */
export async function wipeReceived(): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECEIVED_STORE, 'readwrite');
    tx.objectStore(RECEIVED_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
