-- 186_community_announcement_channels.sql — broadcast announcement
-- channels for the Community pillar.
--
-- Direct messaging is per-pair. Announcement channels let an instance
-- broadcast to many subscribers at once (e.g., a regulatory expert
-- publishing a "DORA reading-list update" to 200 subscribers). Channels
-- are signed; subscribers verify on receipt.

CREATE TABLE IF NOT EXISTS community_channels (
  id              TEXT PRIMARY KEY,
  channel_handle  TEXT NOT NULL UNIQUE,            -- e.g. '@dora-updates'
  owner_pubkey    TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  description     TEXT,
  topic_tags      JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT TRUE,           -- public = discoverable; private = subscriber-list-controlled
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS community_channels_owner_idx
  ON community_channels(owner_pubkey);

CREATE INDEX IF NOT EXISTS community_channels_public_idx
  ON community_channels(is_public, is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS community_channel_subscribers (
  channel_id      TEXT NOT NULL,
  subscriber_pubkey TEXT NOT NULL,
  subscribed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TIMESTAMP,
  notification_pref TEXT NOT NULL DEFAULT 'normal',  -- 'silent' / 'normal' / 'high_priority'
  PRIMARY KEY (channel_id, subscriber_pubkey)
);

CREATE INDEX IF NOT EXISTS community_channel_subscribers_channel_active_idx
  ON community_channel_subscribers(channel_id) WHERE unsubscribed_at IS NULL;

CREATE TABLE IF NOT EXISTS community_channel_posts (
  id              TEXT PRIMARY KEY,
  channel_id      TEXT NOT NULL,
  posted_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  posted_by       TEXT NOT NULL,                   -- author pubkey
  title           TEXT,
  body_md         TEXT NOT NULL,
  attachments     JSONB DEFAULT '[]',
  signature       TEXT NOT NULL,                   -- Ed25519 sig over the post payload
  pinned          BOOLEAN DEFAULT FALSE,
  edited_at       TIMESTAMP,
  deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS community_channel_posts_channel_idx
  ON community_channel_posts(channel_id, posted_at DESC) WHERE deleted_at IS NULL;
