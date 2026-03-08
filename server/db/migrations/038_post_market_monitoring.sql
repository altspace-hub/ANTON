-- EUAI-04: Post-market monitoring log
-- EU AI Act Art. 72 — operators of high-risk AI systems must maintain logs.
-- Tracks: output quality ratings, reversal/amendment events, complaints.

CREATE TABLE IF NOT EXISTS post_market_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL DEFAULT 'default',
  session_id      TEXT,                          -- associated session, if any
  module_id       TEXT,                          -- associated module, if any
  event_type      TEXT    NOT NULL CHECK (event_type IN (
                    'quality_rating',            -- user rated output quality
                    'reversal',                  -- user reversed/rejected an AI-assisted decision
                    'amendment',                 -- user significantly amended AI output before use
                    'complaint',                 -- user submitted a complaint about AI behaviour
                    'incident'                   -- serious incident (wrong output led to adverse event)
                  )),
  severity        TEXT    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  quality_score   INTEGER CHECK (quality_score BETWEEN 1 AND 5),  -- for quality_rating events
  description     TEXT    NOT NULL,              -- free-text description of the event
  corrective_action TEXT,                        -- what the user did to correct/mitigate
  metadata        TEXT,                          -- JSON blob for event-specific extra data
  reviewed_by     TEXT,                          -- admin reviewer name
  reviewed_at     DATETIME,
  created_at      DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pmm_user_date
  ON post_market_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmm_module
  ON post_market_events(module_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmm_session
  ON post_market_events(session_id);
