/**
 * rules/br.ts — Brazil. Confidence: medium per §6.4 BR.
 *
 * Monthly exemption BRL 35,000 in sales. Progressive 15/17.5/20/22.5%
 * by gain bracket. Foreign-held crypto: special 15% (Law 14.754).
 * v1 models the domestic progressive case.
 */
import type { JurisdictionRule } from '../schema.js';

export const BR: JurisdictionRule = {
  jurisdiction_code: 'BR',
  jurisdiction_name: 'Brazil',
  authority: 'Receita Federal',
  authority_url: 'https://www.gov.br/receitafederal/',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE'], default: 'AVERAGE', optimization_allowed: false },
  rates: {
    capital_gains: {
      type: 'progressive',
      structure: {
        type: 'progressive',
        brackets: [
          { upTo: 5_000_000,  rate: 0.15 },   // ≤ BRL 5M
          { upTo: 10_000_000, rate: 0.175 },  // ≤ BRL 10M
          { upTo: 30_000_000, rate: 0.20 },   // ≤ BRL 30M
          { upTo: null,       rate: 0.225 },  // > BRL 30M
        ],
      },
    },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.275 } },
  },
  exemptions_and_reliefs: {
    // BRL 35k monthly exemption — annual equivalent surfaced for the
    // engine. Actual monthly windowing lands in Phase 7.
    annual_exemption: 35000 * 12,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'crypto_only', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment: 'BRL 35k monthly sales exemption — significant for occasional use.',
    emt_classification_impact: 'Not yet tested.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: {
    domestic_form: 'Monthly DARF + annual return',
    carf_dac8_in_force: false,
    effective_date: '2026-01-01',
  },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.4 BR', 'Law 14.754'],
    confidence: 'medium',
    review_flags: [
      'monthly_exemption_modelled_as_annual_brl_420k_in_v1',
      'foreign_held_special_15pct_law_14_754_not_modelled',
    ],
  },
};
