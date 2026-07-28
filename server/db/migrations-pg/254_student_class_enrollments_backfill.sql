-- 254_student_class_enrollments_backfill.sql
--
-- Creates a table that migration 204 is *recorded* as having created, but did not.
--
-- ── What happened ──────────────────────────────────────────────────────────
--
-- 204_school_inline_migrations_consolidation.sql applied to existing databases on
-- 2026-04-26. At that point the file contained only ALTER TABLE statements for
-- student_class_enrollments. The `CREATE TABLE IF NOT EXISTS` was added to the SAME
-- FILE on 2026-06-21 (commit 7b2a8cfb, "repair fresh-install db:init"), 56 days later.
--
-- The runner skips any migration whose id is already in schema_migrations, and it is
-- right to: re-running arbitrary SQL against a live database is far more dangerous than
-- skipping it. So the repair worked perfectly for FRESH installs and was a silent no-op
-- for every database that already existed — which is every database of an existing user.
--
-- The observable result: `PATCH /api/school/classes/:classId/students/:studentId/settings`
-- writes SEN and assistance-level overrides to a table that is not there. On an install
-- that predates 2026-06-21 it has never worked, and the failure was invisible because
-- the route returned before anyone checked.
--
-- ── The rule this is following ─────────────────────────────────────────────
--
-- NEVER edit a migration that may already have been applied. Its id is the only record
-- that exists, and the runner keys off the id, not the contents — so an edit reaches new
-- installs and no one else, and the two populations silently diverge. Ship a NEW
-- migration instead. That is what this file is.
--
-- Idempotent, so it is a harmless no-op on any database where 204 (post-June) already
-- created the table.
--
-- Shape mirrors 204's definition exactly — do not "improve" it here, or fresh installs
-- and repaired installs will diverge in a second, subtler way.

CREATE TABLE IF NOT EXISTS student_class_enrollments (
  id                     TEXT PRIMARY KEY,
  class_id               TEXT NOT NULL,
  student_user_id        TEXT NOT NULL,
  teacher_level_override TEXT,
  sen_override           TEXT,
  enrolled_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status                 TEXT DEFAULT 'active',
  UNIQUE(class_id, student_user_id)
);

ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS teacher_level_override TEXT;
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS sen_override           TEXT;

CREATE INDEX IF NOT EXISTS idx_sce_class    ON student_class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_sce_student  ON student_class_enrollments(student_user_id);

COMMENT ON TABLE student_class_enrollments IS
  'Per-student-per-class teacher overrides (assistance level, SEN). Declared by migration 204 but created here for databases that applied 204 before 2026-06-21 — see the header of this file before editing any applied migration.';
