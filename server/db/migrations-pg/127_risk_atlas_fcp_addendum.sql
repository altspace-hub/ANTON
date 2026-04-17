-- Migration 127: Risk Atlas — Addendum 1 FCP foundation
--
-- Adds the FCP-specific tables introduced in Addendum 1:
--   • atlas_fcp_scope                        — per-Atlas FCP domain activation
--   • atlas_cross_domain_path_bundles        — cross-domain path groupings
--   • atlas_cross_domain_path_bundle_members — bundle membership + role
--
-- atlas_threat_paths.fcp_domain already exists from migration 125, so the
-- enum extension that the addendum mentioned is a no-op here.
--
-- All tables use BIGSERIAL / TIMESTAMPTZ DEFAULT NOW() and IF NOT EXISTS
-- guards so this migration is safe to re-run.

-- ── atlas_fcp_scope ───────────────────────────────────────────────────────
-- One row per Atlas. Drives which FCP domain packs are active and is
-- written by the fcp-scope-assessor module. Booleans default to the
-- spec's "default-on" set (sanctions + fraud) so a fresh Atlas without
-- a scope assessment still has the safe baseline active.

CREATE TABLE IF NOT EXISTS atlas_fcp_scope (
  atlas_id                          TEXT         PRIMARY KEY REFERENCES risk_atlases(id) ON DELETE CASCADE,
  amlcft_active                     BOOLEAN      NOT NULL DEFAULT FALSE,
  sanctions_active                  BOOLEAN      NOT NULL DEFAULT TRUE,
  fraud_active                      BOOLEAN      NOT NULL DEFAULT TRUE,
  abc_active                        BOOLEAN      NOT NULL DEFAULT FALSE,
  market_abuse_active               BOOLEAN      NOT NULL DEFAULT FALSE,
  tax_evasion_facilitation_active   BOOLEAN      NOT NULL DEFAULT FALSE,
  export_controls_active            BOOLEAN      NOT NULL DEFAULT FALSE,
  modern_slavery_active             BOOLEAN      NOT NULL DEFAULT FALSE,
  universal_core_active             BOOLEAN      NOT NULL DEFAULT FALSE,  -- ON when any FCP domain is active
  scope_rationale                   TEXT,
  assessed_by                       TEXT,
  last_reviewed_at                  TIMESTAMPTZ,
  created_at                        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── atlas_cross_domain_path_bundles ──────────────────────────────────────
-- Groups multiple threat paths that share a single causal story
-- (e.g., "Baltic supply chain exposure" threading sanctions + tax + slavery).
-- The board pack renders bundles as one story rather than disconnected items.

CREATE TABLE IF NOT EXISTS atlas_cross_domain_path_bundles (
  id              BIGSERIAL    PRIMARY KEY,
  atlas_id        TEXT         NOT NULL REFERENCES risk_atlases(id) ON DELETE CASCADE,
  bundle_code     TEXT         NOT NULL,                 -- short code, e.g., XB-1
  name            TEXT         NOT NULL,
  description     TEXT,
  primary_domain  VARCHAR(32),                            -- one of the FCP domain enum values
  created_by      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_xbundle_atlas_code UNIQUE (atlas_id, bundle_code)
);

CREATE INDEX IF NOT EXISTS ix_xbundle_atlas ON atlas_cross_domain_path_bundles(atlas_id);

-- ── atlas_cross_domain_path_bundle_members ───────────────────────────────
-- Composite PK enforces one membership row per (bundle, path). role_in_bundle
-- captures the path's place in the chain (entry / middle / exit / amplifier)
-- so the storytelling layer can render them in causal order.

CREATE TABLE IF NOT EXISTS atlas_cross_domain_path_bundle_members (
  bundle_id        BIGINT       NOT NULL REFERENCES atlas_cross_domain_path_bundles(id) ON DELETE CASCADE,
  threat_path_id   TEXT         NOT NULL REFERENCES atlas_threat_paths(id) ON DELETE CASCADE,
  role_in_bundle   VARCHAR(32)  NOT NULL DEFAULT 'middle',
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bundle_id, threat_path_id)
);

CREATE INDEX IF NOT EXISTS ix_xbundle_members_path ON atlas_cross_domain_path_bundle_members(threat_path_id);
