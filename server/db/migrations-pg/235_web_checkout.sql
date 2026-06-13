-- Migration 235: Web e-commerce checkout — "Pay with FutureChain"
--
-- Plan item #11 (docs/INVESTIGATION_AND_PLAN_2026-06-13.md Area 7), MVP =
-- Phase 0 + 1 + 2. A thin merchant gateway over the SHIPPED FutureChain
-- payment rails (qr.ts / ADR-004 ref / AntonRemittance / active-poll matcher).
--
-- Design principle: the customer's Pay app is the ONLY key-holder. The
-- merchant site + this gateway NEVER sign and NEVER custody. The amount is
-- SEALED server-side at request creation; the public widget polls by id and
-- never sees the amount or any key.
--
-- "Instant" = honest lifecycle: pending → seen (mempool) → confirmed (mined).
-- Never "Paid - final" on `seen` alone.

-- ── One payment request per checkout ────────────────────────────────────────
-- Mirrors the Business `Receipt` shape where sensible (amountMicroFtc, ref,
-- receivingAddress, ftcPerSek, status lifecycle, tx_id, order envelope).
CREATE TABLE IF NOT EXISTS web_payment_requests (
  id                TEXT PRIMARY KEY,
  -- Which gateway API key minted this request (the existing fc_gateway_config
  -- single-tenant key today; a real merchant_id column when Phase 3 lands).
  merchant_ref      TEXT NOT NULL DEFAULT 'default',
  -- Amount is SEALED here at creation — the widget never receives it.
  amount_micro_ftc  NUMERIC(40,0) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'FTC',
  -- Fiat side captured at creation (Wave-A manual-rate concept). Both nullable
  -- so an FTC-native merchant can omit fiat entirely.
  fiat_amount       DOUBLE PRECISION,
  fiat_currency     TEXT,
  fiat_rate         DOUBLE PRECISION,        -- units of `currency` per 1 fiat unit (ftcPerFiat)
  receiving_address TEXT NOT NULL,            -- watch-only merchant address (no key)
  order_envelope    JSONB,                    -- AntonRemittance — the kvitto the customer sees BEFORE paying
  ref               TEXT NOT NULL,            -- ADR-004 v1 reference string (amount-exact + ref match keystone)
  merchant_id       TEXT,                     -- 8-char ADR-004 merchant id
  order_id          TEXT NOT NULL,            -- 12-char ADR-004 order id (single-use replay guard)
  purpose           TEXT NOT NULL DEFAULT 'RETAIL',
  qr_uri            TEXT NOT NULL,            -- the futurechain:pay?... URI the widget renders
  needs_animated    BOOLEAN NOT NULL DEFAULT FALSE,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','seen','confirmed','expired','failed')),
  seen_at           TIMESTAMPTZ,
  confirmed_at      TIMESTAMPTZ,
  tx_id             TEXT,
  -- Per-request webhook delivery (BTCPay-style). Secret is the HMAC key.
  webhook_url       TEXT,
  webhook_secret    TEXT,
  webhook_seen_sent BOOLEAN NOT NULL DEFAULT FALSE,
  webhook_confirmed_sent BOOLEAN NOT NULL DEFAULT FALSE,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL
);

-- Single-use orderId per merchant — the replay guard. A second create with the
-- same (merchant_ref, order_id) is refused at the service layer; this index
-- makes the lookup cheap and pins the invariant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_web_payment_requests_order
  ON web_payment_requests (merchant_ref, order_id);

-- The poller sweeps live requests (pending/seen) that haven't expired.
CREATE INDEX IF NOT EXISTS idx_web_payment_requests_live
  ON web_payment_requests (status, expires_at)
  WHERE status IN ('pending','seen');

CREATE INDEX IF NOT EXISTS idx_web_payment_requests_addr
  ON web_payment_requests (receiving_address);

CREATE INDEX IF NOT EXISTS idx_web_payment_requests_created
  ON web_payment_requests (created_at DESC);

-- ── Webhook delivery audit (BTCPay-style, ANTON-SIG) ────────────────────────
-- Every dispatch attempt, success or failure, with the HMAC-signed body hash
-- so a delivery dispute is self-diagnosing. No payload secrets stored.
CREATE TABLE IF NOT EXISTS web_checkout_webhook_deliveries (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL REFERENCES web_payment_requests(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,                 -- payment.seen | payment.confirmed
  target_url    TEXT NOT NULL,
  signature     TEXT,                          -- the ANTON-SIG value we sent (sha256=...)
  http_status   INTEGER,
  ok            BOOLEAN NOT NULL DEFAULT FALSE,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_web_checkout_webhook_request
  ON web_checkout_webhook_deliveries (request_id, created_at DESC);
