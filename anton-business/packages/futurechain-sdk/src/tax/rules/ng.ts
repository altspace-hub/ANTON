/**
 * rules/ng.ts — Nigeria. Confidence: high per §6.7 NG.
 *
 * Investments and Securities Act 2025 + Nigeria Tax Administration Act
 * 2025: capital gains treated as personal income, up to 25%. Tax-free
 * threshold ₦800,000 annual.
 */
import type { JurisdictionRule } from '../schema.js';

export const NG: JurisdictionRule = {
  jurisdiction_code: 'NG',
  jurisdiction_name: 'Nigeria',
  authority: 'Federal Inland Revenue Service (FIRS)',
  authority_url: 'https://www.firs.gov.ng/',
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
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.25 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 800000, // ₦800k
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'crypto_only', carry_forward_years: 4 },
  ftc_specific_notes: {
    spending_treatment: '"Same tax treatment as transactions conducted in fiat" — explicit per Nigeria Tax Administration Act 2025.',
    emt_classification_impact: 'Not yet specified.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'PIT return', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['Nigeria Tax Administration Act 2025', 'FUTURECHAIN_TAX_RULES.md §6.7 NG'],
    confidence: 'high',
    review_flags: ['vasp_reporting_mandatory_from_2026'],
  },
};
