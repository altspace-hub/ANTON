/**
 * loss-offset.test.ts — focused on Sweden's 70% rule + the no-deduction
 * case.
 */
import { describe, expect, it } from 'vitest';
import { applyLossOffset } from '../loss-offset.js';
import { SE } from '../rules/index.js';

describe('Sweden 70% loss deductibility', () => {
  it('halves a 1000 loss to 700 deductible against gains', () => {
    const out = applyLossOffset(
      { totalGainsFiat: 2000, totalLossesFiat: 1000 },
      SE.loss_treatment,
    );
    // 70% of 1000 = 700; gains 2000 − 700 = 1300 net taxable
    expect(out.netTaxableGainsFiat).toBeCloseTo(1300, 6);
    expect(out.lossesUtilisedFiat).toBeCloseTo(700, 6);
    expect(out.deductiblePercentage).toBe(0.70);
  });

  it('caps utilisation at the level of gains', () => {
    const out = applyLossOffset(
      { totalGainsFiat: 300, totalLossesFiat: 1000 },
      SE.loss_treatment,
    );
    // 700 deductible but only 300 of gains to absorb → utilise 300
    expect(out.netTaxableGainsFiat).toBe(0);
    expect(out.lossesUtilisedFiat).toBe(300);
    // Sweden has carry_forward_years = 0 → leftover dies at year end
    expect(out.lossesRemainingForCarryForwardFiat).toBe(0);
  });

  it('returns gains untouched when there are no losses', () => {
    const out = applyLossOffset(
      { totalGainsFiat: 1500, totalLossesFiat: 0 },
      SE.loss_treatment,
    );
    expect(out.netTaxableGainsFiat).toBe(1500);
    expect(out.lossesUtilisedFiat).toBe(0);
  });
});

describe('non-deductible rule', () => {
  it('leaves gains untouched and reports zero deductibility', () => {
    const out = applyLossOffset(
      { totalGainsFiat: 1000, totalLossesFiat: 500 },
      {
        deductible: false,
        deductible_percentage: 0,
        offset_against: 'none',
        carry_forward_years: 0,
      },
    );
    expect(out.netTaxableGainsFiat).toBe(1000);
    expect(out.lossesUtilisedFiat).toBe(0);
    expect(out.deductiblePercentage).toBe(0);
  });
});

describe('carry-forward rules', () => {
  it('preserves remaining losses when carry-forward is indefinite', () => {
    const out = applyLossOffset(
      { totalGainsFiat: 100, totalLossesFiat: 1000, carriedForwardLossesFiat: 0 },
      {
        deductible: true,
        deductible_percentage: 1.0,
        offset_against: 'crypto_only',
        carry_forward_years: -1,
      },
    );
    // 1000 deductible, only 100 gains absorbs → 900 carry forward
    expect(out.lossesRemainingForCarryForwardFiat).toBe(900);
  });

  it('adds brought-forward losses without re-haircutting', () => {
    const out = applyLossOffset(
      { totalGainsFiat: 500, totalLossesFiat: 100, carriedForwardLossesFiat: 200 },
      {
        deductible: true,
        deductible_percentage: 0.50, // haircut applies only to this year's losses
        offset_against: 'crypto_only',
        carry_forward_years: -1,
      },
    );
    // Available: 100*0.50 + 200 = 250 deductible. Gains 500 absorb all 250.
    expect(out.lossesUtilisedFiat).toBe(250);
    expect(out.netTaxableGainsFiat).toBe(250);
  });
});
