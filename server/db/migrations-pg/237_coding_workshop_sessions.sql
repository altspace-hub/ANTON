-- 237_coding_workshop_sessions.sql
-- ANTON Studio Phase 1 — the kickoff WORKSHOP that opens a Studio project and
-- produces a Project CHARTER (CODING_STUDIO_DESIGN_2026-06-13.md §C-req1 / §B /
-- §D.1 / §F-P1).
--
-- Clone of discovery_sessions (the resumable conversational engine the workshop
-- forks). The workshop is a tiered, resumable, 8-phase talk that enforces
-- "start with the problem, not the solution" and crystallises into a Project
-- CHARTER (an Engagement-shaped object). On finalize the charter seeds a
-- coding_project (via the existing coding-large create path / a direct insert).
--
-- Additive + history-preserving. Idempotent (CREATE TABLE IF NOT EXISTS).
--
--   id               — workshop session id (uuid).
--   user_id          — owner (nullable; solo mode = null).
--   coding_project_id — set once the charter is finalized + a project seeded
--                       (NULL while the workshop is still running).
--   tier             — workshop depth (lite|standard|professional|expert),
--                       mirrors discovery_sessions' tiering.
--   mode             — the Studio mode this workshop belongs to (ask|project);
--                       Phase-1 workshops are always 'project', but the column
--                       is here so an Ask flow can reuse the table later.
--   state            — the full WorkshopState JSON (phase, collected answers,
--                       conversationHistory, the assembling charter draft).
--   status           — active|paused|completed|abandoned (same lifecycle).
--   charter          — the finalized Project CHARTER JSON (NULL until finalize).
--   autosave_version — optimistic autosave counter (mirrors discovery).

CREATE TABLE IF NOT EXISTS coding_workshop_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  coding_project_id TEXT REFERENCES coding_projects(id) ON DELETE SET NULL,
  tier TEXT NOT NULL DEFAULT 'standard' CHECK(tier IN ('lite','standard','professional','expert')),
  mode TEXT NOT NULL DEFAULT 'project' CHECK(mode IN ('ask','project')),
  state TEXT NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','abandoned')),
  charter TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  autosave_version INTEGER DEFAULT 0,
  schema_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_coding_workshop_sessions_user
  ON coding_workshop_sessions (user_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_coding_workshop_sessions_project
  ON coding_workshop_sessions (coding_project_id);
