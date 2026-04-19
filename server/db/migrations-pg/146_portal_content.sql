-- ──────────────────────────────────────────────────────────────────────────────
-- 146_portal_content.sql — Portals Phase 5: per-portal content tables.
--
-- Per ANTON_Portals_Spec.md v0.2 §C.3 the content for each portal lives in
-- the user's local PostgreSQL. The Spec's wording "schema-per-portal" was
-- aspirational; the practical implementation uses **shared tables with a
-- portal_id FK + ON DELETE CASCADE** because:
--
--   1. Dynamic CREATE SCHEMA on every portal-publish requires elevated
--      permissions and complicates the migration runner (which is a single
--      forward-only sweep over a fixed file list).
--   2. v0.7.x users typically run 1-5 portals each; isolation via FK-cascade
--      + portal_id-scoped queries is sufficient.
--   3. Cross-portal monitoring, backup, and audit are straightforward when
--      content lives in one schema.
--   4. PostgreSQL row-level-security can be layered later if isolation needs
--      to be formal (e.g. organisation-deployment topology).
--
-- All inserts MUST scope to portal_id. All reads MUST filter by portal_id.
-- See server/services/portals/portal-database-service.ts for the enforcement
-- surface.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. portal_pages — rendered HTML pages per portal ───────────────────────

CREATE TABLE IF NOT EXISTS portal_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,

  -- Path is "/", "/about", "/products/cake-1", etc. Always lowercased + URL-safe.
  -- One row per (portal_id, path).
  path TEXT NOT NULL,

  title TEXT,                                       -- shown in <title>
  html TEXT NOT NULL,                               -- rendered HTML body
  template TEXT,                                    -- e.g. 'page.basic', 'product.detail'

  -- Optional structured data backing this page (joined into the HTML at render time).
  structured_data JSONB,

  -- For display ordering in nav menus, etc.
  sort_order INTEGER DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT TRUE,

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (portal_id, path)
);

CREATE INDEX IF NOT EXISTS ix_portal_pages_portal_id ON portal_pages(portal_id);
CREATE INDEX IF NOT EXISTS ix_portal_pages_visible
  ON portal_pages(portal_id, visible) WHERE visible = TRUE;

-- ── 2. portal_assets — binary assets ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,

  -- Path within the portal's asset directory: "logo.png", "images/hero.jpg".
  path TEXT NOT NULL,

  mime_type TEXT NOT NULL,                          -- 'image/png', 'image/jpeg', etc.
  byte_size BIGINT NOT NULL,
  content_hash TEXT NOT NULL,                       -- SHA-256 hex (cache invalidation)
  content BYTEA NOT NULL,                           -- raw bytes; for now we co-locate
                                                    -- (10MB cap enforced at service layer)

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (portal_id, path)
);

CREATE INDEX IF NOT EXISTS ix_portal_assets_portal_id ON portal_assets(portal_id);
CREATE INDEX IF NOT EXISTS ix_portal_assets_content_hash ON portal_assets(content_hash);

-- ── 3. portal_structured_data — per-portal key-value JSONB ──────────────────
-- For commerce portals: products, prices, availability.
-- For team portals: roster, schedule, results.
-- For community portals: events, members.
-- The `kind` namespaces the key, e.g. ('product', 'cake-1') vs ('match', '2026-05-01').

CREATE TABLE IF NOT EXISTS portal_structured_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,

  kind TEXT NOT NULL,                               -- 'product' / 'match' / 'event' / ...
  key TEXT NOT NULL,                                -- portal-local identifier within kind

  value JSONB NOT NULL,
  searchable_text TEXT,                             -- denormalised text for FTS

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (portal_id, kind, key)
);

CREATE INDEX IF NOT EXISTS ix_portal_structured_data_portal_kind
  ON portal_structured_data(portal_id, kind);
CREATE INDEX IF NOT EXISTS ix_portal_structured_data_value_gin
  ON portal_structured_data USING gin (value);

-- ── 4. updated_at touch triggers ────────────────────────────────────────────
-- Reuse the touch_portals_updated_at function pattern (PG functions can be
-- reused across triggers because they don't bind to a specific table).

CREATE OR REPLACE FUNCTION touch_portal_content_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portal_pages_touch_updated_at ON portal_pages;
CREATE TRIGGER trg_portal_pages_touch_updated_at
  BEFORE UPDATE ON portal_pages
  FOR EACH ROW EXECUTE FUNCTION touch_portal_content_updated_at();

DROP TRIGGER IF EXISTS trg_portal_assets_touch_updated_at ON portal_assets;
CREATE TRIGGER trg_portal_assets_touch_updated_at
  BEFORE UPDATE ON portal_assets
  FOR EACH ROW EXECUTE FUNCTION touch_portal_content_updated_at();

DROP TRIGGER IF EXISTS trg_portal_structured_data_touch_updated_at ON portal_structured_data;
CREATE TRIGGER trg_portal_structured_data_touch_updated_at
  BEFORE UPDATE ON portal_structured_data
  FOR EACH ROW EXECUTE FUNCTION touch_portal_content_updated_at();
