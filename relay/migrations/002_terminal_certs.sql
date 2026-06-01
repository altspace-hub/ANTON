-- 002_terminal_certs.sql — per-business terminal authorization registry.
--
-- Each business is its own CA: the company money wallet signs a cert
-- authorizing a till's per-terminal key (see src/business/services/
-- terminal-cert.ts). Tills (or the owner) publish those certs here so the
-- owner gets a chain-wide "all my tills" dashboard via
-- GET /v1/terminals/:companyAddr.
--
-- Trust model: the relay verifies the cert's Ed25519 signature against its
-- embedded companyPub before storing (so unsigned junk can't be inserted),
-- and groups by the claimed companyAddr. The FETCHING CLIENT re-verifies
-- each cert fully — including that companyAddr DERIVES from companyPub — so
-- a cert published under a victim's address but signed by another key is
-- filtered out client-side. No KYC, no review: a cert is self-authorizing.

CREATE TABLE IF NOT EXISTS terminal_certs (
  company_addr  TEXT        NOT NULL,   -- fc_ address of the company money wallet (the CA)
  terminal_pub  TEXT        NOT NULL,   -- hex Ed25519 pubkey of the authorized till
  company_pub   TEXT        NOT NULL,   -- hex Ed25519 pubkey that signed the cert
  label         TEXT        NOT NULL,   -- human till name
  issued_at     BIGINT      NOT NULL,   -- epoch ms from the cert
  cert_json     JSONB       NOT NULL,   -- the full TerminalCert (client re-verifies this)
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_addr, terminal_pub)
);

CREATE INDEX IF NOT EXISTS terminal_certs_by_company ON terminal_certs (company_addr);
