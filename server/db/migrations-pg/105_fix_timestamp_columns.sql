-- Migration 105 (PG): Fix TEXT timestamp columns → TIMESTAMPTZ
-- validated_at and last_calibrated_at were defined as TEXT but compared against NOW()
-- causing "operator does not exist: text >= timestamp with time zone"

-- Drop materialized view that depends on validated_at (will be recreated below)
DROP MATERIALIZED VIEW IF EXISTS mv_prediction_track_record;

-- Convert existing TEXT values to TIMESTAMPTZ (handles ISO 8601 strings and NULL)
ALTER TABLE market_predictions
  ALTER COLUMN validated_at TYPE TIMESTAMPTZ
  USING CASE WHEN validated_at IS NOT NULL THEN validated_at::timestamptz ELSE NULL END;

ALTER TABLE market_signal_weights
  ALTER COLUMN last_calibrated_at TYPE TIMESTAMPTZ
  USING CASE WHEN last_calibrated_at IS NOT NULL THEN last_calibrated_at::timestamptz ELSE NULL END;

-- Also fix deadline column (TEXT but used for date comparisons)
ALTER TABLE market_predictions
  ALTER COLUMN deadline TYPE TIMESTAMPTZ
  USING CASE WHEN deadline IS NOT NULL THEN deadline::timestamptz ELSE NULL END;

-- Recreate the materialized view with the now-TIMESTAMPTZ column
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_prediction_track_record AS
SELECT
  prediction_type,
  COUNT(*) as total,
  SUM(CASE WHEN was_correct = 1 THEN 1 ELSE 0 END) as correct,
  ROUND(AVG(CASE WHEN was_correct = 1 THEN 1.0 ELSE 0.0 END), 4) as accuracy,
  ROUND(AVG(brier_score), 4) as avg_brier,
  MIN(validated_at) as first_validated,
  MAX(validated_at) as last_validated
FROM market_predictions
WHERE status = 'validated'
GROUP BY prediction_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_prediction_track_record
  ON mv_prediction_track_record (prediction_type);
