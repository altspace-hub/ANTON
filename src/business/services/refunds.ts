/**
 * refunds.ts — kreditnota (credit note) issuance.
 *
 * Skatteverket + Bokföringslagen 5 kap require that a sale
 * correction is its own sequentially-numbered document, NOT a
 * status flip on the original kvitto. The kreditnota:
 *   • has its own gap-free `kreditNumber` (KN-…)
 *   • references the original `kvittoNumber`
 *   • carries the VAT breakdown as NEGATIVE values so the bookkeeping
 *     net-out is straightforward in SIE 4
 *   • can be partial (refund of 1 item from a 3-item kvitto) — in
 *     that case `linesRefunded` is the subset being returned
 *
 * Flow:
 *   1. issueRefund() — creates the kreditnota + persists it. Returns
 *      the just-created RefundReceipt with status='pending'.
 *   2. The caller (UI) shows the kreditnota PDF, prints it, emails it.
 *   3. When the merchant has confirmed the refund payment landed
 *      (cash, bank, or on-chain outbound), call markRefundConfirmed()
 *      with the optional refundTxHash.
 *
 * Status transitions mirror the kvitto:
 *   pending → confirmed (refund paid)
 *   pending → voided    (issued in error in the same session)
 */
import {
  openDb, STORE_REFUNDS, INDEX_REFUNDS_BY_ORIGINAL, INDEX_REFUNDS_BY_CREATED,
} from './db';
import { consumeKreditNumber, loadConfig } from './merchant';
import { getReceipt } from './receipts';
import type { NewRefundInput, RefundReceipt, VatBreakdownEntry } from './types';

// IDB hates bigint; serialise the same way receipts.ts does.
interface IdbRefund extends Omit<RefundReceipt, 'amountMicroFtc'> {
  amountMicroFtc: string;
}

function serialize(r: RefundReceipt): IdbRefund {
  return { ...r, amountMicroFtc: r.amountMicroFtc.toString() };
}
function hydrate(r: IdbRefund): RefundReceipt {
  return { ...r, amountMicroFtc: BigInt(r.amountMicroFtc) };
}

/** Build the negative VAT breakdown for a refund. If the caller
 *  supplies one explicitly (partial refund with line selection) we
 *  use that; otherwise we negate the original kvitto's breakdown. */
function negateVat(entries: VatBreakdownEntry[]): VatBreakdownEntry[] {
  return entries.map(e => ({ ...e, netSek: -e.netSek, vatSek: -e.vatSek, grossSek: -e.grossSek }));
}

/**
 * Issue a kreditnota correcting (a subset of) the named kvitto.
 * Throws if the original is missing or already fully refunded.
 */
export async function issueRefund(input: NewRefundInput): Promise<RefundReceipt> {
  const config = await loadConfig();
  if (!config) throw new Error('issueRefund: merchant not configured');
  const original = await getReceipt(input.originalKvittoNumber);
  if (!original) {
    throw new Error(`issueRefund: kvitto ${input.originalKvittoNumber} not found`);
  }
  if (input.amountSek <= 0) {
    throw new Error('issueRefund: amount must be positive');
  }
  if (input.amountSek > original.amountSek) {
    throw new Error(`issueRefund: amount ${input.amountSek} SEK exceeds original ${original.amountSek} SEK`);
  }

  const kreditNumber = await consumeKreditNumber(config);
  const now = Date.now();
  const row: RefundReceipt = {
    kreditNumber,
    originalKvittoNumber: input.originalKvittoNumber,
    reason: input.reason.trim() || 'Refund',
    amountSek: input.amountSek,
    amountMicroFtc: input.amountMicroFtc,
    ftcPerSek: input.ftcPerSek,
    // If the caller supplied a partial-refund breakdown use it
    // directly; otherwise negate the original's.
    vatBreakdownReversed: input.vatBreakdownReversed
      ?? negateVat(original.vatBreakdown),
    linesRefunded: input.linesRefunded ?? null,
    refundTxHash: null,
    status: 'pending',
    createdAt: now,
    confirmedAt: null,
    staffId: input.staffId,
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_REFUNDS, 'readwrite');
    tx.objectStore(STORE_REFUNDS).put(serialize(row));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return row;
}

/** Mark a previously-issued kreditnota as paid out. The optional
 *  refundTxHash is the chain tx id when the refund was settled on-
 *  chain; cash / bank refunds leave it null. */
export async function markRefundConfirmed(
  kreditNumber: number,
  refundTxHash: string | null = null,
): Promise<RefundReceipt | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REFUNDS, 'readwrite');
    const store = tx.objectStore(STORE_REFUNDS);
    const req = store.get(kreditNumber);
    req.onsuccess = () => {
      const row = req.result as IdbRefund | undefined;
      if (!row) { resolve(null); return; }
      const updated: RefundReceipt = {
        ...hydrate(row),
        status: 'confirmed',
        confirmedAt: Date.now(),
        refundTxHash,
      };
      store.put(serialize(updated));
      tx.oncomplete = () => resolve(updated);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRefunds(limit = 100): Promise<RefundReceipt[]> {
  const db = await openDb();
  const rows = await new Promise<IdbRefund[]>((resolve, reject) => {
    const tx = db.transaction(STORE_REFUNDS, 'readonly');
    const req = tx.objectStore(STORE_REFUNDS).index(INDEX_REFUNDS_BY_CREATED)
      .openCursor(null, 'prev');
    const out: IdbRefund[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && out.length < limit) { out.push(cursor.value as IdbRefund); cursor.continue(); }
      else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
  return rows.map(hydrate);
}

/** All credit notes pointing at the given original kvitto. Used by
 *  the receipt-detail UI to show "refunded — KN-000007 (50 SEK)". */
export async function listRefundsFor(kvittoNumber: number): Promise<RefundReceipt[]> {
  const db = await openDb();
  const rows = await new Promise<IdbRefund[]>((resolve, reject) => {
    const tx = db.transaction(STORE_REFUNDS, 'readonly');
    const req = tx.objectStore(STORE_REFUNDS).index(INDEX_REFUNDS_BY_ORIGINAL)
      .getAll(kvittoNumber);
    req.onsuccess = () => resolve((req.result as IdbRefund[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return rows.map(hydrate);
}

/** Total previously-refunded amount for the given original kvitto,
 *  in SEK. Used to block over-refunds (partial-refund 50 + 50 + 50
 *  on a 100 SEK kvitto must be rejected on the third attempt). */
export async function totalRefundedSekFor(kvittoNumber: number): Promise<number> {
  const list = await listRefundsFor(kvittoNumber);
  return list
    .filter(r => r.status !== 'voided')
    .reduce((sum, r) => sum + r.amountSek, 0);
}
