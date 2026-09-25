-- 287 — Dow Jones / Roaring screening rows get an owner (2026-09-23).
--
-- entity_screens (every cached screen, with the full result JSON: who was
-- screened, PEP and sanctions hits) and entity_monitoring (ongoing Dow Jones
-- monitoring registrations) had no user column. On a shared
-- (DEPLOYMENT_MODE=team) server GET /api/dowjones/monitoring and the two
-- screens/recent lists returned every person's rows, and any user could
-- pause, cancel or delete anyone's monitoring registration by id.
-- routes/dowjones.ts and routes/roaring.ts now write the caller's id here and
-- scope every list, the Roaring profile cache and PATCH / DELETE
-- /dowjones/monitor/:id with middleware/ownership.ts.
--
-- Nullable on purpose: rows written before this migration have no known owner
-- and are not guessed at (a screen's session_id was never checked, so it does
-- not prove who ran it). Solo mode is never scoped, so they stay visible
-- there; in team mode an unowned row is visible to admins only (the
-- fail-closed rule in ownership.ts). No foreign key to users: removing an
-- account must not cascade away the record of its screening (an AML audit
-- trail). Additive only — no existing row is rewritten.
ALTER TABLE entity_screens ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE entity_monitoring ADD COLUMN IF NOT EXISTS user_id TEXT;

-- The recent lists filter on connector + owner and sort by date; the Roaring
-- profile cache looks an org number up under the owner.
CREATE INDEX IF NOT EXISTS idx_entity_screens_user ON entity_screens(user_id, connector, screened_at DESC);
CREATE INDEX IF NOT EXISTS idx_entity_monitoring_user ON entity_monitoring(user_id, connector, registered_at DESC);
