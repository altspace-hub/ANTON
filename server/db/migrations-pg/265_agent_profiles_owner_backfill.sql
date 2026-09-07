-- 265_agent_profiles_owner_backfill.sql
--
-- agent_profiles.created_by has existed since migration 111 (DEFAULT 'default'), but
-- nothing ever wrote it: createAgent()'s INSERT column list omitted it, so every agent
-- on every instance carries the literal 'default' — a value that matches no user id in
-- any deployment mode. The 2026-09 team-mode audit found the whole /api/agents surface
-- reading, mutating and archiving rows by :id alone as a direct consequence: the owner
-- column was there, it just never held anything worth comparing against.
--
-- ── What happens to EXISTING rows ───────────────────────────────────────────────
--
-- 'default' (and NULL) become 'solo' — SOLO_USER_ID from server/middleware/user-constants.ts,
-- the id authMiddleware actually stamps on req.user in the default deployment.
--
--   * SOLO mode is unaffected either way. scopesToOwner() short-circuits there
--     (middleware/ownership.ts), so the operator keeps seeing every agent on their own
--     machine whatever this column says. The rewrite still matters: from now on the
--     agents they create are stamped 'solo', and without this backfill their existing
--     agents would sit under a second, meaningless sentinel forever.
--   * TEAM mode: a legacy agent ends up owned by 'solo', which is not a login, so it
--     stays visible to admins and invisible to other users. That is the deliberate
--     fail-closed policy middleware/ownership.ts documents for unattributed rows, and
--     it is the honest outcome here — the real author was never recorded, so guessing
--     one (say, the first row in `users`) would hand somebody else's agent, system
--     prompt and connector credentials to whoever happens to sort first. An admin
--     reassigns a legacy agent with a deliberate UPDATE.
--
-- Nothing is deleted, and created_by is deliberately NOT made NOT NULL: a NOT NULL
-- owner column on a table we cannot fully attribute either fails the migration or locks
-- rows away from the person who owns them, which is data-loss-shaped even though no row
-- disappears.

UPDATE agent_profiles
   SET created_by = 'solo'
 WHERE created_by IS NULL OR created_by = 'default';

-- New rows are stamped from req.user.id by createAgent(). The DEFAULT is only a
-- backstop for an insert path that forgets one day, and 'solo' is at least a real
-- identity in the default deployment where 'default' never was.
ALTER TABLE agent_profiles ALTER COLUMN created_by SET DEFAULT 'solo';

-- GET /api/agents now appends `AND created_by = ?` in team mode.
CREATE INDEX IF NOT EXISTS idx_agent_profiles_created_by ON agent_profiles(created_by);
