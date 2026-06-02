/**
 * payment-type.test.ts — the pure payment-type → tax/ISO mapping.
 */
import { describe, expect, it } from 'vitest';
import {
  PAYMENT_TYPES, DEFAULT_PAYMENT_TYPE, paymentTypeMeta, resolveIsoPurpose,
} from '../payment-type';

describe('payment-type metadata', () => {
  it('only "payment" is taxable', () => {
    expect(paymentTypeMeta('payment').taxable).toBe(true);
    expect(paymentTypeMeta('gift').taxable).toBe(false);
    expect(paymentTypeMeta('information').taxable).toBe(false);
    expect(paymentTypeMeta('contract').taxable).toBe(false);
  });

  it('default type is payment (taxable)', () => {
    expect(DEFAULT_PAYMENT_TYPE).toBe('payment');
    expect(paymentTypeMeta(DEFAULT_PAYMENT_TYPE).taxable).toBe(true);
  });

  it('exposes the four types in order', () => {
    expect(PAYMENT_TYPES).toEqual(['payment', 'gift', 'information', 'contract']);
  });

  it('maps each type to a tone + label', () => {
    expect(paymentTypeMeta('payment').toneKey).toBe('success');
    expect(paymentTypeMeta('gift').toneKey).toBe('accent');
    expect(paymentTypeMeta('information').toneKey).toBe('muted');
    expect(paymentTypeMeta('contract').toneKey).toBe('muted');
    for (const t of PAYMENT_TYPES) {
      const m = paymentTypeMeta(t);
      expect(m.labelKey).toBe(`paymentType.${t}`);
      expect(m.labelFallback.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveIsoPurpose', () => {
  it('payment keeps the merchant-derived ISO code', () => {
    expect(resolveIsoPurpose('payment', 'GDDS')).toBe('GDDS');
    expect(resolveIsoPurpose('payment', 'SCVE')).toBe('SCVE');
    expect(resolveIsoPurpose('payment', 'OTHR')).toBe('OTHR');
  });

  it('gift overrides to GIFT regardless of merchant code', () => {
    expect(resolveIsoPurpose('gift', 'GDDS')).toBe('GIFT');
    expect(resolveIsoPurpose('gift', 'SCVE')).toBe('GIFT');
  });

  it('information and contract override to OTHR', () => {
    expect(resolveIsoPurpose('information', 'GDDS')).toBe('OTHR');
    expect(resolveIsoPurpose('contract', 'SCVE')).toBe('OTHR');
  });
});
