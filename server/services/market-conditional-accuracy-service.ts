import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface PredictionFeatures {
  market_regime?: string;
  sector?: string;
  signal_type?: string;
  volatility_level?: string;
  momentum_direction?: string;
}

interface ConditionalAccuracyRow {
  feature_key: string;
  feature_value: string;
  total: number;
  correct: number;
  accuracy: number;
  avg_brier: number;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createConditionalAccuracyService(db: DatabaseAdapter) {

  /**
   * Capture feature context when a prediction is made.
   * Stores the features JSONB on the prediction row for later conditional analysis.
   */
  async function capturePredictionFeatures(
    predictionId: string,
    features: PredictionFeatures,
    isBacktest: boolean,
    _backtestId?: string,
  ): Promise<void> {
    const table = isBacktest ? 'market_backtest_predictions' : 'market_predictions';
    await db.run(
      `UPDATE ${table} SET features = ?::jsonb WHERE id = ?`,
      JSON.stringify(features), predictionId,
    );
  }

  /**
   * After a prediction is validated, update conditional accuracy stats.
   * Reads the features JSONB from the prediction, then upserts aggregates
   * into market_conditional_accuracy for each feature dimension.
   */
  async function updateConditionalAccuracy(
    predictionId: string,
    wasCorrect: boolean,
    brierScore: number,
    isBacktest: boolean,
    backtestId?: string,
  ): Promise<void> {
    const table = isBacktest ? 'market_backtest_predictions' : 'market_predictions';
    const row = await db.get<{ features: string }>(
      `SELECT features FROM ${table} WHERE id = ?`, predictionId,
    );
    if (!row || !row.features) return;

    const features: Record<string, string> =
      typeof row.features === 'string' ? JSON.parse(row.features) : (row.features ?? {});
    const scope = isBacktest ? (backtestId ?? 'backtest') : 'live';

    for (const [key, value] of Object.entries(features)) {
      if (!value) continue;
      await db.run(
        `INSERT INTO market_conditional_accuracy
           (feature_key, feature_value, scope, total, correct, accuracy, avg_brier, last_updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, NOW())
         ON CONFLICT (feature_key, feature_value, scope) DO UPDATE SET
           total = market_conditional_accuracy.total + 1,
           correct = market_conditional_accuracy.correct + EXCLUDED.correct,
           accuracy = (market_conditional_accuracy.correct + EXCLUDED.correct)::numeric
                      / (market_conditional_accuracy.total + 1),
           avg_brier = ((COALESCE(market_conditional_accuracy.avg_brier, 0) * market_conditional_accuracy.total)
                        + EXCLUDED.avg_brier)
                       / (market_conditional_accuracy.total + 1),
           last_updated_at = NOW()`,
        key, value, scope,
        wasCorrect ? 1 : 0,
        wasCorrect ? 1.0 : 0.0,
        brierScore,
      );
    }
  }

  /**
   * Get conditional accuracy breakdown.
   * Only returns feature combinations with >= 3 observations for statistical relevance.
   */
  async function getConditionalAccuracy(scope = 'live'): Promise<ConditionalAccuracyRow[]> {
    return await db.all<ConditionalAccuracyRow>(
      `SELECT feature_key, feature_value, total, correct,
              ROUND(accuracy::numeric, 4) as accuracy,
              ROUND(avg_brier::numeric, 4) as avg_brier
       FROM market_conditional_accuracy
       WHERE scope = ? AND total >= 3
       ORDER BY feature_key, accuracy DESC`,
      scope,
    );
  }

  /**
   * Get signal weight adjustments based on conditional accuracy.
   * Returns a map of "feature_key:feature_value" to weight multipliers (0.5-1.5 range).
   * Features with higher historical accuracy get higher weights.
   */
  async function getSignalWeightAdjustments(scope = 'live'): Promise<Map<string, number>> {
    const rows = await db.all<{ feature_key: string; feature_value: string; accuracy: number }>(
      `SELECT feature_key, feature_value, accuracy
       FROM market_conditional_accuracy
       WHERE scope = ? AND total >= 5`,
      scope,
    );
    const map = new Map<string, number>();
    for (const r of rows) {
      const acc = Number(r.accuracy) || 0.5;
      // Map accuracy to weight: 0% accuracy → 0.5x, 100% accuracy → 1.5x
      map.set(`${r.feature_key}:${r.feature_value}`, 0.5 + acc);
    }
    return map;
  }

  /**
   * Get accuracy summary grouped by feature key.
   * Useful for dashboard display showing which conditions predict best.
   */
  async function getAccuracySummary(scope = 'live') {
    return await db.all<{
      feature_key: string;
      total_observations: number;
      overall_accuracy: number;
      best_value: string;
      best_accuracy: number;
    }>(
      `SELECT feature_key,
              SUM(total) as total_observations,
              ROUND((SUM(correct)::numeric / NULLIF(SUM(total), 0))::numeric, 4) as overall_accuracy,
              (ARRAY_AGG(feature_value ORDER BY accuracy DESC))[1] as best_value,
              MAX(accuracy) as best_accuracy
       FROM market_conditional_accuracy
       WHERE scope = ? AND total >= 3
       GROUP BY feature_key
       ORDER BY overall_accuracy DESC`,
      scope,
    );
  }

  return {
    capturePredictionFeatures,
    updateConditionalAccuracy,
    getConditionalAccuracy,
    getSignalWeightAdjustments,
    getAccuracySummary,
  };
}

export type ConditionalAccuracyService = Awaited<ReturnType<typeof createConditionalAccuracyService>>;
