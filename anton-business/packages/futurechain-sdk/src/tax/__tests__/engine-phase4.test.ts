/**
 * engine-phase4.test.ts — round-trip per Phase-1 jurisdiction.
 *
 * One canonical test per rule block proving the rule's distinguishing
 * feature (per FUTURECHAIN_TAX_RULES.md §8.4 coverage requirement).
 * Sweden's own coverage lives in engine-se.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { computeTaxPosition, isRefused, type TaxComputationResult } from '../engine.js';
import {
  AE, AU, CH, DE, ES, FR, GB, IT, JP, NG, NL, PT, SG, US, ZA,
} from '../rules/index.js';
import type { TaxInputTx } from '../transaction.js';

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return { decimals: 6, fiatCurrency: 'EUR', ...over };
}

const DAY = 24 * 60 * 60 * 1000;

describe('Germany — long-term holding tax-free (Spekulationsfrist)', () => {
  it('zero tax when held > 365 days', () => {
    const r = computeTaxPosition({
      rule: DE,
      transactions: [
        tx({ id: 'a', ts: 0,               kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 'd', ts: 400 * DAY,       kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 2000 }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.longTermExemptGainsFiat).toBeCloseTo(1000, 6);
    expect(r.annual.netTaxableGainsFiat).toBe(0);
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });

  it('full tax when held < 365 days', () => {
    const r = computeTaxPosition({
      rule: DE,
      transactions: [
        tx({ id: 'a', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 'd', ts: 100 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 2000 }),
      ],
    }) as TaxComputationResult;
    // 1000 gain, €1000 annual exemption applies → 0 taxable.
    expect(r.annual.estimatedTaxFiat).toBe(0);
    expect(r.annual.exemptionApplied).toBeCloseTo(1000, 6);
  });
});

describe('France — crypto-to-crypto swap is NOT taxable', () => {
  it('swap of FTC for another crypto generates 0 tax', () => {
    const r = computeTaxPosition({
      rule: FR,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        // Swap 5 FTC for another crypto — would normally be a disposal
        tx({ id: 's', ts: 10 * DAY, kind: 'swap',          amount: '5000000',  fiatValueAtTx: 800 }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.totalGainsFiat).toBe(0);
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });

  it('spend (fiat disposal) IS taxable in France', () => {
    const r = computeTaxPosition({
      rule: FR,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 's', ts: 10 * DAY, kind: 'spend',         amount: '5000000',  fiatValueAtTx: 800 }),
      ],
    }) as TaxComputationResult;
    // €305 annual exemption applies to *gross sales*; engine treats
    // as €305 off gains for v1. Gain = 800 - 500 = 300; after €305 exemption = 0.
    // Actually our engine subtracts annual_exemption from total gains.
    // gain 300, exemption 305 → 0 taxable
    expect(r.annual.totalGainsFiat).toBeCloseTo(300, 6);
    expect(r.annual.netTaxableGainsFiat).toBe(0);
  });
});

describe('Italy — EMT carve-out (26% vs 33%)', () => {
  it('charges 33% by default (utility_token)', () => {
    const r = computeTaxPosition({
      rule: IT,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        // Gain 5000 → above €2k exemption
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 6000 }),
      ],
    }) as TaxComputationResult;
    // Gain 5000, exemption 2000 → taxable 3000. At 33% → 990
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(990, 6);
  });

  it('charges 26% when FTC is flagged as EMT', () => {
    const r = computeTaxPosition({
      rule: IT,
      options: { ftc_classification: 'emt' },
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 6000 }),
      ],
    }) as TaxComputationResult;
    // Same numbers but reduced rate: 3000 × 0.26 = 780
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(780, 6);
    expect(r.ftcClassification).toBe('emt');
  });
});

describe('UK — share pooling + £3k annual exemption', () => {
  it('pool average + £3k exemption applied', () => {
    const r = computeTaxPosition({
      rule: GB,
      transactions: [
        tx({ id: 'a1', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000, fiatCurrency: 'GBP' }),
        tx({ id: 'a2', ts: 10 * DAY, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 3000, fiatCurrency: 'GBP' }),
        tx({ id: 'd',  ts: 30 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 5000, fiatCurrency: 'GBP' }),
      ],
    }) as TaxComputationResult;
    // Pool: 20 FTC, £4000 basis, avg £200/FTC. Sell 10 → cost £2000, gain £3000.
    // Exemption £3000 → net taxable 0.
    expect(r.annual.totalGainsFiat).toBeCloseTo(3000, 6);
    expect(r.annual.exemptionApplied).toBeCloseTo(3000, 6);
    expect(r.annual.netTaxableGainsFiat).toBe(0);
  });

  it('surfaces the 30-day-matching review flag', () => {
    const r = computeTaxPosition({ rule: GB, transactions: [] }) as TaxComputationResult;
    expect(r.reviewReasons).toContain(
      'review_flag_same_day_and_30_day_matching_not_yet_implemented',
    );
  });
});

describe('US — HIFO via Specific ID + long-term preferential rate', () => {
  it('FIFO default — oldest lot consumed', () => {
    const r = computeTaxPosition({
      rule: US,
      transactions: [
        tx({ id: 'a1', ts: 0,        kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 500,  fiatCurrency: 'USD' }),
        tx({ id: 'a2', ts: 10 * DAY, kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 1500, fiatCurrency: 'USD' }),
        tx({ id: 'd',  ts: 100 * DAY, kind: 'sell_to_fiat', amount: '5000000', fiatValueAtTx: 2000, fiatCurrency: 'USD' }),
      ],
    }) as TaxComputationResult;
    // FIFO: sell 5 from lot 1 at $500 basis → gain 1500.
    expect(r.annual.totalGainsFiat).toBeCloseTo(1500, 6);
  });

  it('HIFO override — highest-cost lot consumed first', () => {
    const r = computeTaxPosition({
      rule: US,
      options: { ftc_classification: 'utility_token', cost_basis_override: 'HIFO' },
      transactions: [
        tx({ id: 'a1', ts: 0,         kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 500,  fiatCurrency: 'USD' }),
        tx({ id: 'a2', ts: 10 * DAY,  kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 1500, fiatCurrency: 'USD' }),
        tx({ id: 'd',  ts: 100 * DAY, kind: 'sell_to_fiat',  amount: '5000000', fiatValueAtTx: 2000, fiatCurrency: 'USD' }),
      ],
    }) as TaxComputationResult;
    // HIFO: sell 5 from lot 2 at $1500 basis → gain 500.
    expect(r.annual.totalGainsFiat).toBeCloseTo(500, 6);
  });

  it('long-term preferential 15% rate kicks in after 365 days', () => {
    const r = computeTaxPosition({
      rule: US,
      transactions: [
        tx({ id: 'a', ts: 0,         kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 500,  fiatCurrency: 'USD' }),
        tx({ id: 'd', ts: 400 * DAY, kind: 'sell_to_fiat',  amount: '5000000', fiatValueAtTx: 1500, fiatCurrency: 'USD' }),
      ],
    }) as TaxComputationResult;
    // 1000 gain. Per-tx tax at preferential 15% = 150.
    // But the engine's final aggregate uses the standard 37% rate,
    // so net rate-application diverges per-tx vs aggregate. v1
    // engine reports the aggregate (standard rate × net taxable).
    // Per-tx surface holds the preferential figure for adviser display.
    expect(r.perTransaction[0]!.longTerm).toBe(true);
    expect(r.perTransaction[0]!.taxFiat).toBeCloseTo(150, 6); // 1000 × 15%
  });
});

describe('Australia — 50% CGT discount after 12 months', () => {
  it('reduces the taxable gain by half after 365 days', () => {
    const r = computeTaxPosition({
      rule: AU,
      transactions: [
        tx({ id: 'a', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000, fiatCurrency: 'AUD' }),
        tx({ id: 'd', ts: 400 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 3000, fiatCurrency: 'AUD' }),
      ],
    }) as TaxComputationResult;
    // Gain $2000. After 50% discount → $1000 taxable.
    expect(r.perTransaction[0]!.longTerm).toBe(true);
    expect(r.perTransaction[0]!.effectiveGainLossFiat).toBeCloseTo(1000, 6);
  });

  it('full gain before 365 days', () => {
    const r = computeTaxPosition({
      rule: AU,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000, fiatCurrency: 'AUD' }),
        tx({ id: 'd', ts: 30 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 3000, fiatCurrency: 'AUD' }),
      ],
    }) as TaxComputationResult;
    expect(r.perTransaction[0]!.longTerm).toBe(false);
    expect(r.perTransaction[0]!.effectiveGainLossFiat).toBeCloseTo(2000, 6);
  });
});

describe('Portugal — tax-free after 365 days', () => {
  it('zero tax when held > 365 days', () => {
    const r = computeTaxPosition({
      rule: PT,
      transactions: [
        tx({ id: 'a', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 'd', ts: 400 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 2000 }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBe(0);
    expect(r.annual.longTermExemptGainsFiat).toBeCloseTo(1000, 6);
  });
});

describe('Spain — progressive savings-base rate', () => {
  it('slices a 10k gain across two brackets', () => {
    const r = computeTaxPosition({
      rule: ES,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0 }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 10000 }),
      ],
    }) as TaxComputationResult;
    // 6000 @ 19% + 4000 @ 21% = 1140 + 840 = 1980
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(1980, 6);
    expect(r.reviewRequired).toBe(true); // medium-confidence rule
  });
});

describe('Singapore + UAE + Switzerland — zero CGT for individuals', () => {
  it.each([
    ['Singapore', SG],
    ['UAE',       AE],
    ['Switzerland', CH],
  ])('%s — zero tax even on a 50k gain', (_name, rule) => {
    const r = computeTaxPosition({
      rule,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0,     fiatCurrency: 'USD' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 50000, fiatCurrency: 'USD' }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });
});

describe('South Africa — investor 18% effective + R40k exclusion', () => {
  it('applies the exclusion before taxing the remainder', () => {
    const r = computeTaxPosition({
      rule: ZA,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 10000, fiatCurrency: 'ZAR' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 60000, fiatCurrency: 'ZAR' }),
      ],
    }) as TaxComputationResult;
    // Gain 50000, exclusion 40000, taxable 10000 × 18% = 1800
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(1800, 6);
  });
});

describe('Nigeria — ₦800k threshold', () => {
  it('exempts gains below the threshold', () => {
    const r = computeTaxPosition({
      rule: NG,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 0,      fiatCurrency: 'NGN' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 500000, fiatCurrency: 'NGN' }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });
});

describe('Japan — 55% top bracket + no loss deduction', () => {
  it('disallows loss carry-forward', () => {
    const r = computeTaxPosition({
      rule: JP,
      transactions: [
        tx({ id: 'a', ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 5000, fiatCurrency: 'JPY' }),
        tx({ id: 'd', ts: 10 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 3000, fiatCurrency: 'JPY' }),
      ],
    }) as TaxComputationResult;
    // 2000 loss, JP loss_treatment.deductible=false → no carry forward
    expect(r.annual.totalLossesFiat).toBeCloseTo(2000, 6);
    expect(r.annual.carryForwardLossesFiat).toBe(0);
  });
});

describe('Netherlands — refused (Box 3 wealth-tax model)', () => {
  it('returns RefusalResult per §8.3', () => {
    const r = computeTaxPosition({ rule: NL, transactions: [] });
    expect(isRefused(r)).toBe(true);
    if (isRefused(r)) {
      expect(r.message).toContain('Netherlands');
      expect(r.message).toContain('local tax adviser');
    }
  });
});
