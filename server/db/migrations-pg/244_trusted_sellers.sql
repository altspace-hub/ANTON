-- ═══════════════════════════════════════════════════════════════════
-- 244_trusted_sellers.sql — Trusted Stores P0: pinned, key-anchored sellers.
--
-- A user pins a seller (portal) they already buy from. The pin records the
-- seller's Ed25519 SIGNING key (TOFU anchor) so a later re-resolve can detect a
-- key rotation (a different entity taking the name) as a hard alert — never a
-- silent re-trust. The strongest pin is reached via a MUTUAL handshake: the buyer
-- sends a fresh nonce challenge over the existing portal invoke/inbox loop, the
-- seller SEES it + AGREES + signs it with the portal key, and the buyer verifies
-- the signature against the pinned key live (status='trusted').
--
-- P0 carries NO money, budgets, standing authorisation, or Missions — those are
-- later phases (see docs spec). This table only answers "who is this seller, is
-- this their live key, and do I trust them?".
-- PostgreSQL only.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trusted_sellers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id           TEXT NOT NULL,                 -- req.user.id ('solo' in solo mode)
  portal_address          TEXT NOT NULL,                 -- name.namespace.portal (the open link)
  display_title           TEXT,                          -- snapshot of descriptor.portal.displayTitle at pin
  contact_hash            TEXT,                          -- ANTON-XXXX from the descriptor
  signing_pubkey_hex      TEXT NOT NULL,                 -- THE PIN (88-char hex SPKI DER)
  signing_key_fingerprint TEXT NOT NULL,                 -- sha256(pubkey) — fast compare on re-resolve
  name_skeleton           TEXT NOT NULL,                 -- computeSkeleton(address) — look-alike index
  status                  TEXT NOT NULL DEFAULT 'pinned'
                            CHECK (status IN ('pending','pinned','trusted','key_changed','revoked')),
  verification_method     TEXT,                          -- 'mutual-handshake' | 'descriptor-tofu' | NULL
  descriptor_sig_verified BOOLEAN NOT NULL DEFAULT FALSE,-- did the cached descriptor signature verify?
  last_handshake_nonce    TEXT,                          -- last issued nonce (anti-replay bookkeeping)
  verified_at             TIMESTAMPTZ,                   -- set when the handshake passes
  last_checked_at         TIMESTAMPTZ,                   -- set on each re-resolve key check
  key_changed_at          TIMESTAMPTZ,                   -- set when a re-resolve detects a different key
  previous_pubkey_hex     TEXT,                          -- prior key on rotation (audit)
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, portal_address)
);

CREATE INDEX IF NOT EXISTS idx_trusted_sellers_owner
  ON trusted_sellers (owner_user_id) WHERE status <> 'revoked';
CREATE INDEX IF NOT EXISTS idx_trusted_sellers_skeleton
  ON trusted_sellers (owner_user_id, name_skeleton);
