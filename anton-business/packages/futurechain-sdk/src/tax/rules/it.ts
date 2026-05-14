/**
 * rules/it.ts — Italy jurisdiction rule.
 * Source: FUTURECHAIN_TAX_RULES.md §6.1 Italy. Confidence: high.
 *
 * Strategic significance per the spec: Italy is the FIRST EU Member
 * State to give MiCA-classified EMTs a tax discount — 26% instead of
 * 33% when FTC is classified as EMT. The engine's `emt_classification`
 * toggle activates this carve-out.
 *
 * Other features:
 *   - Cripto-attività under Law 197/2022
 *   - 33% capital gains rate (raised from 26% in 2024)
 *   - €2,000 threshold (gains below = not taxable)
 *   - LIFO permitted; weighted-average alternative
 *   - 0.2% wealth tax on year-end holdings (handled outside the
 *     transaction engine — surfaced via review_flag)
 */
import type { JurisdictionRule } from '../schema.js';

export const IT: JurisdictionRule = {
  jurisdiction_code: 'IT',
  jurisdiction_name: 'Italy',
  authority: 'Agenzia delle Entrate',
  authority_url: 'https://www.agenziaentrate.gov.it/',
  status: 'active',

  classification: {
    asset_type: 'other_specific',
    recognised_as_currency: false,
    legal_status: 'legal',
  },

  taxable_events: {
    buy_with_fiat: false,
    hold: false,
    swap_crypto_to_crypto: true,
    spend_on_goods_services: true,
    receive_as_payment: true,
    gift_to_non_spouse: false,
    lend_or_stake: 'taxable',
  },

  cost_basis_method: {
    // Italy explicitly permits LIFO as an alternative to weighted
    // average (§6.1 IT). optimization_allowed = true so a user can
    // elect LIFO via cost_basis_override.
    permitted: ['AVERAGE', 'LIFO'],
    default: 'AVERAGE',
    optimization_allowed: true,
  },

  rates: {
    capital_gains: {
      type: 'flat',
      structure: { type: 'flat', rate: 0.33 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action'],
      structure: { type: 'flat', rate: 0.33 },
    },
  },

  exemptions_and_reliefs: {
    annual_exemption: 2000, // gains below €2k not taxable
    long_term_holding: { enabled: false, period_days: 0, treatment_after: 'unchanged' },
    // THE EMT CARVE-OUT — Italy's distinguishing feature.
    emt_special_treatment: {
      enabled: true,
      description:
        'MiCA Title II EMT carve-out: euro-denominated e-money tokens ' +
        'are taxed at 26% instead of the standard 33%. Only applies ' +
        'when FTC is classified as EMT (toggle in user settings).',
      reduced_rate: 0.26,
    },
    de_minimis_per_transaction: 0,
  },

  loss_treatment: {
    deductible: true,
    deductible_percentage: 1.0,
    offset_against: 'crypto_only',
    carry_forward_years: 4,
  },

  ftc_specific_notes: {
    spending_treatment:
      'Every spend is a taxable disposal. EMT classification reduces ' +
      'the rate from 33% to 26% — make sure the engine has the EMT ' +
      'toggle set if FTC ships as EMT.',
    emt_classification_impact:
      'Italy is the only jurisdiction where EMT classification is ' +
      'concretely lower tax. 7 percentage points × every disposal.',
    preferred_classification_for_users: 'emt',
  },

  reporting_framework: {
    domestic_form: 'Quadro RT / RW',
    carf_dac8_in_force: true,
    effective_date: '2026-01-01',
  },

  tax_year: { type: 'calendar' },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: ['Legge 197/2022', 'FUTURECHAIN_TAX_RULES.md §6.1 IT'],
    confidence: 'high',
    review_flags: [
      'wealth_tax_0_2pct_handled_outside_transaction_engine',
    ],
  },
};
