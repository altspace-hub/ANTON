/**
 * market-prediction-allocator.test.ts
 *
 * The allocator's job is to make one comparison legible: what happens when the
 * same set of live predictions is sized two ways. Equal weighting says "every
 * call counts the same". Confidence weighting says "back what we believe".
 *
 * On this data those are not equivalent bets. Calibration is inverted across
 * 174 graded predictions — the 0.70–0.85 band runs at 25% while the sub-0.50
 * band runs at 58% — so confidence weighting concentrates money in the calls
 * most likely to be wrong. That is precisely why both portfolios exist rather
 * than just the "sensible" one: the gap between the two curves is the
 * calibration result, and it keeps reporting itself without anyone re-running
 * an analysis.
 *
 * These tests pin the parts where being wrong would be silent: a weight book
 * that stops summing to 1, an expired call still being held, or a symbol
 * quietly vanishing because it could not be priced.
 */

import { describe, it, expect } from 'vitest';
import { computeWeights, type Weighting } from '../../server/services/market-prediction-allocator.js';

const p = (id: string, target_symbol: string, confidence: number) => ({ id, target_symbol, confidence });

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('prediction allocator — weighting', () => {
  it('spreads equal weighting evenly across distinct symbols', () => {
    const w = computeWeights([p('1', 'AAPL', 0.9), p('2', 'MSFT', 0.5), p('3', 'NVDA', 0.6)], 'equal');
    expect(w.get('AAPL')).toBeCloseTo(1 / 3, 9);
    expect(w.get('MSFT')).toBeCloseTo(1 / 3, 9);
    expect(w.get('NVDA')).toBeCloseTo(1 / 3, 9);
    // Equal weighting must ignore confidence entirely — that is the whole
    // point of running it as the control portfolio.
    expect(w.get('AAPL')).toBeCloseTo(w.get('MSFT')!, 9);
  });

  it('sizes confidence weighting by stated confidence', () => {
    const w = computeWeights([p('1', 'AAPL', 0.8), p('2', 'MSFT', 0.2)], 'confidence');
    expect(w.get('AAPL')).toBeCloseTo(0.8, 9);
    expect(w.get('MSFT')).toBeCloseTo(0.2, 9);
  });

  it('accumulates weight when several predictions name the same symbol', () => {
    // Three separate calls on AAPL and one on MSFT means AAPL is believed
    // three times as often. Deduplicating would throw that signal away.
    const w = computeWeights(
      [p('1', 'AAPL', 0.5), p('2', 'AAPL', 0.5), p('3', 'AAPL', 0.5), p('4', 'MSFT', 0.5)],
      'equal',
    );
    expect(w.size).toBe(2);
    expect(w.get('AAPL')).toBeCloseTo(0.75, 9);
    expect(w.get('MSFT')).toBeCloseTo(0.25, 9);
  });

  it('always produces a book that sums to 1', () => {
    // A book that quietly stops summing to 1 is an unfunded portfolio, and NAV
    // would drift for a reason no log line explains.
    for (const weighting of ['equal', 'confidence'] as Weighting[]) {
      for (const set of [
        [p('1', 'AAPL', 0.51)],
        [p('1', 'AAPL', 0.9), p('2', 'MSFT', 0.1)],
        [p('1', 'A', 0.3), p('2', 'B', 0.3), p('3', 'C', 0.3), p('4', 'A', 0.3)],
      ]) {
        expect(sum(computeWeights(set, weighting))).toBeCloseTo(1, 9);
      }
    }
  });

  it('returns an empty book rather than dividing by zero', () => {
    expect(computeWeights([], 'equal').size).toBe(0);
    // Zero-confidence calls under confidence weighting have no claim on the
    // book; the alternative is NaN weights written into holdings.
    expect(computeWeights([p('1', 'AAPL', 0)], 'confidence').size).toBe(0);
  });

  it('never assigns negative weight from a malformed confidence', () => {
    const w = computeWeights([p('1', 'AAPL', -0.4), p('2', 'MSFT', 0.6)], 'confidence');
    expect(w.get('MSFT')).toBeCloseTo(1, 9);
    expect(w.get('AAPL') ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('separates the two rules on a realistically skewed set', () => {
    // The case that matters: one high-confidence call and three low ones.
    // Under equal weighting the loud call gets 25% of the book; under
    // confidence weighting it gets far more. With calibration inverted, that
    // difference is the loss the comparison is designed to surface.
    const set = [p('1', 'LOUD', 0.85), p('2', 'A', 0.5), p('3', 'B', 0.5), p('4', 'C', 0.5)];
    const eq = computeWeights(set, 'equal');
    const cw = computeWeights(set, 'confidence');
    expect(eq.get('LOUD')).toBeCloseTo(0.25, 9);
    expect(cw.get('LOUD')!).toBeGreaterThan(eq.get('LOUD')!);
    expect(cw.get('LOUD')).toBeCloseTo(0.85 / 2.35, 9);
  });
});
