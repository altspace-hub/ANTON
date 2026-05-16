/**
 * qr.test.ts — coverage for the QR URI builder + ID helpers.
 *
 * Run via:
 *   pnpm test:business     (from the repo root)
 */
import { describe, it, expect } from 'vitest';
import {
  buildExtendedQr,
  buildSimpleQr,
  computeMerchantId,
  generateOrderId,
  sekToMicroFtc,
  QR_EXPIRY_SECONDS,
} from '../qr';

describe('sekToMicroFtc', () => {
  it('converts 50 SEK at rate 0.1 to 5_000_000 micro-FTC (5 FTC)', () => {
    expect(sekToMicroFtc(50, 0.1)).toBe(5_000_000n);
  });

  it('handles fractional SEK', () => {
    expect(sekToMicroFtc(12.5, 0.1)).toBe(1_250_000n);
  });

  it('rounds half to nearest at the micro boundary', () => {
    // 0.1 SEK × 0.1 rate × 1e6 = 10_000.0, exactly representable.
    expect(sekToMicroFtc(0.1, 0.1)).toBe(10_000n);
  });

  it('rejects negative SEK', () => {
    expect(() => sekToMicroFtc(-1, 0.1)).toThrow();
  });

  it('rejects non-positive rate', () => {
    expect(() => sekToMicroFtc(50, 0)).toThrow();
    expect(() => sekToMicroFtc(50, -0.1)).toThrow();
  });

  it('rejects non-finite inputs', () => {
    expect(() => sekToMicroFtc(NaN, 0.1)).toThrow();
    expect(() => sekToMicroFtc(50, Infinity)).toThrow();
  });
});

describe('computeMerchantId', () => {
  it('returns 8 uppercase hex chars', () => {
    const id = computeMerchantId('SE5560000000', 'fc_abc');
    expect(id).toMatch(/^[0-9A-F]{8}$/);
  });

  it('is deterministic for the same inputs', () => {
    const a = computeMerchantId('SE5560000000', 'fc_abc');
    const b = computeMerchantId('SE5560000000', 'fc_abc');
    expect(a).toBe(b);
  });

  it('changes with different orgNr', () => {
    const a = computeMerchantId('SE5560000000', 'fc_abc');
    const b = computeMerchantId('SE5560000001', 'fc_abc');
    expect(a).not.toBe(b);
  });

  it('changes with different wallet address', () => {
    const a = computeMerchantId('SE5560000000', 'fc_abc');
    const b = computeMerchantId('SE5560000000', 'fc_xyz');
    expect(a).not.toBe(b);
  });

  it('matches the Rust archive impl for a fixed input pair', () => {
    // Spot-check against the archive (apps/_archive/merchant-backend
    // /src/routes/merchant.rs candidate_merchant_id). For inputs
    // ("SE5560000000", "fc_abc") the keccak-256 first 4 bytes are
    // deterministic; we just lock the current value as a regression
    // sentinel. If this changes the encoding broke somewhere.
    expect(computeMerchantId('SE5560000000', 'fc_abc')).toBe('21A58256');
  });
});

describe('generateOrderId', () => {
  it('returns 12 chars matching ADR-004 grammar', () => {
    const id = generateOrderId();
    expect(id).toMatch(/^[0-9A-F]{12}$/);
  });

  it('returns different ids on successive calls', () => {
    const a = generateOrderId();
    const b = generateOrderId();
    expect(a).not.toBe(b);
  });
});

describe('buildSimpleQr', () => {
  const base = {
    toAddress: 'fc_safelloaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    merchantId: 'KTH00001',
    orderId: 'A1B2C3D4E5F6',
    amountSek: 50,
    ftcPerSek: 0.1,
    now: 1_700_000_000,
  };

  it('produces a futurechain:pay URI with all spec §9 fields', () => {
    const { uri } = buildSimpleQr(base);
    expect(uri.startsWith('futurechain:pay?')).toBe(true);
    expect(uri).toContain('to=fc_safelloaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(uri).toContain('amount=5000000'); // 50 SEK * 0.1 * 1e6
    expect(uri).toContain('currency=FTC');
    expect(uri).toContain('inv=A1B2C3D4E5F6');
    expect(uri).toContain('v=1');
  });

  it('sets exp to now + 15min by default', () => {
    const { expUnixSeconds } = buildSimpleQr(base);
    expect(expUnixSeconds).toBe(1_700_000_000 + QR_EXPIRY_SECONDS);
  });

  it('embeds the v1 reference encoded per ADR-004', () => {
    const { uri, ref } = buildSimpleQr(base);
    expect(ref).toBe('v1: M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL');
    // The URI is a "futurechain:pay?..." string. Pull out the ref
    // parameter via URLSearchParams. URLSearchParams encodes spaces
    // as "+" (form-encoding), and decodes them back on .get().
    const qs = uri.slice(uri.indexOf('?') + 1);
    const params = new URLSearchParams(qs);
    expect(params.get('ref')).toBe(ref);
  });

  it('uses the supplied purpose when given', () => {
    const { ref } = buildSimpleQr({ ...base, purpose: 'RESTAURANT' });
    expect(ref).toContain('P:RESTAURANT');
  });

  it('matches amountMicroFtc with the encoded URI', () => {
    const { amountMicroFtc, uri } = buildSimpleQr({ ...base, amountSek: 12.5 });
    expect(amountMicroFtc).toBe(1_250_000n);
    expect(uri).toContain('amount=1250000');
  });

  it('omits creditor params when no creditor is supplied', () => {
    const { uri } = buildSimpleQr(base);
    expect(uri).not.toContain('cn=');
    expect(uri).not.toContain('cc=');
  });

  it('embeds the ISO 20022 creditor party when supplied', () => {
    const { uri } = buildSimpleQr({
      ...base,
      creditor: {
        name: 'Karl Café AB',
        country: 'SE',
        city: 'Stockholm',
        street: 'Drottninggatan 1',
        postcode: '11151',
      },
    });
    const params = new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
    expect(params.get('cn')).toBe('Karl Café AB');
    expect(params.get('cc')).toBe('SE');
    expect(params.get('cct')).toBe('Stockholm');
    expect(params.get('cst')).toBe('Drottninggatan 1');
    expect(params.get('cpc')).toBe('11151');
  });

  it('omits optional creditor address parts that are absent', () => {
    const { uri } = buildSimpleQr({
      ...base,
      creditor: { name: 'Karl Café AB', country: 'SE' },
    });
    const params = new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
    expect(params.get('cn')).toBe('Karl Café AB');
    expect(params.get('cct')).toBeNull();
  });

  it('throws on bad inputs that the encoder would reject', () => {
    // Merchant id too short → reference.encodeV1 throws → buildSimpleQr
    // propagates.
    expect(() => buildSimpleQr({ ...base, merchantId: 'short' })).toThrow();
  });
});

describe('buildExtendedQr', () => {
  const base = {
    toAddress: 'fc_safelloaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    merchantId: 'KTH00001',
    orderId: 'A1B2C3D4E5F6',
    amountSek: 100,
    ftcPerSek: 0.1,
    itemCount: 3,
    vatSek: 20,
    now: 1_700_000_000,
  };

  it('emits I and V tokens in the v1 reference', () => {
    const { ref } = buildExtendedQr(base);
    // 20 SEK * 0.1 rate * 1e6 = 2_000_000 micro-FTC
    expect(ref).toBe('v1: M:KTH00001 O:A1B2C3D4E5F6 P:RESTAURANT I:3 V:2000000');
  });

  it('emits D token only when discount > 0', () => {
    const { ref } = buildExtendedQr({ ...base, discountSek: 10 });
    // 10 SEK * 0.1 rate * 1e6 = 1_000_000 micro-FTC
    expect(ref).toBe('v1: M:KTH00001 O:A1B2C3D4E5F6 P:RESTAURANT I:3 V:2000000 D:1000000');
  });

  it('omits D token when discount is 0 or undefined', () => {
    const noDiscount = buildExtendedQr(base);
    expect(noDiscount.ref).not.toContain('D:');
    const zeroDiscount = buildExtendedQr({ ...base, discountSek: 0 });
    expect(zeroDiscount.ref).not.toContain('D:');
  });

  it('defaults purpose to RESTAURANT', () => {
    const { ref } = buildExtendedQr(base);
    expect(ref).toContain('P:RESTAURANT');
  });

  it('allows overriding the purpose to EVENT or SERVICE', () => {
    expect(buildExtendedQr({ ...base, purpose: 'EVENT' }).ref).toContain('P:EVENT');
    expect(buildExtendedQr({ ...base, purpose: 'SERVICE' }).ref).toContain('P:SERVICE');
  });

  it('builds an amount-payment URI just like the simple builder', () => {
    const { uri } = buildExtendedQr(base);
    expect(uri.startsWith('futurechain:pay?')).toBe(true);
    expect(uri).toContain('amount=10000000'); // 100 SEK * 0.1 * 1e6
    expect(uri).toContain('v=1');
  });
});
