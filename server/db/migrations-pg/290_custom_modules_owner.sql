-- 290 — Custom modules get an owner (2026-09-25).
--
-- custom_modules had no user column, so on a shared (DEPLOYMENT_MODE=team)
-- server every user listed, read, edited, deleted and community-shared every
-- other user's modules — including rewriting the system prompt someone else
-- runs. routes/custom-modules.ts now stamps the creator's id here and checks
-- it: the owner or an admin may change a module; a module is readable by its
-- owner, an admin, or anyone once it is shared with the community.
--
-- Nullable on purpose: rows written before this migration have no known owner
-- and are not guessed at. Solo mode is never scoped, so they stay visible
-- there; in team mode an unowned row is visible to admins only (the
-- fail-closed rule in middleware/ownership.ts). No foreign key to users, as
-- in 285: removing an account must not cascade away a module shared with the
-- community.
ALTER TABLE custom_modules ADD COLUMN IF NOT EXISTS user_id TEXT;

-- The list filters on the owner and sorts by the last change.
CREATE INDEX IF NOT EXISTS idx_custom_modules_user ON custom_modules(user_id, updated_at DESC);
