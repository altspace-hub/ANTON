/**
 * schema.ts — TypeScript mirror of the YAML jurisdiction-rule schema
 * in `FUTURECHAIN_TAX_RULES.md` §4.
 *
 * The spec parses on these field names — do not rename without
 * updating the parser. Fields are typed as strictly as practical so
 * the rules-loader catches malformed YAML at boot, not in a tax
 * computation at the user's quarterly filing deadline.
 *
 * Spec § references in field comments are to the canonical document.
 */

/** ISO 3166-1 alpha-2 jurisdiction code. */
export type JurisdictionCode = string;

/** Per §4 `classification.asset_type`. */
export type AssetType =
  | 'property'
  | 'financial_asset'
  | 'intangible_asset'
  | 'security'
  | 'foreign_currency'
  | 'other_specific';

export type LegalStatus = 'legal' | 'restricted' | 'banned' | 'grey_zone';

export interface Classification {
  asset_type: AssetType;
  recognised_as_currency: boolean;
  legal_status: LegalStatus;
}

/** Per §4 `taxable_events.lend_or_stake`. */
export type StakingTreatment =
  | 'taxable'
  | 'not_taxable'
  | 'depends_on_beneficial_ownership';

export interface TaxableEvents {
  buy_with_fiat: boolean;
  hold: boolean;
  swap_crypto_to_crypto: boolean;
  spend_on_goods_services: boolean;
  receive_as_payment: boolean;
  gift_to_non_spouse: boolean;
  lend_or_stake: StakingTreatment;
}

/** Per §4 `cost_basis_method.permitted`. */
export type CostBasisMethod =
  | 'AVERAGE'         // Sweden's genomsnittsmetoden; France's pondéré
  | 'FIFO'            // DE/ES/FI/AT/IE/AU defaults
  | 'LIFO'            // Italy's primary; permitted variant elsewhere
  | 'HIFO'            // US via SPECIFIC_ID
  | 'SPECIFIC_ID'     // US — enables HIFO/LIFO with documentation
  | 'SHARE_POOLING'   // UK Section 104 + same-day + 30-day matching
  | 'ACB';            // Canada adjusted cost base (variant of average)

export interface CostBasisRule {
  permitted: CostBasisMethod[];
  default: CostBasisMethod;
  /** Per §4 — can the user override the default to minimize tax? */
  optimization_allowed: boolean;
}

/** Flat-rate or progressive-bracket structure. */
export type RateStructure =
  | { type: 'flat'; rate: number }
  | { type: 'progressive'; brackets: ProgressiveBracket[] }
  | { type: 'bracket_dependent'; brackets: ProgressiveBracket[] };

export interface ProgressiveBracket {
  /** Upper bound of this bracket in local currency. `null` = open-ended top. */
  upTo: number | null;
  /** Rate applied to the slice between the previous bound and this one. */
  rate: number;
}

export interface CapitalGainsRates {
  type: 'flat' | 'progressive' | 'bracket_dependent';
  /** Structured per §4 — varies by rate type. */
  structure: RateStructure;
}

/** §4 `rates.income.applies_to` taxonomy. */
export type IncomeApplicability =
  | 'mining'
  | 'staking'
  | 'airdrop_with_action'
  | 'airdrop_passive'
  | 'salary'
  | 'lending_interest';

export interface IncomeRates {
  applies_to: IncomeApplicability[];
  structure: RateStructure;
}

export interface Rates {
  capital_gains: CapitalGainsRates;
  income: IncomeRates;
}

export type LongTermHoldingTreatment =
  | 'tax_free'
  | 'discounted'        // AU 50% CGT discount — the *gain* is reduced
  | 'reduced_rate'      // a different rate replaces the standard one
  | 'unchanged';

export interface LongTermHoldingRelief {
  enabled: boolean;
  /** e.g. 365 for DE/PT/AU/MT. */
  period_days: number;
  treatment_after: LongTermHoldingTreatment;
  /** Used when `treatment_after === 'discounted'`. The fraction of
   *  the gain that becomes EXEMPT after the holding period —
   *  e.g. 0.5 for AU's 50% CGT discount means 50% of the gain is
   *  removed before tax application. */
  discount_fraction?: number;
  /** Used when `treatment_after === 'reduced_rate'`. Explicit flat
   *  rate that replaces the jurisdiction's standard one for long-
   *  term entries. */
  reduced_rate?: number;
}

/** §4 `emt_special_treatment` — the Italy EMT carve-out lives here. */
export interface EmtSpecialTreatment {
  enabled: boolean;
  description: string;
  /** If a discount rate applies (e.g. Italy 26% vs 33%). */
  reduced_rate?: number;
}

export interface ExemptionsAndReliefs {
  /** §4 `annual_exemption` — in local currency. 0 if none. */
  annual_exemption: number;
  long_term_holding: LongTermHoldingRelief;
  emt_special_treatment: EmtSpecialTreatment;
  /** Below this value per transaction, treated as non-taxable. */
  de_minimis_per_transaction: number;
}

export type LossOffsetScope =
  | 'crypto_only'
  | 'all_capital_gains'
  | 'all_capital_gains_and_income'
  | 'income'
  | 'none';

export interface LossTreatment {
  deductible: boolean;
  /** e.g. 0.70 for Sweden's 70% rule. 1.0 if fully deductible. */
  deductible_percentage: number;
  offset_against: LossOffsetScope;
  /** §4 — 0 means no carry forward; -1 means indefinite; n>0 = years. */
  carry_forward_years: number;
}

export type FtcClassification = 'utility_token' | 'emt';

export interface FtcSpecificNotes {
  spending_treatment: string;
  emt_classification_impact: string;
  preferred_classification_for_users: FtcClassification;
}

export interface ReportingFramework {
  domestic_form: string;
  carf_dac8_in_force: boolean;
  /** ISO date the framework became effective. */
  effective_date: string;
}

export interface TaxYear {
  type: 'calendar' | 'fiscal';
  /** ISO month-day for fiscal years (e.g. "04-06" for UK). */
  start_date?: string;
  end_date?: string;
}

export type Confidence = 'high' | 'medium' | 'low' | 'needs_review';

export interface Metadata {
  last_verified: string;
  verification_source: string[];
  confidence: Confidence;
  review_flags: string[];
}

export type JurisdictionStatus =
  | 'active'            // engine computes against this rule
  | 'unsupported'       // refusal pattern §8.3 — engine offers raw export only
  | 'banned';           // banned-in-jurisdiction (e.g. CN per §6.5)

/** The complete jurisdiction rule block. One `.yaml` file per
 *  jurisdiction populates one of these. */
export interface JurisdictionRule {
  jurisdiction_code: JurisdictionCode;
  jurisdiction_name: string;
  authority: string;
  authority_url: string;
  /** Spec §4 'status' — used for refusal pattern in §8.3. */
  status: JurisdictionStatus;

  classification: Classification;
  taxable_events: TaxableEvents;
  cost_basis_method: CostBasisRule;
  rates: Rates;
  exemptions_and_reliefs: ExemptionsAndReliefs;
  loss_treatment: LossTreatment;
  ftc_specific_notes: FtcSpecificNotes;
  reporting_framework: ReportingFramework;
  tax_year: TaxYear;
  metadata: Metadata;
}

/** Per §7.2 — the engine accepts this flag at compute time so
 *  re-classification later doesn't require a rules rewrite. */
export interface ComputeOptions {
  ftc_classification: FtcClassification;
  /** User-overridden cost-basis method if `optimization_allowed`. */
  cost_basis_override?: CostBasisMethod;
  /** Tax year to compute for. Defaults to the current tax year per
   *  the jurisdiction's calendar. */
  tax_year?: number;
}
