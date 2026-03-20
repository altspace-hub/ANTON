-- Migration 078: Knowledge sharing provenance tracking

CREATE TABLE IF NOT EXISTS community_shared_atoms (
  id TEXT PRIMARY KEY,
  atom_id TEXT NOT NULL,
  original_atom_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'sent',
  contact_hash TEXT NOT NULL,
  mail_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  conflict_atom_id TEXT,
  conflict_reason TEXT,
  shared_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_community_shared_atoms_contact ON community_shared_atoms(contact_hash, direction);
CREATE INDEX IF NOT EXISTS idx_community_shared_atoms_status ON community_shared_atoms(status);
CREATE INDEX IF NOT EXISTS idx_community_shared_atoms_atom ON community_shared_atoms(atom_id);
