-- Fix missing columns on market_atoms and market_theses
-- Migration 057 (partitioning) was registered but failed due to column mismatch.
-- This adds the columns that services expect.

-- ═══════════════════════════════════════════════════════════════
-- 1. market_atoms — add source, source_url, affected_symbols, metadata, status
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'source') THEN
    ALTER TABLE market_atoms ADD COLUMN source TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'source_url') THEN
    ALTER TABLE market_atoms ADD COLUMN source_url TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'affected_symbols') THEN
    ALTER TABLE market_atoms ADD COLUMN affected_symbols JSONB DEFAULT '[]';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'metadata') THEN
    ALTER TABLE market_atoms ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_atoms' AND column_name = 'status') THEN
    ALTER TABLE market_atoms ADD COLUMN status TEXT DEFAULT 'active';
  END IF;
END $$;

-- GIN indexes on the new JSONB columns
CREATE INDEX IF NOT EXISTS idx_market_atoms_affected_symbols_gin ON market_atoms USING GIN(affected_symbols);
CREATE INDEX IF NOT EXISTS idx_market_atoms_status ON market_atoms (status);

-- ═══════════════════════════════════════════════════════════════
-- 2. market_theses — add evidence_atoms, affected_symbols
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_theses' AND column_name = 'evidence_atoms') THEN
    ALTER TABLE market_theses ADD COLUMN evidence_atoms JSONB DEFAULT '[]';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'market_theses' AND column_name = 'affected_symbols') THEN
    ALTER TABLE market_theses ADD COLUMN affected_symbols JSONB DEFAULT '[]';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_market_theses_evidence_atoms_gin ON market_theses USING GIN(evidence_atoms);
CREATE INDEX IF NOT EXISTS idx_market_theses_affected_symbols_gin ON market_theses USING GIN(affected_symbols);
