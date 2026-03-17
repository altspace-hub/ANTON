-- PostgreSQL equivalent of 039_knowledge_atoms_fts5.sql
-- Adds tsvector column + GIN index + trigger + backfill
-- Replaces SQLite FTS5 virtual table with native PostgreSQL full-text search.

-- Add tsvector column if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_atoms' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE knowledge_atoms ADD COLUMN search_vector tsvector;
  END IF;
END $$;

-- Create GIN index
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_search
  ON knowledge_atoms USING GIN(search_vector);

-- Trigger function
CREATE OR REPLACE FUNCTION knowledge_atoms_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_knowledge_atoms_search_vector ON knowledge_atoms;
CREATE TRIGGER trg_knowledge_atoms_search_vector
  BEFORE INSERT OR UPDATE OF content ON knowledge_atoms
  FOR EACH ROW
  EXECUTE FUNCTION knowledge_atoms_search_vector_update();

-- Backfill existing rows
UPDATE knowledge_atoms SET search_vector = to_tsvector('english', COALESCE(content, ''))
WHERE search_vector IS NULL;
