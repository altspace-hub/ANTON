/**
 * types.ts — shared domain types for the Business app.
 *
 * Extracted from receipts.ts + merchant.ts so files like
 * backup-format.ts (pure-logic) can import the Receipt / MerchantConfig
 * shape without transitively reaching the storage layer (which talks
 * to Capacitor secure-storage + IndexedDB). The storage modules in
 * task #3 import these same types and add the runtime functions.
 */
import type { CartLine, VatBreakdownEntry } from './cart';

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
  /** Chain tx id once the inbound poller observed the customer's
   *  payment landing on the merchant's wallet. Optional — pre-2026-05-21
   *  receipts confirmed via the legacy local-only flow lack it. */
  txHash?: string | null;
  /** Wallet address that received this payment. Stamped at receipt
   *  creation so multi-wallet merchants can filter "which till took
   *  this sale". Optional — pre-multi-wallet receipts lack it. */
  receivingAddress?: string;
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
  status: ReceiptStatus;
  /** Wallet address that issued this QR — stamped onto the Receipt so
   *  the inbound poller (services/received.ts) can confirm payments
   *  against the correct multi-wallet bucket. */
  receivingAddress?: string;
}

export type SaleMode = 'simple' | 'extended';

export interface MerchantConfig {
  legalName: string;
  orgNr: string;
  city: string;
  street: string;
  postcode: string;
  /** ISO 3166-1 alpha-2 country code (e.g. 'SE'). Feeds the creditor
   *  party of the ISO 20022 PACS.008 carried by every sale QR. */
  country: string;
  vatRegistered: boolean;
  defaultVatRate: 0 | 6 | 12 | 25;
  /** Empty string until the merchant connects a wallet in Settings.
   *  Sale flows that need a payment QR check for this and prompt
   *  the merchant to connect a wallet if it's blank. */
  safelloReceiveAddress: string;
  kvittoEmail?: string;
  /** Merchant's preferred sale mode (picked during onboarding). The
   *  Home screen promotes this button; the other is still accessible. */
  defaultMode: SaleMode;
  nextKvittoNumber: number;
  /** Gap-free credit-note number sequence per Bokföringslagen.
   *  Credit notes (kreditnotor) are distinct from kvittos; they have
   *  their own sequential numbering that must also be gap-free. */
  nextKreditNumber: number;
  /** Gap-free Z-rapport sequence — every daily close gets the next
   *  Z number. Used for the bokföringskonsult's chain of evidence. */
  nextZNumber: number;
  configuredAt: number;
  ftcPerSek: number;
  lastBackupAt: number;
}

/**
 * RefundReceipt (kreditnota) — Swedish bookkeeping requires that a
 * correction is its OWN sequentially-numbered document, not a
 * status flip on the original kvitto. Skatteverket auditors look
 * for the K-…/KN-… pair when reviewing a refunded sale.
 *
 * `originalKvittoNumber` is the FK back to the kvitto being
 * corrected. Partial refunds are supported via `amountSek` ≤ the
 * original's amount; `lines` is the optional subset of original
 * lines being returned (for cart-mode kvittos).
 *
 * Status:
 *   - 'pending'   — the kreditnota has been issued; the merchant has
 *                   yet to broadcast / settle the refund payment.
 *   - 'confirmed' — chain matcher saw the outbound refund tx (when
 *                   the merchant-pays-customer flow is wired) OR the
 *                   merchant manually marked it paid.
 *   - 'voided'    — kreditnota issued in error and cancelled in the
 *                   same session.
 */
export interface RefundReceipt {
  kreditNumber: number;
  originalKvittoNumber: number;
  /** Free-text reason — surfaces on the kreditnota PDF + SIE 4
   *  export. e.g. "Wrong item", "Customer returned product". */
  reason: string;
  amountSek: number;
  amountMicroFtc: bigint;
  ftcPerSek: number;
  vatBreakdownReversed: VatBreakdownEntry[];
  /** Subset of original kvitto lines being refunded. null for
   *  simple-mode (no line items) or full-refund cart mode. */
  linesRefunded: CartLine[] | null;
  /** Chain tx id of the outbound refund payment once it lands.
   *  Optional — many refunds are settled out-of-band (cash, bank). */
  refundTxHash?: string | null;
  status: ReceiptStatus;
  createdAt: number;
  confirmedAt: number | null;
  /** Lightweight staff stamp — until we ship a proper PIN system
   *  this is just the merchant's device-owner default. */
  staffId?: string;
}

export interface NewRefundInput {
  originalKvittoNumber: number;
  reason: string;
  amountSek: number;
  amountMicroFtc: bigint;
  ftcPerSek: number;
  vatBreakdownReversed?: VatBreakdownEntry[];
  linesRefunded?: CartLine[];
  staffId?: string;
}

/**
 * ZReport — the signed daily close.
 *
 * Required by Skatteverket SKVFS 2021:17/18 for kassaregister; the
 * Z-rapport functions as the bokföring voucher for the day's sales
 * and rolls up: which kvittos issued (from-to range), which
 * kreditnotor, which voids, totals per VAT rate, tips collected.
 *
 * Hash-chained: each Z report includes the previous Z's hash so the
 * sequence is tamper-evident (item #10 in the expert plan).
 */
export interface ZReport {
  zNumber: number;
  openedAt: number;
  closedAt: number;
  /** First and last kvitto number issued in this window. Reading
   *  receipts WHERE kvittoNumber BETWEEN these gives the window's
   *  kvitto set. */
  fromKvittoNumber: number;
  toKvittoNumber: number;
  /** Same for credit notes issued in the window. */
  fromKreditNumber: number;
  toKreditNumber: number;
  /** Daily roll-ups. salesNet = salesGross - VAT. */
  salesGrossSek: number;
  salesNetSek: number;
  vatSek6: number;
  vatSek12: number;
  vatSek25: number;
  voidsCount: number;
  voidsGrossSek: number;
  refundsCount: number;
  refundsGrossSek: number;
  tipsSek: number;
  /** Total FTC received across the window in micro-FTC. */
  ftcReceivedMicro: bigint;
  /** SHA-256 hex of the previous Z report's canonical JSON; null for
   *  the very first Z. Forms the tamper-evident chain. */
  prevHash: string | null;
  /** SHA-256 hex of this Z report's canonical JSON (computed at sign
   *  time over every other field except `signature`). */
  selfHash: string;
  /** Ed25519 signature over selfHash by the merchant's active wallet. */
  signature: string;
  /** Optional external timestamp (RFC 3161 or relay-side timestamp)
   *  to anchor selfHash at a third party. */
  externalTimestamp?: string;
}

export interface KvittoRenderModel {
  receipt: Receipt;
  merchant: MerchantConfig;
}

/** Format the kvitto number per Bokföringslagen — gap-free, padded
 *  for readability. e.g. "K-000001". Pure helper; lives here so
 *  formatters can import it without pulling the storage layer. */
export function formatKvittoNumber(n: number): string {
  return 'K-' + n.toString().padStart(6, '0');
}

/** Kreditnota number — same shape, KN- prefix. */
export function formatKreditNumber(n: number): string {
  return 'KN-' + n.toString().padStart(6, '0');
}

/** Z-rapport number — short prefix; matches Swedish kassaregister
 *  convention of "Z-001", "Z-002" daily. */
export function formatZNumber(n: number): string {
  return 'Z-' + n.toString().padStart(4, '0');
}
