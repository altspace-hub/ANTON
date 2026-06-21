-- ═══════════════════════════════════════════════════════════════════
-- 243_portal_auto_quote_config.sql — Seller AUTO-QUOTE config (commerce-loop P3).
--
-- When a buyer agent invokes an auto-quote-enabled capability, the seller's
-- ANTON answers a price + availability SYNCHRONOUSLY via an LLM (server/services/
-- portals/seller-quoter.ts), instead of queuing to the human inbox. This is the
-- seller-side mirror of the buyer's autonomous negotiation loop.
--
-- This config is SELLER-PRIVATE and MUST NEVER appear in the signed/served
-- capability descriptor (portal_descriptor_cache.descriptor is SHA-256 hashed,
-- Ed25519-signed, and served verbatim to any visitor — a floor price there is an
-- instant leak). It lives only here, read only by the hosting instance.
--
-- All economic numbers are integer micro-FTC (µFTC) base-10 (BigInt-safe),
-- matching the buyer side (MICRO_RE=/^\d{1,30}$/) and the NUMERIC(40,0) precedent.
-- The per-SKU floor/stock catalog reuses the EXISTING portal_structured_data
-- (kind='product') — no new catalog table.
-- PostgreSQL only.
-- ═══════════════════════════════════════════════════════════════════

-- One row per (portal, capability). Absent / enabled=false => today's
-- human-inbox behavior is unchanged (opt-in, zero risk to existing portals).
CREATE TABLE IF NOT EXISTS portal_capability_auto_quote (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id       UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  capability_id   TEXT NOT NULL,                          -- matches descriptor.capabilities[].id
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,         -- master opt-in
  -- Hard floor (cost + min margin). The deterministic clamp target; the LLM can
  -- NEVER quote below it. NOT NULL by design — a NULL/0 floor is a give-away.
  floor_micro_ftc          NUMERIC(40,0) NOT NULL,
  auto_quote_max_micro_ftc NUMERIC(40,0),                 -- quote above this => mandatory human
  max_qty_per_order        INTEGER,                       -- hard quantity cap
  currency        TEXT NOT NULL DEFAULT 'FTC',            -- binding rail unit (v1 fixed)
  catalog_text    TEXT,                                   -- LLM-visible policy/catalog context (NEVER the floor)
  autonomy        JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { requireVisitorIdentity?: boolean }
  daily_llm_call_cap       INTEGER NOT NULL DEFAULT 200,  -- per-portal spend kill-switch
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portal_id, capability_id)
);

CREATE INDEX IF NOT EXISTS ix_portal_capability_auto_quote_portal
  ON portal_capability_auto_quote(portal_id);

-- Per-portal daily LLM-call counter (spend budget). Reset implicitly by date.
-- Incremented via a single atomic UPSERT before each LLM call.
CREATE TABLE IF NOT EXISTS portal_auto_quote_usage (
  portal_id  UUID NOT NULL REFERENCES portals(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  llm_calls  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (portal_id, usage_date)
);
