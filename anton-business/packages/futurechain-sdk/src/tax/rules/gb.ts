/**
 * rules/gb.ts — United Kingdom jurisdiction rule.
 * Source: FUTURECHAIN_TAX_RULES.md §6.2 GB. Confidence: high.
 *
 * Defining features:
 *   - Section 104 share pooling (cost basis) — implemented in v1 as
 *     a pool-average (equivalent to AVERAGE arithmetically)
 *   - Same-day + 30-day "bed-and-breakfast" matching rules — NOT yet
 *     implemented; surfaced via review_flag so reviewRequired triggers
 *   - 18% basic / 24% higher CGT rate from 30 Oct 2024 (modelled here
 *     as 24% flat for v1; bracket-dependent on user's total income
 *     which the engine doesn't yet take)
 *   - £3,000 annual exemption
 *   - Tax year: 6 April – 5 April (not calendar)
 */
import type { JurisdictionRule } from '../schema.js';

export const GB: JurisdictionRule = {
  jurisdiction_code: 'GB',
  jurisdiction_name: 'United Kingdom',
  authority: 'HM Revenue & Customs (HMRC)',
  authority_url: 'https://www.gov.uk/government/organisations/hm-revenue-customs',
  status: 'active',

  classification: {
    asset_type: 'security',
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
    permitted: ['SHARE_POOLING'],
    default: 'SHARE_POOLING',
    optimization_allowed: false,
  },

  rates: {
    capital_gains: {
      type: 'flat',
      // Higher-rate band (24%) — bracket-dependent on user's income;
      // v1 uses the higher band conservatively. Review flag surfaced.
      structure: { type: 'flat', rate: 0.24 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action', 'salary'],
      structure: { type: 'flat', rate: 0.40 },
    },
  },

  exemptions_and_reliefs: {
    annual_exemption: 3000,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: {
      enabled: false,
      description: 'HMRC has not published an EMT carve-out as of 2026-05-12.',
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
      'Disposal of FTC for goods/services or to fiat = chargeable. ' +
      '£3,000 annual allowance is the only relief — beyond it, every ' +
      'disposal triggers the share-pooling computation.',
    emt_classification_impact: 'No automatic relief if FTC = EMT.',
    preferred_classification_for_users: 'utility_token',
  },

  reporting_framework: {
    domestic_form: 'Self Assessment (crypto section from 2024-25)',
    carf_dac8_in_force: true,
    effective_date: '2026-01-01',
  },

  tax_year: { type: 'fiscal', start_date: '04-06', end_date: '04-05' },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['HMRC Cryptoasset Manual', 'FUTURECHAIN_TAX_RULES.md §6.2 GB'],
    confidence: 'high',
    review_flags: [
      'rate_uses_24pct_higher_band_approximation',
    ],
  },
};
