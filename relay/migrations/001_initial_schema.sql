-- Migration 001: Initial portal registry schema.
--
-- Implements ANTON Portals — Discovery Roadmap §Schema (docs/PORTALS_DISCOVERY_ROADMAP.md).
--
-- Four tables, deliberately separated so GDPR retention + DSR rules can
-- target each concern independently:
--
--   reserved_names      — defensive list (Tier 1). Pre-populated from
--                         Forbes / Tranco / manual lists.
--   portal_submissions  — the review queue. Every "I want to publish".
--   kyc_submissions     — KYC data. Separate from submissions so identity
--                         data has its own retention clock.
--   portals             — the live registry. Approved entries only.
--
-- Authorship: cryptographic identity (Ed25519 signing key) lives on the
-- submission + portal rows. Legal identity (KYC) lives in its own table.
-- The two are linked via portal_submissions.kyc_submission_id but the
-- KYC data is never exposed via the public /v1/* surface.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── reserved_names ────────────────────────────────────────────────────
--
-- Pre-claimed names that block self-service Tier 3 registration. The
-- rightful trademark holder can still claim them via the Tier 2 flow
-- (claimable=true). System terms (admin, root, anton) are claimable=false.
CREATE TABLE reserved_names (
  name              TEXT NOT NULL,
  namespace         TEXT NOT NULL DEFAULT 'global',
  basis             TEXT NOT NULL
                    CHECK (basis IN ('famous_brand','system_term','generic_block','tld_collision')),
  basis_evidence    TEXT,            -- 'forbes-g2000-2026', 'tranco-top1k', etc.
  reserved_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimable         BOOLEAN NOT NULL DEFAULT true,
  claimed_by_submission_id UUID,     -- set when a Tier 2 claim is approved
  PRIMARY KEY (name, namespace)
);

CREATE INDEX reserved_names_by_basis ON reserved_names (basis);
CREATE INDEX reserved_names_claimable ON reserved_names (claimable) WHERE claimable = true;

-- ── kyc_submissions ───────────────────────────────────────────────────
--
-- KYC data. PII-bearing; isolated so it can be retention-pruned without
-- touching submission/portal rows. The id_document_number_hash is SHA-256
-- — we never store the document number in cleartext.
--
-- retention_until drives a periodic cleanup job (added in a later phase).
-- Default policy: 5 years from last verification, then automatic delete.
CREATE TABLE kyc_submissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_contact_hash   TEXT NOT NULL,
  legal_name               TEXT NOT NULL,
  id_document_type         TEXT NOT NULL
                           CHECK (id_document_type IN
                           ('passport','national_id','org_registration','other')),
  id_document_number_hash  TEXT NOT NULL,   -- SHA-256 of the document number
  id_document_country      TEXT NOT NULL,   -- ISO 3166-1 alpha-2
  org_name                 TEXT,
  org_registration_number  TEXT,
  contact_email            TEXT NOT NULL,
  contact_phone            TEXT,
  address_country          TEXT NOT NULL,
  address_city             TEXT NOT NULL,
  address_street           TEXT NOT NULL,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at              TIMESTAMPTZ,
  verifier_id              UUID,
  retention_until          TIMESTAMPTZ NOT NULL
);

CREATE INDEX kyc_submissions_by_submitter ON kyc_submissions (submitter_contact_hash);
CREATE INDEX kyc_submissions_retention ON kyc_submissions (retention_until)
  WHERE verified_at IS NOT NULL;

-- ── portal_submissions ────────────────────────────────────────────────
--
-- The review queue. Every row represents a submitter saying "I want to
-- publish this portal". Status transitions are operator-driven via the
-- admin endpoints (Step 9).
--
-- The signed descriptor is stored verbatim so the operator UI can
-- re-verify the Ed25519 signature at approve time. This guards against
-- bit-flips in the descriptor between submission and review.
CREATE TABLE portal_submissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitter_contact_hash   TEXT NOT NULL,
  signing_pubkey_hex       TEXT NOT NULL,           -- 64 hex chars = 32-byte Ed25519
  proposed_name            TEXT NOT NULL,
  proposed_namespace       TEXT NOT NULL,
  descriptor_json          JSONB NOT NULL,
  descriptor_signature     TEXT NOT NULL,
  kyc_submission_id        UUID REFERENCES kyc_submissions(id) ON DELETE SET NULL,
  status                   TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN
                           ('pending','in_review','approved','rejected','withdrawn')),
  tier                     TEXT NOT NULL DEFAULT 'tier3_selfservice'
                           CHECK (tier IN ('tier2_claimed','tier3_selfservice')),
  reviewer_id              UUID,
  reviewed_at              TIMESTAMPTZ,
  rejection_reason         TEXT,                     -- visible to submitter
  internal_notes           TEXT                      -- operator-only
);

CREATE INDEX portal_submissions_by_status ON portal_submissions (status);
CREATE INDEX portal_submissions_by_submitter
  ON portal_submissions (submitter_contact_hash, submitted_at DESC);
CREATE INDEX portal_submissions_by_tier_status
  ON portal_submissions (tier, status, submitted_at DESC);

-- Reservation: only one pending claim per (name, namespace). Approved
-- claims are tracked by the portals.UNIQUE constraint below.
CREATE UNIQUE INDEX portal_submissions_pending_name
  ON portal_submissions (proposed_name, proposed_namespace)
  WHERE status IN ('pending','in_review');

-- ── portals ───────────────────────────────────────────────────────────
--
-- The live registry. Rows here are searchable via /v1/portals/search.
-- An entry only lands here after operator approval.
--
-- revoked_at is the soft-delete path. The UNIQUE index excludes revoked
-- rows so a name can be re-claimed after revocation.
CREATE TABLE portals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id            UUID NOT NULL REFERENCES portal_submissions(id),
  name                     TEXT NOT NULL,
  namespace                TEXT NOT NULL,
  contact_hash             TEXT NOT NULL,
  signing_pubkey_hex       TEXT NOT NULL,
  descriptor_json          JSONB NOT NULL,
  capability_summary       JSONB NOT NULL,           -- denormalised verbs/tags for search
  tier                     TEXT NOT NULL
                           CHECK (tier IN ('tier2_claimed','tier3_selfservice')),
  approved_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at               TIMESTAMPTZ,
  revocation_reason        TEXT
);

CREATE UNIQUE INDEX portals_live_name
  ON portals (name, namespace)
  WHERE revoked_at IS NULL;

CREATE INDEX portals_by_tier ON portals (tier) WHERE revoked_at IS NULL;
CREATE INDEX portals_search_text
  ON portals USING gin (
    to_tsvector('simple',
      coalesce(name,'') || ' ' ||
      coalesce(descriptor_json->>'displayTitle','') || ' ' ||
      coalesce(descriptor_json->>'description','')
    )
  )
  WHERE revoked_at IS NULL;
CREATE INDEX portals_capability_summary
  ON portals USING gin (capability_summary jsonb_path_ops)
  WHERE revoked_at IS NULL;
