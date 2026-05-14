/**
 * rules/us.ts — United States jurisdiction rule.
 * Source: FUTURECHAIN_TAX_RULES.md §6.3 US. Confidence: high.
 *
 * Defining features:
 *   - Property under IRS Notice 2014-21
 *   - FIFO default, Specific ID with documentation (HIFO optimization)
 *   - Short-term (<1 yr): ordinary rates 10/12/22/24/32/35/37% —
 *     modelled here as a flat 37% top bracket for v1 (real US tax
 *     calc requires the user's other income; surfaced as review flag)
 *   - Long-term (≥1 yr): preferential 0/15/20% — modelled here as
 *     a flat 15% (the middle bracket; same income-dependence caveat)
 *   - NIIT 3.8% on high earners — not modelled in v1
 *   - State tax variable — not modelled
 *   - No annual exemption
 */
import type { JurisdictionRule } from '../schema.js';

export const US: JurisdictionRule = {
  jurisdiction_code: 'US',
  jurisdiction_name: 'United States',
  authority: 'Internal Revenue Service (IRS)',
  authority_url: 'https://www.irs.gov/',
  status: 'active',

  classification: {
    asset_type: 'property',
    recognised_as_currency: false,
    legal_status: 'legal',
  },

  taxable_events: {
    buy_with_fiat: false,
    hold: false,
    swap_crypto_to_crypto: true,
    spend_on_goods_services: true,
    receive_as_payment: true,
    gift_to_non_spouse: false,
    lend_or_stake: 'taxable',
  },

  cost_basis_method: {
    permitted: ['FIFO', 'SPECIFIC_ID', 'HIFO', 'LIFO'],
    default: 'FIFO',
    optimization_allowed: true, // HIFO via SPECIFIC_ID is the headline feature
  },

  rates: {
    capital_gains: {
      type: 'flat',
      // Short-term ordinary-income top bracket — v1 approximation
      structure: { type: 'flat', rate: 0.37 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action', 'salary'],
      structure: { type: 'flat', rate: 0.37 },
    },
  },

  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: {
      enabled: true,
      period_days: 365,
      treatment_after: 'reduced_rate',
      // Long-term preferential rate — middle bracket as v1 default.
      // The engine applies this only when an entry's acquiredTs >=
      // 365 days before disposal (i.e. Specific ID / FIFO carries
      // acquisition date).
      reduced_rate: 0.15,
    },
    emt_special_treatment: {
      enabled: false,
      description:
        'IRS has not published an EMT or stablecoin carve-out. ' +
        'USDC-pattern users effectively realize ~0 gain per disposal ' +
        'because the price doesn\'t move vs USD; same logic applies ' +
        'to FTC-as-EMT but no formal authority guidance exists.',
    },
    de_minimis_per_transaction: 0,
  },

  loss_treatment: {
    deductible: true,
    deductible_percentage: 1.0,
    offset_against: 'all_capital_gains_and_income',
    // $3k against ordinary income, indefinite carry forward — engine
    // approximates as indefinite + crypto-only for v1.
    carry_forward_years: -1,
  },

  ftc_specific_notes: {
    spending_treatment:
      'Spending FTC = property disposal at FMV. Cost-basis optimization ' +
      'via HIFO is legal and frequently elected. Long-term holds (>1 yr) ' +
      'qualify for preferential 0/15/20% rates.',
    emt_classification_impact:
      'Even classified as EMT, US still treats as property. No automatic ' +
      'rate reduction. USDC-pattern: economic answer is near-zero gain, ' +
      'but each disposal still requires a Form 8949 line.',
    preferred_classification_for_users: 'utility_token',
  },

  reporting_framework: {
    domestic_form: 'Form 8949 + Schedule D (1099-DA from 2025+)',
    carf_dac8_in_force: false,
    effective_date: '2026-01-01',
  },

  tax_year: { type: 'calendar' },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['IRS Notice 2014-21', 'Rev. Proc. 2024-28', 'FUTURECHAIN_TAX_RULES.md §6.3 US'],
    confidence: 'high',
    review_flags: [
      'short_term_rate_uses_37pct_top_bracket_approximation',
      'long_term_rate_uses_15pct_middle_bracket_approximation',
      'niit_3_8pct_not_modelled',
      'state_tax_not_modelled_ask_state_of_residence',
    ],
  },
};
