-- Migration 054: Markets Pillar — 5 Whys Schema Completion (v2 columns)

-- ── market_why_chains — new columns ──────────────────────────────────────────

ALTER TABLE market_why_chains ADD COLUMN direction TEXT DEFAULT 'failure_analysis';
ALTER TABLE market_why_chains ADD COLUMN root_cause_reached INTEGER DEFAULT 0;
ALTER TABLE market_why_chains ADD COLUMN chain_data TEXT DEFAULT '[]';
ALTER TABLE market_why_chains ADD COLUMN root_cause_summary TEXT;
ALTER TABLE market_why_chains ADD COLUMN atoms_created TEXT DEFAULT '[]';
ALTER TABLE market_why_chains ADD COLUMN correlations_updated TEXT DEFAULT '[]';
ALTER TABLE market_why_chains ADD COLUMN signal_weights_updated TEXT DEFAULT '[]';
ALTER TABLE market_why_chains ADD COLUMN blind_spots_identified TEXT DEFAULT '[]';
ALTER TABLE market_why_chains ADD COLUMN process_improvements TEXT DEFAULT '[]';
ALTER TABLE market_why_chains ADD COLUMN investigation_tasks_spawned TEXT DEFAULT '[]';
ALTER TABLE market_why_chains ADD COLUMN systemic_impact TEXT;
ALTER TABLE market_why_chains ADD COLUMN theses_affected INTEGER DEFAULT 0;
ALTER TABLE market_why_chains ADD COLUMN indexes_affected INTEGER DEFAULT 0;

-- ── market_why_chain_levels — new columns ────────────────────────────────────

ALTER TABLE market_why_chain_levels ADD COLUMN level_type TEXT DEFAULT 'symptom';
ALTER TABLE market_why_chain_levels ADD COLUMN atoms_created_at_level TEXT DEFAULT '[]';
ALTER TABLE market_why_chain_levels ADD COLUMN research_performed TEXT;

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_market_why_chains_direction ON market_why_chains(direction);
CREATE INDEX IF NOT EXISTS idx_market_why_chains_systemic ON market_why_chains(systemic_impact);
CREATE INDEX IF NOT EXISTS idx_market_why_levels_type ON market_why_chain_levels(level_type);
