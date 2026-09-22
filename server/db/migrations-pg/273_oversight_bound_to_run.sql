-- 273 — an oversight sign-off is bound to the run it reviewed (2026-09-16).
--
-- human_oversight_reviews recorded who signed and for which session, and
-- nothing about WHAT they signed: no answer id, no hash of the prompt or the
-- output. A session with three answers had one attestation that covered all
-- of them — including answers produced after the reviewer had left. The row
-- now names the assistant message and carries the server's own hashes of the
-- run (never the client's):
--
--   message_id       — messages.id of the answer reviewed (assistant role,
--                      same session; the route refuses anything else)
--   prompt_sha256    — run_artifacts.prompt_sha256 of that answer at sign-off
--                      (NULL for answers older than Wave 1 / a failed artifact
--                      write — the sign-off is still recorded)
--   output_sha256    — sha256 of messages.content at sign-off
--   evidence_pack_id — optional evidence_packs.id the sign-off is filed under
--
-- All four are nullable so the rows that predate this migration stay valid;
-- services/oversight-status.ts treats an unbound row as covering no specific
-- answer. No foreign keys: a deleted message must not delete the attestation
-- that a human made about it (the audit trail outlives the content).
--
-- The (session_id, created_at DESC) index serves "latest review for this
-- session" — the gate on every page load and the export route's status check.
ALTER TABLE human_oversight_reviews ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE human_oversight_reviews ADD COLUMN IF NOT EXISTS prompt_sha256 TEXT;
ALTER TABLE human_oversight_reviews ADD COLUMN IF NOT EXISTS output_sha256 TEXT;
ALTER TABLE human_oversight_reviews ADD COLUMN IF NOT EXISTS evidence_pack_id TEXT;

CREATE INDEX IF NOT EXISTS idx_human_oversight_session_created
  ON human_oversight_reviews(session_id, created_at DESC);
