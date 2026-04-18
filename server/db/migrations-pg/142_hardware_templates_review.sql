-- ──────────────────────────────────────────────────────────────────────────────
-- 142_hardware_templates_review.sql — templates + community review queue.
--
-- Three tables:
--   hw_templates                — reusable project blueprints
--   hw_community_review_queue   — pending community submissions (HKP/case/template)
--   hw_template_instantiations  — usage audit (template -> instantiated projects)
--
-- Templates can be authoritative (vendor/ANTON-curated) or community-contributed
-- (require review before becoming visible by default).
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hw_templates (
  id                       TEXT PRIMARY KEY,                -- human-readable, e.g. 'esp32-wifi-sensor-mqtt'
  family_id                TEXT NOT NULL,
  hkp_id                   TEXT REFERENCES hardware_knowledge_packs(id) ON DELETE SET NULL,
  -- Defaults applied to projects instantiated from the template
  path                     TEXT NOT NULL CHECK (path IN ('diagnose', 'maintain', 'develop')),
  recommended_tier         INTEGER NOT NULL CHECK (recommended_tier IN (1, 2, 3)),
  title                    TEXT NOT NULL,
  short_description        TEXT NOT NULL,
  long_description         TEXT,
  -- Pre-populated project metadata (posture, hkp_id, etc.) merged into the new project on instantiate
  project_blueprint        JSONB NOT NULL DEFAULT '{}',
  -- Phase data per phase_key (so e.g. requirements phase comes pre-filled with sensible starter text)
  phase_seed_data          JSONB NOT NULL DEFAULT '{}',
  -- Recommended quality-pipeline gates (subset of QualityAdapter gateKeys)
  recommended_gates        JSONB NOT NULL DEFAULT '[]',
  starter_system_prompt    TEXT,                            -- optional Layer-2/3 prompt enrichment
  -- Provenance
  authoritative            BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE for ANTON-curated; FALSE for community contributions
  signed_by                TEXT NOT NULL,
  signing_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  schema_version           TEXT NOT NULL DEFAULT '1.0',
  tags                     JSONB NOT NULL DEFAULT '[]',
  -- Capture provenance — when template was forked from a real project
  source_project_id        TEXT REFERENCES hardware_projects(id) ON DELETE SET NULL,
  installs_count           INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hw_templates_family   ON hw_templates(family_id);
CREATE INDEX IF NOT EXISTS ix_hw_templates_path     ON hw_templates(path);
CREATE INDEX IF NOT EXISTS ix_hw_templates_auth     ON hw_templates(authoritative);
CREATE INDEX IF NOT EXISTS ix_hw_templates_installs ON hw_templates(installs_count DESC);

-- Community review queue — single table for all three submission kinds.
-- Reviewers approve / reject; on approve, source artefact is promoted
-- (set authoritative=true on hkp / diagnostic_case / template).
CREATE TABLE IF NOT EXISTS hw_community_review_queue (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  submission_kind       TEXT NOT NULL CHECK (submission_kind IN ('hkp', 'diagnostic-case', 'template', 'patch-bundle')),
  source_id             TEXT NOT NULL,                     -- id of hkp / diagnostic_case / template
  source_family_id      TEXT,                               -- copy for query speed
  submitted_by          TEXT NOT NULL,
  submission_summary    TEXT NOT NULL,                     -- one-line "what + why" from submitter
  submission_notes      TEXT,                               -- optional longer explanation
  content_hash          TEXT NOT NULL,                     -- sha256 of content at submission time
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'in-review', 'approved', 'rejected', 'withdrawn')),
  -- Reviewer fields populated when reviewer claims + decides
  reviewed_by           TEXT,
  review_started_at     TIMESTAMPTZ,
  review_decision_at    TIMESTAMPTZ,
  review_decision       TEXT CHECK (review_decision IN ('approved', 'rejected', NULL)),
  review_notes          TEXT,                               -- reviewer's rationale (mandatory for reject)
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Mandatory security review for HKP submissions (per spec §13)
  security_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  security_reviewed_by  TEXT,
  security_reviewed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_hw_review_status     ON hw_community_review_queue(status);
CREATE INDEX IF NOT EXISTS ix_hw_review_kind       ON hw_community_review_queue(submission_kind);
CREATE INDEX IF NOT EXISTS ix_hw_review_submitter  ON hw_community_review_queue(submitted_by);
CREATE INDEX IF NOT EXISTS ix_hw_review_pending    ON hw_community_review_queue(status, submitted_at DESC) WHERE status IN ('pending', 'in-review');

-- Template usage audit — populated when a project is created via instantiate.
CREATE TABLE IF NOT EXISTS hw_template_instantiations (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  template_id         TEXT NOT NULL REFERENCES hw_templates(id) ON DELETE CASCADE,
  project_id          TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  instantiated_by     TEXT NOT NULL,
  instantiated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  template_schema_version TEXT NOT NULL,
  UNIQUE (template_id, project_id)
);

CREATE INDEX IF NOT EXISTS ix_hw_inst_template ON hw_template_instantiations(template_id);
CREATE INDEX IF NOT EXISTS ix_hw_inst_project  ON hw_template_instantiations(project_id);
