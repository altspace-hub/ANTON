-- 270 — when an engagement was marked complete (2026-09-08).
--
-- Nothing ever set an engagement to 'completed': the workspace progress bar
-- topped out at 86% and the peer-benchmark library, which reads finished
-- engagements, stayed empty. POST /engagements/:id/complete now closes the
-- matter and records when.
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
