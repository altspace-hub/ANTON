-- Migration 095: Add Bing Search API key to Azure OpenAI config
-- Enables web search grounding for Azure OpenAI models via Bing Web Search API v7

ALTER TABLE azure_openai_config
  ADD COLUMN IF NOT EXISTS bing_search_api_key_encrypted TEXT;
