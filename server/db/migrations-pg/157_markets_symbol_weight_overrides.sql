-- ── 157_markets_symbol_weight_overrides.sql ─────────────────────────────────
-- Markets effectiveness M1.1 — symbol-grain weight override table.
--
-- Context: M1 (1bbd44f) wires pattern-detector → market_signal_weights, but
-- symbol_failure_cluster patterns don't fit that (signal_type, category)
-- grain — they're about a specific ticker. The M1 fallback applied a mild
-- down-weight to the whole 'equity' category, which is the wrong blast
-- radius: one bad symbol drags every equity prediction down. This
-- migration adds the proper grain so AAPL's failures stay scoped to AAPL.
--
-- Semantics: market_signal_weights gives a per-(signal_type, category) base
-- weight. market_symbol_weight_overrides gives a per-symbol multiplier.
-- Final weight used by the rebalance scorer = base × symbol_override,
-- with 1.0 as the implicit default when no override exists.

CREATE TABLE IF NOT EXISTS market_symbol_weight_overrides (
  symbol                TEXT PRIMARY KEY,
  weight_multiplier     NUMERIC(10, 6) NOT NULL DEFAULT 1.0,
  /* Last pattern_id that adjusted this override — for audit + idempotency. */
  last_pattern_id       TEXT,
  last_applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rationale             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- For the rebalance scorer's bulk lookup across current holdings.
CREATE INDEX IF NOT EXISTS idx_market_symbol_weight_overrides_active
  ON market_symbol_weight_overrides (symbol)
  WHERE weight_multiplier <> 1.0;
