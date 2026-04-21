-- ── 158_portal_bookmarks.sql ─────────────────────────────────────────────────
-- Portals Visitor Layer v0.8 — the user-scoped bookmark bar backing the new
-- /portals Visitor Home. Stores both the global top-bar bookmarks and the
-- per-category "Saved in this category" lists in the same table, discriminated
-- by category_id (NULL = global).
--
-- `bookmark_type` constrains what target_* columns are meaningful:
--   • 'platform' — pointer to a first-party / undeletable surface
--                  (Pathfinder, My ANTON); target_route carries the path
--   • 'portal'   — pointer to a specific portal row; target_portal_id set
--   • 'route'    — pointer to any in-app route (e.g. /marketplace); target_route
--   • 'external' — pointer to an out-of-ANTON URL; target_url set

CREATE TABLE IF NOT EXISTS portal_bookmarks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bookmark_type   TEXT NOT NULL CHECK (bookmark_type IN ('platform', 'portal', 'route', 'external')),
  target_portal_id UUID REFERENCES portals(id) ON DELETE CASCADE,
  target_route    TEXT,
  target_url      TEXT,
  category_id     TEXT,                    -- NULL = global bookmark bar; set = per-category saved
  label           TEXT NOT NULL,
  icon_ref        TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  undeletable     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly one of target_portal_id / target_route / target_url must be set.
  CONSTRAINT one_target CHECK (
    (target_portal_id IS NOT NULL)::int
    + (target_route IS NOT NULL)::int
    + (target_url IS NOT NULL)::int
    = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_portal_bookmarks_user_global
  ON portal_bookmarks (user_id, sort_order)
  WHERE category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_bookmarks_user_category
  ON portal_bookmarks (user_id, category_id, sort_order)
  WHERE category_id IS NOT NULL;
