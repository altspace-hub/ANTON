-- Cross-pillar references: link market entities to Work/School/Life items
CREATE TABLE IF NOT EXISTS market_cross_pillar_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_entity_type TEXT NOT NULL,
  market_entity_id TEXT NOT NULL,
  external_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'related',
  notes TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcpr_market ON market_cross_pillar_refs (market_entity_type, market_entity_id);
CREATE INDEX IF NOT EXISTS idx_mcpr_external ON market_cross_pillar_refs (external_type, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mcpr_unique ON market_cross_pillar_refs (market_entity_id, external_id, relationship);
