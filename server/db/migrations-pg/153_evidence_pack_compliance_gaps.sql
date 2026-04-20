-- ──────────────────────────────────────────────────────────────────────────────
-- 153_evidence_pack_compliance_gaps.sql — Phase 3 of EVIDENCE_PACK_SPEC.md.
--
-- Adds compliance_gaps JSONB to evidence_packs. Shape per spec §5.6:
--
--   {
--     "eu_ai_act.annex_iv.4": {
--       "rationale": "Risk management is performed at programme level...",
--       "acceptedAt": "2026-04-20T12:00:00Z",
--       "acceptedBy": "user-id"
--     },
--     "amlr.dim.completeness": { ... }
--   }
--
-- Owner-accepted gaps surface on the pack cover page (PDF + viewer) and in
-- the framework markdowns inside the bundle. Acceptance is reversible
-- before finalise; after finalise it's frozen with the rest of the pack.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE evidence_packs
  ADD COLUMN IF NOT EXISTS compliance_gaps JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN evidence_packs.compliance_gaps IS
  'Per-point gap acceptances keyed by full point id (e.g. "eu_ai_act.annex_iv.4"). Each value: { rationale, acceptedAt, acceptedBy }.';
