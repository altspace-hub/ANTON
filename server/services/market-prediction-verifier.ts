/**
 * market-prediction-verifier.ts
 * Auto-verifies expired predictions against actual market data.
 *
 * Verification strategies:
 * - Directional: compare predicted_direction with actual price movement
 * - Price target: compare predicted_value with actual price
 * - Binary/event: use LLM to verify against recent atoms and news
 *
 * Predictions are verified, Brier scored, and feedback records created.
 */

import type { DatabaseAdapter } from '../db/database.js';

interface ExpiredPrediction {
  id: string;
  title: string;
  prediction_type: string;
  target_symbol: string | null;
  predicted_direction: string | null;
  predicted_outcome: string;
  predicted_value: number | null;
  confidence: number;
  deadline: string;
  created_at: string;
  thesis_id: string | null;
  verification_attempts?: number;
}

/**
 * Max retry attempts before permanently stamping status='expired'.
 * Exported so market-loop-health can exclude retry-exhausted (permanently
 * unverifiable) predictions from the pending backlog with the SAME constant.
 */
export const MAX_VERIFICATION_ATTEMPTS = 3;
/** Gap between retries once a prediction has been tried at least once. */
const RETRY_BACKOFF_DAYS = 7;
/** Max age (days) a price row may be relative to the requested date before it's
 *  considered too stale to grade a prediction against (≈5 trading days). Guards
 *  against validating predictions with a feed frozen by MARKETS_FETCH_DISABLED. */
export const PRICE_STALENESS_DAYS = 7;

/**
 * Below this self-reported confidence an LLM verification is treated as no
 * answer at all. Pairs with the insufficientEvidence flag: the flag catches an
 * honest model, the floor catches a confidently-vague one.
 */
export const LLM_VERIFICATION_MIN_CONFIDENCE = 0.5;

interface VerificationResult {
  predictionId: string;
  wasCorrect: boolean;
  actualOutcome: string;
  actualValue: number | null;
  method: 'auto_price' | 'auto_llm' | 'unverifiable';
  verificationConfidence: number;
  explanation: string;
  gradedScore?: number; // 0.0-1.0 grading curve (partial credit for close predictions)
}

export async function createPredictionVerifier(db: DatabaseAdapter) {

  /**
   * Find all active predictions past their effective deadline. Includes:
   *   • Explicit deadlines in the past (original behaviour).
   *   • Null deadlines whose (created_at + time_horizon_days) window has
   *     elapsed — otherwise these predictions sit as 'active' forever and
   *     never enter the closed loop.
   *   • Predictions previously marked 'expired' (unverifiable) that are
   *     eligible for retry: under MAX_VERIFICATION_ATTEMPTS and last tried
   *     ≥ RETRY_BACKOFF_DAYS ago (price data may have backfilled since).
   */
  async function findExpired(): Promise<ExpiredPrediction[]> {
    // NOTE on types: `deadline` is TIMESTAMPTZ (migrations 105/106). The old
    // query COALESCEd it with a TO_CHAR(...) TEXT branch, which PostgreSQL
    // rejects ("COALESCE types timestamptz and text cannot be matched") — that
    // crash killed the entire verify leg since 2026-04-18. Both COALESCE
    // branches are now timestamptz; the result is rendered to 'YYYY-MM-DD'
    // TEXT only at the top of the SELECT (downstream price lookups expect a
    // date string). All comparisons are against NOW() / timestamptz params.
    const backoffCutoff = new Date(Date.now() - RETRY_BACKOFF_DAYS * 86400000).toISOString();
    return db.all<ExpiredPrediction>(`
      SELECT id, title, prediction_type, target_symbol, predicted_direction,
             predicted_outcome, predicted_value, confidence,
             TO_CHAR(
               COALESCE(deadline, created_at + (COALESCE(time_horizon_days, 30) || ' days')::interval),
               'YYYY-MM-DD'
             ) AS deadline,
             created_at, thesis_id, verification_attempts
      FROM market_predictions
      WHERE (
          status = 'active'
          AND COALESCE(deadline, created_at + (COALESCE(time_horizon_days, 30) || ' days')::interval) < NOW()
        )
        OR (
          status = 'expired' AND was_correct IS NULL
          AND verification_attempts < ${MAX_VERIFICATION_ATTEMPTS}
          AND (last_verification_attempt_at IS NULL OR last_verification_attempt_at < $1)
        )
      ORDER BY deadline ASC
    `, backoffCutoff);
  }

  /**
   * Find predictions expiring within the next N days (for visibility/logging).
   */
  async function findNearExpiry(daysAhead = 2): Promise<ExpiredPrediction[]> {
    // Same timestamptz hygiene as findExpired: compare the TIMESTAMPTZ
    // deadline against NOW()-derived bounds, render to TEXT only on output.
    const days = Math.max(0, Math.floor(daysAhead));
    return db.all<ExpiredPrediction>(`
      SELECT id, title, prediction_type, target_symbol, predicted_direction,
             predicted_outcome, predicted_value, confidence,
             TO_CHAR(deadline, 'YYYY-MM-DD') AS deadline,
             created_at, thesis_id
      FROM market_predictions
      WHERE status = 'active' AND deadline IS NOT NULL
        AND deadline >= NOW() AND deadline < NOW() + ($1 || ' days')::interval
      ORDER BY deadline ASC
    `, days);
  }

  /**
   * Get price at a specific date (or the closest earlier available price),
   * subject to a staleness bound.
   *
   * 2026-07-17: the old version returned the latest price with price_date <=
   * date and NO staleness check. While MARKETS_FETCH_DISABLED freezes the feed
   * (prices stuck at 2026-05-01), any prediction whose deadline falls AFTER the
   * freeze got that frozen price stamped as its "end price" and was validated
   * with a Brier score anyway — silently corrupting the very accuracy/calibration
   * record the pillar exists to produce. Now, if the best available price is
   * more than PRICE_STALENESS_DAYS older than the requested date, we return null.
   * The caller treats null as unverifiable → the prediction stays 'expired'
   * (retriable) instead of being graded against stale data.
   */
  async function getPriceAtDate(
    symbol: string, date: string, maxStalenessDays = PRICE_STALENESS_DAYS,
  ): Promise<number | null> {
    return (await getBarAtDate(symbol, date, maxStalenessDays))?.close ?? null;
  }

  /** getPriceAtDate, but keeping the date of the bar actually used. */
  async function getBarAtDate(
    symbol: string, date: string, maxStalenessDays = PRICE_STALENESS_DAYS,
  ): Promise<{ close: number; priceDate: string } | null> {
    const row = await db.get<{ close: number; price_date: string }>(
      `SELECT close, price_date FROM market_price_normalized
       WHERE symbol = $1 AND price_date <= $2
       ORDER BY price_date DESC LIMIT 1`,
      symbol, date
    );
    if (!row) return null;
    const gapMs = new Date(date).getTime() - new Date(row.price_date).getTime();
    if (Number.isFinite(gapMs) && gapMs > maxStalenessDays * 86_400_000) return null;
    return { close: row.close, priceDate: String(row.price_date).slice(0, 10) };
  }

  /**
   * First bar on or AFTER `date` — the next trading session.
   *
   * Needed because a deadline can land on a day the market never traded. A
   * Sunday deadline resolves backwards to Friday's close, and when the
   * prediction was itself made on that Friday the start and end bars are the
   * same row: a zero-length window that scores every directional call as a
   * ~0.0% move, i.e. an automatic loss no forecast could avoid. The tactical
   * band (1-3 day horizons) puts deadlines on weekends routinely, so this is
   * not an edge case — it silently biased the accuracy record downward.
   */
  async function getBarAtOrAfter(
    symbol: string, date: string, maxWaitDays = PRICE_STALENESS_DAYS,
  ): Promise<{ close: number; priceDate: string } | null> {
    const row = await db.get<{ close: number; price_date: string }>(
      `SELECT close, price_date FROM market_price_normalized
       WHERE symbol = $1 AND price_date > $2
       ORDER BY price_date ASC LIMIT 1`,
      symbol, date
    );
    if (!row) return null;
    const gapMs = new Date(row.price_date).getTime() - new Date(date).getTime();
    if (Number.isFinite(gapMs) && gapMs > maxWaitDays * 86_400_000) return null;
    return { close: row.close, priceDate: String(row.price_date).slice(0, 10) };
  }

  /**
   * Get the latest available price for a symbol.
   */
  async function getLatestPrice(symbol: string): Promise<number | null> {
    const row = await db.get<{ close: number }>(
      `SELECT close FROM market_price_normalized
       WHERE symbol = $1
       ORDER BY price_date DESC LIMIT 1`,
      symbol
    );
    return row?.close ?? null;
  }

  /**
   * Verify a directional prediction (up/down/flat) against actual price movement.
   */
  async function verifyDirectional(pred: ExpiredPrediction): Promise<VerificationResult> {
    if (!pred.target_symbol || !pred.predicted_direction) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable — no symbol or direction', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'Missing target symbol or predicted direction' };
    }

    // Bars at prediction creation and at the deadline.
    const createdDate = new Date(pred.created_at).toISOString().split('T')[0];
    const startBar = await getBarAtDate(pred.target_symbol, createdDate);
    let endBar = await getBarAtDate(pred.target_symbol, pred.deadline);

    // A deadline on a non-trading day resolves backwards, which can land on the
    // very bar the prediction started from — a zero-length window that grades
    // every directional call as ~0.0%. When that happens, roll forward to the
    // first session after the deadline: the market's next actual answer.
    if (startBar && endBar && endBar.priceDate <= startBar.priceDate) {
      const rolled = await getBarAtOrAfter(pred.target_symbol, pred.deadline);
      // Keep the original bar when nothing has traded yet, so the degenerate
      // check below reports *why* rather than the generic "no price data".
      if (rolled) endBar = rolled;
    }

    if (!startBar || !endBar) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable — no price data', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: `No price data for ${pred.target_symbol} at ${createdDate} or ${pred.deadline}` };
    }

    // Still degenerate: the deadline has passed but no session has traded since
    // the prediction was made. Leave it 'expired' and retriable rather than
    // stamping a fabricated 0.0% on the accuracy record.
    if (endBar.priceDate <= startBar.priceDate) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable — no trading session in window', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: `${pred.target_symbol}: no session between ${startBar.priceDate} and deadline ${pred.deadline} — awaiting the next close` };
    }

    const startPrice = startBar.close;
    const endPrice = endBar.close;

    const pctChange = ((endPrice - startPrice) / startPrice) * 100;
    const absPctChange = Math.abs(pctChange);
    const flatThreshold = 1.5; // ±1.5% considered "flat" (was 3% — too aggressive)

    let actualDirection: string;
    if (pctChange > flatThreshold) actualDirection = 'up';
    else if (pctChange < -flatThreshold) actualDirection = 'down';
    else actualDirection = 'flat';

    // Grading curve: directional predictions get partial/full credit
    // instead of binary correct/wrong
    let wasCorrect: boolean;
    let gradedScore: number; // 0.0 to 1.0

    if (pred.predicted_direction === 'flat') {
      // Flat prediction: correct if within threshold
      wasCorrect = actualDirection === 'flat';
      gradedScore = wasCorrect ? 1.0 : (absPctChange < 3 ? 0.5 : 0.0);
    } else {
      // Directional prediction (up/down)
      const directionCorrect = (pred.predicted_direction === 'up' && pctChange > 0)
                            || (pred.predicted_direction === 'down' && pctChange < 0);
      const strongMove = absPctChange > flatThreshold;

      if (directionCorrect && strongMove) {
        // Clear correct direction + beyond threshold
        wasCorrect = true;
        gradedScore = 1.0;
      } else if (directionCorrect && !strongMove) {
        // Correct direction but small move (within flat zone)
        // Partial credit — direction was right, magnitude was weak
        wasCorrect = true;
        gradedScore = 0.7;
      } else if (!directionCorrect && absPctChange <= flatThreshold) {
        // Wrong direction but move was negligible (essentially flat)
        // Slight penalty — call was wrong but barely
        wasCorrect = false;
        gradedScore = 0.3;
      } else {
        // Wrong direction with clear move
        wasCorrect = false;
        gradedScore = 0.0;
      }
    }

    const explanation = `${pred.target_symbol}: ${startPrice.toFixed(2)} → ${endPrice.toFixed(2)} (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%) over ${startBar.priceDate}→${endBar.priceDate}. Predicted: ${pred.predicted_direction}, Actual: ${actualDirection}. Grade: ${(gradedScore * 100).toFixed(0)}%`;

    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `${actualDirection} (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)`,
      actualValue: endPrice,
      method: 'auto_price',
      verificationConfidence: 0.9,
      explanation,
      gradedScore, // Used for Brier score calculation
    };
  }

  /**
   * Verify a price target prediction.
   */
  async function verifyPriceTarget(pred: ExpiredPrediction): Promise<VerificationResult> {
    // A price_target row often carries its threshold only in the claim text
    // ("SPY prints at least one daily close >= 663.00") with predicted_value
    // left NULL. Those failed as "Missing symbol or target value" on every
    // retry until the attempt cap, so SPY price targets were never graded.
    // Parse the level out of the text before giving up.
    //
    // Deliberately NOT a directional fallback: "closes above 663" and "goes
    // up" are different claims. SPY can rise 0.5% (direction correct) without
    // ever printing 663 (claim false), so grading one as the other would put
    // a confident wrong answer into the accuracy record.
    if (!pred.predicted_value) {
      const deterministic = await verifyDeterministicClaim(pred);
      if (deterministic) return deterministic;
    }
    if (!pred.target_symbol || !pred.predicted_value) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'Missing symbol or target value' };
    }

    const actualPrice = await getPriceAtDate(pred.target_symbol, pred.deadline);
    if (!actualPrice) {
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'No price data', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: `No price data for ${pred.target_symbol}` };
    }

    const errorPct = Math.abs((actualPrice - pred.predicted_value) / pred.predicted_value) * 100;
    const wasCorrect = errorPct <= 10; // Within 10% = correct

    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `Actual: $${actualPrice.toFixed(2)} vs predicted: $${pred.predicted_value.toFixed(2)} (${errorPct.toFixed(1)}% error)`,
      actualValue: actualPrice,
      method: 'auto_price',
      verificationConfidence: 0.9,
      explanation: `Price target ${wasCorrect ? 'hit' : 'missed'}: predicted $${pred.predicted_value.toFixed(2)}, actual $${actualPrice.toFixed(2)} (${errorPct.toFixed(1)}% off)`,
    };
  }

  /**
   * A binary prediction that quantifies a price move is arithmetic, not a
   * judgement call — and routing it to the LLM produced exactly the failure
   * this guards against: on 2026-08-19 "NVDA posts a daily move exceeding
   * 2.5% within three sessions" was graded CORRECT from base rates ("NVDA's
   * realized volatility routinely produces 2.5%+ daily swings"), while the
   * actual largest move in the window was -1.94%. The price data needed to
   * settle it was in the same database the whole time.
   *
   * Parsing stays deliberately narrow: a mis-parse would silently produce a
   * confident WRONG deterministic grade, which is worse than deferring. Only
   * an unambiguous "<move> <comparator> <N>%" phrasing matches; everything
   * else returns null and falls through to the LLM path (which now refuses to
   * answer without evidence).
   */
  function parseDailyMoveClaim(text: string): { thresholdPct: number } | null {
    const m = /\b(?:daily\s+)?(?:move|swing|change|gain|drop)\s+(?:of\s+)?(?:exceeding|greater\s+than|more\s+than|larger\s+than|above|over|at\s+least)\s+\$?(\d+(?:\.\d+)?)\s*%/i.exec(text);
    if (!m) return null;
    const thresholdPct = Number(m[1]);
    if (!Number.isFinite(thresholdPct) || thresholdPct <= 0 || thresholdPct > 100) return null;
    return { thresholdPct };
  }

  /** Closes for a symbol across a window, one row per session, oldest first. */
  async function getCloses(
    symbol: string, fromDate: string, toDate: string,
  ): Promise<Array<{ priceDate: string; close: number }>> {
    // DISTINCT ON: the same symbol/day arrives from more than one feed, and a
    // duplicate row would fabricate a 0% session between the real ones.
    const rows = await db.all<{ price_date: string; close: number }>(
      `SELECT DISTINCT ON (price_date) price_date, close
         FROM market_price_normalized
        WHERE symbol = $1 AND price_date >= $2 AND price_date <= $3
        ORDER BY price_date ASC, created_at DESC`,
      symbol, fromDate, toDate
    );
    return rows.map(r => ({ priceDate: String(r.price_date).slice(0, 10), close: Number(r.close) }));
  }

  /**
   * Settle a quantified move claim from prices. Returns null when the claim
   * is not of that shape or the window holds too few sessions to judge it.
   */
  async function verifyQuantifiedMove(pred: ExpiredPrediction): Promise<VerificationResult | null> {
    if (!pred.target_symbol) return null;
    const claim = parseDailyMoveClaim(`${pred.title} ${pred.predicted_outcome ?? ''}`);
    if (!claim) return null;

    const from = new Date(pred.created_at).toISOString().split('T')[0];
    const closes = await getCloses(pred.target_symbol, from, pred.deadline);
    // Two closes are the minimum for one session-over-session move.
    if (closes.length < 2) return null;

    let maxAbsMove = 0;
    let onDate = closes[0].priceDate;
    for (let i = 1; i < closes.length; i++) {
      const prev = closes[i - 1].close;
      if (!prev) continue;
      const move = Math.abs((closes[i].close - prev) / prev) * 100;
      if (move > maxAbsMove) { maxAbsMove = move; onDate = closes[i].priceDate; }
    }

    const wasCorrect = maxAbsMove > claim.thresholdPct;
    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `largest daily move ${maxAbsMove.toFixed(2)}% vs ${claim.thresholdPct}% threshold`,
      actualValue: null,
      method: 'auto_price',
      verificationConfidence: 0.95,
      explanation: `${pred.target_symbol}: largest session move over ${closes[0].priceDate}→${closes[closes.length - 1].priceDate} was ${maxAbsMove.toFixed(2)}% (on ${onDate}) against a ${claim.thresholdPct}% threshold — claim ${wasCorrect ? 'met' : 'not met'}. Settled from ${closes.length} closes, no LLM.`,
      gradedScore: wasCorrect ? 1.0 : 0.0,
    };
  }

  /**
   * Parse a "closes above N" / "prints at least one daily close >= N" claim.
   *
   * Same narrow-match discipline as parseDailyMoveClaim. Negated phrasings
   * ("does not close above 665") invert the claim, so they are refused
   * outright rather than graded backwards — deferring beats a confident
   * wrong answer.
   */
  function parseCloseThresholdClaim(text: string): { thresholdPrice: number; inclusive: boolean } | null {
    if (/\b(?:does\s+not|doesn'?t|won'?t|will\s+not|never|fails?\s+to)\b/i.test(text)) return null;
    const m = /\bclos(?:es|ed|ing|e)\b[^.]{0,40}?(at\s+or\s+above|greater\s+than\s+or\s+equal\s+to|>=|at\s+least|above|over)\s*\$?(\d+(?:\.\d+)?)/i.exec(text);
    if (!m) return null;
    const thresholdPrice = Number(m[2]);
    if (!Number.isFinite(thresholdPrice) || thresholdPrice <= 0) return null;
    // "above"/"over" are strict; "at or above", ">=", "at least" include the level.
    const inclusive = !/^(?:above|over)$/i.test(m[1].trim());
    return { thresholdPrice, inclusive };
  }

  /**
   * Parse a "<cumulative return> <comparator> N%" claim.
   *
   * Refuses anything containing "minus": that is the two-symbol spread shape
   * below, which also contains the words "cumulative return". Grading a
   * spread claim as a single-symbol return answers a different question.
   */
  function parseCumulativeReturnClaim(text: string): { comparator: 'lt' | 'gt'; thresholdPct: number } | null {
    if (/\bminus\b/i.test(text)) return null;
    const m = /\bcumulative\s+return\b[^.]{0,80}?(?:is\s+)?(less\s+than|below|under|<|greater\s+than|more\s+than|above|exceeds?|>)\s*\+?(-?\d+(?:\.\d+)?)\s*%/i.exec(text);
    if (!m) return null;
    const thresholdPct = Number(m[2]);
    if (!Number.isFinite(thresholdPct)) return null;
    const comparator = /^(?:less\s+than|below|under|<)$/i.test(m[1].trim()) ? 'lt' : 'gt';
    return { comparator, thresholdPct };
  }

  /**
   * Parse an "A minus B <n>-day cumulative return < N percentage points" claim.
   * Carries its own two symbols, so it does not depend on target_symbol.
   */
  function parseRelativeSpreadClaim(
    text: string,
  ): { symbolA: string; symbolB: string; comparator: 'lt' | 'gt'; thresholdPct: number } | null {
    const m = /\b([A-Z][A-Z0-9.\-]{0,5})\s+minus\s+([A-Z][A-Z0-9.\-]{0,5})\b[^.]{0,60}?cumulative\s+return\b\s*(?:is\s+)?(less\s+than|below|under|<|greater\s+than|more\s+than|above|exceeds?|>)\s*\+?(-?\d+(?:\.\d+)?)\s*(?:percentage\s+points?|pp\b|%)/i.exec(text);
    if (!m) return null;
    const thresholdPct = Number(m[4]);
    if (!Number.isFinite(thresholdPct)) return null;
    const comparator = /^(?:less\s+than|below|under|<)$/i.test(m[3].trim()) ? 'lt' : 'gt';
    return { symbolA: m[1].toUpperCase(), symbolB: m[2].toUpperCase(), comparator, thresholdPct };
  }

  /** Cumulative return first close → last close, in percent. */
  function cumulativeReturnPct(closes: Array<{ close: number }>): number | null {
    if (closes.length < 2) return null;
    const first = closes[0].close;
    const last = closes[closes.length - 1].close;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }

  /** The text a claim parser reads: the machine-written outcome, then the title. */
  function claimText(pred: ExpiredPrediction): string {
    return `${pred.predicted_outcome ?? ''} ${pred.title}`;
  }

  /** Settle a "highest close vs a price level" claim from prices. */
  async function verifyCloseThreshold(pred: ExpiredPrediction): Promise<VerificationResult | null> {
    if (!pred.target_symbol) return null;
    const claim = parseCloseThresholdClaim(claimText(pred));
    if (!claim) return null;

    const created = new Date(pred.created_at).toISOString().split('T')[0];
    const closes = await getCloses(pred.target_symbol, created, pred.deadline);
    // The creation-day close was already on the tape when the call was made,
    // so it cannot satisfy a forecast. Only later sessions count.
    const candidates = closes.filter(c => c.priceDate > created);
    if (candidates.length === 0) return null;

    let maxClose = candidates[0].close;
    let onDate = candidates[0].priceDate;
    for (const c of candidates) {
      if (c.close > maxClose) { maxClose = c.close; onDate = c.priceDate; }
    }

    const op = claim.inclusive ? '>=' : '>';
    const wasCorrect = claim.inclusive
      ? maxClose >= claim.thresholdPrice
      : maxClose > claim.thresholdPrice;
    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `highest close ${maxClose.toFixed(2)} vs ${op} ${claim.thresholdPrice.toFixed(2)}`,
      actualValue: maxClose,
      method: 'auto_price',
      verificationConfidence: 0.95,
      explanation: `${pred.target_symbol}: highest close over ${candidates[0].priceDate}→${candidates[candidates.length - 1].priceDate} was ${maxClose.toFixed(2)} (on ${onDate}) against ${op} ${claim.thresholdPrice.toFixed(2)} — claim ${wasCorrect ? 'met' : 'not met'}. Settled from ${candidates.length} closes, no LLM.`,
      gradedScore: wasCorrect ? 1.0 : 0.0,
    };
  }

  /** Settle a single-symbol cumulative-return threshold claim from prices. */
  async function verifyCumulativeReturn(pred: ExpiredPrediction): Promise<VerificationResult | null> {
    if (!pred.target_symbol) return null;
    const claim = parseCumulativeReturnClaim(claimText(pred));
    if (!claim) return null;

    const created = new Date(pred.created_at).toISOString().split('T')[0];
    const closes = await getCloses(pred.target_symbol, created, pred.deadline);
    const actualPct = cumulativeReturnPct(closes);
    if (actualPct === null) return null;

    const op = claim.comparator === 'lt' ? '<' : '>';
    const wasCorrect = claim.comparator === 'lt'
      ? actualPct < claim.thresholdPct
      : actualPct > claim.thresholdPct;
    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `cumulative return ${actualPct >= 0 ? '+' : ''}${actualPct.toFixed(2)}% vs ${op} ${claim.thresholdPct}%`,
      actualValue: closes[closes.length - 1].close,
      method: 'auto_price',
      verificationConfidence: 0.95,
      explanation: `${pred.target_symbol}: cumulative return over ${closes[0].priceDate}→${closes[closes.length - 1].priceDate} was ${actualPct >= 0 ? '+' : ''}${actualPct.toFixed(2)}% against ${op} ${claim.thresholdPct}% — claim ${wasCorrect ? 'met' : 'not met'}. Settled from ${closes.length} closes, no LLM.`,
      gradedScore: wasCorrect ? 1.0 : 0.0,
    };
  }

  /** Settle an "A minus B cumulative return" spread claim from prices. */
  async function verifyRelativeSpread(pred: ExpiredPrediction): Promise<VerificationResult | null> {
    const claim = parseRelativeSpreadClaim(claimText(pred));
    if (!claim) return null;

    const created = new Date(pred.created_at).toISOString().split('T')[0];
    const [closesA, closesB] = await Promise.all([
      getCloses(claim.symbolA, created, pred.deadline),
      getCloses(claim.symbolB, created, pred.deadline),
    ]);
    const retA = cumulativeReturnPct(closesA);
    const retB = cumulativeReturnPct(closesB);
    if (retA === null || retB === null) return null;

    const spread = retA - retB;
    const op = claim.comparator === 'lt' ? '<' : '>';
    const wasCorrect = claim.comparator === 'lt'
      ? spread < claim.thresholdPct
      : spread > claim.thresholdPct;
    return {
      predictionId: pred.id,
      wasCorrect,
      actualOutcome: `${claim.symbolA}-${claim.symbolB} spread ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}pp vs ${op} ${claim.thresholdPct}pp`,
      actualValue: null,
      method: 'auto_price',
      verificationConfidence: 0.95,
      explanation: `${claim.symbolA} ${retA >= 0 ? '+' : ''}${retA.toFixed(2)}% minus ${claim.symbolB} ${retB >= 0 ? '+' : ''}${retB.toFixed(2)}% = ${spread >= 0 ? '+' : ''}${spread.toFixed(2)}pp over ${closesA[0].priceDate}→${closesA[closesA.length - 1].priceDate}, against ${op} ${claim.thresholdPct}pp — claim ${wasCorrect ? 'met' : 'not met'}. Settled from prices, no LLM.`,
      gradedScore: wasCorrect ? 1.0 : 0.0,
    };
  }

  /**
   * Try every deterministic claim shape, most specific first.
   *
   * The spread parser MUST run before the plain cumulative-return one: a
   * spread claim also contains the words "cumulative return", so the plain
   * parser would match it and grade one symbol's return instead of the
   * difference between two.
   */
  async function verifyDeterministicClaim(pred: ExpiredPrediction): Promise<VerificationResult | null> {
    return (await verifyQuantifiedMove(pred))
        ?? (await verifyRelativeSpread(pred))
        ?? (await verifyCumulativeReturn(pred))
        ?? (await verifyCloseThreshold(pred));
  }

  /** Whether any deterministic parser recognises this claim (no DB access). */
  function hasDeterministicClaim(pred: ExpiredPrediction): boolean {
    const text = claimText(pred);
    if (parseRelativeSpreadClaim(text)) return true;
    if (!pred.target_symbol) return false;
    return parseDailyMoveClaim(text) !== null
        || parseCumulativeReturnClaim(text) !== null
        || parseCloseThresholdClaim(text) !== null;
  }

  /**
   * Verify a binary/event prediction using LLM against recent atoms.
   */
  async function verifyBinary(pred: ExpiredPrediction): Promise<VerificationResult> {
    // Arithmetic beats judgement: settle quantified price claims from prices.
    const quantified = await verifyDeterministicClaim(pred);
    if (quantified) return quantified;

    try {
      // Gather recent atoms about the entity
      const recentAtoms = await db.all<{ content: string }>(
        `SELECT a.content FROM market_atoms a
         JOIN market_atom_entity_links l ON l.atom_id = a.id
         JOIN market_entities e ON e.id = l.entity_id
         WHERE e.symbol = $1 AND a.created_at > $2
         ORDER BY a.created_at DESC LIMIT 15`,
        pred.target_symbol || '', pred.created_at
      );

      if (recentAtoms.length === 0) {
        return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Unverifiable — no recent data', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'No recent atoms to verify against' };
      }

      const { streamToHandler } = await import('./unified-llm-client.js');

      const context = [
        `PREDICTION: "${pred.title}"`,
        `Predicted outcome: ${pred.predicted_outcome}`,
        `Deadline: ${pred.deadline}`,
        `Symbol: ${pred.target_symbol || 'N/A'}`,
        '',
        `RECENT MARKET INTELLIGENCE (${recentAtoms.length} atoms):`,
        ...recentAtoms.map(a => `- ${a.content.slice(0, 200)}`),
      ].join('\n');

      // Configured markets model (Settings → "Markets AI model", falls back
      // to the utility model) — streamToHandler dispatches by model id
      // across providers, including the sdk:/codex: subscription engines.
      const { getMarketsModel } = await import('./markets-model-store.js');
      const verifierModel = await getMarketsModel(db);

      const result = await new Promise<{ text: string }>((resolve, reject) => {
        let text = '';
        streamToHandler(
          {
            model: verifierModel as import('../../src/lib/types.js').ModelId,
            thinking: 'quick' as import('../../src/lib/types.js').ThinkingLevel,
            system: [
              'You verify market predictions against evidence.',
              '',
              'You grade ONLY from the market intelligence supplied. You must NOT',
              'infer an outcome from base rates, typical volatility, prior',
              'probability, or general knowledge of the symbol. If the supplied',
              'intelligence does not actually say whether the predicted event',
              'occurred, that is not a "false" - it is insufficient evidence, and',
              'you must say so. A guess recorded as a verified outcome corrupts',
              'the accuracy record this system exists to produce.',
              '',
              'Respond ONLY with JSON:',
              '{ "insufficientEvidence": true/false, "wasCorrect": true/false,',
              '  "actualOutcome": "brief description", "explanation": "1-2 sentences",',
              '  "verificationConfidence": 0.0-1.0 }',
              '',
              'Set insufficientEvidence=true whenever the evidence does not settle',
              'the question, and leave wasCorrect false in that case.',
            ].join(String.fromCharCode(10)),
            messages: [{ role: 'user', content: context }],
            maxTokens: 500,
          },
          (event) => {
            const evt = event as Record<string, unknown>;
            if (evt.type === 'content_block_delta') {
              const delta = evt.delta as Record<string, unknown>;
              if (delta?.type === 'text_delta' && delta.text) text += delta.text;
            }
          },
          (completion) => resolve({ text: completion.text || text })
        ).catch(reject);
      });

      const cleaned = result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // An unevidenced answer must not enter the record. 'unverifiable' leaves
      // the prediction 'expired' and retriable, so a later run with better
      // atoms can still settle it — whereas a fabricated grade is permanent
      // and silently feeds calibration.
      const rawConfidence = Number(parsed.verificationConfidence);
      const scored = Number.isFinite(rawConfidence) ? rawConfidence : 0.6;
      if (parsed.insufficientEvidence === true || scored < LLM_VERIFICATION_MIN_CONFIDENCE) {
        return {
          predictionId: pred.id,
          wasCorrect: false,
          actualOutcome: 'Unverifiable — evidence does not settle the claim',
          actualValue: null,
          method: 'unverifiable',
          verificationConfidence: 0,
          explanation: `Insufficient evidence to grade (model confidence ${scored.toFixed(2)}): ${parsed.explanation || 'no reason given'}`,
        };
      }

      return {
        predictionId: pred.id,
        wasCorrect: !!parsed.wasCorrect,
        actualOutcome: parsed.actualOutcome || 'LLM-verified',
        actualValue: null,
        method: 'auto_llm',
        verificationConfidence: scored,
        explanation: parsed.explanation || 'Verified via AI analysis of recent market data',
      };
    } catch (err) {
      console.error(`[verifier] Binary verification failed for ${pred.id}:`, err);
      return { predictionId: pred.id, wasCorrect: false, actualOutcome: 'Verification failed', actualValue: null, method: 'unverifiable', verificationConfidence: 0, explanation: 'AI verification failed' };
    }
  }

  /**
   * Verify a single prediction using the appropriate strategy.
   */
  async function verifyPrediction(pred: ExpiredPrediction): Promise<VerificationResult> {
    switch (pred.prediction_type) {
      case 'directional':
        return verifyDirectional(pred);
      case 'price_target':
        return verifyPriceTarget(pred);
      case 'binary':
      case 'event':
        return verifyBinary(pred);
      default:
        // Try directional first (most common), then binary
        if (pred.predicted_direction) return verifyDirectional(pred);
        return verifyBinary(pred);
    }
  }

  /**
   * Run auto-verification on all expired predictions. LLM-based (binary/
   * event) verification is skipped — not failed — when either:
   *   • MARKETS_THINKING_DISABLED=true (existing pause flag), or
   *   • the caller passes { allowLLM: false } (used by the cron when the
   *     MARKETS_AUTOMATION opt-in is off — price-based grading is free and
   *     keeps running; haiku verification waits for opt-in).
   * Deferred predictions stay retriable and are verified on a later run.
   */
  async function runAutoVerification(options?: { allowLLM?: boolean }): Promise<{
    verified: number;
    unverifiable: number;
    correct: number;
    incorrect: number;
    deferred_llm: number;
    results: VerificationResult[];
  }> {
    const thinkingDisabled =
      String(process.env.MARKETS_THINKING_DISABLED || '').toLowerCase() === 'true'
      || options?.allowLLM === false;
    const expired = await findExpired();
    console.log(`[verifier] Found ${expired.length} expired predictions to verify${thinkingDisabled ? ' (LLM paths deferred)' : ''}`);

    const results: VerificationResult[] = [];
    let verified = 0, unverifiable = 0, correct = 0, incorrect = 0, deferred_llm = 0;

    for (const pred of expired) {
      // Defer LLM-based verifications when thinking is paused — the
      // prediction stays retriable and will be picked up next run.
      if (thinkingDisabled && requiresLLMVerification(pred)) {
        deferred_llm++;
        continue;
      }

      const result = await verifyPrediction(pred);
      results.push(result);

      if (result.method === 'unverifiable') {
        unverifiable++;
        const newAttempts = (pred.verification_attempts ?? 0) + 1;
        // Record the attempt. status='expired' means "past the horizon and
        // still unverified"; retry eligibility is governed jointly by
        // verification_attempts < MAX and the backoff in findExpired's WHERE
        // (and mirrored in the partial index from migration 156). Once
        // newAttempts reaches MAX, the predicate fails → no further retries.
        await db.run(
          `UPDATE market_predictions SET status = 'expired',
             verification_attempts = $1, last_verification_attempt_at = NOW(),
             last_verification_failure = $2, updated_at = NOW()
           WHERE id = $3`,
          newAttempts, truncateFailure(result.explanation), pred.id
        );
        continue;
      }

      // Brier is a proper scoring rule: it is only meaningful against the
      // actual BINARY outcome. This used to score against gradedScore, the
      // partial-credit curve (1.0 / 0.7 / 0.3 / 0.0), which shrinks every
      // forecast-to-outcome distance and flatters the result — a wrong call
      // at 0.60 confidence scored (0.60-0.30)^2 = 0.09 instead of 0.36.
      // Across the first 28 validated predictions that reported an average
      // 0.101 where the truth was 0.253, turning a record fractionally WORSE
      // than a coin flip (0.25) into one that appeared to beat it 2.5x.
      // gradedScore keeps its real jobs: deciding wasCorrect (a right
      // direction with a weak move still counts) and the "Grade: 70%" line
      // in the explanation. It must never re-enter this calculation.
      const predicted = pred.confidence;
      const actual = result.wasCorrect ? 1 : 0;
      const brierScore = (predicted - actual) ** 2;

      await db.run(`
        UPDATE market_predictions SET
          actual_outcome = $1, actual_value = $2, was_correct = $3,
          brier_score = $4, status = 'validated', validated_at = NOW(), updated_at = NOW()
        WHERE id = $5
      `, result.actualOutcome, result.actualValue, result.wasCorrect ? 1 : 0, brierScore, pred.id);

      // Create feedback record
      await db.run(`
        INSERT INTO market_prediction_feedback (prediction_id, feedback_type, predicted_value, actual_value,
                                                 accuracy_score, explanation, lessons_learned)
        VALUES ($1, 'auto_verification', $2, $3, $4, $5, $6)
      `, pred.id, pred.predicted_value, result.actualValue,
         1 - brierScore, `[${result.method}] ${result.explanation}`, null);

      verified++;
      if (result.wasCorrect) correct++;
      else incorrect++;

      // Update parent thesis confidence based on prediction outcome
      if (pred.thesis_id) {
        try {
          const thesis = await db.get<{ confidence: number }>(
            'SELECT confidence FROM market_theses WHERE id = ?', pred.thesis_id
          );
          if (thesis) {
            // Blend: correct predictions boost confidence, wrong ones reduce it
            const factor = result.wasCorrect ? 1.1 : 0.8;
            const newConf = Math.max(0.05, Math.min(0.95, thesis.confidence * factor));
            await db.run(
              'UPDATE market_theses SET confidence = ?, updated_at = NOW() WHERE id = ?',
              newConf, pred.thesis_id
            );
            // Auto-invalidate thesis if confidence drops below 0.15
            if (newConf < 0.15) {
              await db.run(
                "UPDATE market_theses SET status = 'invalidated', updated_at = NOW() WHERE id = ? AND status IN ('active', 'monitoring')",
                pred.thesis_id
              );
              console.log(`[verifier] Thesis ${pred.thesis_id} auto-invalidated (confidence dropped to ${newConf.toFixed(2)})`);
            }
          }
        } catch { /* non-fatal */ }
      }

      console.log(`[verifier] ${pred.target_symbol || '?'} "${pred.title}" → ${result.wasCorrect ? 'CORRECT' : 'WRONG'} (${result.method})`);

      // Brief pause between verifications
      if (expired.length > 3) await new Promise(r => setTimeout(r, 1000));
    }

    console.log(
      `[verifier] Done: ${verified} verified (${correct} correct, ${incorrect} wrong), ${unverifiable} unverifiable${deferred_llm > 0 ? `, ${deferred_llm} LLM-deferred` : ''}`,
    );
    return { verified, unverifiable, correct, incorrect, deferred_llm, results };
  }

  /**
   * A prediction needs the LLM path when it has no price-based grading
   * route: non-directional + non-price_target types, OR directional types
   * missing the symbol/direction needed by verifyDirectional.
   */
  function requiresLLMVerification(pred: ExpiredPrediction): boolean {
    // A claim that quantifies a price move, a close level, a cumulative
    // return or a two-symbol spread is settled arithmetically, so it does not
    // need the model — whatever its declared type. This gate runs
    // BEFORE dispatch: without the exemption such a prediction is deferred as
    // "needs LLM" and never reaches the deterministic route at all, which
    // silently makes that route unreachable whenever the LLM tier is paused.
    if (hasDeterministicClaim(pred)) return false;
    if (pred.prediction_type === 'binary' || pred.prediction_type === 'event') return true;
    if (pred.prediction_type === 'directional' || pred.prediction_type === 'price_target') return false;
    // 'timing', 'relative', or unknown types: LLM is the only viable path
    // unless a symbol + direction are present.
    return !(pred.target_symbol && pred.predicted_direction);
  }

  function truncateFailure(text: string | null | undefined): string | null {
    if (!text) return null;
    return text.length > 500 ? text.slice(0, 500) + '…' : text;
  }

  return { findExpired, findNearExpiry, verifyPrediction, runAutoVerification };
}
