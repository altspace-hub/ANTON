-- Migration 101: Entity graph federation support
-- Enables federated entity views across connected ANTON instances

ALTER TABLE entity_nodes
  ADD COLUMN IF NOT EXISTS source_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS source_peer_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_federated INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_entity_nodes_instance
  ON entity_nodes(source_instance_id) WHERE source_instance_id IS NOT NULL;

ALTER TABLE entity_relationships
  ADD COLUMN IF NOT EXISTS source_instance_id TEXT;
