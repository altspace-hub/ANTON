-- Migration 125: ANTON Risk Atlas — Phase 1a foundation
--
-- Creates the universal seven-stage causal-chain data model. The Atlas
-- generalises Daniel's CASP BWRA threat-path methodology so any business
-- — bakery to bank — gets a professional risk picture.
--
-- Reuses (no new tables):
--   • projects            — Atlas is a project of project_type='risk_atlas'
--   • checkpoint_decisions — every scoring decision is a checkpoint
--   • deadlines           — review cycles + remediation targets
--   • knowledge_atoms     — Atlas entries flow into atoms (cross-workflow)
--   • entity_nodes / entity_relationships — paths/controls/vulnerabilities
--                                           become entities; relationships
--                                           wire them via an extended enum
--   • audit_log           — Atlas event ledger uses the existing pattern
--   • compliance_rules    — rules can reference Atlas state in their logic
--
-- Net new (this migration): 11 atlas_* tables + 1 enum extension on
-- entity_relationships.relationship_type.

-- ── Stage 0 — entity_relationships vocabulary handling ────────────────────
-- Original intent of this block was to ADD a CHECK constraint listing
-- ~10 allowed relationship_type values (the original 6 + the 5 Risk Atlas
-- additions: mitigates / prevents / detects / responds_to / implements).
--
-- Operational reality: live data uses 55+ distinct relationship_type values
-- (e.g. 'references', 'contains', 'defines', 'developed_via', 'mandated_to_develop',
-- 'links', 'elaborated_by', etc.) — the system has been using a free-form
-- vocabulary, so a rigid enum was always going to fail.
--
-- Fix: drop any existing CHECK on relationship_type and DO NOT add a new one.
-- Validation moves to the application layer (knowledge-graph service) which
-- can curate the canonical set without blocking inserts. This keeps Risk
-- Atlas additions valid alongside historical free-form relationships.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entity_relationships_relationship_type_check'
  ) THEN
    ALTER TABLE entity_relationships DROP CONSTRAINT entity_relationships_relationship_type_check;
  END IF;
  -- Intentionally no ADD CONSTRAINT — see comment above.
END
$$;

-- ── Stage 0 root — risk_atlases ────────────────────────────────────────────
-- One row per Atlas. Linked to a project (Atlas is a project_type).
-- The owner-binding mirrors the OTS pattern: caller identity is verified
-- against created_by at the route layer.

CREATE TABLE IF NOT EXISTS risk_atlases (
  id                          TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  description                 TEXT,
  project_id                  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  business_description        TEXT,                              -- 1-2 paragraph free text used by Socratic + Draft modes
  industry_pack_id            TEXT,                              -- soft FK to atlas_industry_packs(id)
  status                      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'review', 'archived')),
  mode                        TEXT NOT NULL DEFAULT 'socratic'
    CHECK (mode IN ('socratic', 'draft', 'expert', 'autonomous')),
  -- Phase 1: single-organisation; Phase 2 will add multi-entity
  entity_id                   TEXT,                              -- soft FK to entity_nodes(entity_id)
  owner_user_id               TEXT REFERENCES users(id),         -- the human risk owner
  created_by                  TEXT REFERENCES users(id),         -- for audit
  org_id                      TEXT NOT NULL DEFAULT 'default',
  last_review_at              TIMESTAMPTZ,
  next_review_due_at          TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_atlases_owner ON risk_atlases(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_risk_atlases_status ON risk_atlases(status) WHERE status != 'archived';
CREATE INDEX IF NOT EXISTS idx_risk_atlases_project ON risk_atlases(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_risk_atlases_review_due ON risk_atlases(next_review_due_at)
  WHERE next_review_due_at IS NOT NULL;

-- ── Stage 1 — exposure points ──────────────────────────────────────────────
-- "What in the business creates exposure?" — the map, no scores yet.

CREATE TABLE IF NOT EXISTS atlas_exposure_points (
  id                          TEXT PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  description                 TEXT,
  category                    TEXT,                              -- service, customer_segment, channel, partner, geography, product, process, system
  source_pack_exposure_id     TEXT,                              -- if proposed from an industry pack
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_exposure_atlas ON atlas_exposure_points(atlas_id);

-- ── Stage 2 — threat paths ────────────────────────────────────────────────
-- "Which harm scenarios are credible?" — narrative cards.
-- fcp_domain (Addendum A1.1.2) is added here in Phase 1a so the FCP overlay
-- can land additively in Phase 1i without an ALTER on a populated table.

CREATE TABLE IF NOT EXISTS atlas_threat_paths (
  id                          TEXT PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  path_code                   TEXT NOT NULL,                     -- TP-1, TP-2, …
  name                        TEXT NOT NULL,
  description                 TEXT,
  source_pack_path_id         TEXT,                              -- proposed-from pack reference
  -- Addendum 1: which FCP domain (if any) this path belongs to
  fcp_domain                  TEXT
    CHECK (fcp_domain IS NULL OR fcp_domain IN (
      'amlcft', 'sanctions', 'fraud', 'abc',
      'market_abuse', 'tax_evasion_facilitation', 'export_controls', 'modern_slavery'
    )),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(atlas_id, path_code)
);
CREATE INDEX IF NOT EXISTS idx_atlas_threat_paths_atlas ON atlas_threat_paths(atlas_id);
CREATE INDEX IF NOT EXISTS idx_atlas_threat_paths_fcp ON atlas_threat_paths(fcp_domain)
  WHERE fcp_domain IS NOT NULL;

-- Many-to-many: threat path ↔ exposure points
CREATE TABLE IF NOT EXISTS atlas_threat_path_exposures (
  threat_path_id              TEXT NOT NULL REFERENCES atlas_threat_paths(id) ON DELETE CASCADE,
  exposure_point_id           TEXT NOT NULL REFERENCES atlas_exposure_points(id) ON DELETE CASCADE,
  order_in_path               INTEGER NOT NULL DEFAULT 0,        -- so we can draw the chain in sequence
  PRIMARY KEY (threat_path_id, exposure_point_id)
);

-- ── Stage 3 — vulnerabilities ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atlas_vulnerabilities (
  id                          TEXT PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  vuln_code                   TEXT NOT NULL,                     -- V-1, V-2, …
  name                        TEXT NOT NULL,
  description                 TEXT,
  severity                    INTEGER NOT NULL DEFAULT 3
    CHECK (severity BETWEEN 1 AND 5),
  source_pack_vuln_id         TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(atlas_id, vuln_code)
);
CREATE INDEX IF NOT EXISTS idx_atlas_vuln_atlas ON atlas_vulnerabilities(atlas_id);

CREATE TABLE IF NOT EXISTS atlas_threat_path_vulnerabilities (
  threat_path_id              TEXT NOT NULL REFERENCES atlas_threat_paths(id) ON DELETE CASCADE,
  vulnerability_id            TEXT NOT NULL REFERENCES atlas_vulnerabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (threat_path_id, vulnerability_id)
);

-- ── Stage 4 — inherent scores (per threat path) ────────────────────────────
-- Inherent = MAX(exposure, threat_credibility, vulnerability) per spec.
-- Computed by atlas-residual-calculator.ts — never by an LLM.

CREATE TABLE IF NOT EXISTS atlas_inherent_scores (
  id                          TEXT PRIMARY KEY,
  threat_path_id              TEXT NOT NULL REFERENCES atlas_threat_paths(id) ON DELETE CASCADE,
  exposure_score              INTEGER NOT NULL CHECK (exposure_score BETWEEN 1 AND 5),
  threat_score                INTEGER NOT NULL CHECK (threat_score BETWEEN 1 AND 5),
  vulnerability_score         INTEGER NOT NULL CHECK (vulnerability_score BETWEEN 1 AND 5),
  inherent_score              INTEGER NOT NULL CHECK (inherent_score BETWEEN 1 AND 5),  -- = max of the 3 above
  rationale                   TEXT,                              -- LLM-generated explanation; the score itself is deterministic
  scored_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scored_by                   TEXT REFERENCES users(id),
  UNIQUE(threat_path_id)                                         -- one current inherent score per path
);

-- ── Stage 5 — controls + the prevent/detect/respond matrix ─────────────────

CREATE TABLE IF NOT EXISTS atlas_controls (
  id                          TEXT PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  control_code                TEXT NOT NULL,                     -- C-1, C-2, …
  name                        TEXT NOT NULL,
  description                 TEXT,
  type                        TEXT NOT NULL                       -- one control can play multiple roles via the matrix
    CHECK (type IN ('prevent', 'detect', 'respond')),
  strength                    TEXT NOT NULL DEFAULT 'adequate'
    CHECK (strength IN ('strong', 'adequate', 'weak')),
  evidence                    TEXT,                              -- required for 'strong'; enforced at app layer
  owner_role                  TEXT,
  source_pack_control_id      TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(atlas_id, control_code)
);
CREATE INDEX IF NOT EXISTS idx_atlas_controls_atlas ON atlas_controls(atlas_id);

-- The heart of the methodology — which controls cover which vulnerabilities.
-- A single control (e.g. transaction monitoring) can play prevent + detect.
CREATE TABLE IF NOT EXISTS atlas_control_vulnerability_map (
  id                          BIGSERIAL PRIMARY KEY,
  control_id                  TEXT NOT NULL REFERENCES atlas_controls(id) ON DELETE CASCADE,
  vulnerability_id            TEXT NOT NULL REFERENCES atlas_vulnerabilities(id) ON DELETE CASCADE,
  type                        TEXT NOT NULL                       -- the role played for THIS vulnerability
    CHECK (type IN ('prevent', 'detect', 'respond')),
  notes                       TEXT,
  UNIQUE(control_id, vulnerability_id, type)
);
CREATE INDEX IF NOT EXISTS idx_atlas_cvm_control ON atlas_control_vulnerability_map(control_id);
CREATE INDEX IF NOT EXISTS idx_atlas_cvm_vulnerability ON atlas_control_vulnerability_map(vulnerability_id);

-- ── Stage 6 — residual scores ──────────────────────────────────────────────
-- Deterministic: Strong = -2, Adequate = -1, Weak = 0 from the inherent.
-- The "control quality rollup" is the worst strength across all controls
-- linked to vulnerabilities of this path. Recalculated whenever any
-- control or mapping changes.

CREATE TABLE IF NOT EXISTS atlas_residual_scores (
  id                          TEXT PRIMARY KEY,
  threat_path_id              TEXT NOT NULL REFERENCES atlas_threat_paths(id) ON DELETE CASCADE,
  residual_score              INTEGER NOT NULL CHECK (residual_score BETWEEN 1 AND 5),
  control_quality_rollup      TEXT NOT NULL                       -- worst-of-many across linked controls
    CHECK (control_quality_rollup IN ('strong', 'adequate', 'weak', 'absent')),
  open_vulnerability_notes    TEXT,
  calculated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(threat_path_id)                                         -- one current residual per path
);

-- ── Stage 7 — appetite statements + escalation triggers ────────────────────

CREATE TABLE IF NOT EXISTS atlas_appetite_statements (
  id                          TEXT PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  threat_path_id              TEXT REFERENCES atlas_threat_paths(id) ON DELETE CASCADE,
  -- threat_path_id NULL = company-wide statement (Stage 7b — addendum)
  appetite_position           TEXT NOT NULL
    CHECK (appetite_position IN ('within', 'boundary', 'outside', 'unacceptable')),
  required_action             TEXT,
  target_date                 DATE,
  budget_eur                  NUMERIC(12,2),
  approved_by                 TEXT REFERENCES users(id),
  approved_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_appetite_atlas ON atlas_appetite_statements(atlas_id);
CREATE INDEX IF NOT EXISTS idx_atlas_appetite_path ON atlas_appetite_statements(threat_path_id);
CREATE INDEX IF NOT EXISTS idx_atlas_appetite_outside
  ON atlas_appetite_statements(atlas_id, appetite_position)
  WHERE appetite_position IN ('outside', 'unacceptable');

CREATE TABLE IF NOT EXISTS atlas_escalation_triggers (
  id                          TEXT PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  trigger_event               TEXT NOT NULL,                     -- "any path reaches residual 5"
  required_action             TEXT NOT NULL,                     -- "immediate board notification"
  timeline                    TEXT,                              -- "same day", "5 business days"
  source                      TEXT NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'pack', 'regulatory')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_triggers_atlas ON atlas_escalation_triggers(atlas_id);

-- ── Maintenance — review cycles ───────────────────────────────────────────
-- Reuses the deadlines table for the actual scheduling; this row holds the
-- per-atlas configuration (frequency, owner role, current state).

CREATE TABLE IF NOT EXISTS atlas_review_cycles (
  id                          TEXT PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  activity                    TEXT NOT NULL
    CHECK (activity IN ('full_review', 'threat_update', 'control_test', 'residual_rescore', 'appetite', 'regulatory_check')),
  frequency                   TEXT NOT NULL                       -- 'annual', 'semi-annual', 'quarterly', 'on_change', 'on_new_regulation'
    CHECK (frequency IN ('annual', 'semi-annual', 'quarterly', 'monthly', 'on_change', 'on_new_regulation')),
  owner_user_id               TEXT REFERENCES users(id),
  next_due_at                 TIMESTAMPTZ,
  last_run_at                 TIMESTAMPTZ,
  deadline_id                 TEXT,                              -- soft FK to deadlines(id) — the actual scheduled item
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_review_atlas ON atlas_review_cycles(atlas_id);
CREATE INDEX IF NOT EXISTS idx_atlas_review_due ON atlas_review_cycles(next_due_at)
  WHERE next_due_at IS NOT NULL;

-- ── Industry pack registry (installed packs index) ────────────────────────
-- One row per installed pack — shipped built-in or imported via .anton bundle.
-- The pack content lives on the filesystem (or in a bundle blob); this table
-- is just the registry.

CREATE TABLE IF NOT EXISTS atlas_industry_packs (
  id                          TEXT PRIMARY KEY,                  -- stable pack id (e.g. 'sme-general', 'fcp-casp')
  name                        TEXT NOT NULL,
  description                 TEXT,
  version                     TEXT NOT NULL DEFAULT '1.0.0',
  source                      TEXT NOT NULL DEFAULT 'builtin'
    CHECK (source IN ('builtin', 'community', 'certified', 'sovereign')),
  pack_path                   TEXT,                              -- relative path under data/risk-atlas/packs/
  pack_bundle_uri             TEXT,                              -- if installed from a .anton bundle
  parent_pack_id              TEXT,                              -- inheritance chain (FCP-CASP inherits from FCP-Bank)
  certified_by                TEXT,
  amlr_obliged                BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
  installed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_packs_source ON atlas_industry_packs(source);
CREATE INDEX IF NOT EXISTS idx_atlas_packs_enabled ON atlas_industry_packs(is_enabled) WHERE is_enabled = TRUE;

-- ── atlas_events — append-only event ledger ──────────────────────────────
-- The existing public.audit_log table is purpose-built for LLM-call audit
-- (session_id, model, thinking_level, provider, …) and doesn't fit a
-- generic resource_type/resource_id shape. Per spec §6.3, atlas_events is
-- "truly needed" because no existing table has the shape we want.

CREATE TABLE IF NOT EXISTS atlas_events (
  id                          BIGSERIAL PRIMARY KEY,
  atlas_id                    TEXT NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  event_type                  TEXT NOT NULL,                     -- see AtlasEventType in TS
  sub_resource_id             TEXT,                              -- threat path id, control id, etc.
  user_id                     TEXT REFERENCES users(id),
  details                     JSONB NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atlas_events_atlas ON atlas_events(atlas_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_events_type ON atlas_events(atlas_id, event_type);
