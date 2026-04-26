-- 175_grow_signals_briefings.sql — Grow pillar weak-signal extension +
-- per-account briefing snapshots.
--
-- The base grow_signals + grow_briefings tables ship in mig 093. This
-- migration adds two complementary tables:
--   1) grow_signal_evidence — per-signal evidence snippets (URL + excerpt
--      + author + retrieved_at) so the AI can cite when generating
--      briefings.
--   2) grow_briefing_distribution — distribution log for briefings (who
--      got it, when, did they read it). Useful for measuring whether
--      generated briefings actually drive action.

CREATE TABLE IF NOT EXISTS grow_signal_evidence (
  id              TEXT PRIMARY KEY,
  signal_id       TEXT NOT NULL,
  evidence_kind   TEXT NOT NULL,         -- 'url_excerpt' / 'press_release' / 'filing' / 'screenshot' / 'manual_quote'
  source_url      TEXT,
  excerpt         TEXT NOT NULL,
  author          TEXT,
  retrieved_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS grow_signal_evidence_signal_idx
  ON grow_signal_evidence(signal_id, retrieved_at DESC);

CREATE INDEX IF NOT EXISTS grow_signal_evidence_kind_idx
  ON grow_signal_evidence(evidence_kind);

-- Distribution log: every time a briefing is shared / sent / read.
CREATE TABLE IF NOT EXISTS grow_briefing_distribution (
  id              TEXT PRIMARY KEY,
  briefing_id     TEXT NOT NULL,
  recipient       TEXT NOT NULL,         -- email / user_id / 'self'
  channel         TEXT NOT NULL,         -- 'app' / 'email' / 'slack' / 'export'
  sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at         TIMESTAMP,
  acted_on_at     TIMESTAMP,             -- did the recipient take a follow-up action?
  payload         JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS grow_briefing_distribution_briefing_idx
  ON grow_briefing_distribution(briefing_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS grow_briefing_distribution_unread_idx
  ON grow_briefing_distribution(recipient, sent_at DESC) WHERE read_at IS NULL;
