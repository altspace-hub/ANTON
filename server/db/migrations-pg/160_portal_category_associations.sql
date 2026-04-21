-- ── 160_portal_category_associations.sql ────────────────────────────────────
-- Visitor-Home category taxonomy (15 categories: Pathfinder / Jobs /
-- Marketplace / Friends / Video / Music / Food / Shop / Sport / News / Money
-- / Travel / Health / Places / Learn). Orthogonal to the registry-level
-- category enum (personal/business/community/commerce/…) in
-- server/services/registry-protocol/operations/register.ts — a single portal
-- can belong to multiple Visitor-Home categories (a catering shop appears in
-- both Food and Shop).
--
-- `source` records how the association came to be:
--   manual              — operator set it in the Manage UI
--   self-declared       — portal owner declared via capability descriptor
--   pathfinder-inferred — Pathfinder's indexing inferred the match
--   curator-featured    — ANTON curator pinned the portal in this category

CREATE TABLE IF NOT EXISTS portal_category_associations (
  portal_id     UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  category_id   TEXT NOT NULL,
  score         REAL NOT NULL DEFAULT 1.0,
  source        TEXT NOT NULL CHECK (source IN ('manual', 'self-declared', 'pathfinder-inferred', 'curator-featured')),
  curator_note  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (portal_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_pca_category_score
  ON portal_category_associations (category_id, score DESC);
