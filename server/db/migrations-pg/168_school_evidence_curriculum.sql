-- 168_school_evidence_curriculum.sql
-- School pillar — Learning Evidence Log + Curriculum Registry.
-- Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.3.
--
-- Closes the 📋 status on /docs/architecture/future/f-54-school-mode.md for
-- evidence + curriculum surfaces. Seed coverage: 5 countries first
-- (SE/UK/US/IN/KE) — 25-country expansion is a follow-up.

-- ── Learning Evidence Log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_evidence_log (
  id                       TEXT PRIMARY KEY,
  student_user_id          TEXT NOT NULL,
  -- evidence kinds match School-mode primary surfaces
  evidence_type            TEXT NOT NULL CHECK (evidence_type IN (
    'work-sample', 'quiz-result', 'observation', 'portfolio-item'
  )),
  subject                  TEXT,
  -- learning-objective id from curriculum_registry (loose FK; entries can be
  -- attached without strict referential integrity for cross-jurisdictional cases)
  learning_objective_id    TEXT,
  ai_assessment_summary    TEXT,
  -- visibility flags
  guardian_visible         BOOLEAN NOT NULL DEFAULT TRUE,
  teacher_notes            TEXT,
  -- attached .anton study-pack reference (if relevant)
  study_pack_bundle_ref    TEXT,
  -- supporting attachments (uri list)
  attachments              JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- soft-delete for safe redaction
  deleted_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_evidence_student
  ON learning_evidence_log(student_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_objective
  ON learning_evidence_log(learning_objective_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_guardian
  ON learning_evidence_log(student_user_id, guardian_visible, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── Curriculum Registry ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_registry (
  id                       TEXT PRIMARY KEY,
  -- ISO 3166-1 alpha-2 country code
  country_code             TEXT NOT NULL,
  -- e.g. "England" (sub-national jurisdiction within UK), "California" (US),
  -- left NULL for nationwide curricula
  jurisdiction             TEXT,
  subject                  TEXT NOT NULL,
  -- e.g. "year-7", "grade-9", "standard-X" — adopt local nomenclature
  year_level               TEXT NOT NULL,
  -- curriculum framework reference (e.g. "ENG-NC-MATH-Y7-SCALE")
  learning_objective_code  TEXT NOT NULL,
  learning_objective_text  TEXT NOT NULL,
  -- canonical source (national-curriculum URL, regulator publication, etc.)
  source_url               TEXT,
  -- when this entry was last verified against the source
  last_verified_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- whether currently active in the registry (for sunsetting outdated curricula)
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- composite uniqueness on jurisdiction + subject + year + objective code
  CONSTRAINT uq_curriculum_objective UNIQUE (
    country_code, jurisdiction, subject, year_level, learning_objective_code
  )
);

CREATE INDEX IF NOT EXISTS idx_curriculum_country_subject
  ON curriculum_registry(country_code, subject, year_level)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_curriculum_objective_code
  ON curriculum_registry(learning_objective_code)
  WHERE is_active = TRUE;

-- ── Seed: 5 countries (SE/UK/US/IN/KE) ───────────────────────────────
-- Each country gets one anchor objective per subject/year as a starting
-- point. Operators expand via the CurriculumRegistryPage admin surface
-- or by importing a `regulatory-knowledge-pack` bundle that targets the
-- registry table.
--
-- IMPORTANT: these are anchor seeds, not authoritative curriculum content.
-- Verify against your jurisdiction's source-of-truth before relying.
INSERT INTO curriculum_registry (id, country_code, jurisdiction, subject, year_level, learning_objective_code, learning_objective_text, source_url) VALUES
  ('seed-se-math-7',   'SE', NULL,        'mathematics', 'year-7',  'SE-MATH-Y7-FRAC',   'Operate with fractions, decimals, and percentages in real contexts.', 'https://www.skolverket.se/'),
  ('seed-uk-eng-math-7','UK','England',  'mathematics', 'year-7',  'UK-ENG-MATH-Y7-RATIO','Use ratio notation, including reduction to simplest form.',         'https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study'),
  ('seed-us-ca-math-7','US', 'California','mathematics', 'grade-7', 'US-CA-MATH-G7-PROP', 'Analyse proportional relationships and use them to solve real-world and mathematical problems.', 'https://www.cde.ca.gov/'),
  ('seed-in-cbse-math-7','IN','CBSE',    'mathematics', 'class-7', 'IN-CBSE-MATH-C7-INT','Operations on integers, properties of integer operations.',           'https://ncert.nic.in/'),
  ('seed-ke-math-7',   'KE', NULL,        'mathematics', 'grade-7', 'KE-MATH-G7-FRAC',   'Apply fractions, decimals and percentages in measurement and money problems.', 'https://kicd.ac.ke/'),
  -- A second-subject anchor per country to prove multi-subject coverage
  ('seed-se-sci-7',    'SE', NULL,        'science',     'year-7',  'SE-SCI-Y7-MATTER',  'Describe states of matter and basic chemical reactions.',                'https://www.skolverket.se/'),
  ('seed-uk-eng-sci-7','UK','England',   'science',     'year-7',  'UK-ENG-SCI-Y7-CELL','Cells: structure, function, and microscopy basics.',                     'https://www.gov.uk/'),
  ('seed-us-ca-sci-7', 'US', 'California','science',     'grade-7', 'US-CA-SCI-G7-ECO',  'Investigate matter cycling and energy flow in ecosystems.',              'https://www.cde.ca.gov/'),
  ('seed-in-cbse-sci-7','IN','CBSE',     'science',     'class-7', 'IN-CBSE-SCI-C7-NUTR','Nutrition in plants and animals.',                                       'https://ncert.nic.in/'),
  ('seed-ke-sci-7',    'KE', NULL,        'science',     'grade-7', 'KE-SCI-G7-PLANTS',  'Structure and function of plants; food production.',                     'https://kicd.ac.ke/')
ON CONFLICT (country_code, jurisdiction, subject, year_level, learning_objective_code) DO NOTHING;
