/**
 * rules/pl.ts — Poland. Confidence: medium per §6.1 PL.
 *
 * 19% flat on disposal to fiat. Crypto-to-crypto NOT taxable (similar
 * to France). Cost basis: total expenses vs total revenues annually.
 */
import type { JurisdictionRule } from '../schema.js';

export const PL: JurisdictionRule = {
  jurisdiction_code: 'PL',
  jurisdiction_name: 'Poland',
  authority: 'Krajowa Administracja Skarbowa',
  authority_url: 'https://www.gov.pl/web/kas',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false,
    swap_crypto_to_crypto: false, // Poland's distinguishing feature
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE'], default: 'AVERAGE', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.19 } },
    income: { applies_to: ['mining', 'salary'], structure: { type: 'flat', rate: 0.32 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'crypto_only', carry_forward_years: 5 },
  ftc_specific_notes: {
    spending_treatment: 'Crypto-to-crypto swaps not taxable. Fiat conversion / spend triggers 19%.',
    emt_classification_impact: 'Not yet tested.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'PIT-38', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.1 PL'],
    confidence: 'medium',
    review_flags: ['expenses_vs_revenues_annual_method_simplified_to_AVERAGE_in_v1'],
  },
};
