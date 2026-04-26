-- 200_agents_conversation_telemetry.sql — per-conversation telemetry +
-- per-message latency tracking for the Specialized Agents pillar.
--
-- The base agents schema (mig 111) covers profiles + conversations +
-- messages + connectors + audit log. This migration adds the operational
-- telemetry layer: conversation outcomes, per-message latency stats,
-- token-cost rollups so operators can manage agent fleet performance.

CREATE TABLE IF NOT EXISTS agent_conversation_telemetry (
  conversation_id     TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  started_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at            TIMESTAMP,
  message_count       INTEGER DEFAULT 0,
  user_message_count  INTEGER DEFAULT 0,
  agent_message_count INTEGER DEFAULT 0,
  tool_call_count     INTEGER DEFAULT 0,
  total_input_tokens  INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_usd      NUMERIC DEFAULT 0,
  avg_latency_ms      INTEGER,
  p95_latency_ms      INTEGER,
  outcome             TEXT,                          -- 'resolved' / 'escalated' / 'abandoned' / 'timeout' / 'error'
  user_satisfaction   TEXT,                          -- 'positive' / 'neutral' / 'negative' / null
  escalation_reason   TEXT,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_conversation_telemetry_agent_idx
  ON agent_conversation_telemetry(agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS agent_conversation_telemetry_outcome_idx
  ON agent_conversation_telemetry(outcome) WHERE outcome IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_conversation_telemetry_unresolved_idx
  ON agent_conversation_telemetry(started_at DESC) WHERE ended_at IS NULL;

-- Per-message timing detail. Aggregated nightly into
-- agent_conversation_telemetry but kept raw for slow-message debugging.

CREATE TABLE IF NOT EXISTS agent_message_timings (
  id                  TEXT PRIMARY KEY,
  message_id          TEXT NOT NULL,
  conversation_id     TEXT NOT NULL,
  agent_id            TEXT NOT NULL,
  recorded_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  llm_latency_ms      INTEGER,
  tool_latency_ms     INTEGER,
  total_latency_ms    INTEGER NOT NULL,
  ttfb_ms             INTEGER,                       -- time to first byte (streaming)
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  cost_usd            NUMERIC,
  llm_provider        TEXT,
  llm_model           TEXT,
  payload             JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS agent_message_timings_conversation_idx
  ON agent_message_timings(conversation_id, recorded_at);

CREATE INDEX IF NOT EXISTS agent_message_timings_slow_idx
  ON agent_message_timings(total_latency_ms DESC, recorded_at DESC);
