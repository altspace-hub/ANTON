-- 276 — session conclusions keep their history (Wave 4b, 2026-09-17).
--
-- session_snapshots was created with UNIQUE (session_id): one row per session,
-- which made sense when a snapshot was a manual "pause" bookmark. Since Wave 4
-- the utility model writes the session's conclusion after every answer, and a
-- single row meant each conclusion overwrote the last — the project layer and
-- the resume block could only ever see the newest, and "what did we decide
-- two answers ago" was gone. One row per answer from here on; readers take the
-- newest by created_at (idx_session_snapshots_session_created, migration 275).
ALTER TABLE session_snapshots DROP CONSTRAINT IF EXISTS session_snapshots_session_id_key;
CREATE INDEX IF NOT EXISTS idx_session_snapshots_session ON session_snapshots(session_id);
