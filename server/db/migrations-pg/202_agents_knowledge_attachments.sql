-- 202_agents_knowledge_attachments.sql — knowledge-pack attachment +
-- per-agent prompt-overlay tracking for the Specialized Agents pillar.
--
-- A specialized agent gains its expertise from one or more knowledge
-- packs (Risk Atlas packs, framework packs, regulatory knowledge bundles)
-- + an optional system-prompt overlay that customises tone / scope.
-- This migration tracks the attachment so we know "which packs is this
-- agent currently grounded in?"

CREATE TABLE IF NOT EXISTS agent_knowledge_attachments (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  attachment_kind     TEXT NOT NULL,                 -- 'knowledge_pack' / 'risk_atlas_pack' / 'framework_pack' / 'document_set' / 'rag_collection' / 'community_pack'
  source_id           TEXT NOT NULL,                 -- pointer into the relevant pack table
  source_label        TEXT,                          -- human-readable label
  attached_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  attached_by         TEXT,
  priority            INTEGER NOT NULL DEFAULT 0,    -- higher = consulted first in retrieval
  scope               TEXT,                          -- 'always' / 'on_demand' / 'on_keyword'
  scope_keywords      JSONB DEFAULT '[]',            -- when scope = 'on_keyword'
  is_active           BOOLEAN DEFAULT TRUE,
  detached_at         TIMESTAMP,
  detached_reason     TEXT,
  payload             JSONB DEFAULT '{}',
  UNIQUE(agent_id, source_id, attachment_kind)
);

CREATE INDEX IF NOT EXISTS agent_knowledge_attachments_agent_idx
  ON agent_knowledge_attachments(agent_id, priority DESC) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS agent_knowledge_attachments_source_idx
  ON agent_knowledge_attachments(source_id);

-- System-prompt overlays: layered on top of the agent's base prompt.
-- A customer-support agent might overlay an "EU GDPR mode" overlay when
-- the conversation jurisdiction is detected as EU.

CREATE TABLE IF NOT EXISTS agent_prompt_overlays (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  overlay_name        TEXT NOT NULL,
  overlay_kind        TEXT NOT NULL,                 -- 'jurisdiction' / 'tone' / 'product' / 'persona' / 'escalation' / 'compliance'
  trigger_condition   JSONB,                         -- when to apply: { jurisdiction: 'EU' } / { keyword: 'gdpr' } / etc.
  prompt_md           TEXT NOT NULL,                 -- the overlay system-prompt content
  priority            INTEGER NOT NULL DEFAULT 0,    -- higher = applied later (overrides earlier)
  is_active           BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_prompt_overlays_agent_idx
  ON agent_prompt_overlays(agent_id, priority) WHERE is_active = TRUE;
