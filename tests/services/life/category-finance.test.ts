/**
 * category-finance.test.ts — pure-function unit tests for Life / Finance
 * calculators. No DB, no I/O.
 */

import { describe, it, expect } from 'vitest';
import {
  compoundInterest,
  fireNumber,
  mortgagePayment,
  avalancheOrder,
  snowballOrder,
  requiredMonthlyContribution,
  type Debt,
} from '../../../server/services/category-finance.js';

describe('compoundInterest', () => {
  it('reduces to simple interest when rate is 0', () => {
    const r = compoundInterest(1000, 100, 0, 5);
    expect(r.totalContributed).toBe(1000 + 100 * 60);
    expect(r.finalBalance).toBe(1000 + 100 * 60);
    expect(r.totalGrowth).toBe(0);
  });

  it('grows principal-only correctly at 7%/yr over 10y', () => {
    const r = compoundInterest(10_000, 0, 0.07, 10);
    // 10000 * (1 + 0.07/12)^120 ≈ 20096.61
    expect(r.finalBalance).toBeGreaterThan(20_000);
    expect(r.finalBalance).toBeLessThan(20_200);
    expect(r.totalContributed).toBe(10_000);
  });

  it('grows monthly-only contributions correctly', () => {
    const r = compoundInterest(0, 500, 0.06, 20);
    // FV of $500/mo at 0.5%/mo for 240 months ≈ $231,020
    expect(r.finalBalance).toBeGreaterThan(230_000);
    expect(r.finalBalance).toBeLessThan(232_000);
    expect(r.totalContributed).toBe(500 * 240);
  });

  it('combines principal + monthly contributions', () => {
    const r = compoundInterest(50_000, 1000, 0.05, 10);
    expect(r.finalBalance).toBeGreaterThan(r.totalContributed);
    expect(r.totalGrowth).toBe(r.finalBalance - r.totalContributed);
  });
});

describe('fireNumber', () => {
  it('uses the 4% rule by default (annualSpend × 25)', () => {
    expect(fireNumber(40_000)).toBe(1_000_000);
    expect(fireNumber(60_000)).toBe(1_500_000);
  });

  it('respects a custom withdrawal rate', () => {
    // 3% safer rule → 33.33× spend
    expect(fireNumber(40_000, 0.03)).toBe(Math.round(40_000 / 0.03));
  });

  it('rejects an invalid withdrawal rate', () => {
    expect(() => fireNumber(40_000, 0)).toThrow();
    expect(() => fireNumber(40_000, -0.01)).toThrow();
    expect(() => fireNumber(40_000, 0.20)).toThrow();
  });
});

describe('mortgagePayment', () => {
  it('handles 0% interest as straight-line amortisation', () => {
    expect(mortgagePayment(120_000, 0, 30)).toBeCloseTo(120_000 / 360, 2);
  });

  it('matches the canonical 30-year amortisation formula', () => {
    // $300k @ 6% over 30y → ~$1798.65/mo
    const m = mortgagePayment(300_000, 0.06, 30);
    expect(m).toBeGreaterThan(1798);
    expect(m).toBeLessThan(1800);
  });

  it('decreases as term lengthens', () => {
    const a = mortgagePayment(300_000, 0.05, 15);
    const b = mortgagePayment(300_000, 0.05, 30);
    expect(a).toBeGreaterThan(b);
  });
});

describe('debt-payoff ordering', () => {
  const debts: Debt[] = [
    { name: 'Visa',     balance: 5000,  apr: 0.22, minimumPayment: 100 },
    { name: 'Loan',     balance: 12000, apr: 0.07, minimumPayment: 250 },
    { name: 'CarLoan',  balance: 8000,  apr: 0.05, minimumPayment: 200 },
    { name: 'Amex',     balance: 1500,  apr: 0.18, minimumPayment: 60  },
  ];

  it('avalanche sorts by descending APR (highest interest first)', () => {
    const ord = avalancheOrder(debts);
    expect(ord[0].name).toBe('Visa');     // 22%
    expect(ord[1].name).toBe('Amex');     // 18%
    expect(ord[2].name).toBe('Loan');     // 7%
    expect(ord[3].name).toBe('CarLoan');  // 5%
    expect(ord.map(d => d.rank)).toEqual([1, 2, 3, 4]);
  });

  it('snowball sorts by ascending balance (smallest first)', () => {
    const ord = snowballOrder(debts);
    expect(ord[0].name).toBe('Amex');     // 1500
    expect(ord[1].name).toBe('Visa');     // 5000
    expect(ord[2].name).toBe('CarLoan');  // 8000
    expect(ord[3].name).toBe('Loan');     // 12000
  });

  it('does not mutate the input array', () => {
    const original = debts.map(d => d.name);
    avalancheOrder(debts);
    snowballOrder(debts);
    expect(debts.map(d => d.name)).toEqual(original);
  });
});

describe('requiredMonthlyContribution', () => {
  it('returns the gap divided by months when years <= 0', () => {
    expect(requiredMonthlyContribution(5_000, 10_000, 0.05, 0)).toBe(5_000);
  });

  it('returns 0 when current balance already grows past target', () => {
    // 100k @ 10% for 10y will easily exceed 150k
    const m = requiredMonthlyContribution(100_000, 150_000, 0.10, 10);
    expect(m).toBe(0);
  });

  it('returns a sensible monthly amount for typical retirement targets', () => {
    // Need to get from 50k to 1M in 30y at 7%
    const m = requiredMonthlyContribution(50_000, 1_000_000, 0.07, 30);
    expect(m).toBeGreaterThan(300);
    expect(m).toBeLessThan(700);
  });
});
