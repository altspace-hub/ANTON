/**
 * qr.ts — build the `futurechain:pay` URI for a Simple- or Extended-
 * mode order. Pure function, no I/O. CLAUDE_ANTON_BUSINESS.md §8.
 *
 *   futurechain:pay
 *     ?to=<merchant_recv_addr>
 *     &amount=<micro_ftc>
 *     &currency=FTC
 *     &ref=<encoded_v1>
 *     &inv=<invoice_id>
 *     &exp=<unix_ts>
 *     &v=1
 *
 * The `ref` is built via @futurechain/sdk's reference.encodeV1 (ADR-004
 * v1 schema). The customer's wallet decodes it and shows the merchant
 * the order info before they sign the PACS.008.
 */
import { reference } from '@futurechain/sdk';
import { keccak_256 } from '@noble/hashes/sha3';

/** 15 minutes — per spec §9 default expiry. Long enough for a queue at
 *  a busy bar; short enough that a stale QR can't be re-used the next
 *  morning. */
export const QR_EXPIRY_SECONDS = 15 * 60;

/** Per-SEK micro-FTC conversion. 1 FTC = 1_000_000 micro-FTC. */
const MICRO_FTC_PER_FTC = 1_000_000n;

/**
 * The merchant's ISO 20022 creditor party, carried compactly in the QR
 * so the payer's app can populate a full PACS.008 from a scan alone.
 * All fields optional on the wire — older payers ignore them.
 */
export interface CreditorParty {
  /** Merchant legal name. */
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  city?: string;
  street?: string;
  postcode?: string;
}

export interface SimpleOrder {
  /** Merchant's Safello-arranged receive address. */
  toAddress: string;
  /** 8-char merchant id per ADR-004 (orgNr + walletAddr hash). */
  merchantId: string;
  /** 12-char order id, unique per merchant. */
  orderId: string;
  /** Amount in SEK at the time of QR generation. */
  amountSek: number;
  /** SEK→FTC rate captured at generation time. */
  ftcPerSek: number;
  /** ADR-004 v1 purpose. Defaults to RETAIL for Simple mode; the
   *  Extended-mode caller can pick RESTAURANT / EVENT / SERVICE. */
  purpose?: reference.V1Purpose;
  /** Generation timestamp; used to compute `exp`. Defaults to now. */
  now?: number;
  /** ISO 20022 creditor party. When present, the QR carries `cn/cc/
   *  cct/cst/cpc` params so the payer can assemble a complete PACS.008. */
  creditor?: CreditorParty;
}

/** Extended-mode order — same shape as a Simple order plus the v1
 *  reference's optional tokens. Per ADR-004:
 *    I: item count           (sum of cart line quantities)
 *    V: VAT in micro-FTC     (post-discount VAT, converted via ftcPerSek)
 *    D: discount in micro-FTC (the SEK discount converted via ftcPerSek)
 */
export interface ExtendedOrder extends SimpleOrder {
  itemCount: number;
  vatSek: number;
  discountSek?: number;
}

export interface BuiltQr {
  uri: string;
  amountMicroFtc: bigint;
  ref: string;
  inv: string;
  expUnixSeconds: number;
}

/** Construct the Simple-mode QR. */
export function buildSimpleQr(order: SimpleOrder): BuiltQr {
  return buildQr({
    ...order,
    purpose: order.purpose ?? 'RETAIL',
  });
}

/** Construct the Extended-mode QR. Adds I/V/D tokens to the v1 ref. */
export function buildExtendedQr(order: ExtendedOrder): BuiltQr {
  return buildQr({
    ...order,
    purpose: order.purpose ?? 'RESTAURANT',
    itemCount: order.itemCount,
    vatMicroUnits: sekToMicroFtc(order.vatSek, order.ftcPerSek),
    discountMicroUnits: order.discountSek !== undefined && order.discountSek > 0
      ? sekToMicroFtc(order.discountSek, order.ftcPerSek)
      : undefined,
  });
}

interface InternalOrder extends SimpleOrder {
  itemCount?: number;
  vatMicroUnits?: bigint;
  discountMicroUnits?: bigint;
}

function buildQr(order: InternalOrder): BuiltQr {
  const purpose = order.purpose ?? 'RETAIL';
  const ref = reference.encodeV1({
    merchantId: order.merchantId,
    orderId: order.orderId,
    purpose,
    itemCount: order.itemCount,
    vatMicroUnits: order.vatMicroUnits,
    discountMicroUnits: order.discountMicroUnits,
  });
  const amountMicroFtc = sekToMicroFtc(order.amountSek, order.ftcPerSek);
  const now = order.now ?? Math.floor(Date.now() / 1000);
  const exp = now + QR_EXPIRY_SECONDS;
  const inv = order.orderId;
  const params = new URLSearchParams({
    to: order.toAddress,
    amount: amountMicroFtc.toString(),
    currency: 'FTC',
    ref,
    inv,
    exp: exp.toString(),
    v: '1',
  });
  // Optional ISO 20022 creditor party — lets the payer's app assemble
  // a complete PACS.008 from the scan. Additive: old payers ignore it.
  if (order.creditor) {
    params.set('cn', order.creditor.name);
    params.set('cc', order.creditor.country);
    if (order.creditor.city) params.set('cct', order.creditor.city);
    if (order.creditor.street) params.set('cst', order.creditor.street);
    if (order.creditor.postcode) params.set('cpc', order.creditor.postcode);
  }
  return {
    uri: `futurechain:pay?${params.toString()}`,
    amountMicroFtc,
    ref,
    inv,
    expUnixSeconds: exp,
  };
}

/** SEK (float) → micro-FTC (bigint). Rounds half to even at the
 *  bigint boundary so the encoded amount is reproducible. */
export function sekToMicroFtc(sek: number, ftcPerSek: number): bigint {
  if (!Number.isFinite(sek) || sek < 0) {
    throw new Error('sek must be a non-negative finite number');
  }
  if (!Number.isFinite(ftcPerSek) || ftcPerSek <= 0) {
    throw new Error('ftcPerSek must be a positive finite number');
  }
  const ftc = sek * ftcPerSek;
  // ftc × 1e6 → micro-FTC. Round to nearest integer.
  const micro = Math.round(ftc * Number(MICRO_FTC_PER_FTC));
  if (!Number.isFinite(micro)) throw new Error('amount overflow');
  return BigInt(micro);
}

// ── Order ID + Merchant ID derivation ────────────────────────────────

/** Generate a 12-char order id. Uses 6 random bytes → 12 hex chars
 *  uppercased to match the /^[A-Z0-9]{12}$/ grammar of ADR-004. */
export function generateOrderId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

/** Derive a deterministic 8-char merchant id per ADR-004 §11.3:
 *  upper-hex of the first 4 bytes of keccak-256(orgNr || walletAddress).
 *  Matches the Rust reference implementation in _archive/ byte-for-byte
 *  for the same inputs. */
export function computeMerchantId(orgNr: string, walletAddress: string): string {
  const enc = new TextEncoder();
  const a = enc.encode(orgNr);
  const b = enc.encode(walletAddress);
  const input = new Uint8Array(a.length + b.length);
  input.set(a, 0);
  input.set(b, a.length);
  const digest = keccak_256(input);
  let hex = '';
  for (let i = 0; i < 4; i++) hex += digest[i]!.toString(16).padStart(2, '0');
  return hex.toUpperCase();
}
