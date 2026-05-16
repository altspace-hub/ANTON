/**
 * payment.test.ts — pure-logic coverage for the `futurechain:pay` URI
 * decoder and the amount helpers.
 */
import { describe, expect, it } from 'vitest';
import { reference } from '@futurechain/sdk';
import {
  decodePaymentUri, isExpired, secondsUntilExpiry,
  microFtcToFtc, formatFtc, estimateSek,
} from '../payment';

const NOW = Date.parse('2026-05-16T12:00:00Z');
const NOW_SEC = Math.floor(NOW / 1000);

/** Build a `futurechain:pay` URI the way the Business app does. */
function buildUri(over: Record<string, string> = {}, refOverride?: string): string {
  const ref = refOverride ?? reference.encodeV1({
    merchantId: '21A58256',
    orderId: 'A1B2C3D4E5F6',
    purpose: 'RETAIL',
  });
  const params = new URLSearchParams({
    to: 'fc_merchant_recv_addr',
    amount: '5000000',
    currency: 'FTC',
    ref,
    inv: 'A1B2C3D4E5F6',
    exp: String(NOW_SEC + 900),
    v: '1',
    ...over,
  });
  return `futurechain:pay?${params.toString()}`;
}

describe('decodePaymentUri — happy path', () => {
  it('decodes a valid Simple-mode QR', () => {
    const r = decodePaymentUri(buildUri(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment.toAddress).toBe('fc_merchant_recv_addr');
    expect(r.payment.amountMicroFtc).toBe(5_000_000n);
    expect(r.payment.currency).toBe('FTC');
    expect(r.payment.merchantId).toBe('21A58256');
    expect(r.payment.orderId).toBe('A1B2C3D4E5F6');
    expect(r.payment.purpose).toBe('RETAIL');
    expect(r.payment.expUnixSeconds).toBe(NOW_SEC + 900);
  });

  it('decodes an Extended-mode QR with item count + VAT', () => {
    const ref = reference.encodeV1({
      merchantId: 'AB12CD34',
      orderId: 'FFEEDDCCBBAA',
      purpose: 'RESTAURANT',
      itemCount: 3,
      vatMicroUnits: 600_000n,
      discountMicroUnits: 100_000n,
    });
    const r = decodePaymentUri(buildUri({}, ref), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment.purpose).toBe('RESTAURANT');
    expect(r.payment.itemCount).toBe(3);
    expect(r.payment.vatMicroFtc).toBe(600_000n);
    expect(r.payment.discountMicroFtc).toBe(100_000n);
  });

  it('keeps the raw URI on the decoded payment', () => {
    const uri = buildUri();
    const r = decodePaymentUri(uri, NOW);
    expect(r.ok && r.payment.qrUri).toBe(uri);
  });

  it('treats a QR with no exp as never-expiring', () => {
    const r = decodePaymentUri(buildUri({ exp: '' }).replace('exp=&', ''), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment.expUnixSeconds).toBe(0);
  });
});

describe('decodePaymentUri — rejections', () => {
  it('rejects an expired QR', () => {
    const r = decodePaymentUri(buildUri({ exp: String(NOW_SEC - 1) }), NOW);
    expect(r).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a non-futurechain scheme', () => {
    const r = decodePaymentUri('https://example.com/?to=x&amount=1&ref=y', NOW);
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a URI with no query string', () => {
    expect(decodePaymentUri('futurechain:pay', NOW)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a missing amount', () => {
    const r = decodePaymentUri(buildUri({ amount: '' }).replace('amount=&', ''), NOW);
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a non-numeric amount', () => {
    expect(decodePaymentUri(buildUri({ amount: '12.5' }), NOW))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a zero amount', () => {
    expect(decodePaymentUri(buildUri({ amount: '0' }), NOW))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a non-FTC currency', () => {
    expect(decodePaymentUri(buildUri({ currency: 'USD' }), NOW))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects an unsupported version', () => {
    expect(decodePaymentUri(buildUri({ v: '2' }), NOW))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a v2 (non-merchant) reference', () => {
    const r = decodePaymentUri(buildUri({}, 'v2: P:RETL N:sale G:checkout'), NOW);
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a garbage reference', () => {
    expect(decodePaymentUri(buildUri({}, 'not a real ref'), NOW))
      .toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects non-string input', () => {
    expect(decodePaymentUri(undefined as unknown as string, NOW))
      .toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('decodePaymentUri — creditor party', () => {
  it('decodes the ISO 20022 creditor party when the QR carries one', () => {
    const r = decodePaymentUri(buildUri({
      cn: 'Karl Café AB', cc: 'SE', cct: 'Stockholm',
      cst: 'Drottninggatan 1', cpc: '11151',
    }), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment.creditor).toEqual({
      name: 'Karl Café AB',
      country: 'SE',
      city: 'Stockholm',
      street: 'Drottninggatan 1',
      postcode: '11151',
    });
  });

  it('leaves creditor null on a QR with no creditor params', () => {
    const r = decodePaymentUri(buildUri(), NOW);
    expect(r.ok && r.payment.creditor).toBeNull();
  });

  it('defaults creditor country to SE when only the name is present', () => {
    const r = decodePaymentUri(buildUri({ cn: 'Karl Café AB' }), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payment.creditor).toEqual({
      name: 'Karl Café AB', country: 'SE',
      city: undefined, street: undefined, postcode: undefined,
    });
  });
});

describe('isExpired / secondsUntilExpiry', () => {
  it('no-expiry QR is never expired', () => {
    expect(isExpired({ expUnixSeconds: 0 }, NOW)).toBe(false);
    expect(secondsUntilExpiry({ expUnixSeconds: 0 }, NOW)).toBeNull();
  });

  it('future expiry is not expired and reports seconds left', () => {
    const p = { expUnixSeconds: NOW_SEC + 120 };
    expect(isExpired(p, NOW)).toBe(false);
    expect(secondsUntilExpiry(p, NOW)).toBe(120);
  });

  it('past expiry is expired and clamps seconds-left to 0', () => {
    const p = { expUnixSeconds: NOW_SEC - 5 };
    expect(isExpired(p, NOW)).toBe(true);
    expect(secondsUntilExpiry(p, NOW)).toBe(0);
  });
});

describe('amount helpers', () => {
  it('converts micro-FTC to FTC', () => {
    expect(microFtcToFtc(5_000_000n)).toBe(5);
    expect(microFtcToFtc(2_500_000n)).toBe(2.5);
  });

  it('formats FTC trimming trailing zeros', () => {
    expect(formatFtc(5_000_000n)).toBe('5');
    expect(formatFtc(2_500_000n)).toBe('2.5');
  });

  it('estimates SEK at the configured rate', () => {
    // 5 FTC at 0.1 FTC/SEK → 50 SEK.
    expect(estimateSek(5_000_000n, 0.1)).toBe(50);
  });

  it('returns 0 SEK for a non-positive rate', () => {
    expect(estimateSek(5_000_000n, 0)).toBe(0);
  });
});
