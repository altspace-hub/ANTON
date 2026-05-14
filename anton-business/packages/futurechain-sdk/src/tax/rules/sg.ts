/**
 * rules/sg.ts — Singapore. Confidence: high per §6.5 SG.
 *
 * NO capital gains tax on individual capital crypto disposals. Frequent
 * trading = business income (up to 22%). Models the individual case
 * as flat 0% — review flag covers the badges-of-trade distinction.
 */
import type { JurisdictionRule } from '../schema.js';

export const SG: JurisdictionRule = {
  jurisdiction_code: 'SG',
  jurisdiction_name: 'Singapore',
  authority: 'Inland Revenue Authority of Singapore (IRAS)',
  authority_url: 'https://www.iras.gov.sg/',
  status: 'active',
  classification: { asset_type: 'intangible_asset', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: false,
    spend_on_goods_services: false, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'not_taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE'], default: 'AVERAGE', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.00 } },
    income: { applies_to: ['mining', 'salary'], structure: { type: 'flat', rate: 0.22 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No CGT means no carve-out needed.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: false, deductible_percentage: 0, offset_against: 'none', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment: 'No CGT on individual capital disposals. GST exempt since 2020.',
    emt_classification_impact: 'No impact — CGT-free.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'IR8A (income, if business)', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['IRAS guidance', 'FUTURECHAIN_TAX_RULES.md §6.5 SG'],
    confidence: 'high',
    review_flags: [
      'badges_of_trade_test_distinguishes_individual_vs_business',
      'frequent_trading_may_recharacterise_as_business_income',
    ],
  },
};
