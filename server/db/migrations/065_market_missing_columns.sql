-- Fix missing columns on market_atoms and market_theses (SQLite version)

ALTER TABLE market_atoms ADD COLUMN source TEXT;
ALTER TABLE market_atoms ADD COLUMN source_url TEXT;
ALTER TABLE market_atoms ADD COLUMN affected_symbols TEXT DEFAULT '[]';
ALTER TABLE market_atoms ADD COLUMN metadata TEXT DEFAULT '{}';
ALTER TABLE market_atoms ADD COLUMN status TEXT DEFAULT 'active';

ALTER TABLE market_theses ADD COLUMN evidence_atoms TEXT DEFAULT '[]';
ALTER TABLE market_theses ADD COLUMN affected_symbols TEXT DEFAULT '[]';
