-- Migration 070: Importance scoring, entity graph auto-population, category learning

-- 1. Add importance_score to market_atoms
ALTER TABLE market_atoms ADD COLUMN IF NOT EXISTS importance_score INTEGER DEFAULT 50;
ALTER TABLE market_atoms ADD COLUMN IF NOT EXISTS importance_source TEXT DEFAULT 'rule';
CREATE INDEX IF NOT EXISTS idx_market_atoms_importance ON market_atoms(importance_score DESC);

-- 2. Junction table: atom-to-entity links
CREATE TABLE IF NOT EXISTS market_atom_entity_links (
  id SERIAL PRIMARY KEY,
  atom_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'mentioned',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (atom_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_atom_entity_links_atom ON market_atom_entity_links(atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_entity_links_entity ON market_atom_entity_links(entity_id);

-- 3. Category importance table (learned weights)
CREATE TABLE IF NOT EXISTS market_category_importance (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  atom_type TEXT NOT NULL,
  base_importance INTEGER NOT NULL DEFAULT 50,
  learned_multiplier REAL NOT NULL DEFAULT 1.0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  avg_price_impact REAL,
  last_calibrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_imp_unique ON market_category_importance(category, COALESCE(subcategory, ''), atom_type);

-- 4. Add unique constraint to market_signal_weights for ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_market_signal_weights_type_category'
  ) THEN
    ALTER TABLE market_signal_weights ADD CONSTRAINT uq_market_signal_weights_type_category UNIQUE (signal_type, category);
  END IF;
END $$;

-- 5. Seed signal weights (currently empty)
INSERT INTO market_signal_weights (signal_type, category, weight, sample_size, accuracy)
VALUES
  ('fact', 'equity', 1.0, 0, NULL), ('fact', 'macro', 1.0, 0, NULL),
  ('signal', 'equity', 1.0, 0, NULL), ('signal', 'macro', 1.0, 0, NULL), ('signal', 'sector', 1.0, 0, NULL),
  ('insight', 'equity', 1.0, 0, NULL), ('insight', 'macro', 1.0, 0, NULL),
  ('event', 'equity', 1.0, 0, NULL), ('event', 'macro', 1.0, 0, NULL), ('event', 'sector', 1.0, 0, NULL),
  ('prediction', 'equity', 1.0, 0, NULL), ('prediction', 'macro', 1.0, 0, NULL),
  ('outcome', 'equity', 1.0, 0, NULL), ('outcome', 'macro', 1.0, 0, NULL)
ON CONFLICT DO NOTHING;

-- 6. Seed category importance (pre-weights)
INSERT INTO market_category_importance (category, subcategory, atom_type, base_importance) VALUES
  ('macro', 'geopolitical', 'event', 90), ('macro', 'central_bank', 'event', 85),
  ('macro', 'interest_rate', 'event', 85), ('macro', 'trade_war', 'event', 75),
  ('macro', NULL, 'fact', 60), ('macro', NULL, 'signal', 65), ('macro', NULL, 'insight', 60),
  ('macro', NULL, 'event', 70), ('macro', NULL, 'prediction', 65),
  ('equity', 'earnings_surprise', 'event', 80), ('equity', NULL, 'fact', 40),
  ('equity', NULL, 'signal', 55), ('equity', NULL, 'insight', 50), ('equity', NULL, 'event', 55),
  ('sector', NULL, 'event', 70), ('sector', NULL, 'signal', 60), ('sector', NULL, 'insight', 55),
  ('commodity', NULL, 'event', 65), ('commodity', NULL, 'signal', 55),
  ('fx', NULL, 'event', 70), ('fx', NULL, 'signal', 60),
  ('crypto', NULL, 'event', 55), ('general', NULL, 'insight', 35),
  ('general', NULL, 'fact', 30), ('general', NULL, 'event', 40)
ON CONFLICT DO NOTHING;

-- 7. Backfill importance_score for existing atoms
UPDATE market_atoms SET importance_score =
  CASE
    WHEN category = 'macro' AND subcategory IN ('geopolitical', 'war', 'conflict') AND atom_type = 'event' THEN 90
    WHEN category = 'macro' AND subcategory IN ('central_bank', 'interest_rate') AND atom_type = 'event' THEN 85
    WHEN category = 'macro' AND atom_type = 'event' THEN 70
    WHEN category = 'macro' AND atom_type IN ('signal', 'insight') THEN 65
    WHEN category = 'macro' AND atom_type = 'fact' THEN 60
    WHEN category = 'equity' AND atom_type = 'event' THEN 55
    WHEN category = 'equity' AND atom_type = 'signal' THEN 55
    WHEN category = 'sector' AND atom_type = 'event' THEN 70
    WHEN category = 'sector' AND atom_type = 'signal' THEN 60
    WHEN category = 'commodity' AND atom_type IN ('event', 'signal') THEN 65
    WHEN atom_type = 'prediction' THEN 65
    WHEN atom_type = 'outcome' THEN 70
    ELSE 50
  END
WHERE importance_score = 50 OR importance_score IS NULL;
