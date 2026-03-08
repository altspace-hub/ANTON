-- Migration 040: Regulatory Feed subscriptions and digest history
-- LONE-07/18: Monitor regulatory sources and deliver periodic digests

CREATE TABLE IF NOT EXISTS regulatory_feed_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  source_id   TEXT NOT NULL,               -- e.g. 'eba', 'esma', 'fatf', 'eurlex'
  source_name TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'eu',  -- 'eu'|'uk'|'nordic'|'fatf'|'basel'|'iosco'
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, source_id)
);

CREATE TABLE IF NOT EXISTS regulatory_feed_digests (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,              -- Markdown digest text
  sources     TEXT NOT NULL DEFAULT '[]', -- JSON array of source_ids included
  period_from TEXT,
  period_to   TEXT,
  token_count INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rfs_user ON regulatory_feed_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_rfd_user ON regulatory_feed_digests(user_id, created_at);
