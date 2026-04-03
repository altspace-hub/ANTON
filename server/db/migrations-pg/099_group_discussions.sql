-- Migration 099: Group-scoped discussion forums
-- Each group gets its own topic/post threads (separate from global forum)

CREATE TABLE IF NOT EXISTS community_group_topics (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  author_hash TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  pinned INTEGER DEFAULT 0,
  locked INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_topics_group ON community_group_topics(group_id, pinned DESC, last_post_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS community_group_posts (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES community_group_topics(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  parent_id TEXT,
  author_hash TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT 'Anonymous',
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  flagged INTEGER DEFAULT 0,
  posted_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_posts_topic ON community_group_posts(topic_id, posted_at ASC);
CREATE INDEX IF NOT EXISTS idx_group_posts_group ON community_group_posts(group_id);
