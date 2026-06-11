-- Migration 225: bundle_signers — TOFU registry for .anton bundle provenance
-- (CORE_EXPERIENCE_REVIEW 2026-06, Wave 2 item 2.4)
--
-- Trust-on-first-use ledger of Ed25519 public keys seen on signed .anton
-- bundles. The first time a signer pubkey appears in a valid signature the
-- validator records it here; subsequent bundles from the same key surface as
-- "known signer". This is NOT a PKI: a row only means "this instance has seen
-- this key before", nothing more. signer_name is the name claimed at first
-- sight — if a later bundle claims a different name for the same key, the
-- validator warns but never overwrites first_seen_name.

CREATE TABLE IF NOT EXISTS bundle_signers (
  pubkey          TEXT PRIMARY KEY,          -- Ed25519 public key, DER SPKI hex
  signer_name     TEXT,                      -- name claimed at first sight (TOFU-pinned)
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bundles_seen    INTEGER NOT NULL DEFAULT 1
);
