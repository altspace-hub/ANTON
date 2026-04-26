-- 204_school_inline_migrations_consolidation.sql — consolidate school.ts inline migrations
--
-- Phase-3 cleanup of the G.15 silent-catches finding (school.ts × 29).
-- The route file `server/routes/school.ts` had ~30 lines of
-- `try { await db.exec('ALTER TABLE … ADD COLUMN …') } catch {}` — inline
-- semi-migrations that ran on every server startup. The pattern was
-- intentional (idempotent: if the column exists, swallow the error) but
-- it produced noise in the G.15 silent-catches audit and hid actual schema
-- evolution from the migration history.
--
-- This migration captures all those inline schema changes as a proper,
-- audit-defensible migration. The corresponding inline IIFE in school.ts
-- is removed in the same PR.

-- ── student_growth_profiles — gamification + adaptive-learning columns ───

ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS sen_mode             TEXT DEFAULT NULL;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS explanation_style    TEXT DEFAULT 'balanced';
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS streak_shields       INTEGER DEFAULT 2;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS gymnasiet_program    TEXT;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS university_program   TEXT;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS total_xp             INTEGER DEFAULT 0;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS xp_level             INTEGER DEFAULT 1;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS current_streak       INTEGER DEFAULT 0;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS longest_streak       INTEGER DEFAULT 0;
ALTER TABLE student_growth_profiles ADD COLUMN IF NOT EXISTS last_active_date     TEXT;

-- ── teacher_assignments — template flag ─────────────────────────────────

ALTER TABLE teacher_assignments      ADD COLUMN IF NOT EXISTS is_template         INTEGER DEFAULT 0;

-- ── student_class_enrollments — per-student-per-class teacher overrides ─

ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS teacher_level_override TEXT;
ALTER TABLE student_class_enrollments ADD COLUMN IF NOT EXISTS sen_override            TEXT;

-- ── school_classes — leaderboard toggle ─────────────────────────────────

ALTER TABLE school_classes           ADD COLUMN IF NOT EXISTS leaderboard_enabled INTEGER DEFAULT 0;

-- ── guardian_student_links — email digest preference ───────────────────

ALTER TABLE guardian_student_links   ADD COLUMN IF NOT EXISTS email_digest        INTEGER DEFAULT 1;

-- ── teacher_lessons — class-attached lesson plan / template ─────────────

CREATE TABLE IF NOT EXISTS teacher_lessons (
  id                    TEXT PRIMARY KEY,
  teacher_user_id       TEXT NOT NULL,
  class_id              TEXT,
  title                 TEXT NOT NULL,
  subject_id            TEXT NOT NULL DEFAULT 'mathematics',
  learning_objectives   TEXT DEFAULT '[]',
  content_blocks        TEXT DEFAULT '[]',
  tier                  TEXT DEFAULT 'T2',
  is_template           INTEGER DEFAULT 0,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── XP / gamification ledger + achievements + daily quests ──────────────

CREATE TABLE IF NOT EXISTS student_xp_events (
  id                    TEXT PRIMARY KEY,
  student_user_id       TEXT NOT NULL,
  event_type            TEXT NOT NULL,
  xp_earned             INTEGER NOT NULL,
  context               TEXT,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_achievements (
  id                    TEXT PRIMARY KEY,
  student_user_id       TEXT NOT NULL,
  achievement_id        TEXT NOT NULL,
  earned_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS school_admin_config (
  key                   TEXT PRIMARY KEY,
  value                 TEXT
);

CREATE TABLE IF NOT EXISTS student_daily_quests (
  id                    TEXT PRIMARY KEY,
  student_user_id       TEXT NOT NULL,
  quest_type            TEXT NOT NULL,
  quest_date            TEXT NOT NULL,
  target                INTEGER NOT NULL,
  progress              INTEGER DEFAULT 0,
  completed             INTEGER DEFAULT 0,
  xp_reward             INTEGER NOT NULL,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_user_id, quest_date, quest_type)
);

CREATE TABLE IF NOT EXISTS guardian_digest_log (
  id                    TEXT PRIMARY KEY,
  guardian_user_id      TEXT NOT NULL,
  student_user_id       TEXT NOT NULL,
  sent_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  digest_data           TEXT
);

-- ── Spaced-repetition review cards + avatar customisation ───────────────

CREATE TABLE IF NOT EXISTS review_cards (
  id                    TEXT PRIMARY KEY,
  student_user_id       TEXT NOT NULL,
  subject_id            TEXT NOT NULL,
  front                 TEXT NOT NULL,
  back                  TEXT NOT NULL,
  source                TEXT,
  due_date              TEXT,
  interval_days         INTEGER DEFAULT 1,
  ease_factor           REAL DEFAULT 2.5,
  repetitions           INTEGER DEFAULT 0,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_avatars (
  student_user_id       TEXT PRIMARY KEY,
  avatar_char           TEXT DEFAULT '🦊',
  color_scheme          TEXT DEFAULT 'teal',
  frame                 TEXT DEFAULT 'none',
  title                 TEXT DEFAULT '',
  unlocked_items        TEXT DEFAULT '[]',
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Group study rooms + weekly XP snapshots + season events ─────────────

CREATE TABLE IF NOT EXISTS study_rooms (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  subject_id            TEXT,
  host_user_id          TEXT NOT NULL,
  max_participants      INTEGER DEFAULT 8,
  is_public             INTEGER DEFAULT 1,
  join_code             TEXT UNIQUE,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at            TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weekly_xp_snapshots (
  id                    TEXT PRIMARY KEY,
  student_user_id       TEXT NOT NULL,
  class_id              TEXT,
  week_start            TEXT NOT NULL,
  week_xp               INTEGER DEFAULT 0,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_user_id, week_start)
);

CREATE TABLE IF NOT EXISTS xp_seasons (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  emoji                 TEXT DEFAULT '⭐',
  start_date            TEXT NOT NULL,
  end_date              TEXT NOT NULL,
  xp_multiplier         REAL DEFAULT 1.0,
  description           TEXT,
  active                INTEGER DEFAULT 1
);

-- Seed 4 default seasons (idempotent — ON CONFLICT DO NOTHING).
INSERT INTO xp_seasons (id, name, emoji, start_date, end_date, xp_multiplier, description, active) VALUES
  ('season-autumn-2026', 'Autumn Challenge', '🍂', '2026-09-01', '2026-11-30', 1.5,  'Back to school season — earn 50% bonus XP on all activities!', 1),
  ('season-winter-2026', 'Winter Sprint',    '❄️', '2026-12-01', '2027-02-28', 2.0,  'Winter double XP event — all XP doubled during the Christmas break study sprint!', 1),
  ('season-spring-2027', 'Spring Bloom',    '🌸', '2027-03-01', '2027-05-31', 1.5,  'Exam prep season — bonus XP for every practice session and review card!', 1),
  ('season-summer-2027', 'Summer Quest',    '☀️', '2027-06-01', '2027-08-31', 1.25, 'Keep learning through summer — 25% XP boost to stay sharp!', 1)
ON CONFLICT (id) DO NOTHING;

-- ── Rich curriculum + lesson system (already-IIFE'd in school.ts) ───────

CREATE TABLE IF NOT EXISTS school_curricula (
  id                    TEXT PRIMARY KEY,
  subject_id            TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  tier                  TEXT DEFAULT 'T2',
  language              TEXT DEFAULT 'en',
  units                 TEXT DEFAULT '[]',
  created_by            TEXT DEFAULT 'system',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_lessons (
  id                    TEXT PRIMARY KEY,
  curriculum_id         TEXT,
  subject_id            TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  content_blocks        TEXT DEFAULT '[]',
  estimated_minutes     INTEGER DEFAULT 30,
  bloom_level           TEXT DEFAULT 'understand',
  tier                  TEXT DEFAULT 'T2',
  published             INTEGER DEFAULT 0,
  created_by            TEXT DEFAULT 'teacher',
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_lesson_progress (
  id                    TEXT PRIMARY KEY,
  lesson_id             TEXT NOT NULL,
  student_user_id       TEXT NOT NULL,
  status                TEXT DEFAULT 'not_started',
  completed_blocks      TEXT DEFAULT '[]',
  score                 INTEGER,
  time_spent_seconds    INTEGER DEFAULT 0,
  started_at            TIMESTAMP,
  completed_at          TIMESTAMP,
  UNIQUE(lesson_id, student_user_id)
);
