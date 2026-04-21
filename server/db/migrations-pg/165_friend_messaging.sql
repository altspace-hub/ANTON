-- ── 165_friend_messaging.sql ────────────────────────────────────────────────
-- 1:1 chat + lightweight group (beehive) chat tables for the Visitor Layer
-- Friends surface. v1 stores bodies server-side to enable reload/search;
-- future migration will swap body for ciphertext + client-side decrypt.

CREATE TABLE IF NOT EXISTS friend_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- whose mailbox this row lives in
  contact_id          UUID NOT NULL REFERENCES friend_contacts(id) ON DELETE CASCADE,
  direction           TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  body                TEXT NOT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_friend_messages_owner_contact
  ON friend_messages (owner_user_id, contact_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS friend_groups (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  host_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS friend_group_members (
  group_id          UUID NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  member_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('host', 'member')),
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, member_user_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_group_members_member
  ON friend_group_members (member_user_id);
