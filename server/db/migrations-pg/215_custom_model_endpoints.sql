-- ═══════════════════════════════════════════════════════════
-- 215_custom_model_endpoints
--
-- Generic registry for OpenAI-compatible model endpoints — lets users plug in
-- cost-effective providers (DeepSeek, OpenRouter, Together.ai, Groq,
-- Fireworks, DeepInfra) and self-hosted servers (vLLM, LM Studio,
-- llama.cpp) through one consistent surface.
--
-- Models are referenced as `compat:<slug>:<model>` (e.g.
-- `compat:deepseek:deepseek-chat`). The provider router resolves the slug
-- to a row here, decrypts the API key, and dispatches via the
-- openaiCompatibleAdapter.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS custom_model_endpoints (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
    -- short stable identifier used in model IDs, e.g. 'deepseek', 'openrouter'
  display_name TEXT NOT NULL,
    -- human-readable name shown in Settings, e.g. 'DeepSeek', 'OpenRouter'
  base_url TEXT NOT NULL,
    -- OpenAI-compatible base, e.g. 'https://api.deepseek.com/v1'
  api_key_encrypted TEXT,
    -- bearer token, AES-256-GCM via credential-vault; NULL for keyless endpoints
  default_model TEXT,
    -- recommended model id for this endpoint, e.g. 'deepseek-chat'
  available_models JSONB DEFAULT '[]'::jsonb,
    -- cached model list, refreshed via GET /models when the endpoint is healthchecked
  context_window INTEGER,
    -- approximate context window for the default model (informational)
  extra_headers JSONB DEFAULT '{}'::jsonb,
    -- optional headers some providers require (OpenRouter wants HTTP-Referer + X-Title)
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_model_endpoints_slug ON custom_model_endpoints(slug);
CREATE INDEX IF NOT EXISTS idx_custom_model_endpoints_enabled ON custom_model_endpoints(enabled);

COMMENT ON TABLE custom_model_endpoints IS
  'Registry for OpenAI-compatible model endpoints (DeepSeek, OpenRouter, Together, Groq, vLLM, etc.). Resolved by the openai_compatible provider via the compat:<slug>:<model> model-id prefix.';
