/**
 * rules/fr.ts — France jurisdiction rule.
 * Source: FUTURECHAIN_TAX_RULES.md §6.1 France. Confidence: high.
 *
 * Defining feature: **crypto-to-crypto swaps are NOT taxable** until
 * conversion to fiat. The only EU member with this rule. The engine's
 * §7 swap-exempt filter is wired off this `taxable_events`
 * `swap_crypto_to_crypto: false` flag.
 */
import type { JurisdictionRule } from '../schema.js';

export const FR: JurisdictionRule = {
  jurisdiction_code: 'FR',
  jurisdiction_name: 'France',
  authority: 'Direction Générale des Finances Publiques (DGFiP)',
  authority_url: 'https://www.impots.gouv.fr/',
  status: 'active',

  classification: {
    asset_type: 'other_specific',
    recognised_as_currency: false,
    legal_status: 'legal',
  },

  taxable_events: {
    buy_with_fiat: false,
    hold: false,
    swap_crypto_to_crypto: false, // UNIQUE in the EU
    spend_on_goods_services: true,
    receive_as_payment: true,
    gift_to_non_spouse: false,
    lend_or_stake: 'taxable',
  },

  cost_basis_method: {
    permitted: ['AVERAGE'],
    default: 'AVERAGE',
    optimization_allowed: false,
  },

  rates: {
    capital_gains: {
      type: 'flat',
      // PFU: 12.8% IR + 17.2% social = 30% total
      structure: { type: 'flat', rate: 0.30 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action'],
      structure: { type: 'flat', rate: 0.30 },
    },
  },

  exemptions_and_reliefs: {
    annual_exemption: 305, // €305 of gross sales
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    emt_special_treatment: {
      enabled: false,
      description: 'No formal EMT carve-out; argument for "no realized gain" untested at DGFiP.',
    },
    de_minimis_per_transaction: 0,
  },

  loss_treatment: {
    deductible: true,
    deductible_percentage: 1.0,
    offset_against: 'crypto_only',
    carry_forward_years: 10,
  },

  ftc_specific_notes: {
    spending_treatment:
      'Spending FTC for goods/services = disposal to EUR (taxable). ' +
      'Swapping FTC for another crypto = NOT taxable.',
    emt_classification_impact:
      'If FTC is classified as EMT, possibility of "no realized gain" ' +
      'treatment is open. Needs rescrit fiscal before relied upon.',
    preferred_classification_for_users: 'utility_token',
  },

  reporting_framework: {
    domestic_form: 'Formulaire 2086',
    carf_dac8_in_force: true,
    effective_date: '2026-01-01',
  },

  tax_year: { type: 'calendar' },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['CGI Art. 150 VH bis', 'FUTURECHAIN_TAX_RULES.md §6.1 FR'],
    confidence: 'high',
    review_flags: ['professional_trader_threshold_fact_specific'],
  },
};
