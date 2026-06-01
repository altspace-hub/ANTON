# ANTON Mesh Relay — Operational Runbook

Procedures for operators of an ANTON Mesh relay. Each procedure assumes:

- **Docker deployment** with `docker-compose.yml` from this directory, OR
- **Bare-metal systemd** with the unit at `systemd/anton-mesh-relay.service`

Most procedures work the same either way.

---

## 0 · Quick reference

| Endpoint | Purpose |
|---|---|
| `https://r1.example.org/healthz` | Liveness probe — JSON with version + active counts |
| `https://r1.example.org/metrics` | Prometheus text-exposition format |
| `wss://r1.example.org/` | Mesh protocol (HELLO_INSTANCE / HELLO_PHONE / ENVELOPE) |

| Audit log | Default | What's in it |
|---|---|---|
| Path | `/var/log/anton-mesh-relay/audit.jsonl` (or stdout via `RELAY_AUDIT_LOG_PATH`) | One JSON event per line. NEVER includes payload bytes (spec §1.4). |
| Includes | `type`, `conn_id`, `source` (IP bucket), `instance_id_prefix` (8 hex), `error_code`, `reason` | Enough to debug + monitor abuse |
| Excludes | Payload bytes, full instance_ids, session_ids, key material | If anything resembling these appears in the log, it's a bug — file an issue. |

---

## 1 · Deploy a new relay version

**Goal:** swap to a newer relay binary without dropping all phones simultaneously.

The relay's graceful drain (`drainIntervalMs`, default 5s) emits `RELAY_DRAINING` to every live connection before closing. Phones treat this as "try the next relay now" and pre-migrate.

### Docker

```bash
# 1. Pull the new image.
docker compose pull

# 2. Stop + replace. SIGTERM triggers the drain, the docker-compose
#    `stop_grace_period` should be ≥ drainIntervalMs + a few seconds.
docker compose up -d

# 3. Verify the new version is live.
curl -s https://r1.example.org/healthz | jq .version
```

### systemd

```bash
# 1. Pull the new build artifact (e.g. tarball or git pull + pnpm build).
# 2. Drop in the new files, then graceful restart.
sudo systemctl reload-or-restart anton-mesh-relay

# 3. Verify.
curl -s https://r1.example.org/healthz | jq .version
journalctl -u anton-mesh-relay --since '1 minute ago' | tail -20
```

### Multi-region rolling deploy

If you operate `r1` + `r2`, **deploy them sequentially**, not in parallel — that way phones always have at least one warm relay to fail over to. Cycle: r1 down → r1 up → smoke test → r2 down → r2 up → smoke test.

---

## 2 · Investigate an `INVALID_PROOF` spike

**Symptom:** Prometheus shows `anton_relay_hello_rejected_total{code="0x0003"}` climbing fast.

`INVALID_PROOF` (code 0x0003) means a HELLO_INSTANCE failed step 4 (timestamp out of window) or step 5 (proof_sig didn't verify) or step 6 (proof replay) — see spec §3.2.

### Triage

```bash
# Pull the last 1000 hello_instance_rejected events, group by source bucket.
sudo grep '"hello_instance_rejected"' /var/log/anton-mesh-relay/audit.jsonl | tail -1000 \
  | jq -r '.source' | sort | uniq -c | sort -rn | head -10
```

### Decisions

| Pattern | Likely cause | Action |
|---|---|---|
| One source bucket dominates | Dead instance retrying with stale clock OR a single attacker | Rate-limit kicks in automatically. Verify `anton_relay_rate_limited_total` counter is also climbing. If a legitimate operator: contact them, ask them to NTP-sync. |
| Distributed across many sources | Crawler / scanner hitting the WSS port | Normal — the relay rejects them at HELLO. No action unless rates are pathological. |
| Bursts after a relay restart | Replay of in-flight HELLO_INSTANCEs the previous boot already accepted | Self-healing — replay window is 60s; new boots clear the cache. Confirm normalcy after a few minutes. |

### Block a specific source

If `source` clearly matches a hostile bucket (e.g. one /64 generating thousands of HELLOs/s):

```bash
# Block at the firewall — ufw / iptables / cloudflare. Example for ufw + IPv4:
sudo ufw deny from 203.0.113.0/24

# For an IPv6 /64 (the bucket the rate-limiter uses):
sudo ufw deny from 2001:db8::/64
```

The relay's per-bucket rate limit handles most cases; firewall-level blocks are for sustained / pathological abuse.

---

## 3 · Investigate "my phone can't connect"

A user reports that their Companion App can't reach their paired ANTON instance.

### 30-second triage

```bash
# 1. Is the relay alive?
curl -s https://r1.example.org/healthz
# expected: {"ok":true, "version":"...", ...}

# 2. Is the instance dialed in?
curl -s https://r1.example.org/healthz | jq '.active_instances'
# > 0 means at least one instance leg is registered. Compare to expected count.

# 3. Did the user's phone reach us recently?
# The phone's source IP is its mobile/wifi public IP. Search recent audit
# events for that source bucket (user can find it at https://api.ipify.org
# from the phone).
sudo grep '"source":"<user-ip-bucket>"' /var/log/anton-mesh-relay/audit.jsonl | tail -20
```

### Common patterns

| Audit log shows | Diagnosis | Fix |
|---|---|---|
| Nothing at all from the user's bucket | Phone never reached the relay | Check user's network (corporate firewall, captive portal, VPN). |
| `"hello_phone"` but no `"match"` | Their instance isn't online | Tell user to check the desktop ANTON is running + reachable to the dialer. |
| `"hello_phone_rejected"` repeatedly | Malformed HELLO — APK out of date OR relay version mismatch | Compare APK version vs relay version; both should be on v0.1.x. |
| `"rate_limited"` from their bucket | Rate-limit fired (often shared NAT) | Wait 60s for the cooldown. If chronic, raise `helloRateLimit.capacity` for that relay. |
| `"hello_instance_rejected"` for their instance | Their instance's clock is skewed > 30s | NTP-sync the desktop running their ANTON. |
| Match happened, then `"session_end"` quickly | Noise handshake failed → likely pubkey mismatch | Their pairing record is stale. Re-pair. |

---

## 4 · Rotate the relay's TLS certificate

### Caddy (recommended)

Caddy auto-renews Let's Encrypt certs. No manual action needed unless renewal is failing — check Caddy's logs:

```bash
sudo journalctl -u caddy -e --no-pager | tail -50
```

If renewal is broken (DNS not resolving, port 80 blocked, ACME rate limit), fix the underlying issue and `sudo systemctl reload caddy`.

### Direct TLS at the relay

If you mounted a cert into `RELAY_TLS_CERT` / `RELAY_TLS_KEY`:

```bash
# 1. Drop in the new cert + key.
sudo cp new-fullchain.pem /etc/anton-mesh-relay/tls/fullchain.pem
sudo cp new-privkey.pem /etc/anton-mesh-relay/tls/privkey.pem

# 2. Restart the relay (graceful drain handled automatically).
sudo systemctl restart anton-mesh-relay
# OR for docker:
docker compose restart relay
```

The phone's mesh transport pins the **operator's Ed25519 + X25519 pubkey** at pairing, NOT the relay's TLS cert. So a TLS cert rotation is invisible to phones — they don't notice.

---

## 5 · Add a new region

To bring `r3.example.org` (e.g. APAC) online:

```bash
# 1. Provision the box (Hetzner Singapore, Fly.io syd, etc.).
# 2. Set up Caddy + docker-compose with RELAY_URL=wss://r3.example.org.
# 3. DNS A/AAAA → new box IP.
# 4. Verify /healthz.
# 5. Update the operator-side env:
#    ANTON_MESH_RELAYS=wss://r1.example.org,wss://r2.example.org,wss://r3.example.org
#    Then restart the ANTON instances that emit pairings.
```

**Existing pairings** (phones already paired before r3 existed) will NOT use r3 — their `relay_endpoints` was baked at pair time. They keep using r1+r2 until they re-pair. New pairings get all three.

---

## 6 · Drop a region

Reverse of §5:

```bash
# 1. Remove from ANTON_MESH_RELAYS in operator env.
# 2. New pairings will not include the dropped relay.
# 3. Existing phones still try the dropped relay; their `relay_endpoints`
#    array still contains it. Each failed attempt falls over to the next.
# 4. Wait at least 30 days before tearing down the box, so phones that
#    rarely open get a chance to re-pair on their own.
```

If you must shut down faster, push a forced re-pair flow (out of scope of this runbook).

---

## 7 · Handle a memory / CPU pressure event

The relay's docker-compose sets `mem_limit: 512m` + `cpus: 1.0`. If you see OOM kills or sustained CPU at 100%:

### Diagnose

```bash
docker stats anton-mesh-relay --no-stream

# Audit log: how many connections are live?
curl -s https://r1.example.org/healthz | jq '.ws_connections, .active_sessions'

# Prometheus: total counter rates.
curl -s https://r1.example.org/metrics | grep '_total '
```

### Tune

| Symptom | Tune |
|---|---|
| Memory near limit, sessions also high | Raise `mem_limit` to 1G in compose; one box can hold ~5–8k matched sessions per Phase 1 reviewer 3 analysis. |
| CPU saturated, low connection count | Check if you're under HELLO flood (rate limiter should catch). If legitimate traffic, scale horizontally — add another box. |
| Many idle sessions, growing over hours | The v0.2 idle-eviction policy isn't yet implemented. Workaround: set a periodic `systemctl restart` on a quiet hour to clear them. (Tracked in spec §12.1.) |

---

## 8 · Drain + retire a relay

Permanent shutdown (e.g. retiring r2 and not replacing it):

```bash
# 1. Notify operators 30+ days in advance so existing pairings have time
#    to re-pair (their relay_endpoints field still includes r2 until then).
# 2. Remove r2 from ANTON_MESH_RELAYS in the operator env.
# 3. New pairings stop including r2.
# 4. After the deprecation window:
docker compose stop && docker compose rm -f
# OR: sudo systemctl stop anton-mesh-relay && sudo systemctl disable
# 5. Update DNS to remove r2 records.
# 6. Decommission the box.
```

The `RELAY_DRAINING` graceful shutdown only matters for normal restarts. For permanent retirement, the phones eventually fail over to whatever's left in their `relay_endpoints` list, then can't reach r2 at all — which is the desired end state.

---

## 9 · Audit log forensics

The audit log is a JSONL stream of relay events. NEVER includes payloads.

### Useful queries

```bash
# All events for a specific instance_id prefix (8 hex chars)
sudo jq -c 'select(.instance_id_prefix == "aabbccdd")' /var/log/anton-mesh-relay/audit.jsonl

# Match success rate over the last hour
sudo journalctl -u anton-mesh-relay --since '1 hour ago' \
  | jq -c 'select(.type | startswith("hello_") or . == "match" or . == "session_end")' \
  | jq -s 'group_by(.type) | map({type: .[0].type, count: length})'

# Sources currently blocked by rate limiting
sudo grep '"rate_limited"' /var/log/anton-mesh-relay/audit.jsonl | tail -100 \
  | jq -r '.source' | sort | uniq -c | sort -rn
```

### Retention

The audit log doesn't auto-rotate. Set up `logrotate`:

```
# /etc/logrotate.d/anton-mesh-relay
/var/log/anton-mesh-relay/*.jsonl {
    daily
    rotate 30
    compress
    missingok
    notifempty
    copytruncate
}
```

30 days is a defensible default — long enough to investigate incidents, short enough that a hostile relay operator with disk access can't build a long-term metadata corpus.

---

## 10 · Emergency: relay process is unreachable

If `/healthz` doesn't respond and SSH still works:

```bash
# 1. Process state
sudo systemctl status anton-mesh-relay
# OR: docker ps && docker logs anton-mesh-relay --tail 100

# 2. Port still bound?
sudo ss -tlnp | grep :8443

# 3. Quick restart
sudo systemctl restart anton-mesh-relay
# OR: docker compose restart relay

# 4. Verify
curl -s http://localhost:8443/healthz   # bypass Caddy in case the issue is upstream
```

If SSH itself is down (host is wedged), failover relay should already be handling traffic. Reboot the box, verify on the way back up. Investigate root cause from the cloud console / serial logs.

---

## 11 · Portal registry (v0.2+) — first-time setup

Brings the `/v1/portals/*` HTTP endpoints online on a relay that's
previously been WS-only. Adds a Postgres dependency. Pure-WS relays
that don't want to host a directory should leave the registry env
vars unset — the relay's `/v1/*` returns a structured 503 and
nothing else changes.

### 11.1 · Generate secrets (locally, on your dev box)

Three values that NEVER cross the wire as plaintext:

```bash
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # RELAY_OPERATOR_PASSWORD
openssl rand -hex 32   # RELAY_OPERATOR_JWT_SECRET
```

Save them in a password manager. They go into the `.env` file on the
server (§11.3).

### 11.2 · Provision Postgres

**Option A — bundled Postgres via docker-compose (recommended for first deploy):**
The `registry-db` service in `docker-compose.yml` runs Postgres 16
alpine bound only to `127.0.0.1:5432`. Data persists in a docker
volume.

**Option B — external Postgres:**
Comment out the `registry-db` service in `docker-compose.yml` and
point `RELAY_REGISTRY_DATABASE_URL` at your existing instance.
First migration runs `CREATE EXTENSION pgcrypto` — either grant the
relay's role superuser temporarily or pre-create it.

### 11.3 · Drop in the env file on the server

```bash
cd /opt/anton-mesh-relay   # or wherever docker-compose.yml lives
cp .env.example .env
chmod 600 .env
vi .env
# Paste the three secrets from §11.1.
```

### 11.4 · Pull the new image + bring up the stack

```bash
# 0. Fetch the new code.
git pull   # or docker pull <your-registry>/anton-mesh-relay:0.2.0

# 1. Build the image (Dockerfile now copies migrations).
docker compose build relay

# 2. Bring up Postgres first; relay's depends_on waits for healthy.
docker compose up -d registry-db

# 3. Apply the schema migrations.
docker compose run --rm relay node dist/registry/migrate.js
# Expect: "migrations: applied=1 skipped=0"

# 4. Bring up the relay. Graceful drain on the OLD container fires
#    automatically; phones treat RELAY_DRAINING as "try the next
#    relay now". With only 1 active session today, this is invisible.
docker compose up -d relay

# 5. Verify.
curl -s https://relay.futurechain.eu/healthz | jq .
# Look for: { ok:true, version:"0.2.0", registry_enabled:true, ... }
curl -s https://relay.futurechain.eu/v1/healthz | jq .
# Look for: { ok:true, reason:null }
```

### 11.5 · First operator login (smoke test)

```bash
# From your laptop, NOT the relay host:
curl -s -X POST https://relay.futurechain.eu/v1/admin/login \
  -H 'content-type: application/json' \
  -d '{"password":"<RELAY_OPERATOR_PASSWORD>","operatorId":"op-daniel"}' | jq .
# Expected: { token:"eyJ...", expiresAt:"...", operatorId:"op-daniel" }

TOKEN="<the JWT>"
curl -s -H "Authorization: Bearer $TOKEN" \
  https://relay.futurechain.eu/v1/admin/submissions | jq .
# Expected: { submissions: [], total: 0 }
```

### 11.6 · Wire ANTON Local

On every ANTON Local instance that should publish to this registry:

```bash
# In the ANTON Local production env:
RELAY_PORTAL_SUBMIT_URL=https://relay.futurechain.eu/v1
```

Then restart ANTON Local. New portals from the walkthrough will queue
at the relay; existing portals stay local-only until re-finalized.

### 11.7 · Rotate the JWT signing secret

If `RELAY_OPERATOR_JWT_SECRET` is ever leaked:

```bash
# 1. Generate a new secret (§11.1).
# 2. Edit .env, replace RELAY_OPERATOR_JWT_SECRET.
# 3. docker compose up -d relay     # picks up the new env.
# All existing operator tokens are invalidated; operators re-login.
```

### 11.8 · Registry DB backup

Daily logical dump (cron on the relay host):

```bash
# /etc/cron.daily/anton-relay-registry-backup
#!/bin/sh
set -e
TS=$(date -u +%Y%m%dT%H%M%SZ)
docker exec anton-relay-registry-db pg_dump -U relay -d relay_registry \
  | gzip > /var/backups/relay-registry/relay-registry-$TS.sql.gz
find /var/backups/relay-registry -name '*.sql.gz' -mtime +30 -delete
```

Restore:

```bash
gunzip -c /var/backups/relay-registry/relay-registry-*.sql.gz \
  | docker exec -i anton-relay-registry-db psql -U relay -d relay_registry
```

---

## 12 · Deploy the terminal-certs update (migration 002)

Brings the **`/v1/terminals/*`** endpoints online — the per-business terminal
authorization registry that backs ANTON Business's "company tills" dashboard.
A relay already running the v0.2 registry (§11) only needs the new code plus
migration `002_terminal_certs.sql`; no new secrets, no schema reset.

**What it adds**
- `POST /v1/terminals/publish` — store a company-signed terminal cert. The
  relay verifies ONLY the Ed25519 signature over the cert digest before
  storing (self-authorizing — no KYC, no review). Malformed or wrongly-signed
  certs get `400`.
- `GET /v1/terminals/:companyAddr` — list a company's authorized tills. The
  fetching client re-verifies every cert, so the relay's grouping is never
  trusted.
- Table `terminal_certs` (PK `company_addr` + `terminal_pub`), migration 002.

**Before:** `GET /v1/terminals/<addr>` → `501 not_implemented` (the route is
absent from the running build). **After:** `200` with `{ terminals: [...] }`.

### 12.1 · Deploy (on the Bahnhof relay host)

```bash
cd /opt/anton-mesh-relay          # wherever docker-compose.yml lives

# 1. Fetch the new code (includes migration 002 + the terminals handlers).
git pull

# 2. Rebuild the relay image (the Dockerfile copies migrations/ into it).
docker compose build relay

# 3. Apply pending migrations. 001 is already applied, so expect 002 only.
docker compose run --rm relay node dist/registry/migrate.js
#    Expect: "migrations: applied=1 skipped=1"
#            applied: 002_terminal_certs.sql

# 4. Restart the relay (graceful drain fires on the old container; with
#    active_sessions:0 today this is invisible to phones).
docker compose up -d relay

# 5. Confirm the version came up.
curl -s https://relay.futurechain.eu/healthz | jq '.version, .registry_enabled'
```

> External-Postgres operators (§11.2 Option B) run the migrate step against
> their DB the same way; migration 002 needs no extension beyond what 001
> already required.

### 12.2 · Verify (from your laptop, NOT the relay host)

The endpoints are self-authorizing, so the route can be smoke-tested without
operator credentials.

```bash
# 1. The route now exists (was 501) and an empty company lists cleanly.
curl -s -o /dev/null -w 'GET terminals -> HTTP %{http_code}\n' \
  https://relay.futurechain.eu/v1/terminals/fc_SmokeTest11111111111111111111
#    Expect: HTTP 200   (was 501 before the deploy)

curl -s https://relay.futurechain.eu/v1/terminals/fc_SmokeTest11111111111111111111
#    Expect: {"companyAddr":"fc_SmokeTest...","terminals":[]}

# 2. A junk cert is rejected (proves the publish path is wired) — never a 5xx.
curl -s -X POST https://relay.futurechain.eu/v1/terminals/publish \
  -H 'content-type: application/json' \
  -d '{"cert":{"v":1,"companyPub":"00","terminalPub":"00","sig":"00","companyAddr":"fc_x","label":"x","issuedAt":1}}'
#    Expect: {"error":"invalid_cert",...}
```

For an end-to-end **signed** round-trip (real cert published, listed back,
upsert + tamper-rejection), the repo ships an integration test that runs
against a real Postgres. Run it against a throwaway DB:

```bash
createdb relay_reg_test   # any DEDICATED db — the test drops + re-migrates it
cd relay
RELAY_REGISTRY_TEST_DATABASE_URL=postgres://USER:PASS@localhost:5432/relay_reg_test \
  npx vitest run tests/terminals-endpoints.test.ts
#    Expect: 4 passed  (publish 201, list round-trip, upsert relabel, tamper 400)
```

The ANTON Business app needs no change — `src/business/services/relay-terminals.ts`
already points at `https://relay.futurechain.eu/v1`; the "Company tills"
dashboard degrades gracefully (shows "no tills yet") until this deploy lands,
then lights up.

---

## Reference

- Spec: `docs/ANTON_MESH_SPEC.md`
- Threat model: `docs/ANTON_MESH_THREAT_MODEL.md`
- Self-host guide for SMEs/orgs: `docs/RELAY_OPERATOR_GUIDE.md`
- DPIA template: `docs/RELAY_DPIA_TEMPLATE.md`
- Portals discovery roadmap: `docs/PORTALS_DISCOVERY_ROADMAP.md`
