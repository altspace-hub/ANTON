-- Migration 123: ANTON Output Transformation System — Phase 1 foundation
--
-- Adds the platform-wide infrastructure for post-hoc output transformation:
--   • sessions.output_structured / content_type / sector — structured twin
--     of output_markdown (which lives in messages.content)
--   • output_versions — versioned output artifacts per session (merged from
--     the SQLite-era schema_enhanced.sql into PG)
--   • renderers — registry of all available output transforms
--   • rendered_artifacts — per-execution artifact storage with validation
--     + metadata + audit linkage
--
-- All additions are backward-compatible. Existing modules continue to work
-- unchanged; `output_structured` is null for sessions whose extraction
-- hasn't run yet.

-- ── Sessions — structured output envelope fields ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'output_structured'
  ) THEN
    ALTER TABLE sessions
      ADD COLUMN output_structured JSONB,                    -- the structured twin of output_markdown
      ADD COLUMN content_type      TEXT,                     -- one of the 8 Phase 1 content types
      ADD COLUMN sector            TEXT,                     -- Phase 2 sector hint; null in Phase 1
      ADD COLUMN structured_status TEXT DEFAULT 'pending'    -- pending | extracted | failed | disabled
        CHECK (structured_status IN ('pending', 'extracted', 'failed', 'disabled')),
      ADD COLUMN structured_hash   TEXT;                     -- content hash of the markdown used for extraction
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_sessions_content_type
  ON sessions(content_type) WHERE content_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_structured_status
  ON sessions(structured_status) WHERE structured_status != 'extracted';

-- ── output_versions — merged from legacy schema_enhanced.sql, PG-native ───
-- Represents the versioned output artifacts for a session. Each rendered
-- artifact from the renderer registry gets a corresponding row here so the
-- existing version-history UI sees renderer outputs uniformly.

CREATE TABLE IF NOT EXISTS output_versions (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id     TEXT,                                      -- nullable soft ref to messages(id)
  version_number INTEGER NOT NULL,
  content        TEXT NOT NULL,                             -- the Markdown / text snapshot
  metadata       JSONB NOT NULL DEFAULT '{}',
  is_current     BOOLEAN NOT NULL DEFAULT FALSE,
  user_id        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_output_versions_session ON output_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_output_versions_current ON output_versions(session_id, is_current)
  WHERE is_current = TRUE;

CREATE TABLE IF NOT EXISTS version_diffs (
  id               BIGSERIAL PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  from_version_id  TEXT NOT NULL REFERENCES output_versions(id) ON DELETE CASCADE,
  to_version_id    TEXT NOT NULL REFERENCES output_versions(id) ON DELETE CASCADE,
  diff_text        TEXT,
  change_summary   TEXT,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_version_diffs_session ON version_diffs(session_id);

-- ── renderers — the registry ──────────────────────────────────────────────
-- One row per available transform. Seeded at startup by the registry loader
-- from a code-defined catalogue. Rows in the DB allow admin override of
-- per-renderer status (e.g. disable a buggy beta renderer without a deploy).

CREATE TABLE IF NOT EXISTS renderers (
  id               TEXT PRIMARY KEY,
  label            TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL
    CHECK (category IN ('visualize', 'adapt_audience', 'package', 'regulatory', 'review')),
  trigger          TEXT NOT NULL DEFAULT 'post_hoc'
    CHECK (trigger IN ('post_hoc', 'upfront', 'both')),
  applies_when     JSONB NOT NULL DEFAULT '{}',             -- { content_types?, sectors?, requires_fields? }
  output           JSONB NOT NULL DEFAULT '{}',             -- { file_type, mime_type, filename_template }
  renderer_module  TEXT NOT NULL,                           -- dotted path or relative import key
  preview_module   TEXT,
  phase            INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'stable'
    CHECK (status IN ('stable', 'beta', 'experimental', 'disabled')),
  sort_order       INTEGER NOT NULL DEFAULT 100,            -- within a category
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_renderers_category_sort ON renderers(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_renderers_enabled ON renderers(status) WHERE status != 'disabled';

-- ── rendered_artifacts — per-execution outputs ────────────────────────────
-- Every renderer invocation writes a row here. Linked to a session and
-- optionally to an output_version (so it appears in the version history).

CREATE TABLE IF NOT EXISTS rendered_artifacts (
  id               BIGSERIAL PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  renderer_id      TEXT NOT NULL REFERENCES renderers(id),
  output_version_id TEXT REFERENCES output_versions(id) ON DELETE SET NULL,
  file_path        TEXT NOT NULL,                           -- relative to OUTPUT_DIR
  preview_path     TEXT,                                    -- optional thumbnail path
  file_type        TEXT NOT NULL,                           -- svg, pdf, html, docx, pptx, xlsx, md, xml, json
  mime_type        TEXT NOT NULL,
  file_size_bytes  BIGINT,
  validation       JSONB,                                   -- { validated_against?, valid, errors? }
  metadata         JSONB NOT NULL DEFAULT '{}',
  options          JSONB NOT NULL DEFAULT '{}',             -- options passed to the renderer
  duration_ms      INTEGER,
  tokens_consumed  INTEGER,                                 -- 0 for deterministic renderers
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       TEXT                                     -- user_id
);
CREATE INDEX IF NOT EXISTS idx_rendered_artifacts_session  ON rendered_artifacts(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rendered_artifacts_renderer ON rendered_artifacts(renderer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rendered_artifacts_version  ON rendered_artifacts(output_version_id)
  WHERE output_version_id IS NOT NULL;

-- ── renderer_audit — light audit trail (who ran what, when, outcome) ──────

CREATE TABLE IF NOT EXISTS renderer_audit_log (
  id               BIGSERIAL PRIMARY KEY,
  session_id       TEXT,
  renderer_id      TEXT,
  artifact_id      BIGINT REFERENCES rendered_artifacts(id) ON DELETE SET NULL,
  user_id          TEXT,
  event            TEXT NOT NULL
    CHECK (event IN ('invoked', 'succeeded', 'failed', 'validation_failed', 'extraction_missing')),
  details          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_renderer_audit_session ON renderer_audit_log(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_renderer_audit_renderer ON renderer_audit_log(renderer_id, created_at DESC);
