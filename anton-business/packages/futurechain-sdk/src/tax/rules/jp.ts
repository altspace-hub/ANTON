/**
 * rules/jp.ts — Japan. Confidence: high per §6.5 JP, but 2026
 * transition year — re-verify monthly.
 *
 * Default: miscellaneous income up to 55% (progressive). The 2026
 * reform proposes a 20% flat tax on registered-platform users. v1
 * uses the conservative default (55% top bracket) and surfaces the
 * reform as a review flag.
 */
import type { JurisdictionRule } from '../schema.js';

export const JP: JurisdictionRule = {
  jurisdiction_code: 'JP',
  jurisdiction_name: 'Japan',
  authority: 'National Tax Agency (NTA)',
  authority_url: 'https://www.nta.go.jp/',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE', 'FIFO'], default: 'AVERAGE', optimization_allowed: true },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.55 } },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.55 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No EMT carve-out under current PSA framework.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: false, deductible_percentage: 0, offset_against: 'none', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment: 'Misc income — every disposal at FMV against acquisition cost.',
    emt_classification_impact: 'Not under MiCA; Japan-specific PSA classification applies.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Final tax return (Kakutei Shinkoku)', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.5 JP'],
    confidence: 'high',
    review_flags: [
      '2026_reform_20pct_flat_on_registered_platforms_verify_status',
      'misc_income_55pct_top_bracket_used_no_loss_offset_or_carry_forward',
    ],
  },
};
