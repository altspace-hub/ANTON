/**
 * rules/ke.ts — Kenya. Per §6.7 KE.
 *
 * UNSUPPORTED in v1 because Kenya's tax model is structurally
 * different: 10% excise duty on transaction FEES (not gains),
 * replacing the abolished 3% Digital Asset Tax on gross value.
 *
 * The transaction-based engine computes on disposal gains; KE
 * computes on the *service fees* charged by VASPs / CASPs. A
 * separate engine path lands in Phase 7+ alongside NL's wealth-tax
 * model. Until then the engine refuses + offers raw CSV export.
 */
import type { JurisdictionRule } from '../schema.js';

export const KE: JurisdictionRule = {
  jurisdiction_code: 'KE',
  jurisdiction_name: 'Kenya',
  authority: 'Kenya Revenue Authority (KRA)',
  authority_url: 'https://www.kra.go.ke/',
  status: 'unsupported',
  classification: { asset_type: 'other_specific', recognised_as_currency: false, legal_status: 'legal' },
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
    emt_special_treatment: { enabled: false, description: 'Excise-on-fees model — no per-disposal carve-out applicable.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: false, deductible_percentage: 0, offset_against: 'none', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment:
      'Kenya uses a 10% excise duty on transaction fees (per the 2025 Finance Act, ' +
      'replacing the abolished 3% Digital Asset Tax on gross value). The duty is ' +
      'charged on the FEES the VASP/CASP collects, not on the user\'s gain. The ' +
      'transaction-based engine cannot compute this without fee data.',
    emt_classification_impact: 'No effect — model is fee-based, not gain-based.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'iTax filing', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['Kenya Finance Act 2025', 'FUTURECHAIN_TAX_RULES.md §6.7 KE'],
    confidence: 'high',
    review_flags: [
      'fee_based_excise_model_needs_separate_engine_path',
      'phase_7_unblocks_kenya_calculation',
    ],
  },
};
