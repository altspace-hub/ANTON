/**
 * rules/ch.ts — Switzerland. Confidence: high per §6.2 CH.
 *
 * Private investor capital gains: TAX-FREE. Professional trader:
 * income tax + social security. The line is fact-specific and
 * decided by the cantonal tax office. v1 treats as flat 0% with a
 * review_flag for the badges-of-trade test. Wealth tax (0.1-1%
 * cantonal, on year-end holdings) is OUT of scope for the
 * transaction engine.
 */
import type { JurisdictionRule } from '../schema.js';

export const CH: JurisdictionRule = {
  jurisdiction_code: 'CH',
  jurisdiction_name: 'Switzerland',
  authority: 'Federal Tax Administration (ESTV)',
  authority_url: 'https://www.estv.admin.ch/',
  status: 'active',
  classification: { asset_type: 'intangible_asset', recognised_as_currency: false, legal_status: 'legal' },
  taxable_events: {
    buy_with_fiat: false, hold: false, swap_crypto_to_crypto: false,
    spend_on_goods_services: false, receive_as_payment: true,
    gift_to_non_spouse: false, lend_or_stake: 'not_taxable',
  },
  cost_basis_method: { permitted: ['AVERAGE'], default: 'AVERAGE', optimization_allowed: false },
  rates: {
    capital_gains: { type: 'flat', structure: { type: 'flat', rate: 0.00 } },
    income: { applies_to: ['mining', 'salary'], structure: { type: 'flat', rate: 0.40 } },
  },
  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: { enabled: false, description: 'No federal EMT carve-out; cantonal rules vary.' },
    de_minimis_per_transaction: 0,
  },
  loss_treatment: { deductible: false, deductible_percentage: 0, offset_against: 'none', carry_forward_years: 0 },
  ftc_specific_notes: {
    spending_treatment: 'No CGT for private investors. Professional trader status changes the answer entirely.',
    emt_classification_impact: 'Cantonal rules differ. EMT vs utility distinction may matter at the canton level.',
    preferred_classification_for_users: 'utility_token',
  },
  reporting_framework: { domestic_form: 'Steuererklärung (cantonal)', carf_dac8_in_force: false, effective_date: '2026-01-01' },
  tax_year: { type: 'calendar' },
  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['ESTV crypto guidance', 'FUTURECHAIN_TAX_RULES.md §6.2 CH'],
    confidence: 'high',
    review_flags: [
      'professional_trader_vs_private_investor_fact_specific',
      'cantonal_wealth_tax_handled_outside_transaction_engine',
    ],
  },
};
