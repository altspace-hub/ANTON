/**
 * rules/be.ts — Belgium. Confidence: medium per §6.1 BE.
 *
 * Defining feature: the "good father" private-investor exemption —
 * 0% if the user's activity is "normal management of private assets",
 * 33% as miscellaneous income for speculative/occasional gains,
 * progressive up to 50% if recharacterised as professional.
 *
 * This is fact-specific (the spec is explicit: "The 'good father' test
 * is subjective. Anton should not assert 0% without confirming user's
 * overall pattern with a Belgian adviser"). v1 defaults to the
 * speculative case (33%) — that's the conservative answer.
 */
import type { JurisdictionRule } from '../schema.js';

export const BE: JurisdictionRule = {
  jurisdiction_code: 'BE',
  jurisdiction_name: 'Belgium',
  authority: 'SPF Finances',
  authority_url: 'https://finances.belgium.be/',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['FIFO'], default: 'FIFO', optimization_allowed: false },
  rates: {
    // Speculative misc-income rate (33%) — conservative v1 default.
    // Private investor (0%) requires fact-specific adviser confirmation.
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.33 } },
    income: { applies_to: ['mining', 'salary'], structure: { type: 'flat', rate: 0.50 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: false, deductible_percentage: 0, offset_against: 'none', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment: 'Speculative 33% as default. Verify private-investor / professional status with a Belgian adviser.',
    emt_classification_impact: 'No formal treatment.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Personal income tax (Bijlage)', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.1 BE'],
    confidence: 'medium',
    review_flags: [
      'private_investor_exemption_0pct_requires_adviser_confirmation',
      'professional_status_progressive_up_to_50pct',
      'good_father_test_subjective_per_spec',
    ],
  },
};
