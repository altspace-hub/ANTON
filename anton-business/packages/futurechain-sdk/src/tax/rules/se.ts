/**
 * rules/se.ts — Sweden jurisdiction rule.
 *
 * Source: FUTURECHAIN_TAX_RULES.md §6.1 Sweden. Last verified
 * 2026-05-12 against Skatteverket's published position. Confidence
 * level: high, per the spec.
 *
 * Rule decisions, traceable to the spec:
 *   - AVERAGE only — genomsnittsmetoden, no optimization (§6.1)
 *   - 30% flat capital gains rate
 *   - No annual exemption — every disposal taxable from the first SEK
 *   - No long-term holding relief — Sweden has none
 *   - 70% loss deductibility against other capital gains (§6.1 + §4)
 *   - K4 section D reporting form
 *   - EMT carve-out not yet established at Skatterättsnämnden —
 *     keeping `emt_special_treatment.enabled = false` until the
 *     förhandsbesked the spec recommends actually lands
 *
 * v1 keeps this as a TypeScript constant rather than YAML to avoid
 * shipping js-yaml in the bundle. The schema is identical; the
 * Phase-5 signed-rules loader can swap to YAML hot-loading without
 * changing any consumer.
 */
import type { JurisdictionRule } from '../schema.js';

export const SE: JurisdictionRule = {
  jurisdiction_code: 'SE',
  jurisdiction_name: 'Sweden',
  authority: 'Skatteverket',
  authority_url: 'https://www.skatteverket.se/privat/skatter/vardepappersochkryptotillgangar/kryptotillgangar.4.html',
  status: 'active',

  classification: {
    asset_type: 'other_specific', // "övrig tillgång" per IL kap. 52
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
    lend_or_stake: 'taxable', // staking taxed as capital income per Skatteverket
  },

  cost_basis_method: {
    permitted: ['AVERAGE'],
    default: 'AVERAGE',
    optimization_allowed: false,
  },

  rates: {
    capital_gains: {
      type: 'flat',
      structure: { type: 'flat', rate: 0.30 },
    },
    income: {
      applies_to: ['mining', 'staking', 'airdrop_with_action', 'salary'],
      // Mining as private individual taxed as hobby income (progressive);
      // staking taxed at 30% capital income flat. We surface the more
      // common case here; the orchestrator's income path is Phase 5+.
      structure: { type: 'flat', rate: 0.30 },
    },
  },

  exemptions_and_reliefs: {
    annual_exemption: 0,
    long_term_holding: {
      enabled: false,
      period_days: 0,
      treatment_after: 'unchanged',
    },
    emt_special_treatment: {
      enabled: false,
      description:
        'No EMT-specific carve-out established at Skatterättsnämnden as of ' +
        '2026-05-12. If FTC is ultimately classified as MiCA EMT, the argument ' +
        'that an EMT pegged 1:1 to SEK produces ~0 gain per disposal is ' +
        'logical but untested — a förhandsbesked is recommended before ' +
        'asserting this treatment to users.',
    },
    de_minimis_per_transaction: 0,
  },

  loss_treatment: {
    deductible: true,
    deductible_percentage: 0.70, // Sweden's 70%-rule
    offset_against: 'all_capital_gains',
    carry_forward_years: 0, // No crypto-specific carry forward
  },

  ftc_specific_notes: {
    spending_treatment:
      'Every spend is a taxable disposal under genomsnittsmetoden. FTC payment ' +
      'frequency directly drives kvitto-level disposals in the K4 ledger.',
    emt_classification_impact:
      'If FTC is classified as EMT and a förhandsbesked confirms the ' +
      '"no realized gain" interpretation, per-transaction tax goes to ~0. ' +
      'Until then, treat as `other_specific` capital asset.',
    preferred_classification_for_users: 'utility_token',
  },

  reporting_framework: {
    domestic_form: 'K4 section D',
    carf_dac8_in_force: true,
    effective_date: '2026-01-01',
  },

  tax_year: {
    type: 'calendar',
  },

  metadata: {
    last_verified: '2026-05-12',
    verification_source: [
      'https://www.skatteverket.se/privat/skatter/vardepappersochkryptotillgangar/kryptotillgangar.4.html',
      'Inkomstskattelagen (1999:1229) kap. 41–52',
      'FUTURECHAIN_TAX_RULES.md §6.1',
    ],
    confidence: 'high',
    review_flags: [
      'emt_classification_not_tested_at_skatterattsnamnden',
    ],
  },
};
