-- ──────────────────────────────────────────────────────────────────────────────
-- 150_portal_walkthrough_llm.sql — Portals Track C/W1: LLM-led walkthrough wiring.
--
-- Adds:
--   1. llm_calls_used INT on portal_walkthrough_sessions for the per-walkthrough
--      cap (16 calls = 8 phases × 2 retries; prevents accidental cost runaway)
--   2. portal_walkthrough_llm_calls table — one row per LLM call attempted
--      (success or failure). Feeds the cost chip in the UI + lets us audit.
--
-- The engine writes nothing here; orchestration lives in
-- server/services/portals/portal-llm-suggest.ts.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE portal_walkthrough_sessions
  ADD COLUMN IF NOT EXISTS llm_calls_used INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS portal_walkthrough_llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES portal_walkthrough_sessions(id) ON DELETE CASCADE,

  phase_id TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,                            -- ok | parse_error | shape_error | provider_error | cap_exceeded
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd_cents NUMERIC(12, 4) NOT NULL DEFAULT 0,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_portal_walkthrough_llm_calls_session
  ON portal_walkthrough_llm_calls(session_id, created_at DESC);
