-- ──────────────────────────────────────────────────────────────────────────────
-- 133_hardware_build_foundation.sql — Tier 5 Hardware Build, schema foundation
--
-- Implements the three-layer knowledge base from Section 3 of
-- ANTON_Hardware_Build_Spec_v4.md:
--
--   1. Specification layer    → hardware_knowledge_packs + hkp_claims +
--                                hkp_components + hkp_regional_alternatives
--   2. Diagnostic layer       → diagnostic_cases + diagnostic_case_outcomes +
--                                diagnostic_case_cross_references
--   3. Lifecycle layer        → lifecycle_events + lifecycle_event_project_impacts
--
-- All tables carry explicit schema_version columns so additive migrations
-- stay safe. CHECK constraints enforce the spec's classification + event-
-- type vocabularies.
--
-- Launch family is `esp32` only; the family_id column is reserved for
-- arduino, raspberry_pi, stm32, nrf52, rp2040 once those are populated.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Specification layer ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hardware_knowledge_packs (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  family_id             TEXT NOT NULL,                         -- 'esp32', 'arduino', etc.
  manufacturer          TEXT NOT NULL,
  part_number           TEXT NOT NULL,
  revision              TEXT,
  hkp_version           TEXT NOT NULL,                         -- HKP content version
  hkp_schema_version    TEXT NOT NULL DEFAULT '1.0',
  installed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  primary_source        TEXT NOT NULL CHECK (primary_source IN
                          ('sheetsdata-mcp', 'anton-curated', 'community',
                           'user-generated', 'legacy-identified')),
  source_last_refreshed TIMESTAMPTZ,
  signed_by             TEXT,                                  -- contributor identity
  signing_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  metadata              JSONB NOT NULL DEFAULT '{}',           -- environmental profiles, etc.
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (manufacturer, part_number, revision, hkp_version)
);

CREATE INDEX IF NOT EXISTS ix_hkp_family       ON hardware_knowledge_packs(family_id);
CREATE INDEX IF NOT EXISTS ix_hkp_part_number  ON hardware_knowledge_packs(manufacturer, part_number);
CREATE INDEX IF NOT EXISTS ix_hkp_source       ON hardware_knowledge_packs(primary_source);

-- Per-claim provenance + classification (datasheet-verified | community-verified |
-- physically-verified | AI-unverified). Critical-firmware paths consult this.
CREATE TABLE IF NOT EXISTS hkp_claims (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  hkp_id              TEXT NOT NULL REFERENCES hardware_knowledge_packs(id) ON DELETE CASCADE,
  claim_path          TEXT NOT NULL,                          -- e.g. 'hardware-specs.gpio.max_current_per_pin_ma'
  claim_value         TEXT NOT NULL,                          -- stringified; consumers parse per claim_path schema
  classification      TEXT NOT NULL CHECK (classification IN
                        ('datasheet-verified', 'community-verified',
                         'physically-verified', 'AI-unverified')),
  verified_by         JSONB DEFAULT '[]',                     -- contributor identities
  verification_count  INTEGER NOT NULL DEFAULT 0,
  evidence_ref        TEXT,                                   -- pointer to datasheet page or community thread
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hkp_id, claim_path)
);

CREATE INDEX IF NOT EXISTS ix_hkp_claims_classification ON hkp_claims(classification);
CREATE INDEX IF NOT EXISTS ix_hkp_claims_hkp            ON hkp_claims(hkp_id);

-- Components inside an HKP — pin descriptions, peripherals, etc.
CREATE TABLE IF NOT EXISTS hkp_components (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  hkp_id          TEXT NOT NULL REFERENCES hardware_knowledge_packs(id) ON DELETE CASCADE,
  component_type  TEXT NOT NULL,                              -- 'gpio-pin', 'peripheral', 'protocol', etc.
  name            TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hkp_components_hkp_type ON hkp_components(hkp_id, component_type);

-- Regional sourcing alternatives — distributor + price + counterfeit risk per region.
-- Critical for humanitarian deployment kits.
CREATE TABLE IF NOT EXISTS hkp_regional_alternatives (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  hkp_id                   TEXT NOT NULL REFERENCES hardware_knowledge_packs(id) ON DELETE CASCADE,
  component_id             TEXT REFERENCES hkp_components(id) ON DELETE CASCADE,
  region                   TEXT NOT NULL,                     -- ISO region code or named ('west-africa')
  alternative_part         TEXT NOT NULL,
  distributor              TEXT,
  typical_price_local      NUMERIC(12, 4),
  typical_price_currency   TEXT,
  typical_lead_days        INTEGER,
  counterfeit_risk         TEXT CHECK (counterfeit_risk IN ('low', 'moderate', 'high', 'critical')),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hkp_regional_region ON hkp_regional_alternatives(region);
CREATE INDEX IF NOT EXISTS ix_hkp_regional_hkp    ON hkp_regional_alternatives(hkp_id);

-- ── Diagnostic layer ─────────────────────────────────────────────────────────
-- Community-contributed cases. Every successful Diagnose path produces a candidate.

CREATE TABLE IF NOT EXISTS diagnostic_cases (
  case_id              TEXT PRIMARY KEY,                      -- human-readable id, e.g. 'esp32-adc2-wifi-brownout-2024-03'
  hkp_id               TEXT REFERENCES hardware_knowledge_packs(id) ON DELETE SET NULL,
  family_id            TEXT NOT NULL,
  title                TEXT NOT NULL,
  severity             TEXT CHECK (severity IN ('low', 'moderate', 'high', 'critical')),
  case_data            JSONB NOT NULL,                        -- full structured case (symptoms, causes, resolutions per spec §3.3)
  case_schema_version  TEXT NOT NULL DEFAULT '1.0',
  first_reported       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_by            TEXT,
  signing_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  authoritative        BOOLEAN NOT NULL DEFAULT FALSE,        -- vendor/expert-blessed cases
  contributor_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_diagnostic_cases_family   ON diagnostic_cases(family_id);
CREATE INDEX IF NOT EXISTS ix_diagnostic_cases_hkp      ON diagnostic_cases(hkp_id);
CREATE INDEX IF NOT EXISTS ix_diagnostic_cases_severity ON diagnostic_cases(severity);

-- Outcome tracking: every time a user tries a resolution, log the outcome.
-- Counters on diagnostic_cases.case_data are derived from this table.
CREATE TABLE IF NOT EXISTS diagnostic_case_outcomes (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  case_id               TEXT NOT NULL REFERENCES diagnostic_cases(case_id) ON DELETE CASCADE,
  resolution_id         TEXT NOT NULL,                        -- matches resolution within case_data
  attempted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome               TEXT NOT NULL CHECK (outcome IN ('worked', 'made_worse', 'no_effect', 'partial')),
  contributor_id        TEXT,
  context_notes         TEXT,
  consent_for_sharing   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_diagnostic_outcomes_case ON diagnostic_case_outcomes(case_id);

-- Cross-references between related diagnostic cases ("see also" relationships)
CREATE TABLE IF NOT EXISTS diagnostic_case_cross_references (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  primary_case_id     TEXT NOT NULL REFERENCES diagnostic_cases(case_id) ON DELETE CASCADE,
  related_case_id     TEXT NOT NULL REFERENCES diagnostic_cases(case_id) ON DELETE CASCADE,
  relationship_type   TEXT NOT NULL CHECK (relationship_type IN
                        ('similar-symptoms', 'shared-root-cause', 'contraindicated-resolution',
                         'follow-up-of', 'variant-of')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (primary_case_id, related_case_id, relationship_type)
);

-- ── Lifecycle layer ──────────────────────────────────────────────────────────
-- Automated feeds: NVD, GHSA, Espressif advisories, EOL announcements,
-- regulatory updates, recalls, field-modification patterns, known-good patches.

CREATE TABLE IF NOT EXISTS lifecycle_events (
  event_id              TEXT PRIMARY KEY,                     -- e.g. 'cve-2026-XXXXX-esp32-wifi-driver'
  hkp_id                TEXT REFERENCES hardware_knowledge_packs(id) ON DELETE SET NULL,
  hkp_id_pattern        TEXT,                                 -- e.g. 'esp32-*' for events affecting many HKPs
  family_id             TEXT NOT NULL,
  event_type            TEXT NOT NULL CHECK (event_type IN
                          ('security-advisory', 'end-of-life', 'revision-change',
                           'regulatory-update', 'recall', 'field-modification-pattern',
                           'known-good-patch')),
  title                 TEXT NOT NULL,
  severity              TEXT,                                  -- per-event-type severity (CVE→cvss, recall→risk class, etc.)
  cvss_score            NUMERIC(3, 1),
  published_at          TIMESTAMPTZ NOT NULL,
  source                TEXT NOT NULL,                        -- 'nvd', 'ghsa', 'espressif', 'cpsc', etc.
  source_url            TEXT,
  event_data            JSONB NOT NULL,                       -- full structured event per spec §3.4
  event_schema_version  TEXT NOT NULL DEFAULT '1.0',
  superseded_by         TEXT REFERENCES lifecycle_events(event_id) ON DELETE SET NULL,
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_lifecycle_family       ON lifecycle_events(family_id);
CREATE INDEX IF NOT EXISTS ix_lifecycle_event_type   ON lifecycle_events(event_type);
CREATE INDEX IF NOT EXISTS ix_lifecycle_published    ON lifecycle_events(published_at DESC);
CREATE INDEX IF NOT EXISTS ix_lifecycle_hkp_id       ON lifecycle_events(hkp_id);
CREATE INDEX IF NOT EXISTS ix_lifecycle_hkp_pattern  ON lifecycle_events(hkp_id_pattern);

-- Per-project impact: when a lifecycle event matches a project's HKP, register
-- an impact row so we can notify the owner and track action taken.
CREATE TABLE IF NOT EXISTS lifecycle_event_project_impacts (
  id                       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_id                 TEXT NOT NULL REFERENCES lifecycle_events(event_id) ON DELETE CASCADE,
  project_id               TEXT NOT NULL,                     -- references hardware project bundle id (filesystem)
  detected_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  impact_assessment        JSONB,                              -- structured assessment (per spec §3.4)
  user_action_taken        TEXT,                              -- 'patched', 'acknowledged-no-action', 'deferred', etc.
  action_taken_at          TIMESTAMPTZ,
  acknowledged             BOOLEAN NOT NULL DEFAULT FALSE,
  notification_sent_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_lifecycle_impacts_project       ON lifecycle_event_project_impacts(project_id);
CREATE INDEX IF NOT EXISTS ix_lifecycle_impacts_unacked       ON lifecycle_event_project_impacts(acknowledged, detected_at DESC) WHERE acknowledged = FALSE;
