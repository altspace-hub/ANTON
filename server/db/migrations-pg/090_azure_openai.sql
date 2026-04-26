-- Migration 090: Azure OpenAI Integration
-- Stores Azure OpenAI endpoint configuration and deployment mappings

CREATE TABLE IF NOT EXISTS azure_openai_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  endpoint TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_version TEXT DEFAULT '2024-10-21',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS azure_openai_deployments (
  id TEXT PRIMARY KEY,
  config_id TEXT REFERENCES azure_openai_config(id) ON DELETE CASCADE DEFAULT 'default',
  deployment_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  display_name TEXT,
  is_reasoning_model BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_azure_deployments_config ON azure_openai_deployments(config_id);
CREATE INDEX IF NOT EXISTS idx_azure_deployments_active ON azure_openai_deployments(is_active) WHERE is_active = TRUE;
