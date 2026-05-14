/**
 * refund-tagging.test.ts — § 7.4 refund-as-cancellation coverage.
 */
import { describe, expect, it } from 'vitest';
import { applyRefundTagging, DEFAULT_REFUND_WINDOW_DAYS } from '../refund-tagging.js';
import { computeTaxPosition, type TaxComputationResult } from '../engine.js';
import { SE } from '../rules/index.js';
import type { TaxInputTx } from '../transaction.js';

function tx(over: Partial<TaxInputTx> & Pick<TaxInputTx, 'id' | 'ts' | 'kind' | 'amount' | 'fiatValueAtTx'>): TaxInputTx {
  return { decimals: 6, fiatCurrency: 'SEK', ...over };
}

const DAY = 24 * 60 * 60 * 1000;

describe('applyRefundTagging — unit', () => {
  it('cancels a refund_received paired to a spend within the window', () => {
    const txs = [
      tx({ id: 's',  ts: 0,         kind: 'spend',           amount: '1000000', fiatValueAtTx: 100 }),
      tx({ id: 'rr', ts: 5 * DAY,   kind: 'refund_received', amount: '1000000', fiatValueAtTx: 100, refundOf: 's' }),
    ];
    const out = applyRefundTagging(txs);
    expect(out.cancelledPairCount).toBe(1);
    expect(out.filtered).toHaveLength(0);
  });

  it('cancels a refund_sent paired to a receive_as_payment within the window', () => {
    const txs = [
      tx({ id: 'r',  ts: 0,         kind: 'receive_as_payment', amount: '1000000', fiatValueAtTx: 100 }),
      tx({ id: 'rs', ts: 5 * DAY,   kind: 'refund_sent',        amount: '1000000', fiatValueAtTx: 100, refundOf: 'r' }),
    ];
    const out = applyRefundTagging(txs);
    expect(out.cancelledPairCount).toBe(1);
    expect(out.filtered).toHaveLength(0);
  });

  it('passes through when the refund is outside the window', () => {
    const txs = [
      tx({ id: 's',  ts: 0,                                    kind: 'spend',           amount: '1000000', fiatValueAtTx: 100 }),
      tx({ id: 'rr', ts: (DEFAULT_REFUND_WINDOW_DAYS + 1) * DAY, kind: 'refund_received', amount: '1000000', fiatValueAtTx: 100, refundOf: 's' }),
    ];
    const out = applyRefundTagging(txs);
    expect(out.cancelledPairCount).toBe(0);
    expect(out.filtered).toHaveLength(2);
  });

  it('passes through when the refund has no refundOf set', () => {
    const txs = [
      tx({ id: 's',  ts: 0,       kind: 'spend',           amount: '1000000', fiatValueAtTx: 100 }),
      tx({ id: 'rr', ts: 1 * DAY, kind: 'refund_received', amount: '1000000', fiatValueAtTx: 100 }),
    ];
    const out = applyRefundTagging(txs);
    expect(out.cancelledPairCount).toBe(0);
    expect(out.filtered).toHaveLength(2);
  });

  it('passes through when refundOf points at a missing original', () => {
    const txs = [
      tx({ id: 'rr', ts: 1 * DAY, kind: 'refund_received', amount: '1000000', fiatValueAtTx: 100, refundOf: 'ghost' }),
    ];
    const out = applyRefundTagging(txs);
    expect(out.cancelledPairCount).toBe(0);
    expect(out.filtered).toHaveLength(1);
  });

  it('rejects direction mismatches (refund_received paired with an inbound)', () => {
    const txs = [
      tx({ id: 'r',  ts: 0,       kind: 'receive_as_payment', amount: '1000000', fiatValueAtTx: 100 }),
      tx({ id: 'rr', ts: 1 * DAY, kind: 'refund_received',    amount: '1000000', fiatValueAtTx: 100, refundOf: 'r' }),
    ];
    const out = applyRefundTagging(txs);
    expect(out.cancelledPairCount).toBe(0);
    expect(out.filtered).toHaveLength(2);
  });

  it('respects a custom window', () => {
    const txs = [
      tx({ id: 's',  ts: 0,       kind: 'spend',           amount: '1000000', fiatValueAtTx: 100 }),
      tx({ id: 'rr', ts: 20 * DAY, kind: 'refund_received', amount: '1000000', fiatValueAtTx: 100, refundOf: 's' }),
    ];
    expect(applyRefundTagging(txs, 14).cancelledPairCount).toBe(0);
    expect(applyRefundTagging(txs, 30).cancelledPairCount).toBe(1);
  });
});

describe('engine integration — refund cancellation', () => {
  it('removes the realized gain from a cancelled spend/refund pair', () => {
    // Buy 10 FTC for 1000, spend 4 FTC at fair value 600 (=> gain 200),
    // then refund_received within 5 days. After cancellation, no
    // disposal, no gain.
    const r = computeTaxPosition({
      rule: SE,
      transactions: [
        tx({ id: 'a',  ts: 0,         kind: 'buy_with_fiat',    amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 's',  ts: 5 * DAY,   kind: 'spend',            amount: '4000000',  fiatValueAtTx: 600 }),
        tx({ id: 'rr', ts: 7 * DAY,   kind: 'refund_received',  amount: '4000000',  fiatValueAtTx: 600, refundOf: 's' }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.totalGainsFiat).toBe(0);
    expect(r.annual.estimatedTaxFiat).toBe(0);
    expect(r.reviewReasons).toContain('refund_pairs_cancelled_1_treatment_not_legally_settled');
    expect(r.reviewRequired).toBe(true);
  });

  it('keeps the gain when the refund is outside the window', () => {
    const r = computeTaxPosition({
      rule: SE,
      transactions: [
        tx({ id: 'a',  ts: 0,                                    kind: 'buy_with_fiat',   amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 's',  ts: 0,                                    kind: 'spend',           amount: '4000000',  fiatValueAtTx: 600 }),
        tx({ id: 'rr', ts: (DEFAULT_REFUND_WINDOW_DAYS + 1) * DAY, kind: 'refund_received', amount: '4000000',  fiatValueAtTx: 600, refundOf: 's' }),
      ],
    }) as TaxComputationResult;
    // Gain 200 still surfaces.
    expect(r.annual.totalGainsFiat).toBeCloseTo(200, 6);
    expect(r.reviewReasons.every((rsn) => !rsn.startsWith('refund_pairs_cancelled'))).toBe(true);
  });

  it('respects refundWindowDays=0 to disable cancellation entirely', () => {
    const r = computeTaxPosition({
      rule: SE,
      refundWindowDays: 0,
      transactions: [
        tx({ id: 'a',  ts: 0,       kind: 'buy_with_fiat',    amount: '10000000', fiatValueAtTx: 1000 }),
        tx({ id: 's',  ts: 1 * DAY, kind: 'spend',            amount: '4000000',  fiatValueAtTx: 600 }),
        tx({ id: 'rr', ts: 2 * DAY, kind: 'refund_received',  amount: '4000000',  fiatValueAtTx: 600, refundOf: 's' }),
      ],
    }) as TaxComputationResult;
    expect(r.annual.totalGainsFiat).toBeCloseTo(200, 6);
  });
});
