-- Migration 224: "Rerun with…" + Gap Assessor second-opinion lane
-- (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2 items 2.3 + 2.7)
--
-- 2.3  messages.rerun_of — links a rerun assistant message to the original
--      assistant message it re-executed (same session, different model).
--      The rerun goes through the standard /api/claude/message pipeline, so it
--      gets its own run_artifacts row for free; rerun_of is the only new state.
--      NULL for every normal message. No FK: the original message may be
--      deleted later and the rerun must survive as a standalone output.
--
-- 2.7  gap_finding_opinions — a COMPARISON SLOT for second-opinion assessment
--      runs with a different model. Never touches gap_findings: the primary
--      findings stay authoritative; opinions live beside them. Because the
--      scoring rubric (gap-scoring.ts) is shared and deterministic, agreement
--      between primary and opinion is exactly "do the criterion facts produce
--      the same computed score" — model-vs-model comparison with no judge LLM.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS rerun_of TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_rerun_of
  ON messages(rerun_of) WHERE rerun_of IS NOT NULL;

CREATE TABLE IF NOT EXISTS gap_finding_opinions (
  id                     BIGSERIAL PRIMARY KEY,
  assessment_id          TEXT NOT NULL REFERENCES gap_assessments(id) ON DELETE CASCADE,
  framework              TEXT NOT NULL,
  article_id             TEXT NOT NULL,
  article_title          TEXT,
  -- The actual model id that produced this opinion (e.g. claude-opus-4-8,
  -- mistral-large-latest, azure:gpt4o-eu) — NOT the UI tier alias.
  model_id               TEXT NOT NULL,
  -- Structured criterion facts the opinion model answered (rubric input).
  facts                  JSONB,
  -- Deterministic rubric outputs computed from `facts` (gap-scoring.ts).
  computed_score         TEXT CHECK (computed_score IN ('red','amber','yellow','green')),
  computed_numeric_score INTEGER,
  computed_priority      TEXT CHECK (computed_priority IN ('critical','high','medium','low')),
  rubric_version         INTEGER,
  -- LLM-side narrative (the only part the model decides).
  rationale              TEXT,
  current_state          TEXT,
  evidence_refs          JSONB,
  warnings               JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One opinion per article per model — re-running a second opinion with the
  -- same model replaces the previous slot (delete-then-insert in the route).
  UNIQUE (assessment_id, framework, article_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_gap_finding_opinions_assessment
  ON gap_finding_opinions(assessment_id);
