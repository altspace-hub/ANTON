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

## Reference

- Spec: `docs/ANTON_MESH_SPEC.md`
- Threat model: `docs/ANTON_MESH_THREAT_MODEL.md`
- Self-host guide for SMEs/orgs: `docs/RELAY_OPERATOR_GUIDE.md`
- DPIA template: `docs/RELAY_DPIA_TEMPLATE.md`
