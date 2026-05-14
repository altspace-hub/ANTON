/**
 * rules/pt.ts — Portugal jurisdiction rule.
 * Source: FUTURECHAIN_TAX_RULES.md §6.1 PT. Confidence: high.
 *
 * Second-best holding regime in the EU after Germany: HOLDING > 365
 * days = 0% on disposal. Short-term 28% flat.
 */
import type { JurisdictionRule } from '../schema.js';

export const PT: JurisdictionRule = {
  jurisdiction_code: 'PT',
  jurisdiction_name: 'Portugal',
  authority: 'Autoridade Tributária e Aduaneira (AT)',
  authority_url: 'https://www.portaldasfinancas.gov.pt/',
  status: 'active',

  classification: {
    asset_type: 'other_specific',
    recognised_as_currency: false,
    legal_status: 'legal',
  },

  taxable_events: {
    buy_with_fiat: false,
    hold: false,
    swap_crypto_to_crypto: false, // same-category swaps generally not taxed
    spend_on_goods_services: true,
    receive_as_payment: true,
    gift_to_non_spouse: false,
    lend_or_stake: 'taxable',
  },

  cost_basis_method: {
    // FIFO required so the engine can track per-lot acquisition
    // dates against PT's 365-day holding-period rule (AVERAGE
    // pools don't carry per-lot timestamps).
    permitted: ['FIFO'],
    default: 'FIFO',
    optimization_allowed: false,
  },

  rates: {
    capital_gains: {
      type: 'flat',
      structure: { type: 'flat', rate: 0.28 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action'],
      structure: { type: 'flat', rate: 0.48 },
    },
  },

  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: {
      enabled: true,
      period_days: 365,
      treatment_after: 'tax_free',
    },
    emt_special_treatment: {
      enabled: false,
      description: 'No formal EMT carve-out at Autoridade Tributária.',
    },
    de_minimis_per_transaction: 0,
  },

  loss_treatment: {
    deductible: true,
    deductible_percentage: 1.0,
    offset_against: 'crypto_only',
    carry_forward_years: 5,
  },

  ftc_specific_notes: {
    spending_treatment:
      'Disposals < 365 days held → 28% on the gain. Long-term holds ' +
      'used in payment escape taxation entirely.',
    emt_classification_impact: 'Not yet tested by Portuguese tax authority.',
    preferred_classification_for_users: 'utility_token',
  },

  reporting_framework: {
    domestic_form: 'Anexo G (IRS)',
    carf_dac8_in_force: true,
    effective_date: '2026-01-01',
  },

  tax_year: { type: 'calendar' },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['FUTURECHAIN_TAX_RULES.md §6.1 PT'],
    confidence: 'high',
    review_flags: ['mining_taxed_at_progressive_rate_up_to_48pct'],
  },
};
