-- 285 — Presentations get an owner (2026-09-23).
--
-- The presentations table had no user column at all, so on a shared
-- (DEPLOYMENT_MODE=team) server GET /api/presentations listed every person's
-- decks with their file names, a file name was all the download route asked
-- for, and PATCH / DELETE / generate worked on any id. routes/presentations.ts
-- now writes the creator's id here and scopes every route with
-- middleware/ownership.ts.
--
-- Nullable on purpose: rows written before this migration have no known owner
-- and are not guessed at. Solo mode is never scoped, so they stay visible
-- there; in team mode an unowned row is visible to admins only (the
-- fail-closed rule in ownership.ts). No foreign key to users: removing an
-- account must not cascade away the record of its decks.
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS user_id TEXT;

-- The list filters on the owner and sorts by date; the download looks a file
-- name up under the owner.
CREATE INDEX IF NOT EXISTS idx_presentations_user ON presentations(user_id, created_at DESC);
