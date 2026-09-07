/**
 * market-direction-grading.ts
 * Decides whether a directional prediction was right.
 *
 * ── The defect this replaces ──────────────────────────────────────────────
 *
 * verifyDirectional classified the actual move three ways against a ±1.5%
 * band, then graded the three prediction buckets by two different rules. A
 * 'flat' prediction was correct only if the move stayed inside the band. An
 * 'up' or 'down' prediction was correct on the SIGN alone:
 *
 *     } else if (directionCorrect && !strongMove) {
 *         wasCorrect = true;          // +0.2% counts as "up"
 *         gradedScore = 0.7;
 *     }
 *
 * So a +0.2% move made an 'up' call correct AND a 'flat' call correct. Two
 * mutually exclusive claims about one outcome, both scored right. That is not a
 * threshold that needs tuning, it is a contradiction: `was_correct` did not
 * describe the world, it described which bucket you had guessed.
 *
 * It also inflated the headline. Over the trusted window, 45 of 80 graded
 * up/down calls resolved on moves this same code classifies as flat, and 25 of
 * them scored correct — roughly half of all the correct directional grades on
 * record.
 *
 * The rule here is the obvious one: classify the move once, and a prediction is
 * correct when it names that class. Exactly one of {up, down, flat} is right
 * for any outcome. The partial credit that the old code smuggled into the
 * BINARY is preserved in `gradedScore`, where it belongs — nothing is lost,
 * it stops corrupting the measurement.
 *
 * ── Why the band scales with the horizon ──────────────────────────────────
 *
 * A single ±1.5% band cannot serve every horizon this system predicts over,
 * and the record shows it clearly. Measured across the trusted window:
 *
 *     horizon    n    mean |move|    landed "flat" under a fixed 1.5% band
 *      2 days    9       0.56%        9 of 9
 *      3 days   37       0.96%       29 of 37
 *     14 days   19       1.58%       10 of 19
 *     18 days    4       5.93%        0 of 4
 *
 * On a two- or three-day horizon almost nothing clears 1.5%, so a fixed band
 * silently converts short-horizon calls into unfalsifiable ones: the answer is
 * "flat" before the market opens. 64% of all outcomes classified flat, which
 * mechanically caps how accurate a directional forecaster can look.
 *
 * The band therefore scales as the square root of the horizon — the standard
 * diffusion scaling for price variance over time — anchored so that the
 * fourteen-day horizon keeps exactly today's 1.5%. Nothing about the reference
 * point is sacred; it is the value already in use, kept so this change is a fix
 * to the SHAPE of the band rather than a silent re-tuning of its level.
 *
 * This is a modelling choice and is labelled as one. Setting HORIZON_EXPONENT
 * to 0 restores a flat band at REFERENCE_BAND_PCT for every horizon.
 */

/** Horizon at which the band equals REFERENCE_BAND_PCT exactly. */
export const REFERENCE_HORIZON_DAYS = 14;

/** The band at the reference horizon, in percent. The pre-existing value. */
export const REFERENCE_BAND_PCT = 1.5;

/** 0.5 = square-root-of-time. 0 would restore a fixed band at every horizon. */
export const HORIZON_EXPONENT = 0.5;

/**
 * Bounds. A one-day call should still have to clear something, and a
 * year-ahead call should not need a 10% move to count as directional.
 */
export const MIN_BAND_PCT = 0.25;
export const MAX_BAND_PCT = 6.0;

/** Horizon assumed when a prediction does not record one. */
export const DEFAULT_HORIZON_DAYS = REFERENCE_HORIZON_DAYS;

export type Direction = 'up' | 'down' | 'flat';

/**
 * The move, in percent, that a prediction over `horizonDays` must clear to
 * count as directional rather than flat.
 */
export function flatBandPct(horizonDays: number | null | undefined): number {
  const days = Number.isFinite(horizonDays) && (horizonDays as number) > 0
    ? (horizonDays as number)
    : DEFAULT_HORIZON_DAYS;
  const scaled = REFERENCE_BAND_PCT * Math.pow(days / REFERENCE_HORIZON_DAYS, HORIZON_EXPONENT);
  return Math.min(MAX_BAND_PCT, Math.max(MIN_BAND_PCT, scaled));
}

/** Classify an observed move. This is the single source of "what happened". */
export function classifyMove(pctChange: number, horizonDays: number | null | undefined): Direction {
  const band = flatBandPct(horizonDays);
  if (pctChange > band) return 'up';
  if (pctChange < -band) return 'down';
  return 'flat';
}

export interface DirectionalGrade {
  /** What the market actually did, by the same rule for every bucket. */
  actualDirection: Direction;
  /** Correct exactly when the prediction named `actualDirection`. */
  wasCorrect: boolean;
  /** Partial credit, for reporting only — never for scoring. 0.0 to 1.0. */
  gradedScore: number;
  /** The band applied, so an explanation can state it. */
  bandPct: number;
}

/**
 * Grade one directional prediction.
 *
 * `wasCorrect` is a strict three-way match, so accuracy means the same thing in
 * every bucket and the three are comparable. `gradedScore` keeps the nuance the
 * old code put in the binary: a call that got the direction right but did not
 * clear the band is better than one that got the direction wrong, and both are
 * distinguishable from a clean hit — but neither is "correct".
 */
export function gradeDirectional(
  predictedDirection: Direction,
  pctChange: number,
  horizonDays: number | null | undefined,
): DirectionalGrade {
  const bandPct = flatBandPct(horizonDays);
  const actualDirection = classifyMove(pctChange, horizonDays);
  const wasCorrect = actualDirection === predictedDirection;

  let gradedScore: number;
  if (wasCorrect) {
    gradedScore = 1.0;
  } else if (predictedDirection === 'flat') {
    // Predicted no move; the market moved. Nearer misses score better: a move
    // just past the band is a closer call than one at several times it.
    gradedScore = Math.abs(pctChange) < bandPct * 2 ? 0.5 : 0.0;
  } else if (actualDirection === 'flat') {
    // Predicted a direction; the market did not move enough to have one. The
    // sign still says whether the lean was right.
    const signCorrect = (predictedDirection === 'up' && pctChange > 0)
      || (predictedDirection === 'down' && pctChange < 0);
    gradedScore = signCorrect ? 0.7 : 0.3;
  } else {
    // Predicted up and it fell, or predicted down and it rose. No credit.
    gradedScore = 0.0;
  }

  return { actualDirection, wasCorrect, gradedScore, bandPct };
}
