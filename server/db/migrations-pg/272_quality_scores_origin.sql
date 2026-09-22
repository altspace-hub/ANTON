-- 272 — every quality score says where it came from (2026-09-16).
--
-- quality_scores had 304 rows on the dev database and only 24 of them belonged
-- to a session that still exists. 276 were written by tests/routes/rerun.test.ts:
-- it seeded a score for a throwaway session and deleted only the session —
-- the table has no foreign key, so the scores stayed, at 8.40 each, under
-- module_id 'gap-analysis'. Every average, trend, leaderboard and capability
-- card over the table counted them as real work.
--
-- origin: 'run'    — the Quality Ratchet scored a real output (the default, so
--                    the ratchet's INSERT does not need to know the column).
--         'orphan' — session_id points at nothing. session_id may legitimately
--                    hold a sessions.id, a gap_assessments.id, a risk_atlases.id
--                    (POST /atlas/:id/quality-score) or a coding_reviews.id
--                    (coding-review.ts), so a row is an orphan only when it
--                    matches none of them. A NULL session_id is a session-less
--                    score (POST /api/quality/score without a session) and
--                    stays 'run'.
--
-- Readers that compute a baseline, average or trend filter on origin = 'run':
-- quality-ratchet (trend, leaderboard), orchestrator-engine, orchestrator-
-- pattern-engine, pattern-detection, capability-card-generator, atom-ab,
-- routes/projects. Single-row lookups by session or content hash do not.
ALTER TABLE quality_scores ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'run';

UPDATE quality_scores qs
SET origin = 'orphan'
WHERE qs.origin = 'run'
  AND qs.session_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sessions s        WHERE s.id = qs.session_id)
  AND NOT EXISTS (SELECT 1 FROM gap_assessments g WHERE g.id = qs.session_id)
  AND NOT EXISTS (SELECT 1 FROM risk_atlases r    WHERE r.id = qs.session_id)
  AND NOT EXISTS (SELECT 1 FROM coding_reviews c  WHERE c.id = qs.session_id);
