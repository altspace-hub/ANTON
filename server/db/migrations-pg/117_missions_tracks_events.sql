-- Migration 117: ANTON Missions — Tracks, Events, Structured Storage (Phase 2)
--
-- Adds:
--   • mission_tracks — multi-track sub-missions within a single mission (A6)
--   • mission_scheduled_tasks — one-off timed tasks (A2)
--   • mission_event_queue — inbound external events (A7)
--   • mission_data_tables / mission_data_rows — generic structured storage (A4)
--   • mission_document_intake — incoming document pipeline (A3)
--   • web_snapshots / web_snapshot_diffs — web change monitor (A9)
--
-- Per ADR §13.3: domain-specific writes (Grow, Procure, Civic) are preferred
-- over mission_data_rows when applicable. mission_data_rows is the GENERIC
-- fallback for ad-hoc structured data.

-- ── mission_tracks — multi-track sub-missions within one mission ──────────

CREATE TABLE IF NOT EXISTS missions.mission_tracks (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  description                 TEXT,
  track_type                  TEXT NOT NULL DEFAULT 'batch'
    CHECK (track_type IN ('batch', 'recurring', 'interactive', 'event_driven')),
  status                      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed')),
  trigger_config              JSONB NOT NULL DEFAULT '{}',     -- CRON / webhook URL / event type
  hot_context                 TEXT,                            -- pre-loaded context for interactive tracks (max ~25K tokens)
  hot_context_updated_at      TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_tracks_mission ON missions.mission_tracks(mission_id, status);

-- Extend mission_tasks to optionally belong to a track. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'missions' AND table_name = 'mission_tasks' AND column_name = 'track_id'
  ) THEN
    ALTER TABLE missions.mission_tasks
      ADD COLUMN track_id TEXT REFERENCES missions.mission_tracks(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_mission_tasks_track ON missions.mission_tasks(track_id);
  END IF;
END
$$;

-- ── mission_scheduled_tasks — one-off timed tasks (A2) ────────────────────
-- "Post article A on April 20, post B on April 27" — internal scheduler.

CREATE TABLE IF NOT EXISTS missions.mission_scheduled_tasks (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT NOT NULL REFERENCES missions.mission_tasks(id) ON DELETE CASCADE,
  execute_at                  TIMESTAMPTZ NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
  payload                     JSONB NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_execute ON missions.mission_scheduled_tasks(execute_at, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_mission ON missions.mission_scheduled_tasks(mission_id);

-- ── mission_event_queue — inbound external events (A7) ────────────────────

CREATE TABLE IF NOT EXISTS missions.mission_event_queue (
  id                          BIGSERIAL PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  track_id                    TEXT REFERENCES missions.mission_tracks(id) ON DELETE SET NULL,
  event_type                  TEXT NOT NULL
    CHECK (event_type IN ('webhook', 'mcp_event', 'email_received', 'file_received', 'slack_message', 'schedule', 'manual')),
  event_payload               JSONB NOT NULL DEFAULT '{}',
  priority                    TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status                      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at                TIMESTAMPTZ,
  error_message               TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_queue_status  ON missions.mission_event_queue(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_event_queue_mission ON missions.mission_event_queue(mission_id, status);

-- ── mission_data_tables + mission_data_rows — generic structured storage ──
-- Preferred precedence: domain-specific tables (grow_*, procure_*, civic_*)
-- when applicable. This is the FALLBACK for ad-hoc mission-specific data.

CREATE TABLE IF NOT EXISTS missions.mission_data_tables (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  table_name                  TEXT NOT NULL,
  schema_definition           JSONB NOT NULL DEFAULT '{}',     -- column types / constraints
  description                 TEXT,
  max_rows                    INTEGER NOT NULL DEFAULT 10000,  -- enforce growth cap
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, table_name)
);

CREATE INDEX IF NOT EXISTS idx_data_tables_mission ON missions.mission_data_tables(mission_id);

CREATE TABLE IF NOT EXISTS missions.mission_data_rows (
  id                          BIGSERIAL PRIMARY KEY,
  table_id                    TEXT NOT NULL REFERENCES missions.mission_data_tables(id) ON DELETE CASCADE,
  row_data                    JSONB NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_rows_table ON missions.mission_data_rows(table_id);

-- Trigger to enforce per-table max_rows
CREATE OR REPLACE FUNCTION missions.check_data_row_limit() RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  row_max       INTEGER;
BEGIN
  SELECT max_rows INTO row_max FROM missions.mission_data_tables WHERE id = NEW.table_id;
  SELECT COUNT(*) INTO current_count FROM missions.mission_data_rows WHERE table_id = NEW.table_id;
  IF current_count >= row_max THEN
    RAISE EXCEPTION 'Mission data table row limit exceeded (% rows). Increase max_rows or archive.', row_max;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_mission_data_row_limit') THEN
    CREATE TRIGGER enforce_mission_data_row_limit
      BEFORE INSERT ON missions.mission_data_rows
      FOR EACH ROW EXECUTE FUNCTION missions.check_data_row_limit();
  END IF;
END
$$;

-- ── mission_document_intake — inbound document pipeline (A3) ──────────────

CREATE TABLE IF NOT EXISTS missions.mission_document_intake (
  id                          TEXT PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  source_type                 TEXT NOT NULL
    CHECK (source_type IN ('email', 'webhook', 'browser', 'folder', 'api')),
  source_details              JSONB NOT NULL DEFAULT '{}',
  filename                    TEXT,
  file_type                   TEXT,
  file_size                   BIGINT,
  file_path                   TEXT,                            -- under data/missions/documents/{mission_id}/
  extracted_text_preview      TEXT,
  atom_ids                    JSONB NOT NULL DEFAULT '[]',
  status                      TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  received_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at                TIMESTAMPTZ,
  error_message               TEXT
);

CREATE INDEX IF NOT EXISTS idx_doc_intake_mission ON missions.mission_document_intake(mission_id, status);

-- ── web_snapshots + web_snapshot_diffs — web change monitor (A9) ──────────

CREATE TABLE IF NOT EXISTS missions.web_snapshots (
  id                          BIGSERIAL PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  url                         TEXT NOT NULL,
  snapshot_type               TEXT NOT NULL DEFAULT 'text'
    CHECK (snapshot_type IN ('text', 'screenshot', 'both')),
  text_content                TEXT,
  screenshot_path             TEXT,
  content_hash                TEXT,                            -- SHA-256 of text_content
  captured_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_web_snapshots_mission_url ON missions.web_snapshots(mission_id, url, captured_at DESC);

CREATE TABLE IF NOT EXISTS missions.web_snapshot_diffs (
  id                          BIGSERIAL PRIMARY KEY,
  snapshot_id_old             BIGINT NOT NULL REFERENCES missions.web_snapshots(id) ON DELETE CASCADE,
  snapshot_id_new             BIGINT NOT NULL REFERENCES missions.web_snapshots(id) ON DELETE CASCADE,
  diff_summary                TEXT,
  diff_details                JSONB,
  significance                TEXT NOT NULL DEFAULT 'low'
    CHECK (significance IN ('none', 'low', 'medium', 'high')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshot_diffs_significance ON missions.web_snapshot_diffs(significance, created_at DESC);
