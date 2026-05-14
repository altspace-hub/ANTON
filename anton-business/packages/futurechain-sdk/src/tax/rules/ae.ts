/**
 * rules/ae.ts — UAE. Confidence: high per §6.6 AE.
 *
 * No personal income tax, no capital gains tax. Cleanest tax
 * environment in the world for individual crypto.
 */
import type { JurisdictionRule } from '../schema.js';

export const AE: JurisdictionRule = {
  jurisdiction_code: 'AE',
  jurisdiction_name: 'United Arab Emirates',
  authority: 'Federal Tax Authority',
  authority_url: 'https://tax.gov.ae/',
  status: 'active',
  classification: { asset_type: 'intangible_asset', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: false,
    spend_on_goods_services: false, receive_as_payment: false,
    gift_to_non_spouse: false, lend_or_stake: 'not_taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE'], default: 'AVERAGE', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.00 } },
    income: { applies_to: [], structure: { type: 'flat', rate: 0.00 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No tax to carve out from.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: false, deductible_percentage: 0, offset_against: 'none', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment: 'No personal tax on crypto disposals. Corporate tax 9% applies above AED 375k profits for businesses only.',
    emt_classification_impact: 'No impact — no tax base.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'N/A (no individual filing)', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['UAE FTA crypto VAT clarification 2024', 'FUTURECHAIN_TAX_RULES.md §6.6 AE'],
    confidence: 'high',
    review_flags: ['corporate_tax_9pct_above_aed_375k_applies_to_businesses_only'],
  },
};
