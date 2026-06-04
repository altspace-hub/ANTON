-- 003_comm_push_tokens.sql — FCM/push token registry for Comm offline delivery.
--
-- Push-notifications plan, Phase 3. When a SEND_COMM arrives for an OFFLINE
-- recipient the relay mailboxes the ciphertext (comm-registry.routeSend) and
-- fires a CONTENT-FREE wake push to every token registered for that recipient's
-- routing_id, so a backgrounded/killed Comm app reconnects and decrypts locally.
--
-- Trust model (mirrors 002_terminal_certs): registration is SIGNED. The client
-- sends its Ed25519 pubkey + the token + a signature over a canonical message;
-- the relay verifies the sig against the pubkey and derives
-- routing_id = sha256(pubkey)[0..16], so a caller can only register tokens for a
-- routing_id whose private key they hold (no token-hijacking). The relay never
-- sees plaintext addresses or message content — only the opaque routing_id.

CREATE TABLE IF NOT EXISTS comm_push_tokens (
    id              BIGSERIAL PRIMARY KEY,
    -- 16-byte routing id (sha256(ed25519_pubkey)[0..16]) as 32 hex chars.
    routing_id_hex  TEXT        NOT NULL,
    -- 'fcm' (Android), 'apns' (iOS, future), 'web' (PWA, future).
    platform        TEXT        NOT NULL,
    -- The opaque device token issued by FCM/APNs.
    token           TEXT        NOT NULL,
    enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ,
    -- A device token is unique to a device+app install; re-registering it for a
    -- new routing_id (e.g. a fresh identity on the same phone) UPSERTs the row.
    UNIQUE (platform, token)
);

-- Dispatch reads by routing_id; only enabled rows matter.
CREATE INDEX IF NOT EXISTS idx_comm_push_routing
    ON comm_push_tokens (routing_id_hex)
    WHERE enabled;
