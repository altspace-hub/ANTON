/**
 * rules/cy.ts — Cyprus. Confidence: high per §6.1 CY (recent legislation).
 *
 * Headline: 8% flat from 2026-01-01 — lowest CGT rate in the EU for crypto.
 * Strategic potential as a FutureChain expansion hub per the spec.
 */
import type { JurisdictionRule } from '../schema.js';

export const CY: JurisdictionRule = {
  jurisdiction_code: 'CY',
  jurisdiction_name: 'Cyprus',
  authority: 'Cyprus Tax Department',
  authority_url: 'https://www.mof.gov.cy/mof/tax/',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['FIFO'], default: 'FIFO', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.08 } },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.35 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'crypto_only', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment: '8% flat on every disposal. Loss offset crypto-only, same-year only.',
    emt_classification_impact: 'No formal treatment.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'IR1', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.1 CY'],
    confidence: 'high',
    review_flags: ['no_carry_forward_for_crypto_losses'],
  },
};
