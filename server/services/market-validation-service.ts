import type { DatabaseAdapter } from '../db/database.js';
import { dateOffsetLiteral } from '../db/dialect-helpers.js';
import { trustedSince } from './market-learning-window.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface PredictionRow {
  id: string;
  thesis_id: string | null;
  title: string;
  confidence: number;
  predicted_direction: string | null;
  predicted_value: number | null;
  deadline: string | null;
  status: string;
  was_correct: number | null;
  brier_score: number | null;
}

interface CalibrationBucket {
  bucket: string;
  confidence_low: number;
  confidence_high: number;
  total: number;
  correct: number;
  accuracy: number;
  avg_confidence: number;
  calibration_error: number;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketValidationService(db: DatabaseAdapter) {

  // ── Expired Predictions ──────────────────────────────────────────────────
  // Find predictions past their deadline that haven't been validated

  async function findExpiredPredictions() {
    return await db.all<PredictionRow>(
      `SELECT * FROM market_predictions
       WHERE status = 'active' AND deadline IS NOT NULL AND deadline < NOW()
       ORDER BY deadline ASC`
    );
  }

  // ── Brier Score Calculation ──────────────────────────────────────────────

  async function getOverallBrierScore() {
    const row = await db.get<{ avg: number; count: number }>(
      "SELECT AVG(brier_score) as avg, COUNT(*) as count FROM market_predictions WHERE brier_score IS NOT NULL"
    );
    return { averageBrierScore: row?.avg ?? null, sampleSize: row?.count ?? 0 };
  }

  // ── Calibration Analysis ─────────────────────────────────────────────────
  // Check if stated confidence matches actual accuracy across buckets

  async function getCalibrationData(): Promise<CalibrationBucket[]> {
    const buckets: CalibrationBucket[] = [];
    const ranges = [
      { label: '0-20%', low: 0, high: 0.2 },
      { label: '20-40%', low: 0.2, high: 0.4 },
      { label: '40-60%', low: 0.4, high: 0.6 },
      { label: '60-80%', low: 0.6, high: 0.8 },
      { label: '80-100%', low: 0.8, high: 1.01 },
    ];

    for (const range of ranges) {
      const row = await db.get<{ total: number; correct: number; avg_conf: number }>(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
                AVG(confidence) as avg_conf
         FROM market_predictions
         WHERE status = 'validated' AND confidence >= ? AND confidence < ?`,
        range.low, range.high
      );

      const total = row?.total ?? 0;
      const correct = row?.correct ?? 0;
      const accuracy = total > 0 ? correct / total : 0;
      const avgConf = row?.avg_conf ?? (range.low + range.high) / 2;

      buckets.push({
        bucket: range.label,
        confidence_low: range.low,
        confidence_high: range.high,
        total,
        correct,
        accuracy,
        avg_confidence: avgConf,
        calibration_error: Math.abs(avgConf - accuracy),
      });
    }

    return buckets;
  }

  // ── Accuracy by Time Horizon ─────────────────────────────────────────────

  async function getAccuracyByHorizon() {
    return await db.all<{ horizon: string; total: number; correct: number; avg_brier: number }>(
      `SELECT
         CASE
           WHEN time_horizon_days <= 30 THEN 'short'
           WHEN time_horizon_days <= 180 THEN 'medium'
           ELSE 'long'
         END as horizon,
         COUNT(*) as total,
         SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
         AVG(brier_score) as avg_brier
       FROM market_predictions
       WHERE status = 'validated' AND time_horizon_days IS NOT NULL
       -- GROUP BY the EXPRESSION, not the select alias. SQLite resolves an output alias
       -- here; PostgreSQL does not, and rejects the query with "column
       -- market_predictions.time_horizon_days must appear in the GROUP BY clause".
       GROUP BY
         CASE
           WHEN time_horizon_days <= 30 THEN 'short'
           WHEN time_horizon_days <= 180 THEN 'medium'
           ELSE 'long'
         END`
    );
  }

  // ── Accuracy by Symbol ───────────────────────────────────────────────────

  async function getAccuracyBySymbol(limit = 10) {
    return await db.all<{ symbol: string; total: number; correct: number; accuracy: number }>(
      `SELECT target_symbol as symbol,
              COUNT(*) as total,
              SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
              CAST(SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as accuracy
       FROM market_predictions
       WHERE status = 'validated' AND target_symbol IS NOT NULL
       GROUP BY target_symbol
       -- HAVING COUNT(*), not the alias. SQLite allows an output alias in HAVING;
       -- PostgreSQL evaluates HAVING before the select list exists and errors with
       -- "column total does not exist".
       HAVING COUNT(*) >= 3
       ORDER BY accuracy DESC
       LIMIT ?`, limit
    );
  }

  // ── Recent Validations ───────────────────────────────────────────────────

  async function getRecentValidations(limit = 10) {
    return await db.all<PredictionRow & { actual_outcome: string }>(
      `SELECT * FROM market_predictions
       WHERE status = 'validated'
       ORDER BY validated_at DESC
       LIMIT ?`, limit
    );
  }

  // ── Signal Weight Adjustment ─────────────────────────────────────────────
  // Update signal weights based on prediction accuracy

  async function updateSignalWeights() {
    // Get atom types that contributed to validated predictions via theses
    const signalStats = await db.all<{ signal_type: string; category: string; total: number; correct: number }>(
      // Trusted window only — grading defects repaired in mid-August make
      // older labels unreliable in both directions. See market-learning-window.ts.
      `SELECT ma.atom_type as signal_type, ma.category,
              COUNT(DISTINCT mp.id) as total,
              SUM(CASE WHEN mp.was_correct = 1 THEN 1 ELSE 0 END) as correct
       FROM market_predictions mp
       JOIN market_thesis_atoms mta ON mp.thesis_id = mta.thesis_id
       JOIN market_atoms ma ON mta.atom_id = ma.id
       WHERE mp.status = 'validated' AND mp.validated_at >= ?
       GROUP BY ma.atom_type, ma.category
       HAVING total >= 3`,
      trustedSince()
    );

    for (const stat of signalStats) {
      const accuracy = stat.correct / stat.total;
      const weight = 0.5 + accuracy * 0.5; // Map 0-1 accuracy to 0.5-1.0 weight

      const existing = await db.get<{ id: number }>(
        'SELECT id FROM market_signal_weights WHERE signal_type = ? AND category = ?',
        stat.signal_type, stat.category
      );

      if (existing) {
        await db.run(`
          UPDATE market_signal_weights SET weight = ?, sample_size = ?, accuracy = ?,
                 last_calibrated_at = NOW(), updated_at = NOW()
          WHERE id = ?
        `, weight, stat.total, accuracy, existing.id);
      } else {
        await db.run(`
          INSERT INTO market_signal_weights (signal_type, category, weight, sample_size, accuracy, last_calibrated_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `, stat.signal_type, stat.category, weight, stat.total, accuracy);
      }
    }

    return { updated: signalStats.length };
  }

  // ── Accuracy by Temporal Horizon ─────────────────────────────────────

  async function getAccuracyByTemporalHorizon() {
    return await db.all<{
      horizon: string; total: number; correct: number; avg_brier: number; avg_confidence: number;
    }>(`
      SELECT COALESCE(horizon, 'unspecified') as horizon,
             COUNT(*) as total,
             SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
             ROUND(AVG(brier_score)::numeric, 4) as avg_brier,
             ROUND(AVG(confidence)::numeric, 4) as avg_confidence
      FROM market_predictions WHERE status = 'validated'
      GROUP BY horizon
      ORDER BY CASE horizon
        WHEN 'today' THEN 1 WHEN 'this_week' THEN 2 WHEN 'this_month' THEN 3
        WHEN 'this_year' THEN 4 WHEN 'this_decade' THEN 5 ELSE 6
      END
    `);
  }

  return {
    findExpiredPredictions,
    getOverallBrierScore,
    getCalibrationData,
    getAccuracyByHorizon,
    getAccuracyByTemporalHorizon,
    getAccuracyBySymbol,
    getRecentValidations,
    updateSignalWeights,
  };
}

export type MarketValidationService = Awaited<ReturnType<typeof createMarketValidationService>>;
