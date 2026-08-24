import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter } from '../../../server/db/database.js';
import {
  isClaimAlreadySettled,
  parseCloseThresholdClaim,
  parseCloseRangeClaim,
} from '../../../server/services/market-claim-parsers.js';
import {
  createCrossMetricValidator,
  FALSIFIABILITY_MARGIN_PCT,
} from '../../../server/services/market-cross-metric-validator.js';

/**
 * 2026-08-23: three of the first 33 graded predictions asked whether SPY
 * would close above 663-665 while SPY traded at 765-778 for the whole window.
 * Missing would have taken a 14% crash. All three graded CORRECT, and since
 * nothing downstream can tell them from real forecasts they lifted the hit
 * rate from 50.0% to 54.5% and pulled the Brier score down with them.
 *
 * These are the actual stored claim texts, checked against the actual spot
 * prices of those days.
 */

/** The real SPY closes over the window those three were written in. */
const SPY_SPOT = 765.10;

const REAL_TAUTOLOGIES = [
  'SPY-proxy closes at or above 665 on at least one session by 19 Aug 2026',
  'SPY posts a daily close above 665 on or before 2026-08-20',
  'SPY prints at least one daily close >= 663.00 by 2026-08-21',
];

/** A db double: one price row for SPY, nothing else. */
function dbWithSpot(price: number | null): DatabaseAdapter {
  return {
    get: async (sql: string) =>
      (sql.includes('market_price_normalized') && price !== null ? { close: price } : undefined),
    all: async () => [],
    run: async () => undefined,
  } as unknown as DatabaseAdapter;
}

describe('isClaimAlreadySettled', () => {
  it('rejects every claim that actually polluted the record', () => {
    for (const text of REAL_TAUTOLOGIES) {
      const verdict = isClaimAlreadySettled(text, SPY_SPOT);
      expect(verdict.trivial, text).toBe(true);
      expect(verdict.reason).toMatch(/already/);
    }
  });

  it('accepts the same claims when the threshold is genuinely out of reach', () => {
    // Same texts, but spot well BELOW the level — a real forecast.
    for (const text of REAL_TAUTOLOGIES) {
      expect(isClaimAlreadySettled(text, 600).trivial, text).toBe(false);
    }
  });

  it('honours the margin for a threshold spot has all but reached', () => {
    const text = 'SPY prints at least one daily close >= 663.00 by 2026-08-21';
    // 0.15% below the level: not yet true, but not a forecast either.
    expect(isClaimAlreadySettled(text, 662.0, 0).trivial).toBe(false);
    expect(isClaimAlreadySettled(text, 662.0, FALSIFIABILITY_MARGIN_PCT).trivial).toBe(true);
    // 5% below the level clears any sane margin.
    expect(isClaimAlreadySettled(text, 630, FALSIFIABILITY_MARGIN_PCT).trivial).toBe(false);
  });

  it('respects strict vs inclusive comparators at the exact level', () => {
    expect(parseCloseThresholdClaim('SPY closes above 663')?.inclusive).toBe(false);
    expect(parseCloseThresholdClaim('SPY closes at or above 663')?.inclusive).toBe(true);

    expect(isClaimAlreadySettled('SPY closes above 663', 663).trivial).toBe(false);
    expect(isClaimAlreadySettled('SPY closes at or above 663', 663).trivial).toBe(true);
  });

  it('declines to judge shapes that spot alone cannot settle', () => {
    // These depend on a window that has not happened yet.
    expect(isClaimAlreadySettled('XLE cumulative return is less than +1.5%', 90).trivial).toBe(false);
    expect(isClaimAlreadySettled('XLE minus SPY 3-day cumulative return < +2.0 percentage points', 90).trivial).toBe(false);
    expect(isClaimAlreadySettled('NVDA posts a daily move exceeding 2.5%', 900).trivial).toBe(false);
  });

  it('never blocks on a missing or nonsensical spot price', () => {
    const text = REAL_TAUTOLOGIES[0];
    expect(isClaimAlreadySettled(text, 0).trivial).toBe(false);
    expect(isClaimAlreadySettled(text, Number.NaN).trivial).toBe(false);
    expect(isClaimAlreadySettled(text, -5).trivial).toBe(false);
  });
});

describe('cross-metric validator — falsifiability gate', () => {
  const base = {
    targetSymbol: 'SPY',
    predictedDirection: 'up',
    confidence: 0.6,
    description: '',
    predictionType: 'price_target',
  };

  it('marks a claim already true at spot as unfalsifiable', async () => {
    const validator = await createCrossMetricValidator(dbWithSpot(SPY_SPOT));
    const r = await validator.validatePrediction({
      ...base,
      title: 'SPY closes above 663 within three trading days',
      predictedOutcome: 'SPY prints at least one daily close >= 663.00 by 2026-08-21',
    });
    expect(r.falsifiable).toBe(false);
    expect(r.falsifiabilityReason).toContain('SPY');
    expect(r.flags.some((f) => f.startsWith('UNFALSIFIABLE:'))).toBe(true);
  });

  it('passes the identical claim when spot is far below the level', async () => {
    const validator = await createCrossMetricValidator(dbWithSpot(600));
    const r = await validator.validatePrediction({
      ...base,
      title: 'SPY closes above 663 within three trading days',
      predictedOutcome: 'SPY prints at least one daily close >= 663.00 by 2026-08-21',
    });
    expect(r.falsifiable).toBe(true);
    expect(r.falsifiabilityReason).toBeUndefined();
  });

  it('reads the threshold out of predicted_outcome, not only the title', async () => {
    const validator = await createCrossMetricValidator(dbWithSpot(SPY_SPOT));
    const r = await validator.validatePrediction({
      ...base,
      // Title alone carries no number — this is the shape the pulse writes.
      title: 'SPY bounces off lower Bollinger band within three sessions',
      predictedOutcome: 'SPY posts a daily close above 665 on or before 2026-08-20',
    });
    expect(r.falsifiable).toBe(false);
  });

  it('does not block when the symbol has no price row', async () => {
    const validator = await createCrossMetricValidator(dbWithSpot(null));
    const r = await validator.validatePrediction({
      ...base,
      targetSymbol: 'NEWLY_FOLLOWED',
      title: 'NEWLY_FOLLOWED closes above 10',
      predictedOutcome: 'NEWLY_FOLLOWED prints at least one daily close >= 10.00',
    });
    // A missing spine is a different failure; blocking on it would silently
    // stop generation for every newly-followed instrument.
    expect(r.falsifiable).toBe(true);
  });

  it('leaves ordinary directional predictions alone', async () => {
    const validator = await createCrossMetricValidator(dbWithSpot(SPY_SPOT));
    const r = await validator.validatePrediction({
      ...base,
      predictionType: 'directional',
      title: 'SPY drifts lower into late August on war escalation',
      predictedOutcome: 'SPY closes the window below where it started',
    });
    expect(r.falsifiable).toBe(true);
  });
});

/**
 * 2026-08-24: a fourth claim shape turned up stuck. "All SPY closes through
 * 2026-08-24 are between 745 and 790" is a BAND claim — every close has to
 * stay inside a corridor, and one excursion breaks it however the week ends.
 * It carried predicted_direction 'flat', so grading it directionally would
 * have answered "did SPY go sideways", a different question with a different
 * answer.
 */
describe('parseCloseRangeClaim', () => {
  const REAL = 'All SPY closes through 2026-08-24 are between 745 and 790';

  it('parses the claim that actually sat ungraded', () => {
    expect(parseCloseRangeClaim(REAL)).toEqual({ low: 745, high: 790 });
  });

  it('accepts decimals and a dollar sign', () => {
    expect(parseCloseRangeClaim('SPY closes between $745.50 and $790.25'))
      .toEqual({ low: 745.5, high: 790.25 });
  });

  it('refuses a reversed or degenerate band', () => {
    expect(parseCloseRangeClaim('SPY closes between 790 and 745')).toBeNull();
    expect(parseCloseRangeClaim('SPY closes between 745 and 745')).toBeNull();
    expect(parseCloseRangeClaim('SPY closes between 0 and 790')).toBeNull();
  });

  it('leaves the negated phrasing alone rather than inverting it', () => {
    // "no daily close outside 745-790" means the same thing, but inverting a
    // negation is exactly where a mis-parse flips a grade.
    expect(parseCloseRangeClaim('SPY has no daily close outside 745-790')).toBeNull();
  });

  it('does not collide with the threshold shape', () => {
    const threshold = 'SPY prints at least one daily close >= 663.00';
    expect(parseCloseRangeClaim(threshold)).toBeNull();
    expect(parseCloseThresholdClaim(REAL)).toBeNull();
  });

  it('is not treated as already-settled from spot alone', () => {
    // A band claim is about closes that have not happened yet, so no spot
    // price can settle it at creation.
    expect(isClaimAlreadySettled(REAL, 765).trivial).toBe(false);
    expect(isClaimAlreadySettled(REAL, 900).trivial).toBe(false);
  });
});
