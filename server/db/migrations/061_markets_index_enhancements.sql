-- Migration 061: Markets Pillar — Add budget and currency columns to market_indexes
-- Supports ANTON 100 indexes with fictional 100M budgets per region.

-- Add budget column (default 100M)
ALTER TABLE market_indexes ADD COLUMN budget REAL DEFAULT 100000000;

-- Add currency column (default USD)
ALTER TABLE market_indexes ADD COLUMN currency TEXT DEFAULT 'USD';
