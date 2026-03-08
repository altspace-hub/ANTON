-- KG-03: FTS5 virtual table for knowledge_atoms (BM25 full-text search)
-- Replaces LIKE-based substring search with proper BM25 scoring.
--
-- Uses an external-content FTS5 table linked to knowledge_atoms.
-- The 'rank' function returns BM25 scores (more negative = more relevant).

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_atoms_fts USING fts5(
  content,
  content='knowledge_atoms',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Populate FTS index from existing rows (idempotent: only inserts if table is empty)
INSERT INTO knowledge_atoms_fts(rowid, content)
  SELECT rowid, content FROM knowledge_atoms
  WHERE rowid NOT IN (SELECT rowid FROM knowledge_atoms_fts);

-- Triggers to keep FTS index in sync with knowledge_atoms

CREATE TRIGGER IF NOT EXISTS knowledge_atoms_ai
  AFTER INSERT ON knowledge_atoms BEGIN
  INSERT INTO knowledge_atoms_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_atoms_ad
  AFTER DELETE ON knowledge_atoms BEGIN
  INSERT INTO knowledge_atoms_fts(knowledge_atoms_fts, rowid, content)
    VALUES('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_atoms_au
  AFTER UPDATE ON knowledge_atoms BEGIN
  INSERT INTO knowledge_atoms_fts(knowledge_atoms_fts, rowid, content)
    VALUES('delete', old.rowid, old.content);
  INSERT INTO knowledge_atoms_fts(rowid, content) VALUES (new.rowid, new.content);
END;
