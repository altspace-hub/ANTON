-- 275 — memory that earns its place (Wave 4, 2026-09-17).
--
-- The memory loop collected noise and injected it as "supporting evidence":
-- 2,959 atoms of which 70 came from real work, no owner on any of them, no
-- way to retire one, a summary step that lost the race for the engine slot
-- and a resume layer that nobody ever wrote to. This migration adds the
-- columns the loop needs to be honest; the services fill them in.

-- ── knowledge_atoms: ownership, dedupe, retirement ─────────────────────────
ALTER TABLE knowledge_atoms ADD COLUMN IF NOT EXISTS owner_user_id TEXT;
ALTER TABLE knowledge_atoms ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE knowledge_atoms ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE knowledge_atoms ADD COLUMN IF NOT EXISTS deactivated_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_content_hash ON knowledge_atoms(content_hash);
CREATE INDEX IF NOT EXISTS idx_knowledge_atoms_owner ON knowledge_atoms(owner_user_id);

-- Backfill: the hash of the normalised content (lower-cased, trimmed) so the
-- extractor can refuse a duplicate before it spends an insert and an embedding.
UPDATE knowledge_atoms
   SET content_hash = encode(sha256(convert_to(lower(btrim(content)), 'UTF8')), 'hex')
 WHERE content_hash IS NULL AND content IS NOT NULL;

-- Backfill: the atom's owner is whoever ran the output it was learned from.
UPDATE knowledge_atoms ka
   SET owner_user_id = wo.created_by
  FROM workflow_outputs wo
 WHERE ka.source_output_id = wo.id
   AND ka.owner_user_id IS NULL
   AND wo.created_by IS NOT NULL;

-- ── workflow_outputs: the learning pipeline's own ledger ───────────────────
-- pending → summarised → learned, or skipped / failed with the reason kept.
ALTER TABLE workflow_outputs ADD COLUMN IF NOT EXISTS learning_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE workflow_outputs ADD COLUMN IF NOT EXISTS learning_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workflow_outputs ADD COLUMN IF NOT EXISTS learning_error TEXT;
ALTER TABLE workflow_outputs ADD COLUMN IF NOT EXISTS learned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_workflow_outputs_learning_status ON workflow_outputs(learning_status);

UPDATE workflow_outputs wo
   SET learning_status = CASE
         WHEN EXISTS (SELECT 1 FROM knowledge_atoms ka WHERE ka.source_output_id = wo.id) THEN 'learned'
         WHEN wo.output_summary IS NOT NULL THEN 'summarised'
         ELSE 'pending'
       END,
       learned_at = CASE
         WHEN EXISTS (SELECT 1 FROM knowledge_atoms ka WHERE ka.source_output_id = wo.id)
           THEN (SELECT MAX(ka.created_at) FROM knowledge_atoms ka WHERE ka.source_output_id = wo.id)
         ELSE NULL
       END
 WHERE wo.learning_status = 'pending';

-- ── retrieval_feedback: bind an injected atom to the answer it went into ───
ALTER TABLE retrieval_feedback ADD COLUMN IF NOT EXISTS message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_retrieval_feedback_message ON retrieval_feedback(message_id);

-- ── session_snapshots: the model-written conclusion after a turn ───────────
ALTER TABLE session_snapshots ADD COLUMN IF NOT EXISTS message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_session_snapshots_session_created ON session_snapshots(session_id, created_at DESC);

-- ── goals_profiles: horizons apply to Markets unless the owner widens them ─
ALTER TABLE goals_profiles ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'markets';

-- ── legal_research_sessions: the matter lives in a project ─────────────────
ALTER TABLE legal_research_sessions ADD COLUMN IF NOT EXISTS project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_legal_research_sessions_project ON legal_research_sessions(project_id);
