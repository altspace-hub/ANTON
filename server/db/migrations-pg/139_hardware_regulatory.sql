-- ──────────────────────────────────────────────────────────────────────────────
-- 139_hardware_regulatory.sql — Tier 2 / Tier 3 regulatory artefact pack.
--
-- Two tables:
--
--   hw_regulatory_artefacts  — one row per artefact per project
--   hw_regulatory_signoffs   — per-sign-off audit trail (immutable history)
--
-- ANTON does NOT certify any artefact — these are templates the user
-- (= the responsible economic operator under CRA / RED / MDR / GDPR /
-- equivalent) reviews and signs. Sign-off here means "the user has
-- reviewed and accepts responsibility for this content as the operator",
-- NOT "ANTON has certified compliance".
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hw_regulatory_artefacts (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  project_id               TEXT NOT NULL REFERENCES hardware_projects(id) ON DELETE CASCADE,
  -- Artefact kind vocabulary (extensible; new kinds add via migration)
  kind                     TEXT NOT NULL CHECK (kind IN (
                             'cra-tech-file',          -- EU Cyber Resilience Act technical file outline
                             'doc',                    -- Declaration of Conformity
                             'vdp',                    -- Vulnerability Disclosure Policy
                             'hazard-analysis',        -- Hazard analysis (safety-critical)
                             'red-declaration',        -- EU Radio Equipment Directive declaration
                             'mdr-classification',     -- EU Medical Device Regulation class advisory
                             'dpa',                    -- Data Protection Assessment (Tier 2 baseline)
                             'workplace-safety'        -- Workplace safety checklist (Tier 2 baseline)
                           )),
  title                    TEXT NOT NULL,
  -- Required-by tier; the registry in regulatory-pack-service mirrors this.
  required_for_tier        INTEGER NOT NULL CHECK (required_for_tier IN (1, 2, 3)),
  -- Whether this artefact only applies under specific project flags.
  -- Examples: mdr-classification only when project.medical_adjacent=true;
  --           red-declaration only when project transmits RF.
  required_when            TEXT NOT NULL DEFAULT 'always'
                            CHECK (required_when IN ('always', 'medical-adjacent', 'safety-critical', 'rf-transmitter')),
  -- Status workflow:
  --   draft           — DB row exists but no content yet
  --   generated       — generator has populated content; user has not opened it
  --   user-reviewed   — user has opened + edited; not yet signed
  --   signed-off      — user has explicitly signed accepting operator responsibility
  --   withdrawn       — sign-off revoked (audit retained in signoffs table)
  status                   TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'generated', 'user-reviewed', 'signed-off', 'withdrawn')),
  content_markdown         TEXT,                     -- the artefact body
  content_schema_version   TEXT NOT NULL DEFAULT '1.0',
  generator_version        TEXT,                     -- which generator produced the seed content
  generator_inputs         JSONB,                    -- snapshot of project context used by the generator
  signed_off_by            TEXT,
  signed_off_at            TIMESTAMPTZ,
  signoff_attestation      TEXT,                     -- the explicit sentence the user attested to
  withdrawn_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, kind)
);

CREATE INDEX IF NOT EXISTS ix_hw_reg_artefacts_project ON hw_regulatory_artefacts(project_id);
CREATE INDEX IF NOT EXISTS ix_hw_reg_artefacts_kind    ON hw_regulatory_artefacts(kind);
CREATE INDEX IF NOT EXISTS ix_hw_reg_artefacts_status  ON hw_regulatory_artefacts(status);

-- Append-only sign-off audit trail. Even when a sign-off is withdrawn we keep
-- the historic row so a future audit can show "this was signed off on date X
-- by person Y, then withdrawn on date Z because…".
CREATE TABLE IF NOT EXISTS hw_regulatory_signoffs (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  artefact_id         TEXT NOT NULL REFERENCES hw_regulatory_artefacts(id) ON DELETE CASCADE,
  action              TEXT NOT NULL CHECK (action IN ('signed-off', 'withdrawn', 'edited', 'regenerated')),
  actor_id            TEXT NOT NULL,
  attestation         TEXT,                          -- only populated for action='signed-off'
  reason              TEXT,                          -- optional, for withdrawals especially
  content_hash        TEXT,                          -- sha256 of content at the time of action
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hw_reg_signoffs_artefact ON hw_regulatory_signoffs(artefact_id, occurred_at DESC);
