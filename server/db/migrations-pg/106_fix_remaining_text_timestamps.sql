-- Migration 106 (PG): Fix remaining TEXT timestamp columns → TIMESTAMPTZ
-- All *_at columns in market_* tables that were defined as TEXT but should be TIMESTAMPTZ

-- Drop materialized view that depends on removed_at
DROP MATERIALIZED VIEW IF EXISTS mv_index_stats;

ALTER TABLE market_why_chains
  ALTER COLUMN completed_at TYPE TIMESTAMPTZ
  USING CASE WHEN completed_at IS NOT NULL THEN completed_at::timestamptz ELSE NULL END;

ALTER TABLE market_investigation_tasks
  ALTER COLUMN completed_at TYPE TIMESTAMPTZ
  USING CASE WHEN completed_at IS NOT NULL THEN completed_at::timestamptz ELSE NULL END;

ALTER TABLE market_backtests
  ALTER COLUMN completed_at TYPE TIMESTAMPTZ
  USING CASE WHEN completed_at IS NOT NULL THEN completed_at::timestamptz ELSE NULL END;

ALTER TABLE market_consul_performance
  ALTER COLUMN last_evaluated_at TYPE TIMESTAMPTZ
  USING CASE WHEN last_evaluated_at IS NOT NULL THEN last_evaluated_at::timestamptz ELSE NULL END;

ALTER TABLE market_data_raw
  ALTER COLUMN published_at TYPE TIMESTAMPTZ
  USING CASE WHEN published_at IS NOT NULL THEN published_at::timestamptz ELSE NULL END;

ALTER TABLE market_data_sources
  ALTER COLUMN last_fetch_at TYPE TIMESTAMPTZ
  USING CASE WHEN last_fetch_at IS NOT NULL THEN last_fetch_at::timestamptz ELSE NULL END;

ALTER TABLE market_index_holdings
  ALTER COLUMN removed_at TYPE TIMESTAMPTZ
  USING CASE WHEN removed_at IS NOT NULL THEN removed_at::timestamptz ELSE NULL END;

ALTER TABLE market_indexes
  ALTER COLUMN last_rebalance_at TYPE TIMESTAMPTZ
  USING CASE WHEN last_rebalance_at IS NOT NULL THEN last_rebalance_at::timestamptz ELSE NULL END;

ALTER TABLE market_pattern_detections
  ALTER COLUMN resolved_at TYPE TIMESTAMPTZ
  USING CASE WHEN resolved_at IS NOT NULL THEN resolved_at::timestamptz ELSE NULL END;

ALTER TABLE market_regime_history
  ALTER COLUMN ended_at TYPE TIMESTAMPTZ
  USING CASE WHEN ended_at IS NOT NULL THEN ended_at::timestamptz ELSE NULL END;

-- Recreate the materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_index_stats AS
SELECT
  mi.id as index_id,
  mi.name,
  mi.status,
  mi.index_type,
  mi.total_return,
  mi.current_nav,
  mi.inception_date,
  COUNT(DISTINCT mih.id) FILTER (WHERE mih.removed_at IS NULL) as active_holdings,
  COUNT(DISTINCT mir.id) as total_rebalances,
  MAX(mir.executed_at) as last_rebalance,
  COALESCE(
    (SELECT nav_value FROM market_index_nav_history WHERE index_id = mi.id ORDER BY nav_date DESC LIMIT 1),
    mi.current_nav
  ) as latest_nav
FROM market_indexes mi
LEFT JOIN market_index_holdings mih ON mi.id = mih.index_id
LEFT JOIN market_index_rebalances mir ON mi.id = mir.index_id
GROUP BY mi.id, mi.name, mi.status, mi.index_type, mi.total_return, mi.current_nav, mi.inception_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_index_stats
  ON mv_index_stats (index_id);
