/**
 * engine-phase7.test.ts — Phase 7 coverage.
 *
 *   7a: fiscal-year windowing (GB / AU / ZA)
 *   7b: LIFO cost basis (IT optimisation)
 *   7c: UK same-day + 30-day matching ("bed-and-breakfast")
 */
import { describe, expect, it } from 'vitest';
import { computeTaxPosition, type TaxComputationResult } from '../engine.js';
import { lifo, sharePooling } from '../cost-basis/index.js';
import { taxYearBoundsForRule, currentTaxYearForRule } from '../tax-year.js';
import { AU, GB, IT, SE, ZA } from '../rules/index.js';
import type { TaxInputTx } from '../transaction.js';

const DAY = 24 * 60 * 60 * 1000;

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return { decimals: 6, fiatCurrency: 'GBP', ...over };
}

// ────────────────────────────────────────────────────────────────
// 7a — fiscal-year windowing
// ────────────────────────────────────────────────────────────────

describe('tax-year bounds — calendar vs fiscal', () => {
  it('Sweden (calendar) 2026 = Jan 1 — Dec 31', () => {
    const b = taxYearBoundsForRule(SE, 2026);
    expect(b.fromTs).toBe(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    expect(b.toTs).toBe(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
    expect(b.label).toBe('2026');
  });

  it('UK fiscal 2026 = 6 Apr 2025 — 5 Apr 2026', () => {
    const b = taxYearBoundsForRule(GB, 2026);
    expect(b.fromTs).toBe(Date.UTC(2025, 3, 6, 0, 0, 0, 0));   // 6 Apr 2025
    expect(b.toTs).toBe(Date.UTC(2026, 3, 5, 23, 59, 59, 999)); // 5 Apr 2026
    expect(b.label).toBe('2025-26');
  });

  it('Australia fiscal 2026 = 1 Jul 2025 — 30 Jun 2026', () => {
    const b = taxYearBoundsForRule(AU, 2026);
    expect(b.fromTs).toBe(Date.UTC(2025, 6, 1, 0, 0, 0, 0));    // 1 Jul 2025
    expect(b.toTs).toBe(Date.UTC(2026, 5, 30, 23, 59, 59, 999)); // 30 Jun 2026
    expect(b.label).toBe('2025-26');
  });

  it('South Africa fiscal 2026 = 1 Mar 2025 — end Feb 2026', () => {
    const b = taxYearBoundsForRule(ZA, 2026);
    expect(b.fromTs).toBe(Date.UTC(2025, 2, 1, 0, 0, 0, 0));     // 1 Mar 2025
    expect(b.toTs).toBe(Date.UTC(2026, 1, 28, 23, 59, 59, 999)); // 28 Feb 2026
    expect(b.label).toBe('2025-26');
  });

  it('currentTaxYearForRule picks the year ending now', () => {
    // GB on 7 April 2026 — we're 1 day past the start of GB 2026-27,
    // so currentTaxYear should be 2027.
    const y = currentTaxYearForRule(GB, new Date(Date.UTC(2026, 3, 7)));
    expect(y).toBe(2027);

    // GB on 5 April 2026 — we're inside 2025-26 (about to end).
    const y2 = currentTaxYearForRule(GB, new Date(Date.UTC(2026, 3, 5)));
    expect(y2).toBe(2026);
  });
});

// ────────────────────────────────────────────────────────────────
// 7b — LIFO cost basis
// ────────────────────────────────────────────────────────────────

describe('LIFO cost basis (Italy optimisation)', () => {
  it('matches newest lot first', () => {
    const out = lifo([
      tx({ id: 'a1', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 'a2', ts: 10 * DAY,  kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 2000 }),
      tx({ id: 'd',  ts: 20 * DAY,  kind: 'sell_to_fiat',  amount: '6000000',  fiatValueAtTx: 1500 }),
    ]);
    // LIFO: take 6 from a2 at £200/atomic → cost £1200, gain £300
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(1200, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(300, 6);
    expect(out.entries[0]!.acquiredTs).toBe(10 * DAY);
  });

  it('Italy permits the LIFO override + 33% rate', () => {
    const txs = [
      tx({ id: 'a1', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000, fiatCurrency: 'EUR' }),
      tx({ id: 'a2', ts: 10 * DAY,  kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 3000, fiatCurrency: 'EUR' }),
      tx({ id: 'd',  ts: 20 * DAY,  kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 5000, fiatCurrency: 'EUR' }),
    ];
    // AVERAGE (default): pool 20 @ £4000, avg £200/atomic. Sell 10 → cost £2000, gain £3000.
    const avg = computeTaxPosition({ rule: IT, transactions: txs }) as TaxComputationResult;
    expect(avg.annual.totalGainsFiat).toBeCloseTo(3000, 6);

    // LIFO override: take 10 from a2 → cost £3000, gain £2000.
    const lifoResult = computeTaxPosition({
      rule: IT,
      transactions: txs,
      options: { ftc_classification: 'utility_token', cost_basis_override: 'LIFO' },
    }) as TaxComputationResult;
    expect(lifoResult.annual.totalGainsFiat).toBeCloseTo(2000, 6);
  });
});

// ────────────────────────────────────────────────────────────────
// 7c — UK same-day + 30-day matching
// ────────────────────────────────────────────────────────────────

describe('UK share-pooling — same-day + 30-day matching', () => {
  it('same-day disposal matches against same-day acquisition first', () => {
    // Acquired 10 at the start of the day; sold 10 later the same day.
    const sameDay = Date.UTC(2026, 0, 15);
    const sameDayLater = sameDay + 60_000;
    const out = sharePooling([
      tx({ id: 'a',  ts: sameDay,       kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 'd',  ts: sameDayLater,  kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 1100 }),
    ]);
    // Match against same-day @ £1000 basis → gain £100.
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(1000, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(100, 6);
  });

  it('30-day forward matching defeats the wash-sale loss', () => {
    // Bed-and-breakfast classic: hold at low basis, sell at loss,
    // re-buy within 30 days. UK matches the disposal against the
    // re-buy, not the long-held pool — so the loss largely
    // disappears.
    const out = sharePooling([
      tx({ id: 'old', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 500 }),  // long-held cheap
      tx({ id: 'd',   ts: 100 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 400 }),  // sold at loss
      tx({ id: 're',  ts: 110 * DAY, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 420 }),  // re-bought within 30d
    ]);
    // Disposal matches against the re-buy @ £420 basis, not the
    // old £500 lot. Loss = £400 − £420 = −£20 instead of −£100.
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(420, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(-20, 6);
    // The old £500 lot stays in the pool.
    expect(out.remainingAtomic).toBe('10000000');
    expect(out.remainingBasisFiat).toBeCloseTo(500, 6);
  });

  it('Section 104 pool runs when no matching applies', () => {
    // Two old acquisitions go into the pool; disposal long after
    // the 30-day windows have closed.
    const out = sharePooling([
      tx({ id: 'a1', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 'a2', ts: 10 * DAY,  kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 3000 }),
      tx({ id: 'd',  ts: 100 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 5000 }),
    ]);
    // Pool: 20 atomic, £4000, avg £200/atomic. Sell 10 → cost £2000, gain £3000.
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(2000, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(3000, 6);
  });

  it('engine end-to-end via GB rule — 30-day match neutralises a wash sale', () => {
    const r = computeTaxPosition({
      rule: GB,
      transactions: [
        tx({ id: 'old', ts: 0,         kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 500 }),
        tx({ id: 'd',   ts: 100 * DAY, kind: 'sell_to_fiat',  amount: '10000000', fiatValueAtTx: 400 }),
        tx({ id: 're',  ts: 110 * DAY, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 420 }),
      ],
    }) as TaxComputationResult;
    // Loss is only £20 instead of £100 — bed-and-breakfast applied.
    expect(r.annual.totalLossesFiat).toBeCloseTo(20, 6);
  });
});
