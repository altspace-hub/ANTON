-- Migration 085: Payment fields on contacts for ISO 20022 auto-fill

ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS payment_address TEXT;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS payment_name TEXT;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS payment_country TEXT;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS payment_street TEXT;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS payment_city TEXT;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS payment_postal_code TEXT;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS agent_wallet_address TEXT;
ALTER TABLE community_connections ADD COLUMN IF NOT EXISTS agent_wallet_name TEXT;
