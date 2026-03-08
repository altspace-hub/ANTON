-- EXPORT-03: Track exports per session to enable change log auto-population
-- Each export record stores a content hash and version number.
-- On re-export of the same session, version is incremented and the change log
-- section is injected into the exported document.

CREATE TABLE IF NOT EXISTS session_exports (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id   TEXT NOT NULL,
  module_id    TEXT,
  format       TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  exported_at  TEXT NOT NULL DEFAULT (datetime('now')),
  exported_by  TEXT,

  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_exports_session ON session_exports(session_id, exported_at DESC);
