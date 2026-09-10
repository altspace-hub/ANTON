-- 269 — the matter behind a Counsel's Desk session (2026-09-08).
--
-- A research session opened on a blank textarea: no way to attach the
-- contract or decision the question is about, and nothing recorded about
-- the facts, parties, jurisdiction or the decision the client needs. ANTON
-- now takes the matter in a short intake conversation (kept on the session)
-- and the consultant can attach documents; both are injected into every
-- research turn.
ALTER TABLE legal_research_sessions ADD COLUMN IF NOT EXISTS documents TEXT NOT NULL DEFAULT '[]';
ALTER TABLE legal_research_sessions ADD COLUMN IF NOT EXISTS matter_brief TEXT NOT NULL DEFAULT '{}';
ALTER TABLE legal_research_sessions ADD COLUMN IF NOT EXISTS intake_conversation TEXT NOT NULL DEFAULT '[]';
