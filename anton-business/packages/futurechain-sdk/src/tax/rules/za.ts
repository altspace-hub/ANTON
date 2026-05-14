/**
 * rules/za.ts — South Africa. Confidence: high per §6.7 ZA.
 *
 * Investor (capital): 40% inclusion × max marginal 45% = effective max 18%.
 * Modelled here as a flat 18% (the effective max). Trader status = ordinary
 * income up to 45% — surfaced via review_flag since the investor/trader
 * line is fact-specific. R40,000 annual exclusion.
 */
import type { JurisdictionRule } from '../schema.js';

export const ZA: JurisdictionRule = {
  jurisdiction_code: 'ZA',
  jurisdiction_name: 'South Africa',
  authority: 'South African Revenue Service (SARS)',
  authority_url: 'https://www.sars.gov.za/',
  status: 'active',
  classification: { asset_type: 'intangible_asset', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: true,
    spend_on_goods_services: true, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'taxable',
  },
  cost_basis_method: { permitted: ['FIFO', 'SPECIFIC_ID'], default: 'FIFO', optimization_allowed: true },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.18 } },
    income: { applies_to: ['mining', 'staking', 'salary'], structure: { type: 'flat', rate: 0.45 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 40000, // ZAR 40k
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No SARS EMT carve-out.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: true, deductible_percentage: 1.0, offset_against: 'all_capital_gains', carry_forward_years: -1 },
  ftc_specific_notes: {
    spending_treatment: 'Disposal at FMV; investor vs trader distinction critical.',
    emt_classification_impact: 'Not published.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'ITR12', carf_dac8_in_force: true, effective_date: '2026-03-01' },
  tax_year: { type: 'fiscal', start_date: '03-01', end_date: '02-28' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['SARS guidance', 'FUTURECHAIN_TAX_RULES.md §6.7 ZA'],
    confidence: 'high',
    review_flags: [
      'investor_vs_trader_status_fact_specific',
      'sa_fiscal_year_window_handling_uses_calendar_in_v1',
      'bed_and_breakfast_45_day_rule_not_yet_enforced',
    ],
  },
};
