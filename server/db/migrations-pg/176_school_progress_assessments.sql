-- 176_school_progress_assessments.sql — student progress + assessments
-- for the School pillar.
--
-- The school pillar tracks the structured 7-layer prompt assembly
-- (mig 168 added evidence + curriculum) but didn't yet have a place to
-- record the longitudinal progress of a single student or formal
-- assessments. This migration adds both.

CREATE TABLE IF NOT EXISTS school_student_progress (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  subject_id      TEXT NOT NULL,
  module_id       TEXT,
  topic           TEXT,
  recorded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  level_estimate  TEXT,                  -- e.g. 'L1' / 'L2' / 'L3' / 'L4'
  growth_stage    TEXT,                  -- e.g. 'S1' / 'S2' / 'S3' / 'S4'
  evidence_link   TEXT,                  -- pointer to the conversation / artefact this was derived from
  derived_by      TEXT NOT NULL DEFAULT 'ai',  -- 'ai' / 'teacher' / 'self'
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS school_student_progress_user_idx
  ON school_student_progress(user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS school_student_progress_subject_idx
  ON school_student_progress(subject_id, module_id);

-- Assessments: structured tests / tasks the AI generates and grades.
-- Distinct from progress — an assessment is a formal "this is the
-- student's measured level on date X" event.

CREATE TABLE IF NOT EXISTS school_assessments (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL DEFAULT 'default',
  subject_id      TEXT NOT NULL,
  module_id       TEXT,
  generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  task_kind       TEXT NOT NULL,         -- 'multiple_choice' / 'short_answer' / 'long_answer' / 'practical'
  task_payload    JSONB NOT NULL,        -- the prompt / question itself
  rubric          JSONB,                 -- AI-generated grading rubric
  response        TEXT,
  graded_at       TIMESTAMP,
  graded_score    NUMERIC,               -- 0.0 - 1.0
  graded_by       TEXT,                  -- 'ai' / 'teacher_<id>'
  feedback_md     TEXT
);

CREATE INDEX IF NOT EXISTS school_assessments_user_idx
  ON school_assessments(user_id, generated_at DESC);
