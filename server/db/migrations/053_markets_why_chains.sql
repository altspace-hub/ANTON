-- Migration 053: Markets Pillar Phase 5 — 5 Whys Causal Analysis

CREATE TABLE IF NOT EXISTS market_why_chains (
  id TEXT PRIMARY KEY,
  investigation_id TEXT,
  prediction_id TEXT,
  title TEXT NOT NULL,
  root_cause_type TEXT,                              -- data_gap, model_limitation, signal_weakness, process_gap, assumption_flaw, external_shock, infrastructure_gap, consul_calibration, regime_mismatch
  root_cause_description TEXT,
  impact_assessment TEXT,
  num_levels INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',         -- in_progress, completed
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (investigation_id) REFERENCES market_investigation_tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (prediction_id) REFERENCES market_predictions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_market_why_chains_investigation ON market_why_chains(investigation_id);
CREATE INDEX IF NOT EXISTS idx_market_why_chains_root ON market_why_chains(root_cause_type);

CREATE TABLE IF NOT EXISTS market_why_chain_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_id TEXT NOT NULL,
  level_number INTEGER NOT NULL,                     -- 1 through 5
  question TEXT NOT NULL,                            -- "Why did X happen?"
  answer TEXT NOT NULL,
  evidence_atoms TEXT DEFAULT '[]',                  -- JSON: atom IDs supporting this answer
  atom_created TEXT,                                  -- atom ID created from this finding
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (chain_id) REFERENCES market_why_chains(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_why_levels_chain ON market_why_chain_levels(chain_id);
