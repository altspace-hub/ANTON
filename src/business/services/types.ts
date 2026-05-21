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
  configuredAt: number;
  ftcPerSek: number;
  lastBackupAt: number;
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
