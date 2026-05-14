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
import { resolveCostBasis, type GainLossEntry } from './cost-basis/index.js';
import { buildDisclaimer, type DisclaimerLocale } from './disclaimer.js';
import { applyHoldingPeriod, type HeldEntry } from './holding-period.js';
import { applyLossOffset, type LossOffsetResult } from './loss-offset.js';
import { applyRate } from './rates.js';
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

  // 1. Pick cost-basis method. Default unless the rule allows
  //    optimization AND the user picked one.
  const chosenMethod =
    rule.cost_basis_method.optimization_allowed && input.options?.cost_basis_override
      ? input.options.cost_basis_override
      : rule.cost_basis_method.default;
  const costBasisFn = resolveCostBasis(chosenMethod);

  // 2. Build the gain/loss ledger.
  const ledger = costBasisFn(input.transactions);

  // 3. Apply long-term-holding relief.
  const heldEntries = applyHoldingPeriod(
    ledger.entries,
    rule.exemptions_and_reliefs.long_term_holding,
  );

  // 4. Apply rates per entry. EMT carve-out: if the user has flagged
  //    FTC as EMT and this jurisdiction has an EMT special treatment,
  //    use the reduced rate. Italy is the only `enabled` case today.
  const ftcClassification = input.options?.ftc_classification ?? 'utility_token';
  const emt = rule.exemptions_and_reliefs.emt_special_treatment;
  const useEmtRate = ftcClassification === 'emt' && emt.enabled && emt.reduced_rate !== undefined;

  const perTx: PerTxResult[] = heldEntries.map((e) => {
    if (e.effectiveGainLossFiat <= 0) {
      return { ...e, taxFiat: 0 };
    }
    const taxFiat = useEmtRate
      ? e.effectiveGainLossFiat * (emt.reduced_rate ?? 0)
      : applyRate(e.effectiveGainLossFiat, rule.rates.capital_gains.structure);
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
  //    per-entry slices.
  const finalTax = useEmtRate
    ? offset.netTaxableGainsFiat * (emt.reduced_rate ?? 0)
    : applyRate(offset.netTaxableGainsFiat, rule.rates.capital_gains.structure);

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
