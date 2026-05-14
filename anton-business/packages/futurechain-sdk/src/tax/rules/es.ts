/**
 * rules/es.ts — Spain. Confidence: medium per §6.1 ES.
 *
 * Progressive savings base: 19/21/23/27/28% across €6k / €50k / €200k
 * / €300k / > €300k. FIFO mandatory.
 */
import type { JurisdictionRule } from '../schema.js';

export const ES: JurisdictionRule = {
  jurisdiction_code: 'ES',
  jurisdiction_name: 'Spain',
  authority: 'Agencia Tributaria (AEAT)',
  authority_url: 'https://www.agenciatributaria.gob.es/',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['FIFO'], default: 'FIFO', optimization_allowed: false },
  rates: {
    capital_gains: {
      type: 'progressive',
      structure: {
        type: 'progressive',
        brackets: [
          { upTo: 6000,   rate: 0.19 },
          { upTo: 50000,  rate: 0.21 },
          { upTo: 200000, rate: 0.23 },
          { upTo: 300000, rate: 0.27 },
          { upTo: null,   rate: 0.28 },
        ],
      },
    },
    income: {
      applies_to: ['mining', 'staking', 'salary'],
      structure: { type: 'flat', rate: 0.45 },
    },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No EMT carve-out published.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'all_capital_gains', carry_forward_years: 4 },
  ftc_specific_notes: {
    spending_treatment: 'Disposal at FMV; Modelo 721 reporting required.',
    emt_classification_impact: 'No formal treatment.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Modelo 100 (IRPF) + Modelo 721', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.1 ES'],
    confidence: 'medium',
    review_flags: ['2026_bracket_cutoffs_need_verification', 'modelo_721_threshold_check_required'],
  },
};
