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
import type { AntonRemittance } from '@futurechain/sdk/pacs008';
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
 *
 *  Wave 10 — optional `orderEnvelope` carries the structured AntonRemittance
 *  payload (line items, VAT, ref) so the customer's Pay app can show what
 *  they're paying for line-by-line and bundle it into the PACS.008 RmtInf
 *  when they sign. Per-merchant opt-in (toggle on the QR screen). The
 *  envelope is base64'd and placed under `&order=` in the QR.
 *
 *  CAUTION: QR practical size is ~2 KB at high error correction. Don't
 *  include attachments — those come from the customer on their phone.
 */
export interface ExtendedOrder extends SimpleOrder {
  itemCount: number;
  vatSek: number;
  discountSek?: number;
  /** Wave 10 — structured order envelope encoded into the QR. */
  orderEnvelope?: AntonRemittance;
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
    orderEnvelope: order.orderEnvelope,
  });
}

interface InternalOrder extends SimpleOrder {
  itemCount?: number;
  vatMicroUnits?: bigint;
  discountMicroUnits?: bigint;
  orderEnvelope?: AntonRemittance;
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
  // Wave 10 — optional structured order envelope, base64-JSON in `order`.
  if (order.orderEnvelope) {
    const envelopeJson = JSON.stringify(order.orderEnvelope);
    const envelopeB64 = base64UrlSafe(envelopeJson);
    // Practical QR limit ~2 KB at high error correction. Soft-warn at 1500.
    if (envelopeB64.length > 1500) {
      // eslint-disable-next-line no-console
      console.warn(
        `qr.buildQr: order envelope is ${envelopeB64.length} chars in base64 — ` +
        'the QR may exceed scanner-friendly size. Trim items or skip attachments.',
      );
    }
    params.set('order', envelopeB64);
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

/** URL-safe base64 — replaces `+ /` with `- _`, strips `=` padding so
 *  the encoded value survives a URL parameter without needing percent-
 *  encoding. Decoder reverses. */
function base64UrlSafe(s: string): string {
  // utf-8 → bytes → standard base64 → url-safe substitution
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a `&order=` param back into an AntonRemittance. Returns null
 *  on any failure (invalid base64, JSON parse error, wrong shape).
 *  Used by the Pay app's scanner. */
export function decodeOrderEnvelope(b64: string): AntonRemittance | null {
  try {
    // Restore standard base64 padding.
    const pad = (4 - (b64.length % 4)) % 4;
    const std = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
    const bin = typeof atob === 'function' ? atob(std) : Buffer.from(std, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as AntonRemittance;
    if (parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Re-export the rich-remittance helpers from the SDK for the merchant-side
// callers (cart → envelope construction). Pay imports its own copy.
export { encodeRemittance, decodeRemittance, sha256Hex } from '@futurechain/sdk/pacs008';
export type { AntonRemittance };

/**
 * Build an AntonRemittance order envelope from a cart + order id.
 *
 * The envelope carries line items, totals, and VAT — exactly what the
 * customer sees on the kvitto. The merchant's "Include order details"
 * toggle (Wave 10) controls whether this gets attached to the QR.
 *
 * Stays slim — no attachments. Customer can add their own on Pay-side.
 */
export function buildOrderEnvelopeFromCart(input: {
  cart: import('./cart').Cart;
  totals: import('./cart').CartTotals;
  orderId: string;
}): AntonRemittance {
  const { cart, totals, orderId } = input;
  return {
    v: 1,
    kind: 'order',
    ref: orderId,
    items: cart.lines.map((l) => ({
      name: l.name,
      qty: l.quantity,
      unitPriceSek: l.unitPriceSek,
      lineTotalSek: l.unitPriceSek * l.quantity,
      vatRate: l.vatRate,
    })),
    amountSek: totals.totalSek,
    vatSek: totals.totalVatSek,
  };
}
