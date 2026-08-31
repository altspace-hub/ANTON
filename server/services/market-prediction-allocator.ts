/**
 * Prediction-driven paper allocation.
 *
 * Everything else in Markets records what predictions turned out to be worth
 * AFTER the fact: market_prediction_attribution waits for a rebalance to
 * happen for other reasons, then looks for predictions on the symbols that were
 * traded. Nothing has ever taken a live prediction and put (paper) money behind
 * it. This does — so the question "if we had actually backed our own calls,
 * where would we be?" has an answer instead of an argument.
 *
 * ── Why TWO portfolios ────────────────────────────────────────────────────
 *
 * The obvious design is one portfolio sized by confidence: back the calls we
 * believe most, most heavily. On this data that would be the worst possible
 * rule. Measured over 174 graded predictions, calibration is INVERTED — the
 * 0.70–0.85 confidence band runs at 25% accuracy while the sub-0.50 band runs
 * at 58%. Confidence sizing would put the most money behind the worst calls,
 * and the resulting curve would say "predictions lose money" when the truer
 * statement is "our confidence signal is upside down".
 *
 * So the allocator maintains two portfolios over the SAME prediction set:
 *
 *   equal      — every live prediction gets the same weight
 *   confidence — weight proportional to stated confidence
 *
 * Both are ordinary market_indexes rows, so the NAV engine values them, the
 * benchmark leg measures them against SPY, and drawdown alerts apply. The
 * difference between the two curves IS the calibration result, expressed in
 * the one unit nobody argues with. If confidence weighting ever starts winning,
 * that is the signal that calibration has been fixed — and it will be visible
 * without anyone having to re-run an analysis.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 *
 * Long-only, and only on `up` predictions with a target symbol. Shorting the
 * `down` calls would double the surface area (borrow, sizing, unbounded loss)
 * for a paper portfolio whose purpose is to make one comparison legible. A
 * `down` prediction simply means the symbol is not held.
 *
 * This is paper money in ANTON's own tables. Nothing here places an order, and
 * nothing here should be read as a recommendation to.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-prediction-allocator');

export type Weighting = 'equal' | 'confidence';

/** A live prediction eligible to hold a position. */
interface EligiblePrediction {
  id: string;
  target_symbol: string;
  confidence: number;
}

export interface AllocationResult {
  index_id: string;
  weighting: Weighting;
  predictions_considered: number;
  positions_opened: number;
  skipped_no_price: number;
  nav_at_rebalance: number;
}

/**
 * Live, actionable predictions: still open, deadline not passed, pointing up,
 * and naming a symbol we can price.
 *
 * `status = 'active'` alone is not enough — a prediction whose deadline has
 * passed but which the verifier has not reached yet is no longer a live view,
 * and holding it would quietly turn the portfolio into a graveyard of stale
 * calls.
 */
export async function findEligiblePredictions(db: DatabaseAdapter): Promise<EligiblePrediction[]> {
  return db.all<EligiblePrediction>(
    `SELECT id, target_symbol, confidence
       FROM market_predictions
      WHERE status = 'active'
        AND predicted_direction = 'up'
        AND target_symbol IS NOT NULL
        AND confidence IS NOT NULL
        AND COALESCE(
              deadline,
              created_at + (COALESCE(time_horizon_days, 30) || ' days')::interval
            ) >= NOW()
      ORDER BY created_at DESC`,
  );
}

/**
 * Weights for a prediction set under one sizing rule, normalised to sum to 1.
 *
 * Several predictions can name the same symbol; their weights are summed so a
 * symbol three models like is held three times as heavily. That is the point of
 * the exercise, not a bug to deduplicate away.
 */
export function computeWeights(
  predictions: EligiblePrediction[],
  weighting: Weighting,
): Map<string, number> {
  const raw = new Map<string, number>();
  for (const p of predictions) {
    const w = weighting === 'equal' ? 1 : Math.max(0, p.confidence);
    raw.set(p.target_symbol, (raw.get(p.target_symbol) ?? 0) + w);
  }
  const total = [...raw.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return new Map();
  const out = new Map<string, number>();
  for (const [symbol, w] of raw) out.set(symbol, w / total);
  return out;
}

/** Latest close for a symbol, or null when it cannot be priced. */
async function latestClose(db: DatabaseAdapter, symbol: string): Promise<number | null> {
  const row = await db.get<{ close: number | string | null }>(
    `SELECT COALESCE(adjusted_close, close) AS close
       FROM market_historical_prices
      WHERE symbol = ?
      ORDER BY price_date DESC LIMIT 1`,
    symbol,
  );
  const v = row?.close == null ? null : Number(row.close);
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Rebuild one prediction portfolio's holdings from the current prediction set.
 *
 * Replaces the whole book rather than diffing it: the portfolio is defined as
 * "what we currently believe", so a prediction that has expired should stop
 * being held, and expiry is not an event anything emits.
 */
export async function allocateFromPredictions(
  db: DatabaseAdapter,
  indexId: string,
  weighting: Weighting,
): Promise<AllocationResult> {
  const idx = await db.get<{ current_nav: number | string | null }>(
    'SELECT current_nav FROM market_indexes WHERE id = ?', indexId,
  );
  if (!idx) throw new Error(`allocateFromPredictions: no such index '${indexId}'`);

  const nav = Number(idx.current_nav ?? 0) || 1000;
  const predictions = await findEligiblePredictions(db);
  const weights = computeWeights(predictions, weighting);

  const result: AllocationResult = {
    index_id: indexId,
    weighting,
    predictions_considered: predictions.length,
    positions_opened: 0,
    skipped_no_price: 0,
    nav_at_rebalance: nav,
  };

  const priorRows = await db.all<{ symbol: string; weight: number }>(
    'SELECT symbol, weight FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL', indexId,
  );

  await db.run('DELETE FROM market_index_holdings WHERE index_id = ?', indexId);

  for (const [symbol, weight] of weights) {
    const price = await latestClose(db, symbol);
    if (price == null) {
      // Unpriceable symbol: count it rather than silently dropping the weight,
      // otherwise the book quietly stops summing to 1 and nothing says why.
      result.skipped_no_price++;
      continue;
    }
    const shares = (nav * weight) / price;
    await db.run(
      `INSERT INTO market_index_holdings
         (index_id, symbol, weight, shares, entry_price, current_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      indexId, symbol, weight, shares, price, price,
    );
    result.positions_opened++;
  }

  await db.run(
    `INSERT INTO market_index_rebalances
       (id, index_id, rebalance_type, pre_holdings, post_holdings, trades, reasoning, nav_at_rebalance)
     VALUES (?, ?, 'prediction_allocation', ?, ?, '[]', ?, ?)`,
    `reb_pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    indexId,
    JSON.stringify(priorRows),
    JSON.stringify([...weights].map(([symbol, weight]) => ({ symbol, weight }))),
    `${weighting} weighting over ${predictions.length} live prediction(s); `
      + `${result.positions_opened} position(s), ${result.skipped_no_price} unpriceable`,
    nav,
  );

  await db.run('UPDATE market_indexes SET last_rebalance_at = NOW(), updated_at = NOW() WHERE id = ?', indexId);

  log.info({ ...result }, 'prediction_allocation_complete');
  return result;
}
