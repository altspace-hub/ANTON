-- Migration 089: P2P message transport — add endpoint addressing to connections
-- Enables ANTON-to-ANTON message delivery over HTTP

-- Add endpoint URL for P2P delivery (e.g., "http://192.168.1.100:3001" or "https://my-anton.example.com")
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS endpoint TEXT;

-- Track delivery method used for each queued message
ALTER TABLE community_message_queue ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'local'
  CHECK (delivery_method IN ('local', 'http', 'relay'));

-- Track the HTTP response code on delivery attempt
ALTER TABLE community_message_queue ADD COLUMN IF NOT EXISTS last_http_status INTEGER;
