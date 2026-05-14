/**
 * engine-se.test.ts — Sweden round-trip per FUTURECHAIN_TAX_RULES.md
 * §8.4 test coverage requirements.
 *
 * Each activated jurisdiction must have:
 *   - At least one round-trip test: buy → hold → spend → calculate
 *   - One long-hold test (n/a for SE — no long-term relief)
 *   - One loss-offset test
 *   - One annual-exemption test (n/a for SE — none)
 *   - One DAC8/CARF export test (lands in Phase 3 with the reporter)
 *
 * Plus disclaimer presence + review-flag surfacing (universal hard rules).
 */
import { describe, expect, it } from 'vitest';
import { computeTaxPosition, isRefused, type TaxComputationResult } from '../engine.js';
import { SE } from '../rules/index.js';
import type { TaxInputTx } from '../transaction.js';

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return {
    decimals: 6,
    fiatCurrency: 'SEK',
    ...over,
  };
}

describe('Sweden engine round-trip (genomsnittsmetoden, 30% flat)', () => {
  it('computes a single-disposal gain at 30%', () => {
    // Buy 10 FTC for 1000 SEK, spend 6 FTC valued at 1500 SEK
    // Pool avg: 100 SEK/FTC; cost 6*100=600; gain 900; tax 0.30*900=270
    const r = computeTaxPosition({
      rule: SE,
      transactions: [
        tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 's1', ts: 2, kind: 'spend', amount: '6000000', fiatValueAtTx: 1500 }),
      ],
    });
    expect(isRefused(r)).toBe(false);
    const ok = r as TaxComputationResult;
    expect(ok.annual.totalGainsFiat).toBeCloseTo(900, 6);
    expect(ok.annual.estimatedTaxFiat).toBeCloseTo(270, 6);
    expect(ok.annual.fiatCurrency).toBe('SEK');
    expect(ok.perTransaction).toHaveLength(1);
  });

  it("applies Sweden's 70% loss deductibility against same-year gains", () => {
    // Two pools driven separately by ordering:
    //  Buy 10 for 1000 (avg 100)
    //  Sell 5 for 700  → gain 200
    //  Buy 5 for 1000 (avg ((500)+(1000))/(5+5)=150)
    //  Sell 5 for 500  → cost 750, loss 250
    // Gross gain 200, gross loss 250, deductible loss 250*0.70=175,
    // utilised against gains: 175, net taxable: 200-175=25, tax: 7.50
    const r = computeTaxPosition({
      rule: SE,
      transactions: [
        tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 'd1', ts: 2, kind: 'sell_to_fiat', amount: '5000000', fiatValueAtTx: 700 }),
        tx({ id: 'a2', ts: 3, kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 1000 }),
        tx({ id: 'd2', ts: 4, kind: 'sell_to_fiat', amount: '5000000', fiatValueAtTx: 500 }),
      ],
    });
    const ok = r as TaxComputationResult;
    expect(ok.annual.totalGainsFiat).toBeCloseTo(200, 6);
    expect(ok.annual.totalLossesFiat).toBeCloseTo(250, 6);
    expect(ok.annual.netTaxableGainsFiat).toBeCloseTo(25, 6);
    expect(ok.annual.estimatedTaxFiat).toBeCloseTo(7.5, 6);
  });

  it('carries the §3 disclaimer in English by default', () => {
    const r = computeTaxPosition({ rule: SE, transactions: [] }) as TaxComputationResult;
    expect(r.disclaimer).toContain('Sweden');
    expect(r.disclaimer).toContain('not tax advice');
    expect(r.disclaimer).toContain('FutureChain AB accepts no liability');
  });

  it('produces the Swedish disclaimer when locale=sv', () => {
    const r = computeTaxPosition({
      rule: SE,
      transactions: [],
      locale: 'sv',
    }) as TaxComputationResult;
    expect(r.disclaimer).toContain('Skattereglerna');
    expect(r.disclaimer).toContain('FutureChain AB tar inget ansvar');
  });

  it('surfaces the EMT-classification review flag', () => {
    const r = computeTaxPosition({ rule: SE, transactions: [] }) as TaxComputationResult;
    expect(r.reviewRequired).toBe(true);
    expect(r.reviewReasons).toContain(
      'review_flag_emt_classification_not_tested_at_skatterattsnamnden',
    );
  });

  it('surfaces the adviser-referral threshold breach', () => {
    // Heavy disposal to trigger > 1000 SEK estimated tax
    const r = computeTaxPosition({
      rule: SE,
      transactions: [
        tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 100 }),
        tx({ id: 's1', ts: 2, kind: 'spend', amount: '10000000', fiatValueAtTx: 10000 }),
      ],
      adviserReferralThresholdFiat: 1000,
    }) as TaxComputationResult;
    expect(r.annual.estimatedTaxFiat).toBeGreaterThan(1000);
    expect(r.reviewReasons.some((r) => r.startsWith('estimated_tax_above_threshold_'))).toBe(true);
  });

  it('refuses gracefully when the rule is marked unsupported', () => {
    const r = computeTaxPosition({
      rule: { ...SE, status: 'unsupported' },
      transactions: [],
    });
    expect(isRefused(r)).toBe(true);
    if (isRefused(r)) {
      expect(r.message).toContain('Sweden');
      expect(r.message).toContain('local tax adviser');
    }
  });

  it('falls back to AVERAGE when an unauthorized override is requested', () => {
    // SE rule has optimization_allowed = false, so the override is ignored
    const r = computeTaxPosition({
      rule: SE,
      transactions: [
        tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 'a2', ts: 2, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 2000 }),
        tx({ id: 's1', ts: 3, kind: 'spend', amount: '5000000', fiatValueAtTx: 1500 }),
      ],
      options: { ftc_classification: 'utility_token', cost_basis_override: 'FIFO' },
    }) as TaxComputationResult;
    // AVERAGE basis: pool 20 FTC, 3000 SEK, avg 150. Sell 5 for 1500 → cost 750, gain 750
    // FIFO would give: 5 from lot 1 at 100/FTC → cost 500, gain 1000
    // AVERAGE answer = 750 confirms the override was ignored.
    expect(r.annual.totalGainsFiat).toBeCloseTo(750, 6);
  });

  it('does not apply the EMT carve-out when the SE rule has it disabled', () => {
    // Sweden's EMT special treatment is disabled until förhandsbesked
    // lands. Even if the user flags FTC as EMT, the 30% rate stands.
    const r = computeTaxPosition({
      rule: SE,
      transactions: [
        tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 's1', ts: 2, kind: 'spend', amount: '5000000', fiatValueAtTx: 1500 }),
      ],
      options: { ftc_classification: 'emt' },
    }) as TaxComputationResult;
    // gain 1000, tax at 30% = 300 (NOT a hypothetical reduced rate)
    expect(r.annual.estimatedTaxFiat).toBeCloseTo(300, 6);
    expect(r.ftcClassification).toBe('emt'); // still surfaces the flag the user picked
  });
});
