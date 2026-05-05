# ANTON Mesh — Reference Relay

The reference implementation of an ANTON Mesh relay. A small Node.js process that brokers end-to-end encrypted connections between paired ANTON Companion Apps and their paired ANTON instances. The relay never decrypts traffic — it only matches connections by `instance_id` and forwards opaque ENVELOPE bytes between matched legs.

**License:** Apache 2.0. Self-hosting is a first-class deployment path.

**Spec:** `../docs/ANTON_MESH_SPEC.md` (v0.1).

## Run a relay

Three deployment paths, listed in order of operational simplicity:

### 1. Docker (recommended for self-hosters)

```bash
# Build the image once (multi-stage Alpine, ~120 MiB).
docker build -t anton-mesh-relay:0.1.0 .

# Behind a reverse proxy (Caddy / nginx / Cloudflare) handling TLS:
docker run -d --name anton-mesh-relay \
  -e RELAY_URL=wss://r1.example.org \
  -e RELAY_INSECURE=1 \
  -p 8443:8443 \
  --restart=unless-stopped \
  anton-mesh-relay:0.1.0

# Direct TLS termination at the relay (LE certs mounted read-only):
docker run -d --name anton-mesh-relay \
  -e RELAY_URL=wss://r1.example.org \
  -e RELAY_TLS_CERT=/certs/fullchain.pem \
  -e RELAY_TLS_KEY=/certs/privkey.pem \
  -v /etc/letsencrypt/live/r1.example.org:/certs:ro \
  -p 8443:8443 \
  --restart=unless-stopped \
  anton-mesh-relay:0.1.0
```

Or use the included `docker-compose.yml`:

```bash
# Edit .env first (RELAY_URL, optional cert paths)
docker compose up -d
docker compose logs -f       # tail audit log
```

The compose file enables `read_only: true` rootfs, drops all capabilities,
sets memory + CPU limits, and disables privilege escalation. Defense in
depth — the relay has no reason to do anything but accept WS connections.

### 2. systemd (bare-metal, single-relay deployment)

```bash
# 1. Create the relay user (no shell, no home).
sudo useradd --system --no-create-home --shell /usr/sbin/nologin anton-relay

# 2. Build + install the relay.
pnpm install --ignore-workspace
pnpm build
sudo mkdir -p /opt/anton-mesh-relay
sudo cp -r dist node_modules package.json /opt/anton-mesh-relay/
sudo chown -R anton-relay:anton-relay /opt/anton-mesh-relay

# 3. Configure environment + install the unit.
sudo mkdir -p /etc/anton-mesh-relay
sudo cp systemd/env.example /etc/anton-mesh-relay/env
sudo chown root:anton-relay /etc/anton-mesh-relay/env
sudo chmod 0640 /etc/anton-mesh-relay/env
sudo $EDITOR /etc/anton-mesh-relay/env       # set RELAY_URL etc.

sudo cp systemd/anton-mesh-relay.service /etc/systemd/system/
sudo mkdir -p /var/log/anton-mesh-relay
sudo chown anton-relay:anton-relay /var/log/anton-mesh-relay

sudo systemctl daemon-reload
sudo systemctl enable --now anton-mesh-relay
sudo systemctl status anton-mesh-relay
```

The unit applies systemd's full hardening surface: `NoNewPrivileges`,
`ProtectSystem=strict`, `MemoryDenyWriteExecute`, restricted syscalls,
no kernel module access, etc. See `systemd/anton-mesh-relay.service`.

### 3. Direct (development / quick smoke-test)

```bash
pnpm install --ignore-workspace
pnpm dev                                             # plain WS on :8443

# Or production build, plain WS:
pnpm build
RELAY_URL=wss://r1.example.org RELAY_INSECURE=1 pnpm start
```

## Configuration

| Env var | Required | Default | Meaning |
|---|---|---|---|
| `RELAY_URL` | Yes | — | Canonical URL phones use to dial this relay. MUST match `wss://` (or `ws://` with `RELAY_INSECURE=1` for dev). Used to verify HELLO_INSTANCE per spec §3.2 step 3. |
| `RELAY_PORT` | No | `8443` | Port to listen on. |
| `RELAY_HOST` | No | `0.0.0.0` | Bind address. |
| `RELAY_TLS_CERT` | Either both or neither | — | Path to PEM cert for TLS termination at the relay. |
| `RELAY_TLS_KEY` | Either both or neither | — | Path to PEM private key. |
| `RELAY_INSECURE` | No | unset | When set, accept plain `ws://` connections. Use behind a reverse proxy. |
| `RELAY_MAX_INSTANCES` | No | `10000` | Hard ceiling on concurrent registered instances. |
| `RELAY_AUDIT_LOG_PATH` | No | stdout | Where to write the audit log (one JSONL line per event, never includes payload bytes). |

## Threat model

See `../docs/ANTON_MESH_THREAT_MODEL.md`. The relay's security guarantees rest on:

- It cannot decrypt traffic (Noise IK between phone and instance, relay sees only ciphertext).
- It cannot impersonate (HELLO_INSTANCE proof_sig + binding_sig per spec §3.2; replay cache).
- It cannot misroute (ENVELOPE direction-tag check; instance_id must match `sha256(static_pk)[0..16)`).

The relay can:
- Observe connection metadata (which instance_id is connecting from where, when).
- Cause denial of service for instances dialed at it (operators concerned about this self-host).
- Drop a session under memory pressure (graceful, both sides reconnect).

If the operator can't tolerate the metadata exposure or DoS surface, they should self-host this relay process on their own infrastructure — that's why the spec is open and the code is Apache-2.0.

## Tests

```bash
pnpm test            # run all tests once
pnpm test:watch      # vitest watch mode
pnpm typecheck       # tsc --noEmit
```

Tests are split into:

- `tests/*.test.ts` — unit tests per module (frame, canonical-url, primitives, hello, match, limits, ...)
- `tests/integration/*.test.ts` — full WS-server smoke tests with a phone+instance pair
- `tests/threats/*.test.ts` — explicit attacker-mocked tests for each threat the spec claims to close (T2 byte-flip, T6 cross-tenant, T14 squatting, T16 misrouting, T17 rotation replay, T18 IPv6 bypass)

The `tests/threats/*` files are the litmus paper for whether the relay actually delivers what the threat model says it does. They run in CI on every change.
