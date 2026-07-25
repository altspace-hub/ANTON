-- 252_agent_public_tool_use.sql
--
-- Gate public queries against agents that hold live connectors.
--
-- WHY. /api/agents/public/query is unauthenticated by design (external ANTON
-- instances ask an agent a question) and gates only on status='active' AND
-- auto_response_enabled. That column is DEFAULT TRUE (migration 111), so every
-- agent an operator creates is publicly reachable the moment it goes active.
--
-- For a purely conversational agent that is a reasonable default. It is not one
-- for an agent with connectors attached: the caller's message steers a model
-- whose free-text output is parsed for tool calls, and those tool calls drive
-- SQL against ANTON's own database and HTTP requests carrying the operator's
-- vault-decrypted credentials. The connector executor now bounds what such a
-- call may do (declared-endpoint matching, SELECT-only with a fail-closed table
-- allowlist, no statement separators), but WHETHER a tool-bearing agent is
-- exposed to anonymous callers at all should be a deliberate decision rather
-- than a default.
--
-- DEFAULT FALSE, so this fails closed: existing connector-bearing agents stop
-- answering public queries until the operator opts in. Agents WITHOUT connectors
-- are unaffected — the route only consults this column when the agent actually
-- has active connectors, so ordinary conversational agents keep working exactly
-- as before and need no migration of their own.

ALTER TABLE agent_profiles
  ADD COLUMN IF NOT EXISTS public_tool_use BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN agent_profiles.public_tool_use IS
  'Allow anonymous /agents/public/query callers to reach this agent when it has active connectors. Default false — tool-capable agents are not publicly queryable unless the operator opts in.';
