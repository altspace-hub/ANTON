-- 173_life_news_bias_tracking.sql — bias-profile delta history for the
-- "My Bias" page in the News area.
--
-- Phase B.3 build-out continued. Stores per-user reading-history deltas so
-- the bias-profile chart on /news/my-bias can render trend lines (last 30
-- days, last 90 days, all-time). The instantaneous profile already lives
-- in news_user_preferences.bias_profile JSON; this migration adds the
-- time-series + the dedicated index.

CREATE TABLE IF NOT EXISTS news_bias_history (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  recorded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- One row per bias-bucket per snapshot. Aggregates to the full distribution.
  bias_bucket     TEXT NOT NULL,
  share_pct       NUMERIC NOT NULL,  -- 0.0–100.0
  source_count    INTEGER NOT NULL,
  story_count     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS news_bias_history_user_time_idx
  ON news_bias_history(user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS news_bias_history_bucket_idx
  ON news_bias_history(bias_bucket);

-- A nudge log: when the My-Bias page suggests "your reading is leaning
-- 80% center-left, consider adding a centre-right source", we record the
-- nudge so we can suppress duplicate suggestions and track if the user
-- actually broadened their sources.

CREATE TABLE IF NOT EXISTS news_bias_nudges (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  nudge_kind      TEXT NOT NULL,        -- 'add_opposing' / 'reduce_extreme' / 'broaden_geo'
  nudge_payload   JSONB DEFAULT '{}',
  shown_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acted_on_at     TIMESTAMP,
  dismissed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS news_bias_nudges_user_idx
  ON news_bias_nudges(user_id, shown_at DESC);
