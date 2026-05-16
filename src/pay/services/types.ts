/**
 * types.ts — shared domain types for the Pay app.
 *
 * Kept storage-free so pure-logic modules (payment URI decode) can
 * import these shapes without reaching the Capacitor / IndexedDB layer.
 */

export type PaymentPurpose = 'RETAIL' | 'RESTAURANT' | 'EVENT' | 'SERVICE' | 'REFUND';

/**
 * The customer's local profile. A private person needs almost nothing
 * configured — just the SEK estimate rate and a marker that onboarding
 * is complete. The wallet itself lives in secure-store, not here.
 */
export interface PayProfile {
  /** Epoch ms the wallet was created / onboarding finished. */
  configuredAt: number;
  /** SEK estimate rate — FTC per 1 SEK. The `futurechain:pay` QR
   *  carries only micro-FTC, so the SEK figure shown on the Review
   *  screen is an estimate at this rate. Default 0.1 (1 FTC = 10 SEK). */
  ftcPerSek: number;
}

/**
 * A `futurechain:pay` URI decoded into something the Review screen can
 * render. Produced by services/payment.ts `decodePaymentUri`.
 */
export interface DecodedPayment {
  /** Merchant's Safello-arranged receive address (QR `to`). */
  toAddress: string;
  /** Amount in micro-FTC (QR `amount`). 1 FTC = 1_000_000 micro-FTC. */
  amountMicroFtc: bigint;
  /** Always 'FTC' for v1 QRs. */
  currency: string;
  /** Raw ADR-004 reference string (QR `ref`). */
  ref: string;
  /** 8-char merchant id from the decoded v1 reference. */
  merchantId: string;
  /** 12-char order id. */
  orderId: string;
  /** v1 purpose. */
  purpose: PaymentPurpose;
  /** Item count (Extended-mode QRs only). */
  itemCount: number | null;
  /** VAT in micro-FTC (Extended-mode QRs only). */
  vatMicroFtc: bigint | null;
  /** Discount in micro-FTC (Extended-mode QRs only). */
  discountMicroFtc: bigint | null;
  /** Unix-seconds expiry. 0 means the QR carried no expiry. */
  expUnixSeconds: number;
  /** The full scanned URI, kept verbatim on the payment record. */
  qrUri: string;
}

/**
 * A payment the customer has confirmed. Stored locally; settlement is
 * bilateral (merchant ↔ Safello), so `status` is always 'recorded' —
 * this app records the customer's side, it does not broadcast a chain
 * transaction.
 */
export interface PaymentRecord {
  /** Local uuid. */
  id: string;
  toAddress: string;
  merchantId: string;
  orderId: string;
  purpose: PaymentPurpose;
  amountMicroFtc: bigint;
  ref: string;
  qrUri: string;
  status: 'recorded';
  /** Epoch ms the customer confirmed the payment. */
  paidAt: number;
}
