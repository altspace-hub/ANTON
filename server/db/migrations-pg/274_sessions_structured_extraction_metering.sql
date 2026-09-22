-- 274 — structured extraction is metered (2026-09-16, Wave 3).
--
-- sessions.structured_status could say 'failed' and nothing else: no column
-- for the reason, no count of tries. On the dev database that read
-- pending 46 / failed 6 / extracted 3, and the last failure (09-13) was
-- lost because the extractor's transport/timeout branch returned before
-- anything was written.
--
-- structured_error    — the last failure's message (NULL after a success).
--                       Written by structured-extractor.extractAndStore and,
--                       for failures that escape it, by the extraction queue.
-- structured_attempts — live extraction attempts (cache hits do not count).
--                       Every failure bumps it, so a row reading failed / 4
--                       tried four times and the Transform panel can say so.
--
-- Rows already 'failed' get attempts = 1 and a message saying the reason
-- predates this column, so they are not mistaken for never-tried.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS structured_error TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS structured_attempts INTEGER NOT NULL DEFAULT 0;

UPDATE sessions
SET structured_attempts = 1,
    structured_error = 'Failed before migration 274 — the reason was not recorded'
WHERE structured_status = 'failed'
  AND structured_attempts = 0
  AND structured_error IS NULL;
