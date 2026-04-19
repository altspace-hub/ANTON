-- ──────────────────────────────────────────────────────────────────────────────
-- 152_evidence_packs.sql — Evidence Pack module Phase 1 (per EVIDENCE_PACK_SPEC.md §4).
--
-- The pack is an assembly layer over existing audit data: sessions, messages,
-- audit_log, versions, workflow_runs, rule_violations. Nothing about source
-- tables changes — items are referenced by (item_table, item_id) and
-- canonical-hashed at assembly time so any later mutation invalidates the pack.
--
-- Phase 1 only writes to evidence_packs + evidence_pack_items. Phase 2 will
-- start using shares + access_log when signing + regulator share land. Both
-- get created now so the schema is stable across phases.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evidence_packs (
  id TEXT PRIMARY KEY,                              -- EP-YYYYMMDD-XXXXXX
  title TEXT NOT NULL,
  purpose TEXT,                                     -- "AMLR gap analysis audit — Nordea Q2 2026"
  scope_type TEXT NOT NULL,                         -- project | mission | workflow_run | session | canvas | date_range | custom
  scope_ref JSONB,                                  -- { project_id, session_ids[], start_date, ... }
  scope_label TEXT,                                 -- human-readable summary
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalised_at TIMESTAMPTZ,                         -- once set, content is immutable
  status TEXT NOT NULL DEFAULT 'draft',             -- draft | finalised | shared | archived | superseded
  hash_manifest TEXT,                               -- SHA-256 of canonical manifest, computed at finalise
  signature TEXT,                                   -- Ed25519 signature over hash_manifest (Phase 2)
  signer_public_key TEXT,                           -- embedded for verifier (Phase 2)
  item_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  retention_until TIMESTAMPTZ,                      -- min retention (Art 26 = +6 months default)
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,        -- TRUE = cannot be deleted regardless of retention
  supersedes TEXT REFERENCES evidence_packs(id),    -- previous pack this replaces
  compliance_frameworks JSONB NOT NULL DEFAULT '["eu_ai_act","amlr"]',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS ix_evidence_packs_created_by ON evidence_packs(created_by);
CREATE INDEX IF NOT EXISTS ix_evidence_packs_status ON evidence_packs(status);
CREATE INDEX IF NOT EXISTS ix_evidence_packs_created_at ON evidence_packs(created_at DESC);

-- One row per artefact bound into the pack. Polymorphic by (item_table,
-- item_id). item_hash is the SHA-256 of the canonical JSON of the source row
-- captured at assembly time — any later mutation flips the hash, which flips
-- the manifest hash, which invalidates the signature.
CREATE TABLE IF NOT EXISTS evidence_pack_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,                          -- session | message | output_version | workflow_run | ...
  item_table TEXT NOT NULL,                         -- source table name
  item_id TEXT NOT NULL,                            -- PK in source table
  item_hash TEXT NOT NULL,                          -- sha256 of canonical content
  item_summary TEXT,                                -- short human-readable label for the index
  item_order INTEGER NOT NULL DEFAULT 0,            -- deterministic ordering for the manifest
  included_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redaction_status TEXT NOT NULL DEFAULT 'none',    -- none | partial | full (legal-privilege redactions, Phase 4)
  redaction_reason TEXT,
  regulatory_relevance JSONB                        -- ["eu_ai_act.art_13", "amlr.auditability"]
);

CREATE INDEX IF NOT EXISTS ix_evidence_pack_items_pack ON evidence_pack_items(pack_id, item_order);
CREATE INDEX IF NOT EXISTS ix_evidence_pack_items_type ON evidence_pack_items(item_type);
CREATE INDEX IF NOT EXISTS ix_evidence_pack_items_source ON evidence_pack_items(item_table, item_id);

-- Phase 2: regulator-facing share links. Created now so the schema is final.
CREATE TABLE IF NOT EXISTS evidence_pack_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  recipient_name TEXT NOT NULL,
  recipient_organisation TEXT NOT NULL,
  recipient_contact TEXT,
  purpose TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  allow_download BOOLEAN NOT NULL DEFAULT TRUE,
  allow_search BOOLEAN NOT NULL DEFAULT TRUE,
  watermark_text TEXT
);

CREATE INDEX IF NOT EXISTS ix_evidence_pack_shares_token ON evidence_pack_shares(access_token);
CREATE INDEX IF NOT EXISTS ix_evidence_pack_shares_pack ON evidence_pack_shares(pack_id);

-- Phase 2: chain-of-custody. Every regulator hit appends a row before
-- rendering. Phase 1 never writes here.
CREATE TABLE IF NOT EXISTS evidence_pack_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES evidence_pack_shares(id),
  pack_id TEXT NOT NULL REFERENCES evidence_packs(id),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accessor_type TEXT NOT NULL,                      -- internal_user | external_auditor | system
  accessor_id TEXT,                                 -- user_id | share_id
  ip_address_hash TEXT,
  user_agent_hash TEXT,
  action TEXT NOT NULL,                             -- view_index | view_item | search | export | download | verify_signature
  item_accessed TEXT,
  search_query_hash TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_reason TEXT
);

CREATE INDEX IF NOT EXISTS ix_evidence_pack_access_pack ON evidence_pack_access_log(pack_id, accessed_at DESC);
