import { describe, it, expect } from 'vitest';
import { createPredictionVerifier, PRICE_STALENESS_DAYS } from '../../../server/services/market-prediction-verifier.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

/**
 * 2026-07-17: getPriceAtDate must refuse to grade a prediction against a price
 * far older than the requested date (e.g. while MARKETS_FETCH_DISABLED freezes
 * the feed). Without the guard, a deadline after the freeze got the frozen price
 * stamped as its "end price" and was validated with a Brier score anyway —
 * corrupting the accuracy record. A stale price → method 'unverifiable' → the
 * caller leaves the prediction retriable instead of grading it.
 */

/**
 * Minimal db double over a seeded set of bars. It honours the two date
 * predicates the verifier actually issues — `price_date <= $2` (newest bar at
 * or before a date) and `price_date > $2` (next session) — because returning
 * one fixed row for every query makes the start and end bar identical, and a
 * zero-length window is a distinct case the verifier now refuses to grade.
 * Other reads are unused on the directional path.
 */
function dbWithBars(bars: Array<{ date: string; close: number }>): DatabaseAdapter {
  const sorted = [...bars].sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    get: async (sql: string, ..._params: unknown[]) => {
      const params = _params as string[];
      if (!sql.includes('market_price_normalized')) return undefined;
      const pivot = params[1];
      const row = sql.includes('price_date > $2')
        ? sorted.find(b => b.date > pivot)                       // next session
        : [...sorted].reverse().find(b => b.date <= pivot);      // at or before
      return row ? { close: row.close, price_date: row.date } : undefined;
    },
    all: async () => [],
    run: async () => undefined,
  } as unknown as DatabaseAdapter;
}

/** Single-bar shorthand for the staleness cases. */
const dbWithPrice = (priceDate: string, close = 100) => dbWithBars([{ date: priceDate, close }]);

const directionalPred = (deadline: string) => ({
  id: 'p1', title: 't', prediction_type: 'directional',
  target_symbol: 'AAPL', predicted_direction: 'up' as const,
  predicted_value: null, confidence: 0.8,
  created_at: '2026-04-15T00:00:00Z', deadline,
  verification_attempts: 0,
});

describe('prediction verifier — price staleness guard', () => {
  it('exports a positive staleness window', () => {
    expect(PRICE_STALENESS_DAYS).toBeGreaterThan(0);
  });

  it('grades a prediction when the price is fresh at the deadline', async () => {
    // Two distinct bars: one at creation, one within the staleness window of
    // the deadline. A single shared bar would be a zero-length window, which
    // is the separate (and now unverifiable) case covered below.
    const verifier = await createPredictionVerifier(dbWithBars([
      { date: '2026-04-15', close: 100 },
      { date: '2026-05-01', close: 110 },
    ]));
    const r = await verifier.verifyPrediction(directionalPred('2026-05-02') as never);
    expect(r.method).not.toBe('unverifiable');
    expect(r.wasCorrect).toBe(true); // +10% on an 'up' call
  });

  it('refuses to grade when start and end resolve to the same bar', async () => {
    // A deadline on a non-trading day resolves back onto the creation bar.
    // Grading that yields a guaranteed ~0.0% move — an automatic loss for any
    // directional call. It must stay retriable until a session actually trades.
    const verifier = await createPredictionVerifier(dbWithBars([
      { date: '2026-04-15', close: 100 },
    ]));
    const r = await verifier.verifyPrediction(directionalPred('2026-04-18') as never);
    expect(r.method).toBe('unverifiable');
    expect(r.actualOutcome).toMatch(/no trading session/i);
  });

  it('refuses to grade against a price far older than the deadline (frozen feed)', async () => {
    // price frozen at 2026-05-01; deadline weeks later → gap >> staleness window
    const verifier = await createPredictionVerifier(dbWithPrice('2026-05-01', 110));
    const r = await verifier.verifyPrediction(directionalPred('2026-06-20') as never);
    expect(r.method).toBe('unverifiable');
    expect(r.actualOutcome).toMatch(/unverifiable|no price data/i);
  });
});
