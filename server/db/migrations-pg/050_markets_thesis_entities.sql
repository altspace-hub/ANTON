-- Migration 050 (PG): Markets Pillar Phase 2 — Thesis Engine & Entity Graph
-- Investment theses, predictions, market entities, signal weights.

-- ── Market Theses ───────────────────────────────────────────────────────────
-- Investment/market hypotheses with evidence chains, confidence, time horizons

CREATE TABLE IF NOT EXISTS market_theses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  thesis_type TEXT NOT NULL DEFAULT 'investment',   -- investment, macro, sector, event, contrarian
  status TEXT NOT NULL DEFAULT 'draft',              -- draft, active, monitoring, validated, invalidated, archived
  confidence REAL NOT NULL DEFAULT 0.5,             -- 0.0 to 1.0
  time_horizon TEXT NOT NULL DEFAULT 'medium',       -- short (< 1 month), medium (1-6 months), long (6+ months)
  success_criteria TEXT DEFAULT '[]',               -- JSON array of measurable conditions
  key_assumptions TEXT DEFAULT '[]',                -- JSON array of assumptions
  risk_factors TEXT DEFAULT '[]',                   -- JSON array of risk factors
  target_entities TEXT DEFAULT '[]',                -- JSON array of entity IDs this thesis targets
  ai_score REAL,                                    -- AI-assigned quality score
  ai_analysis TEXT,                                 -- AI analysis text
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_theses_status ON market_theses(status);
CREATE INDEX IF NOT EXISTS idx_market_theses_type ON market_theses(thesis_type);
CREATE INDEX IF NOT EXISTS idx_market_theses_confidence ON market_theses(confidence DESC);

-- ── Thesis-Atom Links ───────────────────────────────────────────────────────
-- Evidence atoms supporting or contradicting a thesis

CREATE TABLE IF NOT EXISTS market_thesis_atoms (
  id SERIAL PRIMARY KEY,
  thesis_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'supports',             -- supports, contradicts, context, assumption
  weight REAL NOT NULL DEFAULT 1.0,                  -- importance weight
  added_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (thesis_id) REFERENCES market_theses(id) ON DELETE CASCADE,
  FOREIGN KEY (atom_id) REFERENCES market_atoms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_thesis_atoms_thesis ON market_thesis_atoms(thesis_id);
CREATE INDEX IF NOT EXISTS idx_market_thesis_atoms_atom ON market_thesis_atoms(atom_id);

-- ── Predictions ─────────────────────────────────────────────────────────────
-- Concrete, measurable forward-looking claims derived from theses

CREATE TABLE IF NOT EXISTS market_predictions (
  id TEXT PRIMARY KEY,
  thesis_id TEXT,                                   -- optional link to parent thesis
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  prediction_type TEXT NOT NULL DEFAULT 'directional', -- directional, price_target, timing, relative, binary
  target_entity TEXT,                                -- entity this prediction is about
  target_symbol TEXT,                                -- ticker symbol if applicable
  predicted_outcome TEXT NOT NULL,                   -- the specific predicted outcome
  predicted_value REAL,                              -- numeric target if applicable
  predicted_direction TEXT,                          -- up, down, flat
  confidence REAL NOT NULL DEFAULT 0.5,
  time_horizon_days INTEGER,                         -- days until expected outcome
  deadline TEXT,                                     -- hard deadline for validation
  status TEXT NOT NULL DEFAULT 'active',              -- active, expired, validated, invalidated
  actual_outcome TEXT,                               -- what actually happened
  actual_value REAL,                                 -- actual numeric value
  was_correct INTEGER,                               -- 1 = correct, 0 = wrong, NULL = pending
  brier_score REAL,                                  -- Brier score (0 = perfect, 1 = worst)
  key_assumptions TEXT DEFAULT '[]',                 -- JSON array
  validated_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_predictions_thesis ON market_predictions(thesis_id);
CREATE INDEX IF NOT EXISTS idx_market_predictions_status ON market_predictions(status);
CREATE INDEX IF NOT EXISTS idx_market_predictions_deadline ON market_predictions(deadline);
CREATE INDEX IF NOT EXISTS idx_market_predictions_symbol ON market_predictions(target_symbol);

-- ── Prediction Feedback ─────────────────────────────────────────────────────
-- Detailed validation results and learning from prediction outcomes

CREATE TABLE IF NOT EXISTS market_prediction_feedback (
  id SERIAL PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'validation',  -- validation, partial_update, assumption_check
  predicted_value REAL,
  actual_value REAL,
  accuracy_score REAL,                               -- 0.0 to 1.0
  explanation TEXT,                                   -- why prediction was right/wrong
  lessons_learned TEXT,                               -- key takeaways
  atoms_created TEXT DEFAULT '[]',                   -- JSON: atom IDs created from this feedback
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (prediction_id) REFERENCES market_predictions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_pred_feedback_pred ON market_prediction_feedback(prediction_id);

-- ── Market Entities ─────────────────────────────────────────────────────────
-- Companies, sectors, instruments, currencies, commodities in the market graph

CREATE TABLE IF NOT EXISTS market_entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,                         -- company, sector, index, currency, commodity, etf, crypto, central_bank, event_type
  symbol TEXT,                                       -- ticker symbol if applicable
  description TEXT,
  metadata TEXT DEFAULT '{}',                        -- JSON: sector, country, market_cap, etc.
  atom_count INTEGER NOT NULL DEFAULT 0,             -- denormalized count of linked atoms
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_entities_type ON market_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_market_entities_symbol ON market_entities(symbol);
CREATE INDEX IF NOT EXISTS idx_market_entities_name ON market_entities(name);

-- ── Market Entity Relationships ─────────────────────────────────────────────
-- How entities relate to each other (supply chain, competition, correlation)

CREATE TABLE IF NOT EXISTS market_entity_relationships (
  id SERIAL PRIMARY KEY,
  source_entity_id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,                   -- competes_with, supplies_to, subsidiary_of, correlates_with, sector_member, affected_by
  strength REAL NOT NULL DEFAULT 0.5,                -- 0.0 to 1.0
  evidence_atom_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT DEFAULT '{}',                        -- JSON: extra context
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (source_entity_id) REFERENCES market_entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_entity_id) REFERENCES market_entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_entity_rel_source ON market_entity_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_market_entity_rel_target ON market_entity_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_market_entity_rel_type ON market_entity_relationships(relationship_type);

-- ── Market Entity Aliases ───────────────────────────────────────────────────
-- Alternative names, tickers, and identifiers for entities

CREATE TABLE IF NOT EXISTS market_entity_aliases (
  id SERIAL PRIMARY KEY,
  entity_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'name',            -- name, ticker, isin, cusip, lei, abbreviation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (entity_id) REFERENCES market_entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_entity_aliases_entity ON market_entity_aliases(entity_id);
CREATE INDEX IF NOT EXISTS idx_market_entity_aliases_alias ON market_entity_aliases(alias);

-- ── Signal Weights ──────────────────────────────────────────────────────────
-- Learned weights for different signal types based on prediction accuracy

CREATE TABLE IF NOT EXISTS market_signal_weights (
  id SERIAL PRIMARY KEY,
  signal_type TEXT NOT NULL,                         -- atom_type + category combination
  category TEXT NOT NULL DEFAULT 'general',           -- market category this weight applies to
  weight REAL NOT NULL DEFAULT 1.0,                  -- multiplier for confidence
  sample_size INTEGER NOT NULL DEFAULT 0,            -- number of predictions this is based on
  accuracy REAL,                                     -- historical accuracy of this signal type
  last_calibrated_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_signal_weights_type ON market_signal_weights(signal_type, category);
