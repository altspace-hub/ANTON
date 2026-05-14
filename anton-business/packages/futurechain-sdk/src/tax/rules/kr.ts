/**
 * rules/kr.ts — South Korea. Confidence: medium per §6.5 KR.
 *
 * 20% on gains over KRW 2.5M annual threshold (~€1,700). Implementation
 * delayed multiple times — verify current effective date before
 * relying on these figures.
 */
import type { JurisdictionRule } from '../schema.js';

export const KR: JurisdictionRule = {
  jurisdiction_code: 'KR',
  jurisdiction_name: 'South Korea',
  authority: 'National Tax Service (NTS)',
  authority_url: 'https://www.nts.go.kr/',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE'], default: 'AVERAGE', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.20 } },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.45 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 2500000, // KRW 2.5M
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'crypto_only', carry_forward_years: 5 },
  ftc_specific_notes: {
    spending_treatment: 'KRW 2.5M annual threshold makes occasional payment use effectively tax-free.',
    emt_classification_impact: 'Not yet tested.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Hometax filing', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.5 KR'],
    confidence: 'medium',
    review_flags: [
      'implementation_delayed_multiple_times_verify_current_effective_date',
    ],
  },
};
