// ── market-prediction-attribution-service.ts ───────────────────────────────
// Markets effectiveness M2 — populate the prediction_attribution pipeline.
//
// Background: the April 2026 audit found market_prediction_attribution had
// 0 rows despite 338 predictions and 1 rebalance. The schema existed (from
// migration 066) but nothing wrote to it. This service closes that loop.
//
// Two phases, both cheap (no LLM spend, runs under MARKETS_THINKING_DISABLED):
//
//   1. recordAttributionsForRebalance(rebalanceId, trades) — called from
//      market-index-rebalance-service.executeRebalance() right after the
//      rebalance row is committed. For every trade (symbol + weight_before/
//      after), we find active predictions on that symbol and insert an
//      attribution row capturing the prediction's agreement with the trade.
//
//   2. computeMaturedAttributionPnL() — scheduled cron. Finds attributions
//      whose prediction has reached its horizon (validated, or
//      time_horizon_days elapsed since the rebalance), pulls historical
//      close prices for (rebalance_date, rebalance_date + horizon), and
//      fills in subsequent_return + attribution_pnl.
//
// signal_score:
//   confidence × direction_sign × weight_change_sign
//     direction_sign ∈ {+1, 0, -1}  (up / flat / down)
//     weight_change_sign ∈ {+1, 0, -1}
//   Positive = rebalance agreed with the prediction (bullish pred → up-weight).
//   Magnitude = prediction's confidence.
//
// attribution_pnl:
//   weight_change × subsequent_return  (index-level contribution)
//   e.g. weight_change = +0.02 on a symbol that returned +5% → +10bps.
//
// See M1 service (market-pattern-weight-feedback-service) for the sister
// closed-loop piece. M1 feeds patterns → weights; M2 feeds predictions →
// portfolio impact so a future attribution-aware weight tuner can be built.

import type { DatabaseAdapter } from '../db/database.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('market-prediction-attribution');

interface TradeInput {
  symbol: string;
  action: 'buy' | 'sell' | 'increase' | 'decrease' | 'hold' | string;
  oldWeight: number;
  newWeight: number;
}

interface PredictionRow {
  id: string;
  target_symbol: string | null;
  predicted_direction: string | null;
  confidence: number | string;
  time_horizon_days: number | null;
  status: string;
}

export interface AttributionRecordResult {
  trades_considered: number;
  attributions_inserted: number;
  symbols_with_predictions: number;
}

export interface AttributionPnLResult {
  matured_considered: number;
  pnl_computed: number;
  skipped_missing_price: number;
  errors: Array<{ attribution_id: number; reason: string }>;
}

export async function createMarketPredictionAttributionService(db: DatabaseAdapter) {

  /**
   * Called right after a rebalance commits. Walks the trades list, and for
   * each non-hold trade finds active (or recently-validated) predictions
   * targeting that symbol. Writes one attribution row per (prediction, trade)
   * pair.
   *
   * Window for "active": status='active' at the moment of the rebalance
   * OR validated within the last 7 days (the prediction's signal likely
   * informed the rebalance decision even if verification caught up later).
   */
  async function recordAttributionsForRebalance(
    rebalanceId: string,
    trades: TradeInput[],
  ): Promise<AttributionRecordResult> {
    const result: AttributionRecordResult = {
      trades_considered: trades.length,
      attributions_inserted: 0,
      symbols_with_predictions: 0,
    };

    const realTrades = trades.filter(t => t.action !== 'hold' && t.symbol);
    if (realTrades.length === 0) return result;

    // Group trades by symbol so we fetch predictions once per symbol.
    const tradesBySymbol = new Map<string, TradeInput>();
    for (const t of realTrades) tradesBySymbol.set(t.symbol, t);

    for (const [symbol, trade] of tradesBySymbol) {
      const predictions = await db.all<PredictionRow>(
        `SELECT id, target_symbol, predicted_direction, confidence, time_horizon_days, status
         FROM market_predictions
         WHERE target_symbol = ?
           AND (status = 'active' OR (status = 'validated' AND validated_at >= NOW() - INTERVAL '7 days'))`,
        symbol,
      );
      if (predictions.length === 0) continue;
      result.symbols_with_predictions++;

      const weightChange = trade.newWeight - trade.oldWeight;
      for (const p of predictions) {
        const signalScore = computeSignalScore(p, weightChange);
        try {
          await db.run(
            `INSERT INTO market_prediction_attribution
              (prediction_id, rebalance_id, signal_score, weight_change)
             VALUES (?, ?, ?, ?)`,
            p.id, rebalanceId, signalScore, weightChange,
          );
          result.attributions_inserted++;
        } catch (err) {
          log.warn(
            { predictionId: p.id, rebalanceId, err: err instanceof Error ? err.message : String(err) },
            'attribution_insert_failed',
          );
        }
      }
    }

    if (result.attributions_inserted > 0) {
      log.info(
        { rebalanceId, trades: result.trades_considered, attributions: result.attributions_inserted, symbols: result.symbols_with_predictions },
        'attributions_recorded',
      );
    }
    return result;
  }

  /**
   * Cron-friendly. Finds attributions whose prediction has reached its
   * horizon (or been validated) and whose attribution_pnl is still NULL.
   * Pulls the rebalance_date close price and the horizon-date close price
   * for the symbol, computes subsequent_return, and fills in attribution_pnl.
   *
   * Horizon logic:
   *   • If the prediction was validated, use the validation date.
   *   • Else time_horizon_days after the rebalance (default 30 if null).
   *
   * Skips attributions whose horizon has not yet elapsed.
   */
  async function computeMaturedAttributionPnL(options: { batchLimit?: number } = {}): Promise<AttributionPnLResult> {
    const limit = options.batchLimit ?? 500;
    const result: AttributionPnLResult = {
      matured_considered: 0, pnl_computed: 0, skipped_missing_price: 0, errors: [],
    };

    // Candidate attributions: no PnL computed yet, horizon conceptually elapsed.
    // Use a coarse NOW()-30-days prefilter to limit the join; exact maturity
    // check happens per-row below.
    const candidates = await db.all<{
      id: number;
      prediction_id: string;
      rebalance_id: string;
      weight_change: number | string;
      target_symbol: string | null;
      time_horizon_days: number | null;
      prediction_status: string;
      validated_at: string | null;
      rebalance_executed_at: string;
    }>(
      `SELECT
         a.id, a.prediction_id, a.rebalance_id, a.weight_change,
         p.target_symbol, p.time_horizon_days, p.status AS prediction_status, p.validated_at,
         r.executed_at AS rebalance_executed_at
       FROM market_prediction_attribution a
       JOIN market_predictions p ON p.id = a.prediction_id
       JOIN market_index_rebalances r ON r.id = a.rebalance_id
       WHERE a.attribution_pnl IS NULL
         AND r.executed_at <= NOW() - INTERVAL '1 day'
       ORDER BY r.executed_at ASC
       LIMIT ?`,
      limit,
    );

    for (const row of candidates) {
      result.matured_considered++;
      try {
        const endDate = pickEndDate(row);
        if (!endDate) continue; // horizon not elapsed yet
        const startDate = row.rebalance_executed_at.slice(0, 10);
        const endDateStr = endDate.slice(0, 10);
        const symbol = row.target_symbol;
        if (!symbol) { result.skipped_missing_price++; continue; }

        const priceStart = await pickClosePrice(db, symbol, startDate, 'backward');
        const priceEnd = await pickClosePrice(db, symbol, endDateStr, 'backward');
        if (priceStart == null || priceEnd == null || priceStart === 0) {
          result.skipped_missing_price++;
          continue;
        }

        const subsequentReturn = (priceEnd - priceStart) / priceStart;
        const weightChange = Number(row.weight_change);
        const attributionPnl = weightChange * subsequentReturn;

        await db.run(
          `UPDATE market_prediction_attribution
             SET subsequent_return = ?, attribution_pnl = ?, computed_at = NOW()
           WHERE id = ?`,
          subsequentReturn, attributionPnl, row.id,
        );
        result.pnl_computed++;
      } catch (err) {
        result.errors.push({
          attribution_id: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (result.pnl_computed > 0 || result.errors.length > 0) {
      log.info(
        { considered: result.matured_considered, computed: result.pnl_computed, skipped_missing_price: result.skipped_missing_price, errors: result.errors.length },
        'attribution_pnl_batch_complete',
      );
    }
    return result;
  }

  return {
    recordAttributionsForRebalance,
    computeMaturedAttributionPnL,
  };
}

export type MarketPredictionAttributionService = Awaited<ReturnType<typeof createMarketPredictionAttributionService>>;

// ── Helpers ────────────────────────────────────────────────────────────────

function directionSign(dir: string | null): number {
  if (!dir) return 0;
  const d = dir.toLowerCase();
  if (d === 'up' || d === 'bullish' || d === 'positive') return 1;
  if (d === 'down' || d === 'bearish' || d === 'negative') return -1;
  return 0;
}

function weightChangeSign(delta: number): number {
  if (delta > 0.0001) return 1;
  if (delta < -0.0001) return -1;
  return 0;
}

function computeSignalScore(p: PredictionRow, weightChange: number): number {
  const confidence = Math.max(0, Math.min(1, Number(p.confidence)));
  return confidence * directionSign(p.predicted_direction) * weightChangeSign(weightChange);
}

function pickEndDate(row: {
  time_horizon_days: number | null;
  prediction_status: string;
  validated_at: string | null;
  rebalance_executed_at: string;
}): string | null {
  // Prefer the actual validation date when the prediction has closed.
  if (row.prediction_status === 'validated' && row.validated_at) {
    return row.validated_at;
  }
  const horizonDays = row.time_horizon_days ?? 30;
  const rebalance = Date.parse(row.rebalance_executed_at);
  if (Number.isNaN(rebalance)) return null;
  const horizonMs = horizonDays * 24 * 3600 * 1000;
  const maturity = rebalance + horizonMs;
  if (Date.now() < maturity) return null; // not mature yet
  return new Date(maturity).toISOString();
}

/**
 * Find the closest trading-day close price on-or-before (backward) the
 * target date. Backward lookup is the right default: price on a weekend
 * falls back to Friday's close.
 */
async function pickClosePrice(
  db: DatabaseAdapter,
  symbol: string,
  targetDate: string,
  _direction: 'backward',
): Promise<number | null> {
  const row = await db.get<{ close: number | string | null; adjusted_close: number | string | null }>(
    `SELECT close, adjusted_close
     FROM market_historical_prices
     WHERE symbol = ? AND price_date <= ?
     ORDER BY price_date DESC
     LIMIT 1`,
    symbol, targetDate,
  );
  if (!row) return null;
  const value = row.adjusted_close ?? row.close;
  return value == null ? null : Number(value);
}
