-- PostgreSQL-specific market optimizations: JSONB, NUMERIC, materialized views
-- Replaces the SQLite no-op migration 056.

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. JSONB CONVERSIONS                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Helper: Convert a TEXT column to JSONB safely via a temp column
-- Pattern: add _jsonb col → copy+cast → drop old → rename

-- market_atoms: entities, affected_symbols, metadata
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'entities' AND data_type = 'text') THEN
    ALTER TABLE market_atoms ADD COLUMN entities_jsonb JSONB;
    UPDATE market_atoms SET entities_jsonb = CASE WHEN entities IS NOT NULL AND entities != '' THEN entities::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_atoms DROP COLUMN entities;
    ALTER TABLE market_atoms RENAME COLUMN entities_jsonb TO entities;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'affected_symbols' AND data_type = 'text') THEN
    ALTER TABLE market_atoms ADD COLUMN affected_symbols_jsonb JSONB;
    UPDATE market_atoms SET affected_symbols_jsonb = CASE WHEN affected_symbols IS NOT NULL AND affected_symbols != '' THEN affected_symbols::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_atoms DROP COLUMN affected_symbols;
    ALTER TABLE market_atoms RENAME COLUMN affected_symbols_jsonb TO affected_symbols;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'metadata' AND data_type = 'text') THEN
    ALTER TABLE market_atoms ADD COLUMN metadata_jsonb JSONB;
    UPDATE market_atoms SET metadata_jsonb = CASE WHEN metadata IS NOT NULL AND metadata != '' THEN metadata::jsonb ELSE '{}'::jsonb END;
    ALTER TABLE market_atoms DROP COLUMN metadata;
    ALTER TABLE market_atoms RENAME COLUMN metadata_jsonb TO metadata;
  END IF;
END $$;

-- market_theses: evidence_atoms, affected_symbols
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_theses' AND column_name = 'evidence_atoms' AND data_type = 'text') THEN
    ALTER TABLE market_theses ADD COLUMN evidence_atoms_jsonb JSONB;
    UPDATE market_theses SET evidence_atoms_jsonb = CASE WHEN evidence_atoms IS NOT NULL AND evidence_atoms != '' THEN evidence_atoms::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_theses DROP COLUMN evidence_atoms;
    ALTER TABLE market_theses RENAME COLUMN evidence_atoms_jsonb TO evidence_atoms;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_theses' AND column_name = 'affected_symbols' AND data_type = 'text') THEN
    ALTER TABLE market_theses ADD COLUMN affected_symbols_jsonb JSONB;
    UPDATE market_theses SET affected_symbols_jsonb = CASE WHEN affected_symbols IS NOT NULL AND affected_symbols != '' THEN affected_symbols::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_theses DROP COLUMN affected_symbols;
    ALTER TABLE market_theses RENAME COLUMN affected_symbols_jsonb TO affected_symbols;
  END IF;
END $$;

-- market_predictions: metadata
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_predictions' AND column_name = 'metadata' AND data_type = 'text') THEN
    ALTER TABLE market_predictions ADD COLUMN metadata_jsonb JSONB;
    UPDATE market_predictions SET metadata_jsonb = CASE WHEN metadata IS NOT NULL AND metadata != '' THEN metadata::jsonb ELSE '{}'::jsonb END;
    ALTER TABLE market_predictions DROP COLUMN metadata;
    ALTER TABLE market_predictions RENAME COLUMN metadata_jsonb TO metadata;
  END IF;
END $$;

-- market_prediction_feedback: metadata
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_prediction_feedback' AND column_name = 'metadata' AND data_type = 'text') THEN
    ALTER TABLE market_prediction_feedback ADD COLUMN metadata_jsonb JSONB;
    UPDATE market_prediction_feedback SET metadata_jsonb = CASE WHEN metadata IS NOT NULL AND metadata != '' THEN metadata::jsonb ELSE '{}'::jsonb END;
    ALTER TABLE market_prediction_feedback DROP COLUMN metadata;
    ALTER TABLE market_prediction_feedback RENAME COLUMN metadata_jsonb TO metadata;
  END IF;
END $$;

-- market_pattern_detections: pattern_data, affected_entities
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_pattern_detections' AND column_name = 'pattern_data' AND data_type = 'text') THEN
    ALTER TABLE market_pattern_detections ADD COLUMN pattern_data_jsonb JSONB;
    UPDATE market_pattern_detections SET pattern_data_jsonb = CASE WHEN pattern_data IS NOT NULL AND pattern_data != '' THEN pattern_data::jsonb ELSE '{}'::jsonb END;
    ALTER TABLE market_pattern_detections DROP COLUMN pattern_data;
    ALTER TABLE market_pattern_detections RENAME COLUMN pattern_data_jsonb TO pattern_data;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_pattern_detections' AND column_name = 'affected_entities' AND data_type = 'text') THEN
    ALTER TABLE market_pattern_detections ADD COLUMN affected_entities_jsonb JSONB;
    UPDATE market_pattern_detections SET affected_entities_jsonb = CASE WHEN affected_entities IS NOT NULL AND affected_entities != '' THEN affected_entities::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_pattern_detections DROP COLUMN affected_entities;
    ALTER TABLE market_pattern_detections RENAME COLUMN affected_entities_jsonb TO affected_entities;
  END IF;
END $$;

-- market_indexes: universe
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_indexes' AND column_name = 'universe' AND data_type = 'text') THEN
    ALTER TABLE market_indexes ADD COLUMN universe_jsonb JSONB;
    UPDATE market_indexes SET universe_jsonb = CASE WHEN universe IS NOT NULL AND universe != '' THEN universe::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_indexes DROP COLUMN universe;
    ALTER TABLE market_indexes RENAME COLUMN universe_jsonb TO universe;
  END IF;
END $$;

-- market_index_rebalances: pre_holdings, post_holdings, trades
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_index_rebalances' AND column_name = 'pre_holdings' AND data_type = 'text') THEN
    ALTER TABLE market_index_rebalances ADD COLUMN pre_holdings_jsonb JSONB;
    UPDATE market_index_rebalances SET pre_holdings_jsonb = CASE WHEN pre_holdings IS NOT NULL AND pre_holdings != '' THEN pre_holdings::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_index_rebalances DROP COLUMN pre_holdings;
    ALTER TABLE market_index_rebalances RENAME COLUMN pre_holdings_jsonb TO pre_holdings;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_index_rebalances' AND column_name = 'post_holdings' AND data_type = 'text') THEN
    ALTER TABLE market_index_rebalances ADD COLUMN post_holdings_jsonb JSONB;
    UPDATE market_index_rebalances SET post_holdings_jsonb = CASE WHEN post_holdings IS NOT NULL AND post_holdings != '' THEN post_holdings::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_index_rebalances DROP COLUMN post_holdings;
    ALTER TABLE market_index_rebalances RENAME COLUMN post_holdings_jsonb TO post_holdings;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_index_rebalances' AND column_name = 'trades' AND data_type = 'text') THEN
    ALTER TABLE market_index_rebalances ADD COLUMN trades_jsonb JSONB;
    UPDATE market_index_rebalances SET trades_jsonb = CASE WHEN trades IS NOT NULL AND trades != '' THEN trades::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_index_rebalances DROP COLUMN trades;
    ALTER TABLE market_index_rebalances RENAME COLUMN trades_jsonb TO trades;
  END IF;
END $$;

-- market_narratives: key_themes, related_atoms
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_narratives' AND column_name = 'key_themes' AND data_type = 'text') THEN
    ALTER TABLE market_narratives ADD COLUMN key_themes_jsonb JSONB;
    UPDATE market_narratives SET key_themes_jsonb = CASE WHEN key_themes IS NOT NULL AND key_themes != '' THEN key_themes::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_narratives DROP COLUMN key_themes;
    ALTER TABLE market_narratives RENAME COLUMN key_themes_jsonb TO key_themes;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_narratives' AND column_name = 'related_atoms' AND data_type = 'text') THEN
    ALTER TABLE market_narratives ADD COLUMN related_atoms_jsonb JSONB;
    UPDATE market_narratives SET related_atoms_jsonb = CASE WHEN related_atoms IS NOT NULL AND related_atoms != '' THEN related_atoms::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_narratives DROP COLUMN related_atoms;
    ALTER TABLE market_narratives RENAME COLUMN related_atoms_jsonb TO related_atoms;
  END IF;
END $$;

-- market_why_chains: metadata
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_why_chains' AND column_name = 'metadata' AND data_type = 'text') THEN
    ALTER TABLE market_why_chains ADD COLUMN metadata_jsonb JSONB;
    UPDATE market_why_chains SET metadata_jsonb = CASE WHEN metadata IS NOT NULL AND metadata != '' THEN metadata::jsonb ELSE '{}'::jsonb END;
    ALTER TABLE market_why_chains DROP COLUMN metadata;
    ALTER TABLE market_why_chains RENAME COLUMN metadata_jsonb TO metadata;
  END IF;
END $$;

-- market_why_chain_levels: evidence, sub_questions
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_why_chain_levels' AND column_name = 'evidence' AND data_type = 'text') THEN
    ALTER TABLE market_why_chain_levels ADD COLUMN evidence_jsonb JSONB;
    UPDATE market_why_chain_levels SET evidence_jsonb = CASE WHEN evidence IS NOT NULL AND evidence != '' THEN evidence::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_why_chain_levels DROP COLUMN evidence;
    ALTER TABLE market_why_chain_levels RENAME COLUMN evidence_jsonb TO evidence;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_why_chain_levels' AND column_name = 'sub_questions' AND data_type = 'text') THEN
    ALTER TABLE market_why_chain_levels ADD COLUMN sub_questions_jsonb JSONB;
    UPDATE market_why_chain_levels SET sub_questions_jsonb = CASE WHEN sub_questions IS NOT NULL AND sub_questions != '' THEN sub_questions::jsonb ELSE '[]'::jsonb END;
    ALTER TABLE market_why_chain_levels DROP COLUMN sub_questions;
    ALTER TABLE market_why_chain_levels RENAME COLUMN sub_questions_jsonb TO sub_questions;
  END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. GIN INDEXES on frequently queried JSONB columns                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE INDEX IF NOT EXISTS idx_market_atoms_affected_symbols_gin ON market_atoms USING GIN(affected_symbols);
CREATE INDEX IF NOT EXISTS idx_market_atoms_entities_gin ON market_atoms USING GIN(entities);
CREATE INDEX IF NOT EXISTS idx_market_theses_evidence_atoms_gin ON market_theses USING GIN(evidence_atoms);
CREATE INDEX IF NOT EXISTS idx_market_theses_affected_symbols_gin ON market_theses USING GIN(affected_symbols);
CREATE INDEX IF NOT EXISTS idx_market_indexes_universe_gin ON market_indexes USING GIN(universe);
CREATE INDEX IF NOT EXISTS idx_market_pattern_detections_affected_entities_gin ON market_pattern_detections USING GIN(affected_entities);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. NUMERIC CONVERSIONS for financial precision                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- market_index_holdings: weight, entry_price, current_price, unrealized_pnl
DO $$ BEGIN
  ALTER TABLE market_index_holdings ALTER COLUMN weight TYPE NUMERIC(10,6);
  ALTER TABLE market_index_holdings ALTER COLUMN entry_price TYPE NUMERIC(16,6);
  ALTER TABLE market_index_holdings ALTER COLUMN current_price TYPE NUMERIC(16,6);
  ALTER TABLE market_index_holdings ALTER COLUMN unrealized_pnl TYPE NUMERIC(16,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- market_index_nav_history: nav_value, daily_return
DO $$ BEGIN
  ALTER TABLE market_index_nav_history ALTER COLUMN nav_value TYPE NUMERIC(16,6);
  ALTER TABLE market_index_nav_history ALTER COLUMN daily_return TYPE NUMERIC(10,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- market_index_leaderboard: total_return, annualized_return, sharpe_ratio, max_drawdown
DO $$ BEGIN
  ALTER TABLE market_index_leaderboard ALTER COLUMN total_return TYPE NUMERIC(10,6);
  ALTER TABLE market_index_leaderboard ALTER COLUMN annualized_return TYPE NUMERIC(10,6);
  ALTER TABLE market_index_leaderboard ALTER COLUMN sharpe_ratio TYPE NUMERIC(10,6);
  ALTER TABLE market_index_leaderboard ALTER COLUMN max_drawdown TYPE NUMERIC(10,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- market_predictions: confidence, predicted_value, actual_value, brier_score
DO $$ BEGIN
  ALTER TABLE market_predictions ALTER COLUMN confidence TYPE NUMERIC(10,6);
  ALTER TABLE market_predictions ALTER COLUMN predicted_value TYPE NUMERIC(16,6);
  ALTER TABLE market_predictions ALTER COLUMN actual_value TYPE NUMERIC(16,6);
  ALTER TABLE market_predictions ALTER COLUMN brier_score TYPE NUMERIC(10,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- market_prediction_feedback: predicted_value, actual_value, accuracy_score
DO $$ BEGIN
  ALTER TABLE market_prediction_feedback ALTER COLUMN predicted_value TYPE NUMERIC(16,6);
  ALTER TABLE market_prediction_feedback ALTER COLUMN actual_value TYPE NUMERIC(16,6);
  ALTER TABLE market_prediction_feedback ALTER COLUMN accuracy_score TYPE NUMERIC(10,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- market_signal_weights: weight, decay_rate
DO $$ BEGIN
  ALTER TABLE market_signal_weights ALTER COLUMN weight TYPE NUMERIC(10,6);
  ALTER TABLE market_signal_weights ALTER COLUMN decay_rate TYPE NUMERIC(10,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- market_indexes: total_return, current_nav
DO $$ BEGIN
  ALTER TABLE market_indexes ALTER COLUMN total_return TYPE NUMERIC(16,6);
  ALTER TABLE market_indexes ALTER COLUMN current_nav TYPE NUMERIC(16,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- market_index_rebalances: nav_at_rebalance
DO $$ BEGIN
  ALTER TABLE market_index_rebalances ALTER COLUMN nav_at_rebalance TYPE NUMERIC(16,6);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 4. MATERIALIZED VIEWS                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- View 1: Prediction track record summary
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

-- View 2: Index stats summary
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

-- View 3: Ranked leaderboard
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_index_leaderboard_ranked AS
SELECT
  lb.*,
  mi.name as index_name,
  mi.index_type,
  RANK() OVER (PARTITION BY lb.period ORDER BY lb.total_return DESC) as computed_rank
FROM market_index_leaderboard lb
JOIN market_indexes mi ON lb.index_id = mi.id
WHERE mi.status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_leaderboard_ranked
  ON mv_index_leaderboard_ranked (index_id, period);
