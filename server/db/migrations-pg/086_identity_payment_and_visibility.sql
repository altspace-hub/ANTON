-- Migration 086: Identity payment fields, auto-connect, profile visibility

-- Payment info on identity (for QR sharing)
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS payment_address TEXT;
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS payment_name TEXT;
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS payment_country TEXT;
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS agent_wallet_address TEXT;
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS agent_wallet_name TEXT;

-- Auto-connect and visibility
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS auto_accept_connections INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_identity ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'private';
