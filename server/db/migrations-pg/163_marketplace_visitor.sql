-- ── 163_marketplace_visitor.sql ──────────────────────────────────────────────
-- Marketplace visitor experience — adds what migration 104 didn't cover.
-- marketplace_bundle_listings + marketplace_reviews ALREADY EXIST in
-- migration 104; we only extend (verified_install column) + add the
-- user-library table.

-- Extend existing reviews with a verified-install marker + richer title/
-- body/version split so the visitor review surface can render without
-- overloading the legacy review_text column.
ALTER TABLE marketplace_reviews
  ADD COLUMN IF NOT EXISTS verified_install BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE marketplace_reviews
  ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE marketplace_reviews
  ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE marketplace_reviews
  ADD COLUMN IF NOT EXISTS version_reviewed TEXT;
-- Make reviewer_name optional for v1 visitor submit (filled from session).
ALTER TABLE marketplace_reviews
  ALTER COLUMN reviewer_name DROP NOT NULL;

-- Per-user library: what a user has purchased / installed / uninstalled /
-- updated. State machine: purchased → installed → uninstalled / updated.
-- Uninstalled rows stay so the library remembers past purchases.
CREATE TABLE IF NOT EXISTS marketplace_user_library (
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bundle_id              TEXT NOT NULL,     -- matches marketplace_bundle_listings.id (TEXT PK)
  state                  TEXT NOT NULL CHECK (state IN ('purchased', 'installed', 'uninstalled', 'updated')),
  acquired_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_installed_version TEXT,
  PRIMARY KEY (user_id, bundle_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_library_user
  ON marketplace_user_library (user_id, state, acquired_at DESC);
