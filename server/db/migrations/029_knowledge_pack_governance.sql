-- ============================================================================
-- Migration 029: Knowledge Pack Governance Fields (KP-03)
-- Adds provenance and attestation fields to knowledge_packs so that
-- pack imports can be version-stamped and traced to a source document.
-- ============================================================================

ALTER TABLE knowledge_packs ADD COLUMN IF NOT EXISTS effective_date TEXT;         -- e.g. '2024-06-19' (OJ publication date)
ALTER TABLE knowledge_packs ADD COLUMN IF NOT EXISTS source_url TEXT;             -- canonical URL of the regulatory text
ALTER TABLE knowledge_packs ADD COLUMN IF NOT EXISTS validated_by TEXT;           -- name/email of person who verified the content
ALTER TABLE knowledge_packs ADD COLUMN IF NOT EXISTS content_confirmed INTEGER NOT NULL DEFAULT 0; -- 1 = submitter confirmed accuracy

CREATE INDEX IF NOT EXISTS idx_knowledge_packs_effective_date ON knowledge_packs(effective_date);
