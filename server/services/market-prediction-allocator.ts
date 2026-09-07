/**
 * market-prediction-allocator.ts — mirror the live prediction set into paper
 * portfolios so prediction quality can be read in money.
 *
 * This is paper money in ANTON's own tables. Nothing here places an order, and
 * nothing here should be read as a recommendation to.
 *
 * ── Why this now holds shorts ────────────────────────────────────────────
 *
 * The book was long-only and filtered to `predicted_direction = 'up'`, so it
 * expressed one third of what the system actually says. Measured over the
 * trusted window on 3 September 2026, that third was the WEAK third:
 *
 *     up     56 graded   57.1% correct   Brier 0.2488
 *     down   24 graded   66.7% correct   Brier 0.2227
 *     flat   14 graded   78.6% correct   Brier 0.1975
 *
 * The 62.1% headline was carried by the calls the portfolio could not trade,
 * while the book was built exclusively from the ones running at barely better
 * than a coin flip. Both books duly underperformed SPY by ~2.1–2.3 points in
 * their first three sessions. That is not a strategy failing; it is a
 * measurement instrument wired to the wrong half of its input.
 *
 * So a 'down' call is now a short. The portfolio expresses the view the system
 * actually stated, and its return finally reflects the whole prediction set.
 *
 * ── Why 'flat' is still not a position ───────────────────────────────────
 *
 * 'flat' is the most accurate bucket and it is deliberately NOT traded. A flat
 * call says "this will not move much", which is a view about VOLATILITY, and
 * there is no cash-equity position that profits from being right about it —
 * expressing it needs options this system does not model. Manufacturing a long
 * or a short from it would put a directional bet behind a non-directional view
 * and then credit the result to the prediction. It is counted and reported as
 * `flat_not_expressible` instead, so its accuracy is never silently folded
 * into a portfolio number it did not produce.
 *
 * ── Netting, and the cash leg ────────────────────────────────────────────
 *
 * Predictions disagree: one call says AAPL up, another says down. Those are
 * netted per symbol, so genuine internal disagreement shrinks the position
 * rather than opening two opposing ones in the same book.
 *
 * NAV is computed by market-nav-engine as sum(shares × price). A short has
 * negative shares and therefore negative market value, so without the cash the
 * short sale raises, a half-long/half-short book would price at nearly zero
 * and every return would be measured against a meaningless base. The proceeds
 * are held as an explicit CASH_SYMBOL holding at a price of 1, which makes
 *
 *     NAV = cash + Σ(shares × price)
 *
 * exact at inception with no change to the NAV engine at all.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-prediction-allocator');

export type Weighting = 'equal' | 'confidence';

/**
 * Cash, as a holding priced at 1.
 *
 * The NAV engine looks a symbol up in market_data_raw and falls back to
 * `current_price` when it finds nothing, so a row carrying price 1 contributes
 * its own face value and needs no special case. The '$' prefix cannot collide
 * with a real ticker.
 */
export const CASH_SYMBOL = '$CASH';

/** A live prediction eligible to hold a position. */
export interface EligiblePrediction {
  id: string;
  target_symbol: string;
  confidence: number;
  predicted_direction: string;
}

export interface AllocationResult {
  index_id: string;
  weighting: Weighting;
  predictions_considered: number;
  positions_opened: number;
  long_positions: number;
  short_positions: number;
  skipped_no_price: number;
  /** 'flat' calls: accurate, but not expressible as a cash-equity position. */
  flat_not_expressible: number;
  /** Symbols where up and down calls cancelled exactly, so nothing was held. */
  offsetting_symbols: number;
  /** (long − short) / NAV. 1.0 is fully long, 0 is market-neutral. */
  net_exposure: number;
  /** (long + short) / NAV. Held at ~1 so risk stays comparable to the old book. */
  gross_exposure: number;
  cash: number;
  nav_at_rebalance: number;
}

/**
 * Live, actionable predictions: still open, deadline not passed, naming a
 * symbol we can price, and carrying a direction we can express.
 *
 * `status = 'active'` alone is not enough — a prediction whose deadline has
 * passed but which the verifier has not reached yet is no longer a live view,
 * and holding it would quietly turn the portfolio into a graveyard of stale
 * calls.
 */
export async function findEligiblePredictions(db: DatabaseAdapter): Promise<EligiblePrediction[]> {
  return db.all<EligiblePrediction>(
    `SELECT id, target_symbol, confidence, predicted_direction
       FROM market_predictions
      WHERE status = 'active'
        AND predicted_direction IN ('up', 'down', 'flat')
        AND target_symbol IS NOT NULL
        AND confidence IS NOT NULL
        AND COALESCE(
              deadline,
              created_at + (COALESCE(time_horizon_days, 30) || ' days')::interval
            ) >= NOW()
      ORDER BY created_at DESC`,
  );
}

export interface SignedWeights {
  /** symbol → signed fraction of NAV. Positive long, negative short. */
  weights: Map<string, number>;
  flatCount: number;
  offsetting: number;
  netExposure: number;
  grossExposure: number;
}

/**
 * Signed target weights for a prediction set.
 *
 * Several predictions can name the same symbol; their masses are summed so a
 * symbol three models like is held three times as heavily. That is the point
 * of the exercise, not a bug to deduplicate away. Opposing calls on the same
 * symbol subtract, so the book holds the system's net view.
 *
 * Normalised by GROSS mass, so long and short legs together consume about one
 * NAV of exposure. Sizing each leg to a full NAV instead would double the
 * book's risk the day shorts were introduced and make every return before and
 * after that change incomparable.
 */
export function computeWeights(
  predictions: EligiblePrediction[],
  weighting: Weighting,
): SignedWeights {
  const signed = new Map<string, number>();
  let flatCount = 0;

  for (const p of predictions) {
    if (p.predicted_direction === 'flat') { flatCount++; continue; }
    const mass = weighting === 'equal' ? 1 : Math.max(0, p.confidence);
    const sign = p.predicted_direction === 'down' ? -1 : 1;
    signed.set(p.target_symbol, (signed.get(p.target_symbol) ?? 0) + sign * mass);
  }

  // A symbol whose up and down calls cancel exactly carries no view. Counting
  // these matters: a book quietly holding fewer names than it has predictions
  // looks like a pricing failure unless the reason is reported.
  let offsetting = 0;
  for (const [symbol, mass] of [...signed]) {
    if (mass === 0) { offsetting++; signed.delete(symbol); }
  }

  const gross = [...signed.values()].reduce((a, b) => a + Math.abs(b), 0);
  const weights = new Map<string, number>();
  if (gross <= 0) {
    return { weights, flatCount, offsetting, netExposure: 0, grossExposure: 0 };
  }
  let net = 0;
  for (const [symbol, mass] of signed) {
    const w = mass / gross;
    weights.set(symbol, w);
    net += w;
  }
  return { weights, flatCount, offsetting, netExposure: net, grossExposure: 1 };
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
  const { weights, flatCount, offsetting } = computeWeights(predictions, weighting);

  const result: AllocationResult = {
    index_id: indexId,
    weighting,
    predictions_considered: predictions.length,
    positions_opened: 0,
    long_positions: 0,
    short_positions: 0,
    skipped_no_price: 0,
    flat_not_expressible: flatCount,
    offsetting_symbols: offsetting,
    net_exposure: 0,
    gross_exposure: 0,
    cash: nav,
    nav_at_rebalance: nav,
  };

  const priorRows = await db.all<{ symbol: string; weight: number }>(
    'SELECT symbol, weight FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL', indexId,
  );

  await db.run('DELETE FROM market_index_holdings WHERE index_id = ?', indexId);

  // Cash is derived from what was ACTUALLY placed, not from the intended
  // weights, so an unpriceable symbol leaves its share in cash and NAV still
  // reconciles exactly instead of drifting by the dropped amount.
  let placedValue = 0;
  let longValue = 0;
  let shortValue = 0;

  for (const [symbol, weight] of weights) {
    const price = await latestClose(db, symbol);
    if (price == null) {
      // Unpriceable symbol: count it rather than silently dropping the weight,
      // otherwise the book quietly stops summing to 1 and nothing says why.
      result.skipped_no_price++;
      continue;
    }
    const targetValue = nav * weight;          // negative for a short
    const shares = targetValue / price;
    await db.run(
      `INSERT INTO market_index_holdings
         (index_id, symbol, weight, shares, entry_price, current_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      indexId, symbol, weight, shares, price, price,
    );
    placedValue += targetValue;
    if (targetValue >= 0) { longValue += targetValue; result.long_positions++; }
    else { shortValue += -targetValue; result.short_positions++; }
    result.positions_opened++;
  }

  // NAV = cash + Σ(shares × price). Holding the short proceeds as cash is what
  // makes that identity hold; without it the book would price at
  // long − short and every return would be measured against a base that is
  // near zero for a balanced book.
  const cash = nav - placedValue;
  await db.run(
    `INSERT INTO market_index_holdings
       (index_id, symbol, weight, shares, entry_price, current_price)
     VALUES (?, ?, ?, ?, 1, 1)`,
    indexId, CASH_SYMBOL, nav > 0 ? cash / nav : 0, cash,
  );

  result.cash = cash;
  result.net_exposure = nav > 0 ? (longValue - shortValue) / nav : 0;
  result.gross_exposure = nav > 0 ? (longValue + shortValue) / nav : 0;

  await db.run(
    `INSERT INTO market_index_rebalances
       (id, index_id, rebalance_type, pre_holdings, post_holdings, trades, reasoning, nav_at_rebalance)
     VALUES (?, ?, 'prediction_allocation', ?, ?, '[]', ?, ?)`,
    `reb_pred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    indexId,
    JSON.stringify(priorRows),
    JSON.stringify([...weights].map(([symbol, weight]) => ({ symbol, weight }))),
    `${weighting} weighting over ${predictions.length} live prediction(s); `
      + `${result.long_positions} long, ${result.short_positions} short, `
      + `${result.skipped_no_price} unpriceable, ${flatCount} flat not expressible, `
      + `net ${(result.net_exposure * 100).toFixed(1)}% / gross ${(result.gross_exposure * 100).toFixed(1)}%`,
    nav,
  );

  await db.run('UPDATE market_indexes SET last_rebalance_at = NOW(), updated_at = NOW() WHERE id = ?', indexId);

  log.info({ ...result }, 'prediction_allocation_complete');
  return result;
}
