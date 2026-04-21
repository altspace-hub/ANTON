-- ── 166_video_layer.sql ─────────────────────────────────────────────────────
-- Visitor Layer v0.8 — Video. Per Q7/Q8/Q9: 2GB max, MinIO self-hosted
-- storage, comments deferred to v0.8.2. Playlist = bundle type #45 and
-- lives in the existing .anton bundle registry.
--
-- Four tables:
--   video_uploads        — upload intent + metadata + transcoding state
--   video_variants       — rendered variant rows (HLS ladder) per upload
--   video_views          — view counter rows (aggregate)
--   video_playlists      — ordered collections, synced with bundle #45

CREATE TABLE IF NOT EXISTS video_uploads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  visibility         TEXT NOT NULL CHECK (visibility IN ('public', 'friends-circle', 'unlisted', 'private')) DEFAULT 'private',
  duration_seconds   INTEGER,
  source_size_bytes  BIGINT,
  storage_key        TEXT NOT NULL,                   -- MinIO object key for the original
  state              TEXT NOT NULL CHECK (state IN ('pending', 'uploaded', 'transcoding', 'ready', 'failed', 'deleted')) DEFAULT 'pending',
  error_message      TEXT,
  poster_storage_key TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_uploads_uploader
  ON video_uploads (uploader_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_uploads_state
  ON video_uploads (state) WHERE state IN ('pending', 'uploaded', 'transcoding');

CREATE TABLE IF NOT EXISTS video_variants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id          UUID NOT NULL REFERENCES video_uploads(id) ON DELETE CASCADE,
  label              TEXT NOT NULL,                    -- e.g. '1080p', '720p', '480p', 'audio-only'
  width              INTEGER,
  height             INTEGER,
  bitrate_kbps       INTEGER,
  storage_key        TEXT NOT NULL,
  size_bytes         BIGINT,
  duration_seconds   INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_variants_upload
  ON video_variants (upload_id);

CREATE TABLE IF NOT EXISTS video_views (
  id                 BIGSERIAL PRIMARY KEY,
  upload_id          UUID NOT NULL REFERENCES video_uploads(id) ON DELETE CASCADE,
  viewer_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  viewed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completion_pct     SMALLINT CHECK (completion_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_video_views_upload
  ON video_views (upload_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS video_playlists (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  description        TEXT,
  visibility         TEXT NOT NULL CHECK (visibility IN ('public', 'friends-circle', 'unlisted', 'private')) DEFAULT 'private',
  bundle_id          TEXT,                               -- link to the .anton bundle (#45) once exported
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_video_playlists_owner
  ON video_playlists (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS video_playlist_items (
  playlist_id        UUID NOT NULL REFERENCES video_playlists(id) ON DELETE CASCADE,
  upload_id          UUID NOT NULL REFERENCES video_uploads(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,
  added_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (playlist_id, upload_id)
);
CREATE INDEX IF NOT EXISTS idx_video_playlist_items_order
  ON video_playlist_items (playlist_id, position);
