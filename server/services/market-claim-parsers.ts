/**
 * market-claim-parsers.ts
 * Pure parsers for the quantified claim shapes a market prediction can take.
 *
 * These have two callers and both matter:
 *   • the verifier, which uses them to settle a claim from prices instead of
 *     asking a model to judge it;
 *   • the falsifiability guard at creation, which uses them to reject a claim
 *     the spot price has ALREADY satisfied.
 *
 * Keeping one implementation for both is the point. A claim the grader can
 * settle is exactly a claim the guard can check, and if the two ever drifted
 * apart the guard would wave through shapes the grader later scores as free
 * wins — which is the failure it exists to prevent.
 *
 * Parsing stays deliberately narrow. A mis-parse produces a confident WRONG
 * answer at both ends: a fabricated grade in the accuracy record, or a real
 * forecast thrown away as trivial. Anything ambiguous returns null, and the
 * caller falls back to its slower, safer path.
 */

/** Comparator direction shared by the threshold shapes. */
export type ClaimComparator = 'lt' | 'gt';

export interface CloseThresholdClaim { thresholdPrice: number; inclusive: boolean }
export interface CumulativeReturnClaim { comparator: ClaimComparator; thresholdPct: number }
export interface RelativeSpreadClaim {
  symbolA: string; symbolB: string; comparator: ClaimComparator; thresholdPct: number;
}

const NEGATION = /\b(?:does\s+not|doesn'?t|won'?t|will\s+not|never|fails?\s+to)\b/i;
const LT_WORDS = /^(?:less\s+than|below|under|<)$/i;

/**
 * "NVDA posts a daily move exceeding 2.5% within three sessions"
 *
 * Only an unambiguous "<move> <comparator> <N>%" phrasing matches.
 */
export function parseDailyMoveClaim(text: string): { thresholdPct: number } | null {
  const m = /\b(?:daily\s+)?(?:move|swing|change|gain|drop)\s+(?:of\s+)?(?:exceeding|greater\s+than|more\s+than|larger\s+than|above|over|at\s+least)\s+\$?(\d+(?:\.\d+)?)\s*%/i.exec(text);
  if (!m) return null;
  const thresholdPct = Number(m[1]);
  if (!Number.isFinite(thresholdPct) || thresholdPct <= 0 || thresholdPct > 100) return null;
  return { thresholdPct };
}

/**
 * "SPY prints at least one daily close >= 663.00 by 2026-08-21"
 *
 * Negated phrasings ("does not close above 665") invert the claim and are
 * refused rather than graded backwards.
 */
export function parseCloseThresholdClaim(text: string): CloseThresholdClaim | null {
  if (NEGATION.test(text)) return null;
  const m = /\bclos(?:es|ed|ing|e)\b[^.]{0,40}?(at\s+or\s+above|greater\s+than\s+or\s+equal\s+to|>=|at\s+least|above|over)\s*\$?(\d+(?:\.\d+)?)/i.exec(text);
  if (!m) return null;
  const thresholdPrice = Number(m[2]);
  if (!Number.isFinite(thresholdPrice) || thresholdPrice <= 0) return null;
  // "above"/"over" are strict; "at or above", ">=", "at least" include the level.
  const inclusive = !/^(?:above|over)$/i.test(m[1].trim());
  return { thresholdPrice, inclusive };
}

/**
 * "XLE cumulative return from 2026-08-17 close to 2026-08-20 close is less than +1.5%"
 *
 * Refuses anything containing "minus": that is the two-symbol spread shape,
 * which also contains the words "cumulative return".
 */
export function parseCumulativeReturnClaim(text: string): CumulativeReturnClaim | null {
  if (/\bminus\b/i.test(text)) return null;
  const m = /\bcumulative\s+return\b[^.]{0,80}?(?:is\s+)?(less\s+than|below|under|<|greater\s+than|more\s+than|above|exceeds?|>)\s*\+?(-?\d+(?:\.\d+)?)\s*%/i.exec(text);
  if (!m) return null;
  const thresholdPct = Number(m[2]);
  if (!Number.isFinite(thresholdPct)) return null;
  return { comparator: LT_WORDS.test(m[1].trim()) ? 'lt' : 'gt', thresholdPct };
}

/**
 * "XLE minus SPY 3-day cumulative return < +2.0 percentage points"
 *
 * Carries its own two symbols, so it does not depend on target_symbol.
 */
export function parseRelativeSpreadClaim(text: string): RelativeSpreadClaim | null {
  const m = /\b([A-Z][A-Z0-9.\-]{0,5})\s+minus\s+([A-Z][A-Z0-9.\-]{0,5})\b[^.]{0,60}?cumulative\s+return\b\s*(?:is\s+)?(less\s+than|below|under|<|greater\s+than|more\s+than|above|exceeds?|>)\s*\+?(-?\d+(?:\.\d+)?)\s*(?:percentage\s+points?|pp\b|%)/i.exec(text);
  if (!m) return null;
  const thresholdPct = Number(m[4]);
  if (!Number.isFinite(thresholdPct)) return null;
  return {
    symbolA: m[1].toUpperCase(),
    symbolB: m[2].toUpperCase(),
    comparator: LT_WORDS.test(m[3].trim()) ? 'lt' : 'gt',
    thresholdPct,
  };
}

/**
 * Is this claim already true at the price it was written against?
 *
 * 2026-08-23: three of the first 33 graded predictions asked whether SPY
 * would close above 663-665 while SPY traded at 765-778. Missing would have
 * taken a 14% crash. All three graded CORRECT, and because they are
 * indistinguishable from real forecasts downstream they lifted the hit rate
 * from 50.0% to 54.5% on their own.
 *
 * Only the close-threshold shape is checkable from spot alone — a cumulative
 * return or a spread depends on a window that has not happened yet, so those
 * return false (not trivial) rather than guessing.
 *
 * `marginPct` is the room the price must still have to travel. A claim the
 * spot already satisfies is trivial at any margin; one needing less than
 * `marginPct` of movement is close enough to it to be worth refusing too.
 */
export function isClaimAlreadySettled(
  text: string, spotPrice: number, marginPct = 0,
): { trivial: boolean; reason?: string } {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) return { trivial: false };

  const close = parseCloseThresholdClaim(text);
  if (!close) return { trivial: false };

  const satisfied = close.inclusive
    ? spotPrice >= close.thresholdPrice
    : spotPrice > close.thresholdPrice;
  if (satisfied) {
    return {
      trivial: true,
      reason: `spot ${spotPrice.toFixed(2)} already ${close.inclusive ? '>=' : '>'} the ${close.thresholdPrice.toFixed(2)} threshold`,
    };
  }

  // Not yet satisfied, but within a whisker of it.
  if (marginPct > 0) {
    const gapPct = ((close.thresholdPrice - spotPrice) / spotPrice) * 100;
    if (gapPct < marginPct) {
      return {
        trivial: true,
        reason: `spot ${spotPrice.toFixed(2)} is only ${gapPct.toFixed(2)}% below the ${close.thresholdPrice.toFixed(2)} threshold (under the ${marginPct}% margin)`,
      };
    }
  }

  return { trivial: false };
}
