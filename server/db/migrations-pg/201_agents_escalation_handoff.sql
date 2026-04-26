-- 201_agents_escalation_handoff.sql — escalation queue + human-handoff
-- workflow for the Specialized Agents pillar.
--
-- When an agent hits its escalation policy (out-of-scope query, low
-- confidence, explicit user request for human, etc.), we need a queue
-- the human-on-call sees + a handoff state machine. This migration adds
-- both.

CREATE TABLE IF NOT EXISTS agent_escalations (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  conversation_id     TEXT NOT NULL,
  triggered_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  trigger_kind        TEXT NOT NULL,                 -- 'out_of_scope' / 'low_confidence' / 'user_request' / 'sentiment_negative' / 'connector_failure' / 'policy_required' / 'manual'
  trigger_reason      TEXT,
  context_summary_md  TEXT,                          -- agent-generated summary for the human picker-upper
  proposed_response   TEXT,                          -- what the agent would have said, if anything
  priority            TEXT NOT NULL DEFAULT 'medium', -- 'critical' / 'high' / 'medium' / 'low'
  status              TEXT NOT NULL DEFAULT 'pending', -- 'pending' / 'claimed' / 'in_progress' / 'resolved' / 'reassigned' / 'cancelled'
  claimed_by          TEXT,
  claimed_at          TIMESTAMP,
  resolved_at         TIMESTAMP,
  resolution_md       TEXT,
  reassigned_to       TEXT,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_escalations_pending_idx
  ON agent_escalations(priority, triggered_at) WHERE status IN ('pending', 'claimed');

CREATE INDEX IF NOT EXISTS agent_escalations_agent_idx
  ON agent_escalations(agent_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS agent_escalations_conversation_idx
  ON agent_escalations(conversation_id);

-- Handoff transitions: each transition between human and agent.
CREATE TABLE IF NOT EXISTS agent_handoffs (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL,
  occurred_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  direction           TEXT NOT NULL,                 -- 'agent_to_human' / 'human_to_agent' / 'agent_to_agent'
  from_agent_id       TEXT,
  to_agent_id         TEXT,
  human_id            TEXT,
  reason              TEXT,
  context_passed_md   TEXT,                          -- conversation summary handed over
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_handoffs_conversation_idx
  ON agent_handoffs(conversation_id, occurred_at);
