-- Migration 104: Bundle marketplace — discovery, ratings, and reviews
-- Enables searchable catalogue of .anton bundles with community ratings

CREATE TABLE IF NOT EXISTS marketplace_bundle_listings (
  id TEXT PRIMARY KEY,
  bundle_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  author_hash TEXT NOT NULL,
  author_name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  tags JSONB DEFAULT '[]',
  target_areas JSONB DEFAULT '[]',
  bundle_hash TEXT NOT NULL,
  bundle_size_bytes INTEGER,
  is_published INTEGER DEFAULT 1,
  avg_rating DOUBLE PRECISION DEFAULT 0.0,
  rating_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketplace_type ON marketplace_bundle_listings(bundle_type, is_published);
CREATE INDEX IF NOT EXISTS idx_marketplace_author ON marketplace_bundle_listings(author_hash);
CREATE INDEX IF NOT EXISTS idx_marketplace_rating ON marketplace_bundle_listings(avg_rating DESC) WHERE is_published = 1;
CREATE INDEX IF NOT EXISTS idx_marketplace_search ON marketplace_bundle_listings USING gin(to_tsvector('english', title || ' ' || description));

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES marketplace_bundle_listings(id) ON DELETE CASCADE,
  reviewer_hash TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, reviewer_hash)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_listing ON marketplace_reviews(listing_id, created_at DESC);
