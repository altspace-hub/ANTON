/**
 * payment.ts — decode a `futurechain:pay` URI and record confirmed
 * payments.
 *
 * The decode half is pure logic (no I/O) and is unit-tested in
 * __tests__/payment.test.ts. The Business app encodes the QR via
 * @futurechain/sdk `reference.encodeV1`; this module decodes it back
 * with `reference.decode` and validates the URI envelope around it.
 *
 * Settlement is bilateral (merchant ↔ Safello) — `recordPayment` only
 * writes the customer's local receipt, it does not broadcast a chain
 * transaction.
 */
import { reference } from '@futurechain/sdk';
import type { DecodedCreditor, DecodedPayment, PaymentRecord } from './types';
import { getAllPayments, putPayment, wipePayments } from './db';
import { loadPayerIdentity } from './payment-identity';
import { loadWallet } from './wallet';
import { assembleDraft } from './pacs008-draft';
import {
  deriveBehaviorProfile, type BehaviorEvent, type BehaviorProfile,
} from './behavior-profile';
import type { FraudAssessment } from './fraud-engine';

/** 1 FTC = 1_000_000 micro-FTC. */
const MICRO_FTC_PER_FTC = 1_000_000;

const DIGITS_RE = /^[0-9]+$/;

export type DecodeResult =
  | { ok: true; payment: DecodedPayment }
  | { ok: false; reason: 'invalid' | 'expired' };

/**
 * Decode + validate a `futurechain:pay` URI. Never throws. `now` is
 * injectable for deterministic tests; defaults to the wall clock.
 */
export function decodePaymentUri(uri: string, now?: number): DecodeResult {
  if (typeof uri !== 'string') return { ok: false, reason: 'invalid' };
  const trimmed = uri.trim();

  // Scheme — `futurechain:pay`, scheme matched case-insensitively.
  if (!trimmed.toLowerCase().startsWith('futurechain:pay')) {
    return { ok: false, reason: 'invalid' };
  }
  const q = trimmed.indexOf('?');
  if (q === -1) return { ok: false, reason: 'invalid' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(trimmed.slice(q + 1));
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const to = params.get('to');
  const amountStr = params.get('amount');
  const ref = params.get('ref');
  const currency = params.get('currency') ?? 'FTC';
  const v = params.get('v');
  const expStr = params.get('exp');

  if (!to) return { ok: false, reason: 'invalid' };
  if (!amountStr || !DIGITS_RE.test(amountStr)) return { ok: false, reason: 'invalid' };
  if (!ref) return { ok: false, reason: 'invalid' };
  if (currency !== 'FTC') return { ok: false, reason: 'invalid' };
  if (v !== null && v !== '1') return { ok: false, reason: 'invalid' };

  let amountMicroFtc: bigint;
  try {
    amountMicroFtc = BigInt(amountStr);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (amountMicroFtc <= 0n) return { ok: false, reason: 'invalid' };

  // The ADR-004 reference must be a v1 (merchant-bearing) remittance.
  const decoded = reference.decode(ref);
  if (decoded.kind !== 'v1') return { ok: false, reason: 'invalid' };
  const f = decoded.fields;

  let expUnixSeconds = 0;
  if (expStr !== null) {
    if (!DIGITS_RE.test(expStr)) return { ok: false, reason: 'invalid' };
    expUnixSeconds = Number.parseInt(expStr, 10);
  }

  // Optional ISO 20022 creditor party (cn/cc/cct/cst/cpc). Present only
  // on QRs from a creditor-aware merchant app; absent on older QRs.
  let creditor: DecodedCreditor | null = null;
  const cn = params.get('cn');
  if (cn) {
    creditor = {
      name: cn,
      country: params.get('cc') ?? 'SE',
      city: params.get('cct') ?? undefined,
      street: params.get('cst') ?? undefined,
      postcode: params.get('cpc') ?? undefined,
    };
  }

  const payment: DecodedPayment = {
    toAddress: to,
    amountMicroFtc,
    currency,
    ref,
    merchantId: f.merchantId,
    orderId: f.orderId,
    purpose: f.purpose,
    itemCount: f.itemCount ?? null,
    vatMicroFtc: f.vatMicroUnits ?? null,
    discountMicroFtc: f.discountMicroUnits ?? null,
    expUnixSeconds,
    creditor,
    qrUri: trimmed,
  };

  if (isExpired(payment, now)) return { ok: false, reason: 'expired' };
  return { ok: true, payment };
}

/** True when the QR carried an expiry that has already passed. A QR
 *  with no `exp` (expUnixSeconds === 0) never expires. */
export function isExpired(payment: { expUnixSeconds: number }, now?: number): boolean {
  if (payment.expUnixSeconds <= 0) return false;
  const nowSec = Math.floor((now ?? Date.now()) / 1000);
  return nowSec > payment.expUnixSeconds;
}

/** Seconds left before the QR expires, or null if it has no expiry.
 *  Clamped at 0 (never negative). */
export function secondsUntilExpiry(
  payment: { expUnixSeconds: number },
  now?: number,
): number | null {
  if (payment.expUnixSeconds <= 0) return null;
  const nowSec = Math.floor((now ?? Date.now()) / 1000);
  return Math.max(0, payment.expUnixSeconds - nowSec);
}

// ── Amount helpers ────────────────────────────────────────────────────

/** micro-FTC → FTC as a float. */
export function microFtcToFtc(micro: bigint): number {
  return Number(micro) / MICRO_FTC_PER_FTC;
}

/** Format micro-FTC as a human FTC string, trimming trailing zeros. */
export function formatFtc(micro: bigint): string {
  return microFtcToFtc(micro).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

/** Estimate the SEK value of a micro-FTC amount at the given rate
 *  (FTC per 1 SEK). The QR carries only FTC, so this is an estimate. */
export function estimateSek(micro: bigint, ftcPerSek: number): number {
  if (!Number.isFinite(ftcPerSek) || ftcPerSek <= 0) return 0;
  return microFtcToFtc(micro) / ftcPerSek;
}

/** Format an estimated SEK amount — whole krona, grouped. */
export function formatSek(sek: number): string {
  return sek.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
}

// ── Payment records ───────────────────────────────────────────────────

/** Persist a confirmed payment as a local receipt. Assembles and
 *  snapshots the ISO 20022 PACS.008 draft from the payer's saved
 *  identity + the scanned creditor party. The optional `risk` is the
 *  fraud-engine assessment computed by the Review screen. */
export async function recordPayment(
  decoded: DecodedPayment,
  risk?: FraudAssessment,
): Promise<PaymentRecord> {
  const [identity, wallet] = await Promise.all([loadPayerIdentity(), loadWallet()]);
  const record: PaymentRecord = {
    id: newId(),
    toAddress: decoded.toAddress,
    merchantId: decoded.merchantId,
    orderId: decoded.orderId,
    purpose: decoded.purpose,
    amountMicroFtc: decoded.amountMicroFtc,
    ref: decoded.ref,
    qrUri: decoded.qrUri,
    status: 'recorded',
    paidAt: Date.now(),
    pacs008: wallet ? assembleDraft(identity, wallet.address, decoded) : undefined,
    risk,
  };
  await putPayment(record);
  return record;
}

/** Every recorded payment, newest first. */
export async function listPayments(): Promise<PaymentRecord[]> {
  return getAllPayments();
}

/** Normalise a stored payment into a behaviour event. */
function recordToEvent(r: PaymentRecord): BehaviorEvent {
  return {
    amountMicroFtc: r.amountMicroFtc,
    counterparty: r.merchantId,
    purpose: r.purpose,
    at: r.paidAt,
  };
}

/** Derive the customer's behaviour profile from their payment history.
 *  `now` is injectable for tests; defaults to the wall clock. */
export async function loadBehaviorProfile(now?: number): Promise<BehaviorProfile> {
  const records = await getAllPayments();
  return deriveBehaviorProfile(records.map(recordToEvent), now);
}

/** Erase all payment records (Settings → Reset app). */
export async function wipeAllPayments(): Promise<void> {
  await wipePayments();
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
