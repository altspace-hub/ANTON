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

/** Minimal db double: every getPriceAtDate query returns a row whose price_date
 *  is `priceDate`. Other reads are unused on the directional path. */
function dbWithPrice(priceDate: string, close = 100): DatabaseAdapter {
  return {
    get: async () => ({ close, price_date: priceDate }),
    all: async () => [],
    run: async () => undefined,
  } as unknown as DatabaseAdapter;
}

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
    const verifier = await createPredictionVerifier(dbWithPrice('2026-05-01', 110));
    // deadline within the staleness window of the price date
    const r = await verifier.verifyPrediction(directionalPred('2026-05-02') as never);
    expect(r.method).not.toBe('unverifiable');
  });

  it('refuses to grade against a price far older than the deadline (frozen feed)', async () => {
    // price frozen at 2026-05-01; deadline weeks later → gap >> staleness window
    const verifier = await createPredictionVerifier(dbWithPrice('2026-05-01', 110));
    const r = await verifier.verifyPrediction(directionalPred('2026-06-20') as never);
    expect(r.method).toBe('unverifiable');
    expect(r.actualOutcome).toMatch(/unverifiable|no price data/i);
  });
});
