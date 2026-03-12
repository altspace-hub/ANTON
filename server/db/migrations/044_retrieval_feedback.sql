-- 044: Retrieval feedback — tracks which knowledge atoms were injected
-- into sessions and whether they were relevant (for future learning).
-- Part of the APCI hybrid memory retrieval upgrade (Phase A+B).

CREATE TABLE IF NOT EXISTS retrieval_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  retrieval_method TEXT NOT NULL DEFAULT 'hybrid',  -- 'hybrid', 'sql_fallback'
  retrieval_score REAL,
  injected_at TEXT NOT NULL DEFAULT (datetime('now')),
  was_relevant INTEGER  -- null = no feedback yet, 1 = relevant, 0 = irrelevant
);

CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_session ON retrieval_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_atom ON retrieval_feedback(atom_id);
