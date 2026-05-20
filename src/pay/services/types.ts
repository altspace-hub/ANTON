/**
 * types.ts — shared domain types for the Pay app.
 *
 * Kept storage-free so pure-logic modules (payment URI decode) can
 * import these shapes without reaching the Capacitor / IndexedDB layer.
 */
import type { Pacs008Draft } from './pacs008-draft';
import type { FraudAssessment } from './fraud-engine';

export type PaymentPurpose = 'RETAIL' | 'RESTAURANT' | 'EVENT' | 'SERVICE' | 'REFUND';

/**
 * The merchant's ISO 20022 creditor party, decoded from the optional
 * `cn/cc/cct/cst/cpc` QR params. Null when the QR predates the
 * creditor-party extension.
 */
export interface DecodedCreditor {
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  city?: string;
  street?: string;
  postcode?: string;
}

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
  /** Merchant ISO 20022 creditor party, if the QR carried one. */
  creditor: DecodedCreditor | null;
  /** The full scanned URI, kept verbatim on the payment record. */
  qrUri: string;
}

/**
 * A payment the customer has confirmed. Stored locally; settlement is
 * bilateral (merchant ↔ Safello), so `status` is always 'recorded' —
 * this app records the customer's side, it does not broadcast a chain
 * transaction.
 */
/**
 * Lifecycle of a payment record.
 *   - `recorded`   pre-chain-settlement legacy: a local receipt only,
 *                  used by older builds that didn't talk to the chain
 *   - `submitting` we're posting `/submit_signed_transaction` now
 *   - `queued`     light hub accepted the signed tx and is gossiping it
 *                  for P2P compliance screening (Phase 0.5 path)
 *   - `accepted`   admitted to a mempool of a node with a local
 *                  Heimdall gateway
 *   - `confirmed`  mined into a block (poller saw it via /transaction)
 *   - `failed`     rejected by Caddy / Heimdall / network — `error` set
 */
export type PaymentStatus =
  | 'recorded'
  | 'submitting'
  | 'queued'
  | 'accepted'
  | 'confirmed'
  | 'failed';

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
  status: PaymentStatus;
  /** Epoch ms the customer confirmed the payment. */
  paidAt: number;
  /** ISO 20022 PACS.008 draft assembled at confirmation time from the
   *  payer's saved identity + the scanned creditor party. Optional —
   *  payments recorded before the identity feature, or with no payer
   *  identity set, omit it. */
  pacs008?: Pacs008Draft;
  /** Light-fraud-engine assessment captured at confirmation time.
   *  Optional — payments recorded before the fraud engine omit it. */
  risk?: FraudAssessment;
  /** On-chain UETR / txid once submitted. Populated from `tx.id`. */
  txId?: string;
  /** Phase 0.5 P2P-forward tracing id, set by the light hub on submit. */
  requestId?: string;
  /** Epoch ms /submit_signed_transaction returned. */
  submittedAt?: number;
  /** Epoch ms the tx was first seen mined into a block. */
  confirmedAt?: number;
  /** Human-readable failure reason when `status === 'failed'`. */
  error?: string;
}
