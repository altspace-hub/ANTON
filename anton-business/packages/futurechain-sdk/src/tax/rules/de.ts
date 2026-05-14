/**
 * rules/de.ts — Germany jurisdiction rule.
 * Source: FUTURECHAIN_TAX_RULES.md §6.1 Germany. Confidence: high.
 *
 * Defining features:
 *   - §23 EStG "Sonstige Wirtschaftsgüter" classification
 *   - FIFO default, Specific ID permitted with records (optimization)
 *   - HOLDING > 12 months = 0% tax (Spekulationsfrist)
 *   - Short-term: marginal income tax up to 45% + Soli — modelled here
 *     as a flat 45% for v1 (progressive income brackets are user-
 *     specific and need an income input the engine doesn't yet take)
 *   - €1,000 annual exemption (raised from €600)
 *   - Loss offset against other crypto gains only
 */
import type { JurisdictionRule } from '../schema.js';

export const DE: JurisdictionRule = {
  jurisdiction_code: 'DE',
  jurisdiction_name: 'Germany',
  authority: 'Bundeszentralamt für Steuern (BZSt)',
  authority_url: 'https://www.bzst.de/',
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
    lend_or_stake: 'depends_on_beneficial_ownership',
  },

  cost_basis_method: {
    permitted: ['FIFO', 'SPECIFIC_ID'],
    default: 'FIFO',
    optimization_allowed: true,
  },

  rates: {
    capital_gains: {
      type: 'flat',
      // Short-term marginal income tax — flat 45% v1 approximation.
      // The actual rate depends on the user's total annual income; the
      // 45% is the top progressive bracket. The engine surfaces a
      // review flag noting this assumption.
      structure: { type: 'flat', rate: 0.45 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action', 'salary'],
      structure: { type: 'flat', rate: 0.45 },
    },
  },

  exemptions_and_reliefs: {
    annual_exemption: 1000,
    long_term_holding: {
      enabled: true,
      period_days: 365,
      treatment_after: 'tax_free',
    },
    emt_special_treatment: {
      enabled: false,
      description: 'No published EMT carve-out as of 2026-05-12.',
    },
    de_minimis_per_transaction: 0,
  },

  loss_treatment: {
    deductible: true,
    deductible_percentage: 1.0,
    offset_against: 'crypto_only',
    carry_forward_years: -1, // indefinite under §23 EStG
  },

  ftc_specific_notes: {
    spending_treatment:
      'Disposals within 12 months trigger short-term marginal tax. ' +
      'Holding > 365 days makes the disposal tax-free regardless of gain.',
    emt_classification_impact:
      'No formal EMT treatment published. EMT classification may have ' +
      'implications under Finanzgericht case law — verify per ruling.',
    preferred_classification_for_users: 'utility_token',
  },

  reporting_framework: {
    domestic_form: 'Anlage SO',
    carf_dac8_in_force: true,
    effective_date: '2026-01-01',
  },

  tax_year: { type: 'calendar' },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: [
      'https://www.bzst.de/',
      'EStG §23 + BMF circular 2022-05-10',
      'FUTURECHAIN_TAX_RULES.md §6.1 DE',
    ],
    confidence: 'high',
    review_flags: [
      'short_term_rate_uses_45pct_top_bracket_approximation',
      'staking_5year_proposal_under_review',
    ],
  },
};
