/**
 * cost-basis.test.ts — coverage for the AVERAGE + FIFO engines.
 *
 * Worked examples follow the spec's intuition examples in §5 + the
 * documented Swedish genomsnittsmetoden rules.
 */
import { describe, expect, it } from 'vitest';
import { average, fifo } from '../cost-basis/index.js';
import type { TaxInputTx } from '../transaction.js';

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return {
    decimals: 6,
    fiatCurrency: 'SEK',
    ...over,
  };
}

describe('AVERAGE cost basis (Sweden genomsnittsmetoden)', () => {
  it('records zero gain on the first acquisition (no disposal)', () => {
    const out = average([
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
    ]);
    expect(out.entries).toEqual([]);
    expect(out.remainingAtomic).toBe('10000000');
    expect(out.remainingBasisFiat).toBe(1000);
  });

  it('rolls multiple acquisitions into a running average', () => {
    // 10 FTC @ 100 SEK each → 1000 SEK basis
    // 5 FTC @ 200 SEK each → 1000 SEK basis
    // Pool: 15 FTC, 2000 SEK, avg 133.33/FTC
    // Sell 6 FTC for 1500 SEK → cost 6*133.33 = 800, gain 700
    const out = average([
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 'a2', ts: 2, kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 1000 }),
      tx({ id: 'd1', ts: 3, kind: 'sell_to_fiat', amount: '6000000', fiatValueAtTx: 1500 }),
    ]);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]!.txId).toBe('d1');
    expect(out.entries[0]!.proceedsFiat).toBe(1500);
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(800, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(700, 6);
    expect(out.entries[0]!.acquiredTs).toBe(null); // AVERAGE doesn't carry lot date
    // Pool remains: 9 FTC, 1200 SEK
    expect(out.remainingAtomic).toBe('9000000');
    expect(out.remainingBasisFiat).toBeCloseTo(1200, 6);
  });

  it('treats spend as a disposal at FMV', () => {
    const out = average([
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 's1', ts: 2, kind: 'spend', amount: '2000000', fiatValueAtTx: 250 }),
    ]);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(50, 6); // 250 − (2/10)*1000
  });

  it('handles disposal larger than pool with zero-basis remainder', () => {
    const out = average([
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 500 }),
      // Try to sell 10 FTC when pool has 5
      tx({ id: 'd1', ts: 2, kind: 'sell_to_fiat', amount: '5000000', fiatValueAtTx: 600 }),
      tx({ id: 'd2', ts: 3, kind: 'sell_to_fiat', amount: '5000000', fiatValueAtTx: 700 }),
    ]);
    expect(out.entries).toHaveLength(2);
    // First disposal exhausts pool — cost 500, gain 100
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(100, 6);
    // Second disposal hits empty pool — zero basis, full proceeds as gain
    expect(out.entries[1]!.costBasisFiat).toBe(0);
    expect(out.entries[1]!.gainLossFiat).toBe(700);
  });

  it('processes transactions in chronological order regardless of input order', () => {
    const out = average([
      tx({ id: 'd1', ts: 3, kind: 'sell_to_fiat', amount: '5000000', fiatValueAtTx: 700 }),
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
    ]);
    expect(out.entries[0]!.txId).toBe('d1');
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(500, 6); // half the pool at avg=100
  });
});

describe('FIFO cost basis (Germany default, US fallback)', () => {
  it('matches oldest lot first', () => {
    // Lot 1: 10 @ 100 SEK each = 1000 (t=1)
    // Lot 2: 10 @ 200 SEK each = 2000 (t=2)
    // Sell 6 for 1500 SEK (t=3) → match 6 from lot 1, basis 600, gain 900
    const out = fifo([
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 'a2', ts: 2, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 2000 }),
      tx({ id: 'd1', ts: 3, kind: 'sell_to_fiat', amount: '6000000', fiatValueAtTx: 1500 }),
    ]);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(600, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(900, 6);
    // acquiredTs = lot 1's timestamp → drives long-term-holding checks
    expect(out.entries[0]!.acquiredTs).toBe(1);
  });

  it('spans multiple lots when disposal exceeds the oldest', () => {
    // Lot 1: 5 @ 100 = 500 (t=1)
    // Lot 2: 5 @ 200 = 1000 (t=2)
    // Sell 7 for 1400 (t=3) → 5 from lot 1 (basis 500) + 2 from lot 2 (basis 400) = 900 basis, gain 500
    const out = fifo([
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 500 }),
      tx({ id: 'a2', ts: 2, kind: 'buy_with_fiat', amount: '5000000', fiatValueAtTx: 1000 }),
      tx({ id: 'd1', ts: 3, kind: 'sell_to_fiat', amount: '7000000', fiatValueAtTx: 1400 }),
    ]);
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(900, 6);
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(500, 6);
    expect(out.entries[0]!.acquiredTs).toBe(1); // first lot consumed
    // Remaining pool: 3 FTC from lot 2 with proportional basis
    expect(out.remainingAtomic).toBe('3000000');
    expect(out.remainingBasisFiat).toBeCloseTo(600, 6); // 3/5 of lot 2's 1000
  });

  it('handles partial lot consumption then full', () => {
    const out = fifo([
      tx({ id: 'a1', ts: 1, kind: 'buy_with_fiat', amount: '10000000', fiatValueAtTx: 1000 }),
      tx({ id: 'd1', ts: 2, kind: 'sell_to_fiat', amount: '3000000', fiatValueAtTx: 450 }),
      tx({ id: 'd2', ts: 3, kind: 'sell_to_fiat', amount: '7000000', fiatValueAtTx: 1050 }),
    ]);
    expect(out.entries[0]!.costBasisFiat).toBeCloseTo(300, 6); // 3/10 of 1000
    expect(out.entries[0]!.gainLossFiat).toBeCloseTo(150, 6);
    expect(out.entries[1]!.costBasisFiat).toBeCloseTo(700, 6); // remainder
    expect(out.entries[1]!.gainLossFiat).toBeCloseTo(350, 6);
    expect(out.remainingAtomic).toBe('0');
  });
});
