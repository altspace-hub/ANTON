/**
 * rules/ca.ts — Canada. Confidence: high per §6.3 CA.
 *
 * Defining feature: 50% inclusion rate. Only half of the capital gain
 * is brought into taxable income, then taxed at the user's marginal
 * combined federal+provincial rate (up to ~54%).
 *
 *   Gain: $1000
 *   Inclusion @ 50%: $500 in taxable income
 *   Tax at marginal 54%: $270
 *
 * The 2024 increase to 66.67% above CAD 250k was modified by
 * subsequent government — v1 uses the long-standing 50% with a
 * review_flag for the high-earner edge case.
 *
 * Cost basis: ACB (Adjusted Cost Base) — same arithmetic as AVERAGE
 * in v1; superficial-loss rules deferred to Phase 7.
 */
import type { JurisdictionRule } from '../schema.js';

export const CA: JurisdictionRule = {
  jurisdiction_code: 'CA',
  jurisdiction_name: 'Canada',
  authority: 'Canada Revenue Agency (CRA)',
  authority_url: 'https://www.canada.ca/en/revenue-agency.html',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['ACB'], default: 'ACB', optimization_allowed: false },
  rates: {
    capital_gains: {
      type: 'flat',
      // Top combined federal + provincial marginal — v1 approximation.
      structure: { type: 'flat', rate: 0.54 },
      // 50% inclusion is the Canadian distinguishing feature.
      inclusion_rate: 0.50,
    },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.54 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: {
    deductible: true,
    deductible_percentage: 0.50, // Allowable capital loss = 50% of the loss
    offset_against: 'all_capital_gains',
    carry_forward_years: -1,
  },
  ftc_specific_notes: {
    spending_treatment: 'Disposal at FMV; 50% inclusion × marginal rate. Treated as barter under CRA guidance.',
    emt_classification_impact: 'Not yet tested.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Schedule 3 (T1 General)', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['CRA crypto guide', 'FUTURECHAIN_TAX_RULES.md §6.3 CA'],
    confidence: 'high',
    review_flags: [
      'top_combined_rate_54pct_approximation',
      '2024_inclusion_rate_change_above_250k_modified_by_govt_verify_current',
      'superficial_loss_rules_not_yet_enforced',
    ],
  },
};
