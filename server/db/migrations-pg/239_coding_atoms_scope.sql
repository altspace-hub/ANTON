-- ═══════════════════════════════════════════════════════════════════
-- 239_coding_atoms_scope.sql — ANTON Studio Phase 4.
--
-- PROJECT-SCOPED coding-atoms learning loop (active memory)
-- (CODING_STUDIO_DESIGN_2026-06-13.md §C-req3 / §D.6 / §F-P4).
--
-- DESIGN: a PROJECT SCOPE TAG on the EXISTING atom infra — NOT a new table,
-- NOT a new retrieval stack. Coding signals (test fail/pass, panel flag, bug,
-- CVE, arch decision) become project-scoped atoms that are injected into the
-- NEXT plan/edit so the project gets smarter as it runs; the loop is MEASURED
-- (A/B holdout) before we claim it works (the Markets lesson).
--
-- Two additive, history-preserving columns on knowledge_atoms + one partial
-- index. Existing atoms (coding_project_id NULL) are untouched and keep
-- flowing through the unchanged area/module retrieval path.
--
-- 1. coding_project_id — nullable FK to coding_projects. When set, the atom is
--    a LESSON FROM THIS PROJECT: filtered + boosted (~2.0x) into the next run
--    of the same project, and excluded from the cross-project default flow only
--    by relevance (it stays a normal atom otherwise).
--
-- 2. atom_origin — a free-text provenance tag for the deterministic capture
--    hooks (test_failure | pattern_works | review_flag | bug | cve | arch_decision).
--    Lets the dashboard + the injection header order lessons by kind without
--    re-parsing content.
--
-- 3. A PARTIAL index on coding_project_id WHERE NOT NULL — keeps the index tiny
--    (only the small minority of project-scoped atoms) while making the
--    per-project lookup in buildAtomLayer / getCodingAtomAbStats fast.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════════════

-- ON DELETE SET NULL: deleting a coding project must not delete the learned
-- atoms (they remain valid general knowledge); they simply lose their project
-- scope tag and fall back to the normal area/module retrieval path.
ALTER TABLE knowledge_atoms
  ADD COLUMN IF NOT EXISTS coding_project_id TEXT
    REFERENCES coding_projects(id) ON DELETE SET NULL;

ALTER TABLE knowledge_atoms
  ADD COLUMN IF NOT EXISTS atom_origin TEXT;

-- Partial index: only the (few) project-scoped atoms are indexed.
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_coding_project
  ON knowledge_atoms (coding_project_id)
  WHERE coding_project_id IS NOT NULL;
