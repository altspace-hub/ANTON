-- Migration 100: Community content moderation infrastructure
-- Enables content flagging, review, and member muting within groups

CREATE TABLE IF NOT EXISTS community_content_flags (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK(content_type IN ('forum_post', 'group_post', 'mail', 'topic')),
  content_id TEXT NOT NULL,
  group_id TEXT,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('spam', 'harassment', 'off_topic', 'inappropriate', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by TEXT,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_content_flags_status ON community_content_flags(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_flags_group ON community_content_flags(group_id, status);

-- Track muted members within groups
ALTER TABLE community_group_members
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mute_reason TEXT;
