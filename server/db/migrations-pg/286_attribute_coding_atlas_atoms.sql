-- 286 — Coding and Risk Atlas atoms get their owner (2026-09-23).
--
-- Migration 275 gave knowledge_atoms an owner and filled it from the workflow
-- output an atom was learned from. Two writers never go through a workflow
-- output, so their atoms kept owner_user_id NULL — and on a shared
-- (DEPLOYMENT_MODE=team) server an atom with no owner is SHARED knowledge:
-- every user lists it, searches it and could retire it. That showed one
-- person's Coding Studio lessons (test failures, CVEs, panel flags) and Risk
-- Atlas threat paths, controls and residual scores to colleagues who cannot
-- open the project or the Atlas itself. The writers now attribute on insert
-- (coding-integration.ts mintCodingAtom, atlas-knowledge-bridge.ts pushAtom);
-- this backfills the rows written before that.
--
-- Only rows that can be attributed by a join are touched, and only while their
-- owner is still NULL, so the file is idempotent and never overwrites an owner
-- set since. A row whose project or Atlas has no owner either stays NULL —
-- nothing truthful can be written there.

-- Coding atoms: knowledge_atoms.coding_project_id (migration 239) →
-- coding_projects.project_id → projects.user_id. The same owner source the
-- coding routes check (ensureCodingProject), never coding_projects.created_by.
UPDATE knowledge_atoms ka
   SET owner_user_id = p.user_id
  FROM coding_projects cp
  JOIN projects p ON p.id = cp.project_id
 WHERE ka.coding_project_id = cp.id
   AND ka.owner_user_id IS NULL
   AND p.user_id IS NOT NULL;

-- Risk Atlas atoms: the bridge writes source_workflow_id = 'risk-atlas' and
-- source_execution_id = the Atlas id (knowledge_atoms has no Atlas column).
UPDATE knowledge_atoms ka
   SET owner_user_id = ra.owner_user_id
  FROM risk_atlases ra
 WHERE ka.source_workflow_id = 'risk-atlas'
   AND ka.source_execution_id = ra.id
   AND ka.owner_user_id IS NULL
   AND ra.owner_user_id IS NOT NULL;
