-- Migration 118: ANTON Missions — Delivery + Templates + High-Risk Tracking (Phase 3)

-- ── mission_deliveries — output delivery routing ──────────────────────────

CREATE TABLE IF NOT EXISTS missions.mission_deliveries (
  id                          BIGSERIAL PRIMARY KEY,
  mission_id                  TEXT NOT NULL REFERENCES missions.missions(id) ON DELETE CASCADE,
  task_id                     TEXT REFERENCES missions.mission_tasks(id) ON DELETE SET NULL,
  channel                     TEXT NOT NULL
    CHECK (channel IN ('in_app', 'email', 'webhook', 'google_drive', 'sharepoint', 'slack', 'filesystem')),
  destination                 JSONB NOT NULL DEFAULT '{}',         -- channel-specific addressing
  status                      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivering', 'delivered', 'failed')),
  output_files                JSONB NOT NULL DEFAULT '[]',
  delivery_details            JSONB NOT NULL DEFAULT '{}',
  retry_count                 INTEGER NOT NULL DEFAULT 0,
  max_retries                 INTEGER NOT NULL DEFAULT 3,
  delivered_at                TIMESTAMPTZ,
  error_message               TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_mission ON missions.mission_deliveries(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_pending ON missions.mission_deliveries(status, created_at)
  WHERE status = 'pending';

-- ── document_templates — fillable templates (DOCX, XLSX, PPTX, PDF) ───────

CREATE TABLE IF NOT EXISTS missions.document_templates (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  description                 TEXT,
  template_type               TEXT NOT NULL
    CHECK (template_type IN ('docx', 'xlsx', 'pdf', 'pptx', 'markdown', 'html')),
  category                    TEXT,                            -- 'regulatory' / 'consulting' / 'internal'
  regulation                  TEXT,                            -- 'AMLR', 'DORA', 'MiCA', etc.
  template_file_path          TEXT NOT NULL,                   -- under data/missions/templates/
  field_schema                JSONB NOT NULL DEFAULT '[]',     -- fillable fields with types
  version                     TEXT NOT NULL DEFAULT '1.0.0',
  is_builtin                  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_category ON missions.document_templates(category);

-- ── high-risk classification on missions ──────────────────────────────────
-- Per spec §11.2 (EU AI Act Annex III): recruitment, credit assessment,
-- regulatory compliance assessment are high-risk → cannot run at full_autonomy

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'missions' AND table_name = 'missions' AND column_name = 'risk_classification'
  ) THEN
    ALTER TABLE missions.missions
      ADD COLUMN risk_classification TEXT NOT NULL DEFAULT 'standard'
      CHECK (risk_classification IN ('standard', 'high_risk', 'prohibited'));
    ALTER TABLE missions.missions
      ADD COLUMN ai_act_category TEXT;          -- e.g. 'employment', 'credit', 'compliance'
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_missions_risk ON missions.missions(risk_classification)
  WHERE risk_classification != 'standard';

-- ── checkpoint linkage to BEEHIVE sessions ────────────────────────────────
-- A parallel_review checkpoint creates a BEEHIVE session. Storing the
-- session id lets the mission resume when BEEHIVE concludes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'missions' AND table_name = 'mission_tasks' AND column_name = 'beehive_session_id'
  ) THEN
    ALTER TABLE missions.mission_tasks
      ADD COLUMN beehive_session_id TEXT;
    -- Note: cross-table FK to beehive_sessions(id) intentionally omitted —
    -- BEEHIVE sessions live in public.beehive_sessions and may outlive the
    -- mission task (and be archived independently). We track the link as
    -- a reference, not a strict FK.
    CREATE INDEX IF NOT EXISTS idx_mission_tasks_beehive ON missions.mission_tasks(beehive_session_id)
      WHERE beehive_session_id IS NOT NULL;
  END IF;
END
$$;
