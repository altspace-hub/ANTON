-- 288 — OpenAI-compatible endpoint controls and the spend ledger (2026-09-25).
--
-- A compat:<slug>:<model> endpoint (OpenRouter, Together, vLLM, …) could only
-- carry a base URL, a key and headers. On a public showcase paid for by one
-- OpenRouter key that is not enough:
--
--   extra_body         merged into every request body — OpenRouter `provider`
--                      routing (EU zero-retention providers only), `plugins`, …
--   allowed_models     when non-empty, ONLY these bare model ids may run on the
--                      endpoint, for everyone, on every path. Empty = any model
--                      (the behaviour before this migration). The health check
--                      never writes it.
--   max_output_tokens  ceiling for max_tokens on this endpoint.
--   model_meta         per bare model id, what the endpoint's GET /models said
--                      (context length, output ceiling, input modalities,
--                      reasoning support, supported parameters). Written by the
--                      health check; read to decide reasoning effort and images.
--   input_/output_price_per_million
--                      USD prices an admin can set when the endpoint does not
--                      report a cost itself (OpenRouter does, in usage.cost).
--
-- llm_spend_ledger holds one row per priced model call — a compat response that
-- reported a cost, or an endpoint with prices — so an instance-wide and a
-- per-user daily USD cap can see compat spend (LLM_DAILY_SPEND_CAP_USD,
-- LLM_USER_DAILY_SPEND_CAP_USD). user_id is NULL for background work with no
-- request behind it. No foreign key to users: the ledger is a spend record and
-- must not lose rows when an account is removed.
ALTER TABLE custom_model_endpoints ADD COLUMN IF NOT EXISTS extra_body JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE custom_model_endpoints ADD COLUMN IF NOT EXISTS allowed_models JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE custom_model_endpoints ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER;
ALTER TABLE custom_model_endpoints ADD COLUMN IF NOT EXISTS model_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE custom_model_endpoints ADD COLUMN IF NOT EXISTS input_price_per_million DOUBLE PRECISION;
ALTER TABLE custom_model_endpoints ADD COLUMN IF NOT EXISTS output_price_per_million DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS llm_spend_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  model TEXT NOT NULL,
  cost_usd DOUBLE PRECISION NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  -- 'reported' (the endpoint's usage.cost) or 'endpoint_price' (admin prices)
  cost_source TEXT NOT NULL,
  purpose TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The caps sum today's rows, instance-wide and per user.
CREATE INDEX IF NOT EXISTS idx_llm_spend_ledger_created ON llm_spend_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_spend_ledger_user_created ON llm_spend_ledger(user_id, created_at);
