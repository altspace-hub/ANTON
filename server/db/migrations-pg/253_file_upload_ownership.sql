-- 253_file_upload_ownership.sql
--
-- An ownership record for uploaded files, plus a correction to the one that
-- already existed but was never populated.
--
-- ── Part 1: file_uploads ────────────────────────────────────────────────────
--
-- POST /api/files/upload wrote nothing to the database at all. It stored the file
-- on disk and returned the generated name, and GET /api/files/:id then served ANY
-- id that existed in the upload directory, with only a path-traversal check. There
-- was no ownership record, so nothing distinguished one user's upload from
-- another's: the id was the entire access control mechanism — a capability URL.
--
-- The id was hardened to randomUUID() earlier (122 CSPRNG bits, so unguessable),
-- but a capability URL still leaks through anything that records a URL: history,
-- proxy logs, a pasted link, a shared screenshot. On a DEPLOYMENT_MODE=team
-- install these are other people's contracts, KYC files and case documents.
--
-- id is the on-disk filename, so existing files can be attributed later if wanted,
-- and lookups need no join. Rows are NOT foreign-keyed to users: a deleted user
-- must not cascade away the audit trail of what they uploaded.
CREATE TABLE IF NOT EXISTS file_uploads (
  id            TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  extension     TEXT,
  size_bytes    BIGINT,
  uploaded_by   TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_by ON file_uploads(uploaded_by);

COMMENT ON TABLE file_uploads IS
  'Ownership record for POST /api/files/upload. id is the on-disk filename. Files predating this table have no row and are treated as unattributed — served in solo mode, withheld from non-admins in team mode.';

-- ── Part 2: repair rag_documents.uploaded_by ────────────────────────────────
--
-- rag_documents HAS had an uploaded_by column all along, but the upload routes
-- read `(req as any).userId`, which is never set — the auth middleware stamps
-- `req.user.id`. Every document ever indexed was therefore attributed to the
-- literal string 'system'.
--
-- That silently disabled the ownership checks added on the reindex / delete / get
-- routes: they compare uploaded_by against a real user id, which 'system' never
-- matches. In team mode the effect was not a leak but a lockout — every user got
-- 404 on their own documents.
--
-- 'system' is normalised to NULL so those rows are honestly unattributed rather
-- than appearing to belong to a user who does not exist. Both values fail an
-- owner check identically, so this changes no access decision; it makes the state
-- legible to an admin, and lets a future backfill tell "nobody recorded this"
-- apart from "a real account named system".
UPDATE rag_documents SET uploaded_by = NULL WHERE uploaded_by = 'system';

COMMENT ON COLUMN rag_documents.uploaded_by IS
  'User id of the uploader. NULL means unattributed — either predating attribution or written by the pre-fix code that stored the literal string ''system''.';
