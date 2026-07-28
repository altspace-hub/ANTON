-- 255_school_safety_events.sql
--
-- Audit record for the School LLM safety screen (server/services/school-safety.ts).
--
-- ── What this is, and what it deliberately is not ──────────────────────────
--
-- This records that a screen fired. It is NOT a safeguarding inbox, and there is no UI
-- reading it. That is a deliberate choice, not an omission: ANTON previously shipped a
-- "Teacher Oversight" page that read tables which did not exist and displayed "no flags"
-- whether or not anything had happened. A dashboard that can only ever look clean is
-- worse than none, so it was removed (#32) rather than filled in with something
-- half-true. The same mistake is not being repeated in the other direction — this table
-- exists so a real inbox CAN be built, and nothing in the product claims one exists.
--
-- ── Why the message text is not stored ─────────────────────────────────────
--
-- The row records the CATEGORY and the rule that fired, never what the child wrote.
-- Storing a child's disclosure of abuse or self-harm in a general application table
-- creates a durable, highly sensitive record with no retention policy, no access control
-- designed for it, and no consent — and it would sit in every backup. The category is
-- what an adult needs in order to act; the words belong to the child and to the
-- conversation they chose to have.
--
-- session_id is nullable and not foreign-keyed: a screen can fire before a session
-- exists, and losing the audit row when a session is deleted would be the wrong tradeoff.

CREATE TABLE IF NOT EXISTS school_safety_events (
  id           TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL,
  session_id   TEXT,
  class_id     TEXT,
  disposition  TEXT NOT NULL CHECK (disposition IN ('support', 'block')),
  category     TEXT NOT NULL,
  rule_name    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_sse_student ON school_safety_events(student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sse_class   ON school_safety_events(class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sse_open    ON school_safety_events(acknowledged_at) WHERE acknowledged_at IS NULL;

COMMENT ON TABLE school_safety_events IS
  'Audit of School LLM safety screens. Category and rule only — never the child''s words. No UI reads this yet; see the file header before building one.';
