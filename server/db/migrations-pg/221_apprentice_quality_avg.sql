-- Migration 221: Apprentice quality average — make promotion arithmetically possible
-- (Core Experience Review 2026-06, bug B2).
--
-- The inline apprentice-progression path in server/routes/claude.ts incremented
-- sessions_completed but NEVER wrote quality_avg; the only writer
-- (apprentice.recordSession) is reachable only via a manual API nothing calls.
-- Result: every profile had quality_avg = NULL, and the promotion gates
-- (quality_avg >= 7.0 / 8.0) evaluated (NULL ?? 0) >= 7.0 — false forever.
--
-- 1. quality_n — the denominator of the running mean. It counts only the
--    sessions that actually received a quality score (quality-ratchet scoring
--    is skipped for outputs <= 200 chars and may fail), so unscored sessions
--    never dilute or poison the average. sessions_completed is NOT a valid
--    denominator for exactly that reason.
--
-- 2. Backfill quality_avg / quality_n for existing profiles from the
--    quality_scores history. Join ground-truthed against the live dev DB:
--    quality_scores.session_id -> sessions.id -> sessions.user_id ('solo')
--    plus module_id matches apprentice_profiles(user_id, module_id) exactly.
--    quality_scores rows whose session is missing or has no user_id are
--    attributed to 'default' (mirroring claude.ts: req.user?.id || 'default');
--    if no such profile exists they are simply ignored.
--    Only profiles with quality_avg IS NULL are touched — any future re-run
--    or manually maintained value is left alone.

ALTER TABLE apprentice_profiles
  ADD COLUMN IF NOT EXISTS quality_n INTEGER NOT NULL DEFAULT 0;

UPDATE apprentice_profiles ap
SET quality_avg = sub.avg_score,
    quality_n   = sub.n
FROM (
  SELECT COALESCE(s.user_id, 'default') AS user_id,
         qs.module_id,
         AVG(qs.score_overall)          AS avg_score,
         COUNT(*)::INTEGER              AS n
  FROM quality_scores qs
  LEFT JOIN sessions s ON s.id = qs.session_id
  GROUP BY COALESCE(s.user_id, 'default'), qs.module_id
) sub
WHERE ap.user_id   = sub.user_id
  AND ap.module_id = sub.module_id
  AND ap.quality_avg IS NULL;
