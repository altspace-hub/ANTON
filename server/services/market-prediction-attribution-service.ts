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
      validated_date: string | null;
      rebalance_date: string;
      rebalance_epoch_ms: string | number;
    }>(
      // Dates are rendered to TEXT and epoch-ms in SQL, never handed over as
      // timestamptz. node-postgres returns timestamptz as a JS Date, and this
      // function called .slice(0, 10) on it — "row.rebalance_executed_at.slice
      // is not a function" killed 39 of 45 rows on every 04:00 sweep since
      // 2026-04-27, so attribution_pnl was NEVER computed for any prediction.
      // p.validated_at had the identical problem one line further down.
      `SELECT
         a.id, a.prediction_id, a.rebalance_id, a.weight_change,
         p.target_symbol, p.time_horizon_days, p.status AS prediction_status,
         TO_CHAR(p.validated_at, 'YYYY-MM-DD') AS validated_date,
         TO_CHAR(r.executed_at, 'YYYY-MM-DD') AS rebalance_date,
         (EXTRACT(EPOCH FROM r.executed_at) * 1000)::bigint AS rebalance_epoch_ms
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
        const endDateStr = pickEndDate(row);
        if (!endDateStr) continue; // horizon not elapsed yet
        const startDate = row.rebalance_date;
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


  /**
   * Portfolio-level roll-up: did the prediction signals add or subtract?
   *
   * attribution_pnl is stored PER PREDICTION but describes a POSITION's move —
   * when several predictions informed the same weight change they each carry
   * the full figure. Summing the column therefore multiplies the real number
   * (on the 2026-04-27 rebalance one NFLX weight change is credited to ten
   * predictions, turning +8.0bps into +80.2bps). The roll-up de-duplicates to
   * one row per (rebalance, symbol) before totalling; `predictions_credited`
   * keeps the fan-out visible rather than hiding it.
   */
  async function getAttributionSummary(): Promise<{
    positions: Array<{
      rebalanceId: string; symbol: string; executedAt: string;
      weightChangePct: number; subsequentReturnPct: number; pnlBps: number;
      returnLowPct: number; returnHighPct: number;
      predictionsCredited: number; avgSignalScore: number;
      /** 'shadow' rows describe trades that were never executed. */
      shadow: boolean;
    }>;
    totals: {
      distinctPositions: number; totalPnlPct: number;
      helped: number; hurt: number;
      attributedPredictions: number; rawSumPnlPct: number;
      /** Counterfactual: positions the signals proposed but never traded. */
      shadowPositions: number; shadowPnlPct: number;
    };
    coverage: {
      attributionRows: number; computedRows: number; pendingRows: number;
      lastRebalanceAt: string | null; rebalanceCount: number;
    };
  }> {
    const positions = await db.all<{
      rebalance_id: string; symbol: string; executed_at: string;
      weight_change: string | number; subsequent_return: string | number;
      attribution_pnl: string | number; predictions_credited: string | number;
      return_low: string | number; return_high: string | number;
      avg_signal: string | number | null; trigger_type: string | null;
    }>(
      `SELECT a.rebalance_id,
              p.target_symbol AS symbol,
              TO_CHAR(r.executed_at, 'YYYY-MM-DD') AS executed_at,
              MAX(r.trigger_type)       AS trigger_type,
              -- weight_change is constant within a (rebalance, symbol) group:
              -- it is one position's move. subsequent_return is NOT — each
              -- contributing prediction has its own horizon and so its own
              -- measurement end date (CVX 2026-04-27 spans -5.76% to +4.06%).
              -- Independent MAX()es would splice values from different rows
              -- into an arithmetically impossible triple, so average instead:
              -- with weight constant, AVG(pnl) = weight x AVG(return) exactly.
              -- min/max keep the horizon disagreement visible.
              AVG(a.weight_change)      AS weight_change,
              AVG(a.subsequent_return)  AS subsequent_return,
              AVG(a.attribution_pnl)    AS attribution_pnl,
              MIN(a.subsequent_return)  AS return_low,
              MAX(a.subsequent_return)  AS return_high,
              COUNT(*)                  AS predictions_credited,
              AVG(a.signal_score)       AS avg_signal
         FROM market_prediction_attribution a
         JOIN market_predictions p ON p.id = a.prediction_id
         JOIN market_index_rebalances r ON r.id = a.rebalance_id
        WHERE a.attribution_pnl IS NOT NULL
        GROUP BY a.rebalance_id, p.target_symbol, r.executed_at
          ORDER BY AVG(a.attribution_pnl) DESC`,
    );

    const mapped = positions.map(r => ({
      rebalanceId: r.rebalance_id,
      symbol: r.symbol,
      executedAt: r.executed_at,
      weightChangePct: Number(r.weight_change) * 100,
      subsequentReturnPct: Number(r.subsequent_return) * 100,
      pnlBps: Number(r.attribution_pnl) * 10_000,
      returnLowPct: Number(r.return_low) * 100,
      returnHighPct: Number(r.return_high) * 100,
      predictionsCredited: Number(r.predictions_credited),
      avgSignalScore: r.avg_signal == null ? 0 : Number(r.avg_signal),
      shadow: r.trigger_type === 'shadow',
    }));

    const raw = await db.get<{ raw_sum: string | number | null; attributed: string | number }>(
      `SELECT SUM(attribution_pnl) AS raw_sum, COUNT(*) AS attributed
         FROM market_prediction_attribution WHERE attribution_pnl IS NOT NULL`,
    );

    const cov = await db.get<{
      rows: string | number; computed: string | number; last_rebalance: string | null; rebalances: string | number;
    }>(
      `SELECT (SELECT COUNT(*) FROM market_prediction_attribution) AS rows,
              (SELECT COUNT(*) FROM market_prediction_attribution WHERE attribution_pnl IS NOT NULL) AS computed,
              (SELECT TO_CHAR(MAX(executed_at), 'YYYY-MM-DD') FROM market_index_rebalances) AS last_rebalance,
              (SELECT COUNT(*) FROM market_index_rebalances) AS rebalances`,
    );

    const rows = Number(cov?.rows ?? 0);
    const computed = Number(cov?.computed ?? 0);

    return {
      positions: mapped,
      totals: {
        // Executed and shadow are reported apart: merging them would present
        // trades that never happened as portfolio performance.
        distinctPositions: mapped.filter(r => !r.shadow).length,
        totalPnlPct: mapped.filter(r => !r.shadow).reduce((acc, r) => acc + r.pnlBps, 0) / 100,
        helped: mapped.filter(r => !r.shadow && r.pnlBps > 0).length,
        hurt: mapped.filter(r => !r.shadow && r.pnlBps < 0).length,
        shadowPositions: mapped.filter(r => r.shadow).length,
        shadowPnlPct: mapped.filter(r => r.shadow).reduce((acc, r) => acc + r.pnlBps, 0) / 100,
        attributedPredictions: Number(raw?.attributed ?? 0),
        rawSumPnlPct: Number(raw?.raw_sum ?? 0) * 100,
      },
      coverage: {
        attributionRows: rows,
        computedRows: computed,
        pendingRows: rows - computed,
        lastRebalanceAt: cov?.last_rebalance ?? null,
        rebalanceCount: Number(cov?.rebalances ?? 0),
      },
    };
  }

  return {
    recordAttributionsForRebalance,
    computeMaturedAttributionPnL,
    getAttributionSummary,
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

/**
 * The 'YYYY-MM-DD' at which a prediction's contribution should be measured, or
 * null while its horizon is still running. Inputs are already normalised by
 * the query — a text date and an epoch in ms — so nothing here parses a
 * timestamptz that pg may hand back as a Date.
 */
function pickEndDate(row: {
  time_horizon_days: number | null;
  prediction_status: string;
  validated_date: string | null;
  rebalance_epoch_ms: string | number;
}): string | null {
  // Prefer the actual validation date when the prediction has closed.
  if (row.prediction_status === 'validated' && row.validated_date) {
    return row.validated_date;
  }
  const horizonDays = row.time_horizon_days ?? 30;
  const rebalance = Number(row.rebalance_epoch_ms);
  if (!Number.isFinite(rebalance)) return null;
  const maturity = rebalance + horizonDays * 24 * 3600 * 1000;
  if (Date.now() < maturity) return null; // not mature yet
  return new Date(maturity).toISOString().slice(0, 10);
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
