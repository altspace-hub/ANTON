/**
 * rules/mt.ts — Malta. Confidence: medium per §6.1 MT.
 *
 * Long-term individual holdings: tax-free. Frequent trading: up to 35%
 * income tax (reducible to 0-5% under residency rules). v1 models the
 * long-term-holder case (0%) with a "fact-specific" review flag.
 *
 * Period_days: 365 — the spec doesn't give a hard number; using
 * the AU/PT convention as a working default.
 */
import type { JurisdictionRule } from '../schema.js';

export const MT: JurisdictionRule = {
  jurisdiction_code: 'MT',
  jurisdiction_name: 'Malta',
  authority: 'Commissioner for Revenue',
  authority_url: 'https://cfr.gov.mt/',
  status: 'active',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['FIFO'], default: 'FIFO', optimization_allowed: false },
  rates: {
    // Frequent-trading rate (up to 35%) used as the short-term default
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.35 } },
    income: { applies_to: ['mining', 'salary'], structure: { type: 'flat', rate: 0.35 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: true, period_days: 365, treatment_after: 'tax_free' },
    emt_special_treatment: { enabled: false, description: 'No published EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'crypto_only', carry_forward_years: -1 },
  ftc_specific_notes: {
    spending_treatment: 'Long-term holds tax-free for individuals. Frequent trading reclassifies as income.',
    emt_classification_impact: 'Not yet tested.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'TA22', carf_dac8_in_force: true, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.1 MT'],
    confidence: 'medium',
    review_flags: [
      'long_term_period_assumed_365_days_no_explicit_spec',
      'frequent_trading_status_fact_specific',
      'residency_rules_can_reduce_rate_to_0_5pct',
    ],
  },
};
