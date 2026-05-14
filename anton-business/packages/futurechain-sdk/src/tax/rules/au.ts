/**
 * rules/au.ts — Australia jurisdiction rule.
 * Source: FUTURECHAIN_TAX_RULES.md §6.5 AU. Confidence: high.
 *
 * Defining feature: 50% CGT discount on assets held > 12 months —
 * implemented via the engine's new `treatment_after: 'discounted'`
 * + `discount_fraction: 0.5` schema fields.
 *
 *   Gain pre-discount: $1000
 *   After discount:     $500 (50% removed)
 *   Tax at marginal:    $500 × 45% = $225
 *
 * The "marginal rate" varies with the user's income; v1 uses 45%
 * (top bracket) conservatively.
 *
 * AU's tax year runs 1 July – 30 June (fiscal) — engine's calendar-
 * year windowing surfaces this gap via review_flag for now.
 */
import type { JurisdictionRule } from '../schema.js';

export const AU: JurisdictionRule = {
  jurisdiction_code: 'AU',
  jurisdiction_name: 'Australia',
  authority: 'Australian Taxation Office (ATO)',
  authority_url: 'https://www.ato.gov.au/',
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
    permitted: ['FIFO', 'SPECIFIC_ID'],
    default: 'FIFO',
    optimization_allowed: true,
  },

  rates: {
    capital_gains: {
      type: 'flat',
      // Top marginal + Medicare (~47%) — v1 conservative approximation
      structure: { type: 'flat', rate: 0.47 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action', 'salary'],
      structure: { type: 'flat', rate: 0.47 },
    },
  },

  exemptions_and_reliefs: {
    // AUD 10,000 personal-use asset exemption — narrow but real
    annual_exemption: 10000,
    long_term_holding: {
      enabled: true,
      period_days: 365,
      treatment_after: 'discounted',
      discount_fraction: 0.50,
    },
    emt_special_treatment: {
      enabled: false,
      description: 'ATO has not published EMT-specific guidance.',
    },
    de_minimis_per_transaction: 0,
  },

  loss_treatment: {
    deductible: true,
    deductible_percentage: 1.0,
    offset_against: 'all_capital_gains',
    carry_forward_years: -1,
  },

  ftc_specific_notes: {
    spending_treatment:
      'Spending FTC = CGT disposal. AUD 10,000 personal-use exemption ' +
      'applies if asset is "primarily for personal use" — fact-specific, ' +
      'not usable for investment-held FTC.',
    emt_classification_impact: 'Not yet tested. Likely no automatic relief.',
    preferred_classification_for_users: 'utility_token',
  },

  reporting_framework: {
    domestic_form: 'CGT schedule, ATO tax return',
    carf_dac8_in_force: false,
    effective_date: '2026-01-01',
  },

  tax_year: { type: 'fiscal', start_date: '07-01', end_date: '06-30' },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['ATO crypto guidance', 'FUTURECHAIN_TAX_RULES.md §6.5 AU'],
    confidence: 'high',
    review_flags: [
      'rate_uses_47pct_top_marginal_approximation',
      'personal_use_asset_exemption_fact_specific',
    ],
  },
};
