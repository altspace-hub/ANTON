-- ── 164_friends_layer.sql ────────────────────────────────────────────────────
-- Visitor Layer v0.8 — Friends. Consumer social surface running on the
-- existing Beehive / Gateway / AAP substrate. Three tables:
--   friend_contacts          — per-user peer list (Ed25519 pubkey-keyed)
--   friend_invitations       — pending / accepted / expired / revoked invites
--   friend_activity_events   — opt-in reverse-chrono share feed
-- Plus the minimal guardian model for school-mode Friends (Q12 answer A):
--   guardians                — links minor → guardian (by email)
--   guardian_approvals       — guardian-gated friend requests when minor

-- Contacts — one row per paired friendship from the owner's POV. Peers
-- appear in two directions (A has B as friend, B has A as friend) as
-- separate rows on each user's side; AAP carries the mutual handshake.
CREATE TABLE IF NOT EXISTS friend_contacts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_public_key          TEXT NOT NULL,                          -- Ed25519 pubkey of the friend's ANTON
  peer_portal_id           TEXT,                                   -- optional: if peer has a portal
  display_name             TEXT NOT NULL,                          -- user-set alias
  contact_status           TEXT NOT NULL CHECK (contact_status IN ('invited', 'pending', 'accepted', 'blocked', 'removed')),
  activity_share_setting   TEXT NOT NULL DEFAULT 'private'
                           CHECK (activity_share_setting IN ('private', 'me', 'friends-circle')),
  muted                    BOOLEAN NOT NULL DEFAULT FALSE,
  added_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, peer_public_key)
);
CREATE INDEX IF NOT EXISTS idx_friend_contacts_owner
  ON friend_contacts (owner_user_id, contact_status);

-- Invitations — signed envelopes issued by a user to bring a peer onto
-- their contact list. `invitation_envelope` is the full signed blob so
-- recipients can verify without needing a live Gateway connection.
CREATE TABLE IF NOT EXISTS friend_invitations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_envelope    TEXT NOT NULL,
  status                 TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_friend_invitations_inviter
  ON friend_invitations (inviter_user_id, status);

-- Activity events — reverse-chronological feed (no algorithmic scoring).
-- visibility column honours per-contact share settings set by the source.
CREATE TABLE IF NOT EXISTS friend_activity_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL CHECK (event_type IN ('portal-updated', 'bundle-shared', 'content-published', 'status-change')),
  payload           JSONB NOT NULL,
  visibility        TEXT NOT NULL CHECK (visibility IN ('public', 'friends-circle', 'specific')),
  specific_audience UUID[],                                  -- when visibility = 'specific'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_friend_activity_source
  ON friend_activity_events (source_user_id, created_at DESC);

-- ── Guardian model (Q12 answer A: minimal) ─────────────────────────────────
-- Links a minor's user_id to a guardian's email. Guardian receives approval
-- requests via email + (if the guardian has their own ANTON) app_checkpoints.
-- Full "guardian has supervise-account" model is deferred to v0.8.1.

CREATE TABLE IF NOT EXISTS guardians (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guardian_email   TEXT NOT NULL,
  guardian_name    TEXT,
  verified_at      TIMESTAMPTZ,               -- NULL until guardian clicks verify link
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (minor_user_id, guardian_email)
);

CREATE TABLE IF NOT EXISTS guardian_approvals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guardian_id           UUID REFERENCES guardians(id) ON DELETE SET NULL,
  subject_kind          TEXT NOT NULL CHECK (subject_kind IN ('friend-invite', 'friend-accept', 'video-upload', 'marketplace-purchase')),
  subject_reference     TEXT NOT NULL,           -- e.g. friend_invitation.id
  subject_summary       TEXT,
  status                TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'expired')) DEFAULT 'pending',
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at            TIMESTAMPTZ,
  decision_note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_guardian_approvals_pending
  ON guardian_approvals (minor_user_id, status)
  WHERE status = 'pending';
