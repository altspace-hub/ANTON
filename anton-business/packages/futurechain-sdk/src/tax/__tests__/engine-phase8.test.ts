/**
 * engine-phase8.test.ts — Phase 8 coverage.
 *
 *   8a: Parameterized share-pooling for Ireland's 4-week (28-day) rule.
 *   8b: Netherlands Box 3 wealth-tax engine path.
 */
import { describe, expect, it } from 'vitest';
import { computeTaxPosition, type TaxComputationResult } from '../engine.js';
import { makeSharePooling } from '../cost-basis/index.js';
import {
  computeWealthTaxPosition,
  isWealthTaxResult,
} from '../wealth-tax.js';
import { IE, NL } from '../rules/index.js';
import type { TaxInputTx } from '../transaction.js';

const DAY = 24 * 60 * 60 * 1000;

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return { decimals: 6, fiatCurrency: 'EUR', ...over };
}

// ────────────────────────────────────────────────────────────────
// 8a — Ireland 28-day matching
// ────────────────────────────────────────────────────────────────

describe('Ireland — 4-week (28-day) forward matching', () => {
  it('matches a re-buy within 28 days against the loss-sale', () => {
    // Same wash-sale shape as UK but with a 28-day window.
    const out = makeSharePooling(28)([
      tx({ id: 'old', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 500 }),
      tx({ id: 'd',   ts: 100 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 400 }),
      tx({ id: 're',  ts: 120 * DAY, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 420 }),
    ]);
    // Re-buy at day 120 is within (100, 128] window → matched.
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(420, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(-20, 6);
  });

  it('does NOT match a re-buy 29 days after the loss-sale', () => {
    // Day 100 + 29 = day 129; outside the 28-day window.
    const out = makeSharePooling(28)([
      tx({ id: 'old', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 500 }),
      tx({ id: 'd',   ts: 100 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 400 }),
      tx({ id: 're',  ts: 129 * DAY, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 420 }),
    ]);
    // Disposal falls through to the pool (old £500 lot). Loss is £100.
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(500, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(-100, 6);
  });

  it('engine end-to-end via IE rule applies 28-day window', () => {
    const r = computeTaxPosition({
      rule: IE,
      transactions: [
        tx({ id: 'a',  ts: 0,        kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 500 }),
        tx({ id: 'd',  ts: 50 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 600 }),
        tx({ id: 're', ts: 60 * DAY, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 580 }),
      ],
    }) as TaxComputationResult;
    // Re-buy at day 60 is within (50, 78] window → matched.
    // Gain = 600 − 580 = 20. Less than €1270 IE exemption → 0 tax.
    expect(r.annual.totalGainsFiat).toBeCloseTo(20, 6);
    expect(r.annual.estimatedTaxFiat).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────
// 8b — Netherlands Box 3 wealth-tax engine
// ────────────────────────────────────────────────────────────────

describe('Netherlands — Box 3 wealth-tax computation', () => {
  it('returns zero when year-end balance is below the allowance', () => {
    const w = computeWealthTaxPosition({
      rule: NL,
      transactions: [
        tx({ id: 'a', ts: 0, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 30000 }),
      ],
    });
    expect(w.yearEndBalanceFiat).toBeCloseTo(30000, 6);
    expect(w.allowanceApplied).toBeCloseTo(30000, 6); // entire balance is exempt
    expect(w.taxableBalanceFiat).toBe(0);
    expect(w.estimatedTaxFiat).toBe(0);
  });

  it('taxes the slice above the allowance at ~0.71% effective', () => {
    // Hold €100,000 worth at year-end. Allowance €57k → taxable €43k.
    // Deemed return 1.97% → €847.10. Box 3 36% → €304.96.
    const w = computeWealthTaxPosition({
      rule: NL,
      transactions: [
        tx({ id: 'a', ts: 0, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 100000 }),
      ],
    });
    expect(w.taxableBalanceFiat).toBeCloseTo(43000, 6);
    expect(w.deemedReturnFiat).toBeCloseTo(43000 * 0.0197, 4);
    expect(w.estimatedTaxFiat).toBeCloseTo(43000 * 0.0197 * 0.36, 4);
  });

  it('derives year-end balance from acquire + dispose stream', () => {
    const w = computeWealthTaxPosition({
      rule: NL,
      transactions: [
        tx({ id: 'a1', ts: 0,        kind: 'buy_with_fiat',   amount: '10000000', fiatValueAtTx: 100000 }),
        tx({ id: 's',  ts: 10 * DAY, kind: 'spend',           amount: '5000000',  fiatValueAtTx: 50000 }),
        tx({ id: 'a2', ts: 20 * DAY, kind: 'buy_with_fiat',   amount: '5000000',  fiatValueAtTx: 55000 }),
        tx({ id: 'r',  ts: 30 * DAY, kind: 'stake_reward',    amount: '1000000',  fiatValueAtTx: 12000 }),
      ],
    });
    // 100k − 50k + 55k + 12k = 117k year-end fiat.
    expect(w.yearEndBalanceFiat).toBeCloseTo(117000, 6);
  });

  it('carries the §3 disclaimer + rule version', () => {
    const w = computeWealthTaxPosition({ rule: NL, transactions: [] });
    expect(w.disclaimer).toContain('Netherlands');
    expect(w.disclaimer).toContain('not tax advice');
    expect(w.ruleVersion).toBe('2026-05-12');
  });

  it('isWealthTaxResult discriminates the result shape', () => {
    const w = computeWealthTaxPosition({ rule: NL, transactions: [] });
    expect(isWealthTaxResult(w)).toBe(true);
    expect(isWealthTaxResult({} as unknown)).toBe(false);
  });
});

describe('NL engine dispatch — computeTaxPosition routes to wealth tax', () => {
  it('returns a TaxComputationResult with empty perTransaction (no disposals)', () => {
    const r = computeTaxPosition({
      rule: NL,
      transactions: [
        tx({ id: 'a', ts: 0, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 100000 }),
      ],
    }) as TaxComputationResult;
    expect(r.perTransaction).toHaveLength(0);
    // €43k × 1.97% × 36% ≈ €304.96 — same as the wealth-tax test
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(43000 * 0.0197 * 0.36, 2);
    expect(r.annual.exemptionApplied).toBeCloseTo(57000, 6);
    expect(r.annual.netTaxableGainsFiat).toBeCloseTo(43000, 6);
  });
});
