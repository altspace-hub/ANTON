-- 181_school_assignment_queue.sql — homework / assignment queue +
-- teacher-review hand-off for the School pillar.
--
-- Builds on the assessments table (mig 176) with the workflow side:
-- the queue an individual student sees ("here's what's due"), and the
-- teacher's review-queue when AI-generated assessments need a human pass
-- before being released to the student.

CREATE TABLE IF NOT EXISTS school_assignments (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  subject_id      TEXT NOT NULL,
  module_id       TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  due_at          TIMESTAMP,
  assigned_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by     TEXT NOT NULL DEFAULT 'self',  -- 'self' / 'teacher_<id>' / 'ai_recommended'
  source_kind     TEXT NOT NULL,                 -- 'homework' / 'practice' / 'assessment' / 'curriculum_path' / 'remediation'
  payload         JSONB DEFAULT '{}',            -- e.g. { topic, target_level, bundle_id }
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' / 'in_progress' / 'submitted' / 'graded' / 'returned' / 'skipped'
  submitted_at    TIMESTAMP,
  graded_at       TIMESTAMP,
  graded_score    NUMERIC,                        -- 0.0–1.0
  graded_feedback TEXT
);

CREATE INDEX IF NOT EXISTS school_assignments_user_due_idx
  ON school_assignments(user_id, due_at) WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS school_assignments_status_idx
  ON school_assignments(status, assigned_at DESC);

-- Teacher review queue: AI-generated assessments / feedback / explanations
-- that the teacher wants to pre-approve before the student sees them.
-- Used in classroom contexts where the teacher is the trust boundary.

CREATE TABLE IF NOT EXISTS school_teacher_review_queue (
  id              TEXT PRIMARY KEY,
  teacher_id      TEXT NOT NULL,
  student_id      TEXT NOT NULL,
  artefact_kind   TEXT NOT NULL,                 -- 'ai_explanation' / 'ai_assessment' / 'ai_feedback' / 'ai_lesson_plan'
  artefact_ref    TEXT NOT NULL,                 -- pointer to the assessment id / message id / etc.
  ai_payload      JSONB NOT NULL,                -- the proposed AI output
  queued_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at     TIMESTAMP,
  decision        TEXT,                          -- 'approve' / 'edit_and_release' / 'reject'
  edited_payload  JSONB,
  review_notes    TEXT
);

CREATE INDEX IF NOT EXISTS school_teacher_review_queue_pending_idx
  ON school_teacher_review_queue(teacher_id, queued_at) WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS school_teacher_review_queue_student_idx
  ON school_teacher_review_queue(student_id, queued_at DESC);
