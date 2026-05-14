/**
 * receipts.ts — persistence for the merchant's kvittos.
 *
 * The kvitto number is the gap-free sequence required by
 * Bokföringslagen 5 kap. Allocation goes through the MerchantConfig
 * counter (consumeKvittoNumber) so the same monotonic counter
 * survives across both Simple and Extended modes.
 *
 * Status flow:
 *   - 'pending'   : QR generated, awaiting confirmation
 *   - 'confirmed' : merchant tapped "Paid ✓" OR RPC poll observed
 *                   the inbound PACS.008
 *   - 'voided'    : merchant cancelled. Row stays for audit — we
 *                   never delete; void preserves the gap-free
 *                   sequence per Skatteverket guidance.
 */
import type { VatBreakdownEntry, CartLine } from './cart';
import { openDb } from './db';
import {
  consumeKvittoNumber,
  loadConfig,
  type MerchantConfig,
} from './merchant';

export type ReceiptMode = 'simple' | 'extended';
export type ReceiptStatus = 'pending' | 'confirmed' | 'voided';

export interface Receipt {
  kvittoNumber: number;
  orderId: string;
  merchantId: string;
  mode: ReceiptMode;
  purpose: string;
  amountSek: number;
  amountMicroFtc: bigint;
  ftcPerSek: number;
  vatSek: number;
  discountSek: number;
  itemCount: number;
  lines: CartLine[] | null;
  vatBreakdown: VatBreakdownEntry[];
  qrUri: string;
  ref: string;
  uetr: string | null;
  status: ReceiptStatus;
  createdAt: number;
  confirmedAt: number | null;
}

export interface NewReceiptInput {
  orderId: string;
  merchantId: string;
  mode: ReceiptMode;
  purpose: string;
  amountSek: number;
  amountMicroFtc: bigint;
  ftcPerSek: number;
  vatSek?: number;
  discountSek?: number;
  itemCount?: number;
  lines?: CartLine[];
  vatBreakdown: VatBreakdownEntry[];
  qrUri: string;
  ref: string;
  /** When confirming via "Paid ✓" tap, the receipt is created already
   *  confirmed. When the RPC poller eventually lands, it'll insert
   *  with status='pending' on QR generation and UPDATE to 'confirmed'
   *  on inbound PACS.008 detection. */
  status: ReceiptStatus;
}

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
  await db.runAsync(
    `INSERT INTO receipts (
      kvitto_number, order_id, merchant_id, mode, purpose,
      amount_sek, amount_micro_ftc, ftc_per_sek, vat_sek, discount_sek,
      item_count, lines_json, vat_breakdown_json, qr_uri, ref, uetr,
      status, created_at, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.kvittoNumber,
    row.orderId,
    row.merchantId,
    row.mode,
    row.purpose,
    row.amountSek,
    row.amountMicroFtc.toString(),
    row.ftcPerSek,
    row.vatSek,
    row.discountSek,
    row.itemCount,
    row.lines ? JSON.stringify(row.lines) : null,
    JSON.stringify(row.vatBreakdown),
    row.qrUri,
    row.ref,
    row.uetr,
    row.status,
    row.createdAt,
    row.confirmedAt,
  );
  return row;
}

interface DbRow {
  kvitto_number: number;
  order_id: string;
  merchant_id: string;
  mode: ReceiptMode;
  purpose: string;
  amount_sek: number;
  amount_micro_ftc: string;
  ftc_per_sek: number;
  vat_sek: number;
  discount_sek: number;
  item_count: number;
  lines_json: string | null;
  vat_breakdown_json: string;
  qr_uri: string;
  ref: string;
  uetr: string | null;
  status: ReceiptStatus;
  created_at: number;
  confirmed_at: number | null;
}

function hydrate(row: DbRow): Receipt {
  return {
    kvittoNumber: row.kvitto_number,
    orderId: row.order_id,
    merchantId: row.merchant_id,
    mode: row.mode,
    purpose: row.purpose,
    amountSek: row.amount_sek,
    amountMicroFtc: BigInt(row.amount_micro_ftc),
    ftcPerSek: row.ftc_per_sek,
    vatSek: row.vat_sek,
    discountSek: row.discount_sek,
    itemCount: row.item_count,
    lines: row.lines_json ? (JSON.parse(row.lines_json) as CartLine[]) : null,
    vatBreakdown: JSON.parse(row.vat_breakdown_json) as VatBreakdownEntry[],
    qrUri: row.qr_uri,
    ref: row.ref,
    uetr: row.uetr,
    status: row.status,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

export async function getReceipt(kvittoNumber: number): Promise<Receipt | null> {
  const db = await openDb();
  const row = await db.getFirstAsync<DbRow>(
    'SELECT * FROM receipts WHERE kvitto_number = ?',
    kvittoNumber,
  );
  return row ? hydrate(row) : null;
}

export async function listReceipts(limit = 100): Promise<Receipt[]> {
  const db = await openDb();
  const rows = await db.getAllAsync<DbRow>(
    'SELECT * FROM receipts ORDER BY created_at DESC LIMIT ?',
    limit,
  );
  return rows.map(hydrate);
}

export async function voidReceipt(kvittoNumber: number): Promise<void> {
  const db = await openDb();
  await db.runAsync(
    `UPDATE receipts SET status = 'voided' WHERE kvitto_number = ?`,
    kvittoNumber,
  );
}

/** Format the kvitto number per Bokföringslagen — gap-free, padded
 *  for readability. e.g. "K-000001". */
export function formatKvittoNumber(n: number): string {
  return 'K-' + n.toString().padStart(6, '0');
}

/** What goes on a Skatteverket-compliant kvitto. */
export interface KvittoRenderModel {
  receipt: Receipt;
  merchant: MerchantConfig;
}
