/**
 * loss-offset.ts — applies a jurisdiction's loss-offset rules to an
 * aggregated annual figure.
 *
 * Sweden is the canonical case: 70% deductibility. A 1000 SEK loss
 * only offsets 700 SEK of gain. Most other jurisdictions offer 100%
 * deductibility but with different `offset_against` scope (some
 * limit to crypto, some to all capital gains, some across to income).
 *
 * Carry-forward semantics:
 *   carry_forward_years === 0   → losses die at year-end
 *   carry_forward_years === -1  → carry forward indefinitely
 *   carry_forward_years === N>0 → carry forward N years
 *
 * Carry-forward state is the caller's responsibility — this module
 * just decides what's deductible *this year* given the inputs.
 */
import type { LossTreatment } from './schema.js';

export interface LossOffsetInput {
  /** Sum of positive gain-loss entries this year, positive number. */
  totalGainsFiat: number;
  /** Sum of negative gain-loss entries this year, positive number. */
  totalLossesFiat: number;
  /** Brought-forward deductible losses from prior years, positive. */
  carriedForwardLossesFiat?: number;
}

export interface LossOffsetResult {
  /** Net taxable amount after applying the deductible portion of
   *  losses against gains. Never negative. */
  netTaxableGainsFiat: number;
  /** Losses applied to this year's gains (after the deductible
   *  percentage). */
  lossesUtilisedFiat: number;
  /** Losses left over after offset (the part of the deductible loss
   *  that exceeded gains — carried forward if the rule allows). */
  lossesRemainingForCarryForwardFiat: number;
  /** Diagnostic — what fraction of the gross losses was actually
   *  deductible at this jurisdiction. */
  deductiblePercentage: number;
}

export function applyLossOffset(
  input: LossOffsetInput,
  rule: LossTreatment,
): LossOffsetResult {
  const gains = Math.max(0, input.totalGainsFiat);
  const losses = Math.max(0, input.totalLossesFiat);
  const broughtForward = Math.max(0, input.carriedForwardLossesFiat ?? 0);

  if (!rule.deductible) {
    return {
      netTaxableGainsFiat: gains,
      lossesUtilisedFiat: 0,
      lossesRemainingForCarryForwardFiat: 0,
      deductiblePercentage: 0,
    };
  }

  const pct = rule.deductible_percentage;
  // Apply the deductibility haircut to this year's losses + bring
  // forward any prior-year losses (which were already haircut when
  // they were carried in — we don't re-haircut).
  const thisYearDeductible = losses * pct;
  const totalDeductible = thisYearDeductible + broughtForward;

  const utilised = Math.min(totalDeductible, gains);
  const remaining = totalDeductible - utilised;

  return {
    netTaxableGainsFiat: gains - utilised,
    lossesUtilisedFiat: utilised,
    lossesRemainingForCarryForwardFiat: rule.carry_forward_years === 0 ? 0 : remaining,
    deductiblePercentage: pct,
  };
}
