/**
 * market-prediction-allocator.test.ts
 *
 * The allocator's job is to make one comparison legible: what happens when the
 * same set of live predictions is sized two ways. Equal weighting says "every
 * call counts the same". Confidence weighting says "back what we believe". The
 * gap between the two curves is the calibration result, reporting itself daily
 * without anyone re-running an analysis.
 *
 * ── What the September rewrite fixed, and must not regress ───────────────
 *
 * The book used to filter to `predicted_direction = 'up'`, so it expressed one
 * third of what the system said — and measurement on 3 September 2026 showed
 * it was the weak third:
 *
 *     up     56 graded   57.1% correct   Brier 0.2488
 *     down   24 graded   66.7% correct   Brier 0.2227
 *     flat   14 graded   78.6% correct   Brier 0.1975
 *
 * A portfolio built only from the 'up' calls was structurally wired to the
 * one bucket with no edge, and duly lost to SPY by ~2.1 points in three
 * sessions. Down calls are now shorts. These tests pin the arithmetic that
 * makes that safe, because every failure mode here is silent: a book that
 * stops summing to one gross NAV is an unfunded portfolio, and a sign error
 * turns a correct bearish call into a loss while every log line still reads
 * "position opened".
 */

import { describe, it, expect } from 'vitest';
import {
  computeWeights, type Weighting, type EligiblePrediction,
} from '../../server/services/market-prediction-allocator.js';

const up = (id: string, target_symbol: string, confidence: number): EligiblePrediction =>
  ({ id, target_symbol, confidence, predicted_direction: 'up' });
const down = (id: string, target_symbol: string, confidence: number): EligiblePrediction =>
  ({ id, target_symbol, confidence, predicted_direction: 'down' });
const flat = (id: string, target_symbol: string, confidence: number): EligiblePrediction =>
  ({ id, target_symbol, confidence, predicted_direction: 'flat' });

const gross = (m: Map<string, number>) =>
  [...m.values()].reduce((a, b) => a + Math.abs(b), 0);
const net = (m: Map<string, number>) =>
  [...m.values()].reduce((a, b) => a + b, 0);

describe('long leg', () => {
  it('spreads equal weighting evenly across distinct symbols', () => {
    const { weights } = computeWeights(
      [up('1', 'AAPL', 0.9), up('2', 'MSFT', 0.5), up('3', 'NVDA', 0.6)], 'equal');
    expect(weights.get('AAPL')).toBeCloseTo(1 / 3, 9);
    expect(weights.get('MSFT')).toBeCloseTo(1 / 3, 9);
    // Equal weighting must ignore confidence entirely — that is the whole
    // point of running it as the control portfolio.
    expect(weights.get('AAPL')).toBeCloseTo(weights.get('MSFT')!, 9);
  });

  it('sizes confidence weighting by stated confidence', () => {
    const { weights } = computeWeights([up('1', 'AAPL', 0.8), up('2', 'MSFT', 0.2)], 'confidence');
    expect(weights.get('AAPL')).toBeCloseTo(0.8, 9);
    expect(weights.get('MSFT')).toBeCloseTo(0.2, 9);
  });

  it('accumulates weight when several predictions name the same symbol', () => {
    // Three separate calls on AAPL means AAPL is believed three times as
    // often. Deduplicating would throw that signal away.
    const { weights } = computeWeights(
      [up('1', 'AAPL', 0.5), up('2', 'AAPL', 0.5), up('3', 'AAPL', 0.5), up('4', 'MSFT', 0.5)],
      'equal');
    expect(weights.size).toBe(2);
    expect(weights.get('AAPL')).toBeCloseTo(0.75, 9);
  });
});

describe('short leg — the fix', () => {
  it('gives a down call a NEGATIVE weight', () => {
    // The sign IS the fix. A positive weight here would buy a symbol the
    // system said would fall, so being right would lose money while every
    // count and log line still looked correct.
    const { weights } = computeWeights([down('1', 'XOM', 0.7)], 'equal');
    expect(weights.get('XOM')).toBeLessThan(0);
  });

  it('holds both legs at once', () => {
    const { weights } = computeWeights([up('1', 'AAPL', 0.6), down('2', 'XOM', 0.6)], 'equal');
    expect(weights.get('AAPL')).toBeGreaterThan(0);
    expect(weights.get('XOM')).toBeLessThan(0);
  });

  it('nets opposing calls on one symbol instead of holding both sides', () => {
    // Two up and one down on AAPL is a net bullish view of one unit, not a
    // simultaneous long and short in the same book.
    const { weights } = computeWeights(
      [up('1', 'AAPL', 0.5), up('2', 'AAPL', 0.5), down('3', 'AAPL', 0.5)], 'equal');
    expect(weights.size).toBe(1);
    expect(weights.get('AAPL')).toBeCloseTo(1, 9);
  });

  it('holds nothing when calls on a symbol cancel exactly, and counts it', () => {
    // A book holding fewer names than it has predictions looks like a pricing
    // failure unless the reason is reported.
    const r = computeWeights([up('1', 'AAPL', 0.5), down('2', 'AAPL', 0.5)], 'equal');
    expect(r.weights.has('AAPL')).toBe(false);
    expect(r.offsetting).toBe(1);
  });
});

describe('flat calls', () => {
  it('never becomes a position, however accurate the bucket is', () => {
    // 'flat' is the most accurate bucket (78.6%) and is still not traded. It
    // is a view about volatility, and no cash-equity position profits from
    // being right about it. Manufacturing one would put a directional bet
    // behind a non-directional view and credit the result to the prediction.
    const r = computeWeights([flat('1', 'AAPL', 0.9), up('2', 'MSFT', 0.5)], 'equal');
    expect(r.weights.has('AAPL')).toBe(false);
    expect(r.weights.get('MSFT')).toBeCloseTo(1, 9);
  });

  it('is counted so its accuracy is never folded into a return it did not produce', () => {
    const r = computeWeights([flat('1', 'AAPL', 0.9), flat('2', 'MSFT', 0.9)], 'equal');
    expect(r.flatCount).toBe(2);
    expect(r.weights.size).toBe(0);
  });
});

describe('exposure arithmetic', () => {
  it('always consumes exactly one NAV of GROSS exposure', () => {
    // Sizing each leg to a full NAV would double the book's risk the day
    // shorts were introduced, making returns before and after incomparable.
    for (const weighting of ['equal', 'confidence'] as Weighting[]) {
      const { weights, grossExposure } = computeWeights(
        [up('1', 'AAPL', 0.8), up('2', 'MSFT', 0.3), down('3', 'XOM', 0.6), down('4', 'TLT', 0.2)],
        weighting);
      expect(gross(weights)).toBeCloseTo(1, 9);
      expect(grossExposure).toBeCloseTo(1, 9);
    }
  });

  it('reports net exposure that matches the weights', () => {
    const { weights, netExposure } = computeWeights(
      [up('1', 'AAPL', 0.5), down('2', 'XOM', 0.5)], 'equal');
    expect(netExposure).toBeCloseTo(net(weights), 9);
    // Balanced long and short is market-neutral.
    expect(netExposure).toBeCloseTo(0, 9);
  });

  it('is fully long when every call is bullish', () => {
    const { netExposure } = computeWeights([up('1', 'AAPL', 0.5), up('2', 'MSFT', 0.5)], 'equal');
    expect(netExposure).toBeCloseTo(1, 9);
  });

  it('is fully short when every call is bearish', () => {
    const { netExposure } = computeWeights([down('1', 'XOM', 0.5), down('2', 'TLT', 0.5)], 'equal');
    expect(netExposure).toBeCloseTo(-1, 9);
  });

  it('tilts net exposure toward the side with more conviction', () => {
    const { netExposure } = computeWeights(
      [up('1', 'AAPL', 0.9), down('2', 'XOM', 0.1)], 'confidence');
    expect(netExposure).toBeGreaterThan(0.5);
    expect(netExposure).toBeLessThan(1);
  });
});

describe('degenerate input', () => {
  it('returns an empty book rather than dividing by zero', () => {
    const r = computeWeights([], 'equal');
    expect(r.weights.size).toBe(0);
    expect(r.grossExposure).toBe(0);
    expect(r.netExposure).toBe(0);
  });

  it('returns an empty book when every call is flat', () => {
    const r = computeWeights([flat('1', 'AAPL', 0.9)], 'equal');
    expect(r.weights.size).toBe(0);
    expect(r.grossExposure).toBe(0);
  });

  it('clamps a negative confidence rather than flipping the position', () => {
    // A negative confidence must not silently turn a long into a short — the
    // direction field is the only thing allowed to decide side.
    const { weights } = computeWeights(
      [up('1', 'AAPL', -0.5), up('2', 'MSFT', 0.5)], 'confidence');
    expect(weights.get('MSFT')).toBeCloseTo(1, 9);
    expect(weights.get('AAPL') ?? 0).toBeGreaterThanOrEqual(0);
  });
});
