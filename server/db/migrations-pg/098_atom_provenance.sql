-- Migration 098: Add provenance metadata to knowledge_atoms
-- Enables boost differentiation for local vs external (peer-shared) atoms
-- Required for cross-instance knowledge sharing (Whitepaper Part 3, §20-21)

ALTER TABLE knowledge_atoms
  ADD COLUMN IF NOT EXISTS source_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS source_peer_hash TEXT,
  ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'local'
    CHECK (trust_level IN ('local', 'trusted_peer', 'known_peer', 'external'));

CREATE INDEX IF NOT EXISTS idx_atoms_provenance
  ON knowledge_atoms(source_instance_id, trust_level);
CREATE INDEX IF NOT EXISTS idx_atoms_peer
  ON knowledge_atoms(source_peer_hash) WHERE source_peer_hash IS NOT NULL;

-- Also add provenance to market_atoms for consistency
ALTER TABLE market_atoms
  ADD COLUMN IF NOT EXISTS source_instance_id TEXT,
  ADD COLUMN IF NOT EXISTS source_peer_hash TEXT,
  ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'local';
