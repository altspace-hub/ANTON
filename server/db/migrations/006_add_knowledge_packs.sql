-- ============================================================================
-- Migration 006: Regulatory Knowledge Packs
-- Adds the knowledge_packs lifecycle table and pack-source columns to the
-- entity graph tables so pack-imported nodes can be tracked and uninstalled.
-- ============================================================================

-- ── knowledge_packs table ─────────────────────────────────────────────────────
-- Tracks every .anton regulatory-knowledge-pack bundle that has been imported.

CREATE TABLE IF NOT EXISTS knowledge_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  description TEXT,
  jurisdiction TEXT,
  regulatory_area TEXT,
  regulation_ids TEXT DEFAULT '[]',        -- JSON array: ["AMLR", "AMLD6", ...]
  author TEXT,
  publisher TEXT,
  tier INTEGER DEFAULT 2 CHECK(tier IN (1, 2, 3)),
  entity_count INTEGER DEFAULT 0,
  relationship_count INTEGER DEFAULT 0,
  alias_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'installed'
    CHECK(status IN ('installed', 'active', 'deactivated', 'error')),
  manifest TEXT NOT NULL DEFAULT '{}',     -- full manifest JSON
  file_hash TEXT,                          -- SHA-256 of the .anton bundle
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT,
  deactivated_at TEXT,
  user_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_knowledge_packs_status ON knowledge_packs(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_user ON knowledge_packs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_area ON knowledge_packs(regulatory_area);

-- ── Pack-source columns on entity_nodes ──────────────────────────────────────
-- Tracks whether a node was created by a pack import (source = 'pack')
-- and which pack it belongs to (pack_id). Workflow-extracted nodes keep
-- source = 'workflow' (existing default).

ALTER TABLE entity_nodes ADD COLUMN source TEXT NOT NULL DEFAULT 'workflow'
  CHECK(source IN ('workflow', 'pack', 'manual'));
ALTER TABLE entity_nodes ADD COLUMN pack_id TEXT REFERENCES knowledge_packs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_entity_nodes_source ON entity_nodes(source);
CREATE INDEX IF NOT EXISTS idx_entity_nodes_pack ON entity_nodes(pack_id);

-- ── Pack-source columns on entity_relationships ───────────────────────────────

ALTER TABLE entity_relationships ADD COLUMN source TEXT NOT NULL DEFAULT 'workflow'
  CHECK(source IN ('workflow', 'pack', 'manual'));
ALTER TABLE entity_relationships ADD COLUMN pack_id TEXT REFERENCES knowledge_packs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_entity_relationships_pack ON entity_relationships(pack_id);

-- ── Pack-source column on entity_aliases ─────────────────────────────────────

ALTER TABLE entity_aliases ADD COLUMN pack_id TEXT REFERENCES knowledge_packs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_entity_aliases_pack ON entity_aliases(pack_id);

-- ── Composite covering indexes for common pack queries ────────────────────────
CREATE INDEX IF NOT EXISTS idx_entity_nodes_pack_type
  ON entity_nodes(pack_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_packs_area_status
  ON knowledge_packs(regulatory_area, status);
