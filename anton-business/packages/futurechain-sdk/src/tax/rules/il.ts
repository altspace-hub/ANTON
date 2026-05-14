/**
 * rules/il.ts — Israel. Confidence: medium per §6.6 IL.
 *
 * 25% capital gains for private; up to 33% for substantial holders.
 * Business income up to 50%. v1 uses 25% private rate as the default.
 */
import type { JurisdictionRule } from '../schema.js';

export const IL: JurisdictionRule = {
  jurisdiction_code: 'IL',
  jurisdiction_name: 'Israel',
  authority: 'Israel Tax Authority',
  authority_url: 'https://www.gov.il/en/departments/israel_tax_authority',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['FIFO'], default: 'FIFO', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.25 } },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.50 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'all_capital_gains', carry_forward_years: -1 },
  ftc_specific_notes: {
    spending_treatment: 'Disposal at FMV at 25% (private investor).',
    emt_classification_impact: 'Not yet tested.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Form 1301', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.6 IL'],
    confidence: 'medium',
    review_flags: [
      'substantial_holder_rate_up_to_33pct',
      'business_income_recharacterisation_up_to_50pct',
    ],
  },
};
