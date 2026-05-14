/**
 * holding-period.ts — applies long-term-holding relief.
 *
 * Used by:
 *   - DE: > 12 months held → 0% (Spekulationsfrist)
 *   - PT: > 365 days → 0%
 *   - AU: > 12 months → 50% discount (the most common variant)
 *   - MT: long-term holdings tax-free for individuals
 *   - LU: > 6 months → tax-free
 *   - SK: > 1 year → reduced rate (verify)
 *
 * Skipped entirely for jurisdictions whose rule has
 * `long_term_holding.enabled = false` (most of them, including SE).
 *
 * Only meaningful when the cost-basis method tracks `acquiredTs` —
 * i.e. FIFO, SPECIFIC_ID, SHARE_POOLING. AVERAGE doesn't carry per-
 * lot acquisition dates, so AVERAGE jurisdictions without long-term
 * relief don't need this module.
 */
import type { GainLossEntry } from './cost-basis/index.js';
import type { LongTermHoldingRelief } from './schema.js';

export interface HeldEntry extends GainLossEntry {
  /** True if `acquiredTs` and `ts` are >= `period_days` apart. */
  longTerm: boolean;
  /** The gain after applying the long-term treatment. For
   *  `tax_free`, this is 0; for `reduced_rate`, the orchestrator
   *  applies the special rate separately. */
  effectiveGainLossFiat: number;
}

export function applyHoldingPeriod(
  entries: GainLossEntry[],
  rule: LongTermHoldingRelief,
): HeldEntry[] {
  if (!rule.enabled) {
    return entries.map((e) => ({ ...e, longTerm: false, effectiveGainLossFiat: e.gainLossFiat }));
  }
  const periodMs = rule.period_days * 24 * 60 * 60 * 1000;

  return entries.map((e) => {
    if (e.acquiredTs === null) {
      // No acquisition date carried (AVERAGE-based result). Treat as
      // short-term — the spec is explicit that AVERAGE-only
      // jurisdictions don't apply this relief.
      return { ...e, longTerm: false, effectiveGainLossFiat: e.gainLossFiat };
    }
    const heldFor = e.ts - e.acquiredTs;
    const longTerm = heldFor >= periodMs;

    if (!longTerm) {
      return { ...e, longTerm: false, effectiveGainLossFiat: e.gainLossFiat };
    }

    if (rule.treatment_after === 'tax_free') {
      return { ...e, longTerm: true, effectiveGainLossFiat: 0 };
    }
    if (rule.treatment_after === 'discounted') {
      // AU 50% CGT discount and similar: a fraction of the gain is
      // EXEMPT after the holding period. e.g. discount_fraction=0.5
      // means 50% of the gain falls out, the rest is taxed at the
      // normal rate.
      const discount = rule.discount_fraction ?? 0;
      if (e.gainLossFiat > 0) {
        return {
          ...e,
          longTerm: true,
          effectiveGainLossFiat: e.gainLossFiat * (1 - discount),
        };
      }
      // Losses: don't discount — they remain fully available for
      // offset (per AU convention; some jurisdictions vary).
      return { ...e, longTerm: true, effectiveGainLossFiat: e.gainLossFiat };
    }
    // 'reduced_rate' and 'unchanged' both keep the gain in scope —
    // the orchestrator picks the rate at apply-rate time using the
    // `longTerm` flag + rule.long_term_holding.reduced_rate.
    return { ...e, longTerm: true, effectiveGainLossFiat: e.gainLossFiat };
  });
}
