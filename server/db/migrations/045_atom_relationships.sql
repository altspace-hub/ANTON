-- 045: Atom-to-atom relationships — tracks how knowledge atoms
-- relate to each other (supports, contradicts, extends, etc.).
-- Part of the APCI knowledge graph layer.

CREATE TABLE IF NOT EXISTS atom_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_atom_id TEXT NOT NULL,
  to_atom_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK(relationship_type IN ('supports','contradicts','extends','requires','caused_by','related_to')),
  strength REAL NOT NULL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_atom_rel_from ON atom_relationships(from_atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_rel_to ON atom_relationships(to_atom_id);
CREATE INDEX IF NOT EXISTS idx_atom_rel_type ON atom_relationships(relationship_type);
