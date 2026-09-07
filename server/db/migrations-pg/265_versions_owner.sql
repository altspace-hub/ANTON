-- 265_versions_owner.sql
--
-- Gives the generic `versions` store an owner, so it stops being the side door
-- around the ownership guard on sessions.ts.
--
-- `versions` held id SERIAL, entity_type, entity_id, version_number, label,
-- content and nothing else. Every route keyed on the caller-supplied
-- entity_type/entity_id pair or on the SERIAL primary key, so on a
-- DEPLOYMENT_MODE=team instance any authenticated user could read the saved
-- output of any session (`GET /api/versions/output/<someone else's session id>`),
-- append a forged version to it, or walk the integer primary key with DELETE and
-- destroy every tenant's version history without guessing a single secret id.
-- The row was never joined back to sessions.user_id, so the correct guard at
-- sessions.ts:164-175 simply did not apply here.
--
-- Attribution cannot be derived at read time: entity_id is a session id for
-- `output` versions written from ModulePage/OutputToolbar, but a module id for
-- the `module` versions BuildYourOwnModule writes, and custom_modules has no
-- owner column at all. So the owner is stamped on the row at write time instead.
--
-- ── What happens to rows that already exist ──────────────────────────────────
--
-- The column is NULLABLE on purpose. A NOT NULL owner with no true value to put
-- in it would either need a fabricated owner (wrong on a shared instance) or
-- would reject the existing rows outright.
--
--   * SOLO mode (the default): scopesToOwner() short-circuits, so every existing
--     row stays readable and deletable by the single operator. Nothing changes
--     for them.
--   * TEAM mode: the backfill below recovers the real owner for every version
--     whose entity_id is a session id — the common case by far. What is left
--     NULL afterwards is genuinely unattributable (module versions, and outputs
--     saved against a module id when no session existed yet). Those become
--     invisible to non-admins, which is the deliberate fail-closed policy stated
--     in server/middleware/ownership.ts: on a shared instance an unowned row is
--     ambiguous, and showing it to everyone is the outcome being removed. Admins
--     still see them, and anything saved from now on is attributed.

ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Recover the owner wherever entity_id is a session id. Matched on the id alone
-- rather than on entity_type: session ids are UUIDs and cannot collide with the
-- module slugs used by the other entity types, and this then also covers any
-- entity_type that keys on a session.
UPDATE versions v
   SET user_id = s.user_id
  FROM sessions s
 WHERE v.user_id IS NULL
   AND v.entity_id = s.id
   AND s.user_id IS NOT NULL;

-- The list/read path is (entity_type, entity_id) + the owner predicate.
CREATE INDEX IF NOT EXISTS idx_versions_entity_owner
  ON versions (entity_type, entity_id, user_id);
