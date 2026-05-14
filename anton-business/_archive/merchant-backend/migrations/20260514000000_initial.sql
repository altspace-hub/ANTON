-- Initial schema for anton-business merchant-backend.
-- See ../README.md and CLAUDE_ANTON_BUSINESS.md for context.

-- ── merchants ──────────────────────────────────────────────────────
-- One row per registered merchant. Created by /merchant/register
-- after KYB approval (off-app).
CREATE TABLE merchants (
    -- 8 chars [A-Z0-9] per ADR-004. Deterministic from orgNr+pubkey.
    id              VARCHAR(8)   PRIMARY KEY,
    wallet_address  TEXT         NOT NULL UNIQUE,
    legal_name      TEXT         NOT NULL,
    org_nr          TEXT         NOT NULL,
    country         VARCHAR(2)   NOT NULL DEFAULT 'SE',
    city            TEXT         NOT NULL,
    street          TEXT         NOT NULL,
    postcode        TEXT         NOT NULL,
    vat_registered  BOOLEAN      NOT NULL,
    approved_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX merchants_org_nr_idx ON merchants(org_nr);

-- ── delegations ────────────────────────────────────────────────────
-- The CURRENT active SignedDelegation per merchant (ADR-005). A new
-- valid delegation supersedes the prior one — we don't keep history
-- here (audit logs do).
CREATE TABLE delegations (
    wallet_address              TEXT            PRIMARY KEY,
    schema_version              VARCHAR(8)      NOT NULL,
    merchant_id                 VARCHAR(8)      NOT NULL,
    safello_receiving_address   TEXT            NOT NULL,
    -- micro-FTC; u128 doesn't fit in BIGINT so we use NUMERIC(39, 0).
    -- 39 digits comfortably exceeds 10^38 = 1e20 trillion FTC.
    max_per_day_micro_ftc       NUMERIC(39, 0)  NOT NULL,
    valid_until                 BIGINT          NOT NULL,
    nonce                       TEXT            NOT NULL,
    signature                   TEXT            NOT NULL,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    FOREIGN KEY (wallet_address) REFERENCES merchants(wallet_address) ON DELETE CASCADE
);

-- ── seen_nonces ────────────────────────────────────────────────────
-- Replay protection per ADR-005. One nonce per merchant per lifetime.
CREATE TABLE seen_nonces (
    wallet_address  TEXT        NOT NULL,
    nonce           TEXT        NOT NULL,
    consumed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (wallet_address, nonce)
);

CREATE INDEX seen_nonces_consumed_idx ON seen_nonces(consumed_at);
