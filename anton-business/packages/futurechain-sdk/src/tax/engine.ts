/**
 * engine.ts — orchestrator. Implements the pseudocode in
 * `FUTURECHAIN_TAX_RULES.md` §5.
 *
 *   function compute_tax_position(user, transactions, jurisdiction_code):
 *       rules = load_jurisdiction(jurisdiction_code)
 *       if rules.status == 'unsupported':
 *           return refuse_with_referral(jurisdiction_code)
 *       pool = build_cost_basis(transactions, rules.cost_basis_method.default)
 *       results = []
 *       for tx in transactions:
 *           if is_taxable_event(tx, rules.taxable_events):
 *               if rules.exemptions.long_term_holding.enabled:
 *                   holding_period = compute_holding_period(tx, pool)
 *                   if holding_period >= rules.exemptions.long_term_holding.period_days:
 *                       apply_long_term_treatment(tx, rules)
 *                       continue
 *               gain_or_loss = compute_gain_loss(tx, pool, rules.cost_basis_method)
 *               tax_amount = apply_rate(gain_or_loss, rules.rates, user.income_bracket)
 *               results.append({tx, gain_or_loss, tax_amount, rule_applied})
 *       annual = aggregate(results)
 *       annual = apply_annual_exemption(annual, rules.exemptions.annual_exemption)
 *       annual = apply_loss_offset(annual, rules.loss_treatment)
 *       return {
 *           per_transaction: results,
 *           annual_summary: annual,
 *           disclaimer: rules.disclaimer,
 *           rule_version: rules.last_verified,
 *           review_required: should_refer_to_adviser(annual, user.preferences),
 *       }
 *
 * Every output carries the §3 disclaimer or this function throws.
 * That's a hard rule per §2 of the spec.
 */
import { resolveCostBasisForRule, type GainLossEntry } from './cost-basis/index.js';
import { buildDisclaimer, type DisclaimerLocale } from './disclaimer.js';
import { applyHoldingPeriod, type HeldEntry } from './holding-period.js';
import { applyLossOffset, type LossOffsetResult } from './loss-offset.js';
import { applyRate } from './rates.js';
import { applyRefundTagging, DEFAULT_REFUND_WINDOW_DAYS } from './refund-tagging.js';
import { computeWealthTaxPosition, type WealthTaxResult } from './wealth-tax.js';
import type {
  ComputeOptions,
  FtcClassification,
  JurisdictionRule,
} from './schema.js';
import type { TaxInputTx } from './transaction.js';

export interface TaxComputationInput {
  rule: JurisdictionRule;
  transactions: TaxInputTx[];
  options?: ComputeOptions;
  /** Brought-forward deductible losses, per loss-offset.ts. */
  carriedForwardLossesFiat?: number;
  /** User preference — Anton refuses to show numbers above this
   *  threshold without first prompting "talk to an adviser." Per §2.2
   *  default is €5k equivalent. The caller supplies the threshold in
   *  the same currency as the rule's local currency. */
  adviserReferralThresholdFiat?: number;
  /** §3 disclaimer locale. */
  locale?: DisclaimerLocale;
  /** Per §7.4 — `refund_*` txs tagged with `refundOf` and falling
   *  within this window cancel their original tx for tax purposes.
   *  Set to 0 to disable refund cancellation entirely. */
  refundWindowDays?: number;
}

export interface PerTxResult extends HeldEntry {
  /** Tax on this single entry's effective gain. Negative entries
   *  contribute 0 here — losses are netted in the annual aggregator. */
  taxFiat: number;
}

export interface AnnualSummary {
  totalGainsFiat: number;
  totalLossesFiat: number;
  /** After annual exemption (if any) + loss offset. The figure that
   *  drives the estimated tax. */
  netTaxableGainsFiat: number;
  estimatedTaxFiat: number;
  /** Carry-forward losses produced by the loss-offset rule. Caller
   *  is expected to persist these and pass back as
   *  `carriedForwardLossesFiat` next year. */
  carryForwardLossesFiat: number;
  /** Annual exemption that got consumed (informational). */
  exemptionApplied: number;
  /** Long-term gains that hit `tax_free` treatment (e.g. DE > 12 months). */
  longTermExemptGainsFiat: number;
  /** Currency for all the above. */
  fiatCurrency: string;
}

export interface TaxComputationResult {
  jurisdictionCode: string;
  jurisdictionName: string;
  perTransaction: PerTxResult[];
  annual: AnnualSummary;
  /** § 3 mandatory disclaimer — always present. */
  disclaimer: string;
  /** § 9.1 — last_verified date of the rule applied. */
  ruleVersion: string;
  /** § 2.2 — true if estimated tax exceeds the user's threshold
   *  OR confidence is anything below 'high' OR review_flags is
   *  non-empty. The UI must surface this prominently. */
  reviewRequired: boolean;
  reviewReasons: string[];
  /** Optional — EMT classification used. Surfaces the §7.2 toggle so
   *  the user can see which interpretation produced these numbers. */
  ftcClassification: FtcClassification;
}

/** Caller for `unsupported` jurisdictions per §8.3. The host's UI
 *  shows this verbatim + offers a raw-CSV export. */
export interface RefusalResult {
  jurisdictionCode: string;
  refused: true;
  message: string;
}

export function isRefused(r: TaxComputationResult | RefusalResult): r is RefusalResult {
  return (r as RefusalResult).refused === true;
}

export function computeTaxPosition(
  input: TaxComputationInput,
): TaxComputationResult | RefusalResult {
  const rule = input.rule;

  if (rule.status !== 'active') {
    return {
      jurisdictionCode: rule.jurisdiction_code,
      refused: true,
      message:
        `Tax calculation for ${rule.jurisdiction_name} is not currently ` +
        `supported in this version. Your transactions are still recorded ` +
        `and can be exported for use by a local tax adviser. We recommend ` +
        `consulting a qualified crypto tax specialist in ${rule.jurisdiction_name} ` +
        `before filing.`,
    };
  }

  // 0. Dispatch by taxation model. Wealth-tax jurisdictions (NL Box 3
  //    today; possibly CH cantonal later) compute on year-end balance
  //    rather than per-disposal. We adapt the result into the
  //    TaxComputationResult shape so callers don't need a separate
  //    UI path — the "disposals" section will be empty (no taxable
  //    events to render) and the headline figures map straight across.
  if (rule.taxation_model === 'wealth') {
    return adaptWealthTaxToTaxResult(
      computeWealthTaxPosition({
        rule,
        transactions: input.transactions,
        locale: input.locale,
        adviserReferralThresholdFiat: input.adviserReferralThresholdFiat,
      }),
    );
  }

  // 1. Pick cost-basis method. Default unless the rule allows
  //    optimization AND the user picked one.
  const chosenMethod =
    rule.cost_basis_method.optimization_allowed && input.options?.cost_basis_override
      ? input.options.cost_basis_override
      : rule.cost_basis_method.default;
  const costBasisFn = resolveCostBasisForRule(chosenMethod, rule.cost_basis_method);

  // 1a. Refund-tagging pre-processor (§7.4). Pairs an original
  //     disposal with its tagged refund inside the configured window
  //     and cancels both before cost-basis sees them. Surfaces a
  //     review_flag so the user knows the treatment isn't legally
  //     settled.
  const refundWindow = input.refundWindowDays ?? DEFAULT_REFUND_WINDOW_DAYS;
  const refundResult = refundWindow > 0
    ? applyRefundTagging(input.transactions, refundWindow)
    : { filtered: input.transactions, cancelledPairCount: 0 };

  // 2. Build the gain/loss ledger.
  const ledger = costBasisFn(refundResult.filtered);

  // 2a. Build a tx-kind lookup so post-ledger steps can filter by
  //     the original taxable-event flag (France: swap_crypto_to_crypto
  //     is non-taxable — disposal still affects the pool, but the
  //     gain is exempt).
  const kindById = new Map(refundResult.filtered.map((t) => [t.id, t.kind]));
  const isExemptSwap = (txId: string): boolean =>
    !rule.taxable_events.swap_crypto_to_crypto && kindById.get(txId) === 'swap';

  // 3. Apply long-term-holding relief.
  const heldEntries = applyHoldingPeriod(
    ledger.entries,
    rule.exemptions_and_reliefs.long_term_holding,
  ).map((e) => isExemptSwap(e.txId) ? { ...e, effectiveGainLossFiat: 0 } : e);

  // 4. Apply rates per entry.
  //    Three rate paths in priority order:
  //      a) EMT carve-out — when the user flags FTC=EMT and the
  //         jurisdiction has emt.enabled (Italy 26% today)
  //      b) Long-term reduced-rate — when long_term_holding.treatment_after
  //         is 'reduced_rate' and the entry is long-term (US-style
  //         preferential long-term rate, abstracted to a single
  //         flat rate; bracketed long-term lands in Phase 5)
  //      c) Standard rate per rule.rates.capital_gains
  const ftcClassification = input.options?.ftc_classification ?? 'utility_token';
  const emt = rule.exemptions_and_reliefs.emt_special_treatment;
  const useEmtRate = ftcClassification === 'emt' && emt.enabled && emt.reduced_rate !== undefined;
  const ltRelief = rule.exemptions_and_reliefs.long_term_holding;
  const ltReducedRate =
    ltRelief.enabled && ltRelief.treatment_after === 'reduced_rate'
      ? ltRelief.reduced_rate
      : undefined;

  const perTx: PerTxResult[] = heldEntries.map((e) => {
    if (e.effectiveGainLossFiat <= 0) {
      return { ...e, taxFiat: 0 };
    }
    // Canada's 50% inclusion rate (and any future jurisdiction with
    // partial inclusion) applies BEFORE the rate. Default 1.0 = full
    // inclusion. Multiplies into the *effective* gain (already past
    // long-term discount, if any).
    const inclusion = rule.rates.capital_gains.inclusion_rate ?? 1.0;
    const taxableGain = e.effectiveGainLossFiat * inclusion;

    let taxFiat: number;
    if (useEmtRate) {
      taxFiat = taxableGain * (emt.reduced_rate ?? 0);
    } else if (e.longTerm && ltReducedRate !== undefined) {
      taxFiat = taxableGain * ltReducedRate;
    } else {
      taxFiat = applyRate(taxableGain, rule.rates.capital_gains.structure);
    }
    return { ...e, taxFiat };
  });

  // 5. Aggregate.
  const fiatCurrency = ledger.entries[0]?.fiatCurrency ?? 'SEK';
  const totalGains = sum(perTx.map((e) => Math.max(0, e.effectiveGainLossFiat)));
  const totalLosses = sum(perTx.map((e) => Math.max(0, -e.gainLossFiat)));
  const longTermExempt = sum(
    heldEntries
      .filter((e) => e.longTerm && e.effectiveGainLossFiat === 0 && e.gainLossFiat > 0)
      .map((e) => e.gainLossFiat),
  );

  // 6. Annual exemption — subtract from gains before loss offset.
  const annualExemption = rule.exemptions_and_reliefs.annual_exemption;
  const gainsAfterExemption = Math.max(0, totalGains - annualExemption);
  const exemptionApplied = Math.min(totalGains, annualExemption);

  // 7. Loss offset.
  const offset: LossOffsetResult = applyLossOffset(
    {
      totalGainsFiat: gainsAfterExemption,
      totalLossesFiat: totalLosses,
      carriedForwardLossesFiat: input.carriedForwardLossesFiat,
    },
    rule.loss_treatment,
  );

  // 8. Final tax on the netted figure. Re-apply the rate to the net
  //    so progressive brackets see the *real* taxable base, not the
  //    per-entry slices. Inclusion rate (Canada 50%) applies before
  //    the rate just like in the per-tx loop above.
  const inclusionRate = rule.rates.capital_gains.inclusion_rate ?? 1.0;
  const taxableBase = offset.netTaxableGainsFiat * inclusionRate;
  const finalTax = useEmtRate
    ? taxableBase * (emt.reduced_rate ?? 0)
    : applyRate(taxableBase, rule.rates.capital_gains.structure);

  const annual: AnnualSummary = {
    totalGainsFiat: totalGains,
    totalLossesFiat: totalLosses,
    netTaxableGainsFiat: offset.netTaxableGainsFiat,
    estimatedTaxFiat: finalTax,
    carryForwardLossesFiat: offset.lossesRemainingForCarryForwardFiat,
    exemptionApplied,
    longTermExemptGainsFiat: longTermExempt,
    fiatCurrency,
  };

  // 9. § 2.2 — adviser referral check.
  const threshold = input.adviserReferralThresholdFiat ?? Number.POSITIVE_INFINITY;
  const reasons: string[] = [];
  if (finalTax > threshold) reasons.push(`estimated_tax_above_threshold_${threshold}`);
  if (rule.metadata.confidence !== 'high') reasons.push(`rule_confidence_${rule.metadata.confidence}`);
  if (rule.metadata.review_flags.length > 0) reasons.push(...rule.metadata.review_flags.map((f) => `review_flag_${f}`));
  if (refundResult.cancelledPairCount > 0) {
    reasons.push(`refund_pairs_cancelled_${refundResult.cancelledPairCount}_treatment_not_legally_settled`);
  }
  const reviewRequired = reasons.length > 0;

  return {
    jurisdictionCode: rule.jurisdiction_code,
    jurisdictionName: rule.jurisdiction_name,
    perTransaction: perTx,
    annual,
    disclaimer: buildDisclaimer({
      jurisdictionName: rule.jurisdiction_name,
      lastVerified: rule.metadata.last_verified,
      locale: input.locale,
    }),
    ruleVersion: rule.metadata.last_verified,
    reviewRequired,
    reviewReasons: reasons,
    ftcClassification,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Map a WealthTaxResult into the TaxComputationResult shape so the
 *  UI doesn't need a separate render path. Wealth-tax-specific
 *  semantics (no disposals, no loss offset, no EMT toggle) collapse
 *  into the existing fields:
 *    - estimatedTaxFiat → annual.estimatedTaxFiat
 *    - taxableBalanceFiat → annual.netTaxableGainsFiat
 *    - allowanceApplied → annual.exemptionApplied
 *    - perTransaction = [] (no taxable events)
 *  The user sees a meaningful number; the adviser-facing export
 *  needs its own renderer (lands when reporting/box3.ts ships). */
function adaptWealthTaxToTaxResult(w: WealthTaxResult): TaxComputationResult {
  return {
    jurisdictionCode: w.jurisdictionCode,
    jurisdictionName: w.jurisdictionName,
    perTransaction: [],
    annual: {
      totalGainsFiat: w.taxableBalanceFiat,
      totalLossesFiat: 0,
      netTaxableGainsFiat: w.taxableBalanceFiat,
      estimatedTaxFiat: w.estimatedTaxFiat,
      carryForwardLossesFiat: 0,
      exemptionApplied: w.allowanceApplied,
      longTermExemptGainsFiat: 0,
      fiatCurrency: w.fiatCurrency,
    },
    disclaimer: w.disclaimer,
    ruleVersion: w.ruleVersion,
    reviewRequired: w.reviewRequired,
    reviewReasons: w.reviewReasons,
    ftcClassification: 'utility_token',
  };
}
