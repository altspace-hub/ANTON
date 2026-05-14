/**
 * rules/nl.ts — Netherlands. Per §6.1 NL.
 *
 * UNSUPPORTED in v1 because the Box 3 wealth-tax model is
 * structurally different from the transaction-based engine: tax is
 * computed on year-end holdings × deemed return rate, NOT on
 * per-transaction gains.
 *
 * Phase 5+ will add a separate engine path for wealth-tax
 * jurisdictions (NL, parts of CH, partly Norway). Until then the
 * engine refuses + offers raw CSV export per §8.3.
 */
import type { JurisdictionRule } from '../schema.js';

export const NL: JurisdictionRule = {
  jurisdiction_code: 'NL',
  jurisdiction_name: 'Netherlands',
  authority: 'Belastingdienst',
  authority_url: 'https://www.belastingdienst.nl/',
  status: 'active',
  taxation_model: 'wealth',
  wealth_tax_params: {
    // Approximate 2024 figures per §6.1 NL — verify annually.
    // ~€57k tax-free wealth allowance per person, 1.97% deemed return,
    // 36% Box 3 rate = ~0.71% effective on holdings above the
    // allowance.
    allowance: 57000,
    deemed_return_rate: 0.0197,
    box_rate: 0.36,
  },
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: true, // unique among supported jurisdictions
    swap_crypto_to_crypto: false, spend_on_goods_services: false,
    receive_as_payment: false, gift_to_non_spouse: false, lend_or_stake: 'not_taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE'], default: 'AVERAGE', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.00 } },
    income: { applies_to: [], structure: { type: 'flat', rate: 0.00 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 57000, // wealth-tax-free allowance ~€57k per person
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'Wealth-tax model — no per-disposal carve-out applicable.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: false, deductible_percentage: 0, offset_against: 'none', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment:
      'Netherlands uses Box 3 wealth tax: ~1.97% deemed return × 36% = ~0.7% of year-end ' +
      'holdings, irrespective of transaction activity. No per-disposal calculation.',
    emt_classification_impact: 'No effect — model is year-end balance, not transactions.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'IB (Aangifte Inkomstenbelasting) Box 3', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.1 NL'],
    confidence: 'high',
    review_flags: [
      'box_3_rates_published_annually_verify_current_year',
      'wealth_tax_balance_uses_running_fiat_value_not_year_end_rate_oracle',
    ],
  },
};
