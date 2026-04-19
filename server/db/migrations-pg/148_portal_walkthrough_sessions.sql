-- ──────────────────────────────────────────────────────────────────────────────
-- 148_portal_walkthrough_sessions.sql — Portals Phase 8: walkthrough sessions.
--
-- A walkthrough session is the AI-led portal-build conversation, persisted
-- across phases so the user can pause and resume. Each session is bound to
-- a template (Spec §E.2: personal/business/community/commerce/team/creator/
-- bulletin) and progresses through 8 phases per Spec §E.4:
--
--   1 intent   2 identity  3 content_structure  4 content_generation
--   5 capabilities  6 aesthetics  7 review  8 publish
--
-- accumulated_state is a JSONB document keyed by phase id; each phase
-- output is validated against its zod schema in the engine before being
-- written here.
--
-- portal_id is set when the session is finalised (Phase 8 success).
-- A session in 'abandoned' status leaves portal_id NULL.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_walkthrough_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,                           -- ANTON user id (free-form for v0.7.x)
  template_id TEXT NOT NULL,                        -- 'personal' / 'business' / ...

  current_phase TEXT NOT NULL DEFAULT 'intent',     -- one of the 8 phase ids
  phases_completed JSONB NOT NULL DEFAULT '[]',     -- array of phase ids in order
  accumulated_state JSONB NOT NULL DEFAULT '{}',    -- { phaseId: phaseOutput }

  depth TEXT NOT NULL DEFAULT 'standard',           -- 'simple' | 'standard' | 'deep'
  status TEXT NOT NULL DEFAULT 'active',            -- 'active' | 'finalized' | 'abandoned'

  -- Set on finalize (Phase 8 success) — points to the created portal.
  portal_id UUID REFERENCES portals(id) ON DELETE SET NULL,

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_portal_walkthrough_sessions_owner
  ON portal_walkthrough_sessions(owner_id);
CREATE INDEX IF NOT EXISTS ix_portal_walkthrough_sessions_status
  ON portal_walkthrough_sessions(status);
CREATE INDEX IF NOT EXISTS ix_portal_walkthrough_sessions_active
  ON portal_walkthrough_sessions(owner_id, updated_at DESC) WHERE status = 'active';

-- Reuse the touch_portal_content_updated_at function (defined in migration 146).
DROP TRIGGER IF EXISTS trg_portal_walkthrough_sessions_touch ON portal_walkthrough_sessions;
CREATE TRIGGER trg_portal_walkthrough_sessions_touch
  BEFORE UPDATE ON portal_walkthrough_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_portal_content_updated_at();
