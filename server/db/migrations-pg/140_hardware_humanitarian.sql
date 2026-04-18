-- ──────────────────────────────────────────────────────────────────────────────
-- 140_hardware_humanitarian.sql — Humanitarian deployment + capacity transfer.
--
-- Two tables:
--   hw_humanitarian_deployments   — flags a project as humanitarian-context
--                                   with named local partner + donor exit timeline
--   hw_capacity_transfer_artefacts — local-language operator-facing docs
--   hw_capacity_transfer_signoffs  — append-only audit trail (mirrors regulatory)
--
-- Per spec §13: humanitarian Tier 3 deployments NEVER ship without
-- local-language capacity-transfer artefacts. Sign-off model identical to
-- the regulatory pack — operator attestation, content-hashed audit trail.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hw_humanitarian_deployments (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id               TEXT NOT NULL UNIQUE REFERENCES hardware_projects(id) ON DELETE CASCADE,
  -- Named local partner organisation that will own ongoing operation.
  -- "the community" / "the village" not acceptable per spec.
  local_partner_name       TEXT NOT NULL,
  local_partner_contact    TEXT NOT NULL,        -- email / phone / address
  -- OCHA cluster coordination
  ocha_cluster             TEXT,                  -- 'health' / 'wash' / 'shelter' / 'logistics' / 'education' / etc.
  cluster_contact          TEXT,
  -- Donor exit honesty
  donor_exit_date          DATE,                  -- when donor support ends
  post_donor_plan          TEXT,                  -- what happens after donor exit
  -- Deployment shape
  units_planned            INTEGER NOT NULL DEFAULT 1,
  internet_posture         TEXT NOT NULL DEFAULT 'intermittent'
                            CHECK (internet_posture IN ('none', 'intermittent', 'scheduled', 'always-on')),
  power_posture            TEXT NOT NULL DEFAULT 'grid+battery'
                            CHECK (power_posture IN ('grid', 'grid+battery', 'solar', 'generator', 'battery')),
  -- Status workflow
  status                   TEXT NOT NULL DEFAULT 'planning'
                            CHECK (status IN ('planning', 'training', 'pilot', 'rollout', 'operating', 'transferred', 'decommissioned')),
  metadata                 JSONB NOT NULL DEFAULT '{}',
  created_by               TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hw_humanitarian_status ON hw_humanitarian_deployments(status);

CREATE TABLE IF NOT EXISTS hw_capacity_transfer_artefacts (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id               TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  -- Six required artefact kinds per spec §4.2 humanitarian workflow.
  kind                     TEXT NOT NULL CHECK (kind IN (
                             'installation-guide',
                             'operator-checklist',
                             'troubleshooting-flowchart',
                             'spares-procedure',
                             'escalation',
                             'decommissioning'
                           )),
  title                    TEXT NOT NULL,
  -- ISO 639-1 language the artefact body is written in. Set by the generator
  -- from project.working_language at generation time.
  language                 TEXT NOT NULL DEFAULT 'en',
  status                   TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'generated', 'user-reviewed', 'signed-off', 'withdrawn')),
  content_markdown         TEXT,
  generator_version        TEXT,
  generator_kind           TEXT NOT NULL DEFAULT 'claude-localized'
                            CHECK (generator_kind IN ('claude-localized', 'english-skeleton-fallback', 'manual')),
  generator_inputs         JSONB,
  signed_off_by            TEXT,
  signed_off_at            TIMESTAMPTZ,
  signoff_attestation      TEXT,
  withdrawn_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, kind)
);

CREATE INDEX IF NOT EXISTS ix_hw_cap_artefacts_project  ON hw_capacity_transfer_artefacts(project_id);
CREATE INDEX IF NOT EXISTS ix_hw_cap_artefacts_kind     ON hw_capacity_transfer_artefacts(kind);
CREATE INDEX IF NOT EXISTS ix_hw_cap_artefacts_lang     ON hw_capacity_transfer_artefacts(language);
CREATE INDEX IF NOT EXISTS ix_hw_cap_artefacts_status   ON hw_capacity_transfer_artefacts(status);

CREATE TABLE IF NOT EXISTS hw_capacity_transfer_signoffs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  artefact_id     TEXT NOT NULL REFERENCES hw_capacity_transfer_artefacts(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('signed-off', 'withdrawn', 'edited', 'regenerated')),
  actor_id        TEXT NOT NULL,
  attestation     TEXT,
  reason          TEXT,
  content_hash    TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hw_cap_signoffs_artefact ON hw_capacity_transfer_signoffs(artefact_id, occurred_at DESC);
