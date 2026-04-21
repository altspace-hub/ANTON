-- ── 159_user_starter_packs.sql ───────────────────────────────────────────────
-- Per-user active starter-pack reference. A starter-pack (bundle type #43,
-- see server/services/portals/starter-pack-schema.ts) is the configuration
-- that drives the Visitor Home layout, default bookmarks, and category grid.
-- One user has exactly one active pack at a time; customizations override
-- specific pack fields without rewriting the whole pack.

CREATE TABLE IF NOT EXISTS user_starter_packs (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_pack_id   TEXT NOT NULL,         -- matches StarterPackBundle.id
  applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customizations   JSONB NOT NULL DEFAULT '{}'::jsonb
);
