/**
 * rules/ie.ts — Ireland. Confidence: medium per §6.2 IE.
 *
 * 33% CGT, €1,270 annual exemption. FIFO with a 4-week rule (the Irish
 * equivalent of UK's 30-day matching). v1 implements FIFO only; the
 * 4-week rule lands when the share-pooling engine generalises to
 * per-jurisdiction matching windows (Phase 7+).
 */
import type { JurisdictionRule } from '../schema.js';

export const IE: JurisdictionRule = {
  jurisdiction_code: 'IE',
  jurisdiction_name: 'Ireland',
  authority: 'Revenue',
  authority_url: 'https://www.revenue.ie/',
  status: 'active',
  classification: { asset_type: 'security', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['FIFO'], default: 'FIFO', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.33 } },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.40 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 1270,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'all_capital_gains', carry_forward_years: -1 },
  ftc_specific_notes: {
    spending_treatment: '€1,270 personal exemption — small but useful for occasional payment use.',
    emt_classification_impact: 'Not yet tested.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Form 11 / CG1', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.2 IE'],
    confidence: 'medium',
    review_flags: ['4_week_matching_rule_not_yet_enforced'],
  },
};
