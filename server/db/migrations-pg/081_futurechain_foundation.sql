-- Migration 081: FutureChain Foundation — config, KYC, wallets, transactions

-- ═══ E1: Connection Config ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fc_connection_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  node_url TEXT NOT NULL DEFAULT 'http://localhost:8545',
  cli_binary_path TEXT NOT NULL DEFAULT 'futurechain',
  wallet_dir TEXT NOT NULL DEFAULT '~/.futurechain/wallets',
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_health_check TIMESTAMPTZ,
  chain_height BIGINT,
  node_version TEXT,
  pacs008_support BOOLEAN DEFAULT FALSE,
  two_tier_storage BOOLEAN DEFAULT FALSE,
  stub_mode BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO fc_connection_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ═══ E2: KYC Profile ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fc_kyc_profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  full_legal_name_enc TEXT,
  country TEXT,
  street_address_enc TEXT,
  city_enc TEXT,
  postal_code_enc TEXT,
  address_country TEXT,
  id_document_number_enc TEXT,
  id_document_type TEXT,
  id_issuing_country TEXT,
  date_of_birth_enc TEXT,
  nationality TEXT,
  tax_id_number_enc TEXT,
  bic_or_lei_enc TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══ E3: Wallet Registry ════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fc_wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  wallet_file_name TEXT NOT NULL,
  address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK(wallet_type IN ('human', 'agent')),
  owner_wallet_address TEXT,
  agent_id TEXT,
  balance_raw BIGINT DEFAULT 0,
  balance_ftc DOUBLE PRECISION DEFAULT 0.0,
  utxo_count INTEGER DEFAULT 0,
  balance_updated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_wallets_address ON fc_wallets(address);
CREATE INDEX IF NOT EXISTS idx_fc_wallets_type ON fc_wallets(wallet_type);

-- ═══ E4: Transaction History ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS fc_transactions (
  id TEXT PRIMARY KEY,
  tx_id TEXT,
  uetr TEXT,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount_ftc DOUBLE PRECISION NOT NULL,
  amount_raw BIGINT NOT NULL,
  wallet_type TEXT NOT NULL CHECK(wallet_type IN ('human', 'agent')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN (
    'draft', 'pending_approval', 'approved', 'submitted', 'confirmed', 'failed', 'rejected'
  )),
  pacs008_fields JSONB NOT NULL DEFAULT '{}',
  remittance_raw TEXT,
  remittance_parsed JSONB,
  task_ref TEXT,
  submission_method TEXT CHECK(submission_method IN ('cli', 'rpc', 'stub')),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  block_height BIGINT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fc_tx_status ON fc_transactions(status);
CREATE INDEX IF NOT EXISTS idx_fc_tx_task ON fc_transactions(task_ref);
