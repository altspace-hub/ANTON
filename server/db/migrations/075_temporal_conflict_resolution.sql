-- Migration 075: Temporal conflict resolution workflow

ALTER TABLE temporal_consequence_log
  ADD COLUMN IF NOT EXISTS resolution_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_action TEXT;

CREATE INDEX IF NOT EXISTS idx_temporal_log_pending
  ON temporal_consequence_log(user_id, resolution_status)
  WHERE resolution_status = 'pending' AND conflicts_detected > 0;
