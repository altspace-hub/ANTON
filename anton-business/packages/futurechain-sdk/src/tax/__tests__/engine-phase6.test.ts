/**
 * engine-phase6.test.ts — round-trip per Phase-2 jurisdiction
 * (FUTURECHAIN_TAX_RULES.md §8.2). One canonical test per rule
 * proving its distinguishing feature.
 */
import { describe, expect, it } from 'vitest';
import { computeTaxPosition, isRefused, type TaxComputationResult } from '../engine.js';
import {
  BE, BR, CA, CY, IE, IL, KE, KR, MT, PL,
} from '../rules/index.js';
import type { TaxInputTx } from '../transaction.js';

const DAY = 24 * 60 * 60 * 1000;

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return { decimals: 6, fiatCurrency: 'EUR', ...over };
}

describe('Cyprus — 8% flat (lowest EU CGT)', () => {
  it('charges 8% on a clean disposal', () => {
    const r = computeTaxPosition({
      rule: CY,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0 }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 10000 }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(800, 6); // 10000 × 0.08
  });
});

describe('Malta — long-term holdings tax-free for individuals', () => {
  it('zero tax after the 365-day threshold', () => {
    const r = computeTaxPosition({
      rule: MT,
      transactions: [
        tx({ id: 'a', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 'd', ts: 400 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 2000 }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBe(0);
    expect(r.annual.longTermExemptGainsFiat).toBeCloseTo(1000, 6);
  });
});

describe('Belgium — conservative 33% speculative default', () => {
  it('applies 33% misc-income rate by default', () => {
    const r = computeTaxPosition({
      rule: BE,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0 }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 1000 }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(330, 6);
    expect(r.reviewReasons).toContain(
      'review_flag_private_investor_exemption_0pct_requires_adviser_confirmation',
    );
  });
});

describe('Ireland — €1,270 personal exemption', () => {
  it('applies exemption before 33% rate', () => {
    const r = computeTaxPosition({
      rule: IE,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0 }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 5000 }),
      ],
    }) as TaxComputationResult;
    // Gain 5000, exemption 1270, taxable 3730 × 33% = 1230.90
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(1230.90, 2);
  });
});

describe('Poland — crypto-to-crypto NOT taxable', () => {
  it('swap is exempt from tax', () => {
    const r = computeTaxPosition({
      rule: PL,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 's', ts: 10 * DAY, kind: 'swap',          amount: '5000000',  fiatValueAtTx: 800 }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.totalGainsFiat).toBe(0);
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });
});

describe('Canada — 50% inclusion × 54% marginal', () => {
  it('halves the taxable base before rate application', () => {
    const r = computeTaxPosition({
      rule: CA,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0, fiatCurrency: 'CAD' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 1000, fiatCurrency: 'CAD' }),
      ],
    }) as TaxComputationResult;
    // Gain 1000 → 50% inclusion = 500 taxable × 54% = 270
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(270, 6);
  });
});

describe('South Korea — KRW 2.5M annual threshold', () => {
  it('exempts gains below threshold', () => {
    const r = computeTaxPosition({
      rule: KR,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0, fiatCurrency: 'KRW' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 2000000, fiatCurrency: 'KRW' }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });

  it('taxes the slice above 2.5M', () => {
    const r = computeTaxPosition({
      rule: KR,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0, fiatCurrency: 'KRW' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 5000000, fiatCurrency: 'KRW' }),
      ],
    }) as TaxComputationResult;
    // 5M - 2.5M exemption = 2.5M × 20% = 500_000
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(500000, 6);
  });
});

describe('Israel — 25% private investor', () => {
  it('charges 25% on a clean disposal', () => {
    const r = computeTaxPosition({
      rule: IL,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0, fiatCurrency: 'ILS' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 10000, fiatCurrency: 'ILS' }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(2500, 6);
  });
});

describe('Brazil — progressive 15-22.5% + BRL 420k annual exemption', () => {
  it('exempts a small gain entirely', () => {
    const r = computeTaxPosition({
      rule: BR,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0, fiatCurrency: 'BRL' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 100000, fiatCurrency: 'BRL' }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });

  it('applies the 15% bracket beyond the exemption', () => {
    const r = computeTaxPosition({
      rule: BR,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0, fiatCurrency: 'BRL' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 1_000_000, fiatCurrency: 'BRL' }),
      ],
    }) as TaxComputationResult;
    // Gain 1_000_000, exemption 420_000, taxable 580_000 × 15% = 87_000
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(87000, 6);
  });
});

describe('Kenya — refused (fee-based excise model)', () => {
  it('returns RefusalResult per §8.3', () => {
    const r = computeTaxPosition({ rule: KE, transactions: [] });
    expect(isRefused(r)).toBe(true);
    if (isRefused(r)) {
      expect(r.message).toContain('Kenya');
    }
  });
});
