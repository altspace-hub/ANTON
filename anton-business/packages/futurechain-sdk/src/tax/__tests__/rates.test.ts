/**
 * rates.test.ts — flat + progressive rate application.
 */
import { describe, expect, it } from 'vitest';
import { applyRate } from '../rates.js';

describe('flat rate', () => {
  it('applies a flat percentage to a positive gain', () => {
    expect(applyRate(1000, { type: 'flat', rate: 0.30 })).toBeCloseTo(300, 6);
  });
  it('returns 0 for non-positive amounts', () => {
    expect(applyRate(0, { type: 'flat', rate: 0.30 })).toBe(0);
    expect(applyRate(-500, { type: 'flat', rate: 0.30 })).toBe(0);
  });
});

describe('progressive brackets', () => {
  // Spanish savings-base 2026 brackets
  const SAVINGS_BASE = {
    type: 'progressive' as const,
    brackets: [
      { upTo: 6000, rate: 0.19 },
      { upTo: 50000, rate: 0.21 },
      { upTo: 200000, rate: 0.23 },
      { upTo: 300000, rate: 0.27 },
      { upTo: null, rate: 0.28 },
    ],
  };

  it('taxes a gain entirely within the first bracket', () => {
    expect(applyRate(5000, SAVINGS_BASE)).toBeCloseTo(5000 * 0.19, 6);
  });

  it('slices across two brackets', () => {
    // 10000 → 6000 @ 19% + 4000 @ 21% = 1140 + 840 = 1980
    expect(applyRate(10000, SAVINGS_BASE)).toBeCloseTo(1980, 6);
  });

  it('slices across all brackets including open-ended top', () => {
    // 400000 → 6000@19 + 44000@21 + 150000@23 + 100000@27 + 100000@28
    // = 1140 + 9240 + 34500 + 27000 + 28000 = 99880
    expect(applyRate(400000, SAVINGS_BASE)).toBeCloseTo(99880, 6);
  });

  it('handles unsorted bracket input', () => {
    const SHUFFLED = {
      type: 'progressive' as const,
      brackets: [
        { upTo: null, rate: 0.28 },
        { upTo: 6000, rate: 0.19 },
        { upTo: 50000, rate: 0.21 },
        { upTo: 200000, rate: 0.23 },
        { upTo: 300000, rate: 0.27 },
      ],
    };
    expect(applyRate(10000, SHUFFLED)).toBeCloseTo(1980, 6);
  });
});
