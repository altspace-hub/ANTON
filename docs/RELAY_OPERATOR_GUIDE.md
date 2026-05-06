# Self-Hosted ANTON Mesh Relay — Operator Guide

For SMEs, NGOs, and any organisation that wants to run their own mesh relay
instead of relying on the openexpert-operated public relays. Targeted at an
IT-comfortable founder or a small IT team — not a 100% non-technical user.

**End state:** a wss-reachable relay at your own domain (e.g. `relay.acme.example`)
that ANTON instances + Companion App phones use as the matchmaking endpoint
for E2E-encrypted traffic.

**Time:** ~1 hour, including DNS propagation.

**Cost:** ~€5/mo (Hetzner CX11) or ~$5/mo (DO basic) for personal/small-team
scale. Scales linearly with concurrent users; one box handles ~5,000
concurrent matched sessions.

---

## Why self-host?

Three reasons SMEs and orgs choose this path over the openexpert-operated relays:

| Reason | Detail |
|---|---|
| **Procurement / DPIA** | Client paperwork asks "who is openexpert org, where, under what jurisdiction" — easier to answer "no third-party relay; we run it ourselves" than to plug in the openexpert DPIA template. |
| **Metadata locality** | The relay sees connection metadata (which `instance_id` is busy when, source IP buckets). Even though it can't decrypt traffic, the metadata tells a story. Self-hosting keeps that story on infrastructure you control. |
| **Sovereignty** | If the openexpert relay went down or changed terms, you'd be cut off. Self-hosting eliminates that dependency. |

What you DON'T get from self-hosting (because the protocol already provides it):

- **Privacy from the relay** — even the openexpert-operated relay can't decrypt your traffic. End-to-end encryption is built into the spec, not the deployment.
- **Performance** — the openexpert-operated relays will likely have better latency (multi-region, DDoS-protected). Self-hosting trades latency for control.

---

## Prerequisites

- A Linux box with public IPv4 (Hetzner / DigitalOcean / Linode / your own DC).
   - Minimum: 1 vCPU, 1 GB RAM. Recommended for >100 users: 2 vCPU, 4 GB RAM.
- A domain you control with DNS access. Subdomain is fine (e.g. `relay.acme.example`).
- Docker + Docker Compose installed, OR Node.js 22+ for bare-metal.
- 60 minutes.

---

## Step 1 — Provision the box

Pick whichever IaaS you're comfortable with. The simplest path:

**Hetzner Cloud CX11** (€4.51/mo, 2 vCPU, 4 GB RAM):

```bash
# Via Hetzner web console: spin up a CX11 in the closest region.
# Or via hcloud CLI:
hcloud server create --name anton-relay --type cx11 --image ubuntu-22.04 --location nbg1 --ssh-key your-key
```

**DigitalOcean Basic Droplet** ($6/mo, similar spec):

```bash
doctl compute droplet create anton-relay --image ubuntu-22-04-x64 --size s-1vcpu-1gb --region fra1 --ssh-keys your-key-id
```

Once the box is up, SSH in and update:

```bash
ssh root@<box-ip>
apt update && apt upgrade -y
adduser --disabled-password anton && usermod -aG sudo anton
mkdir /home/anton/.ssh && cp ~/.ssh/authorized_keys /home/anton/.ssh/
chown -R anton:anton /home/anton/.ssh && chmod 700 /home/anton/.ssh

# Disable root SSH, key-only auth.
sed -i 's/PermitRootLogin yes/PermitRootLogin no/; s/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Basic firewall.
ufw allow OpenSSH
ufw allow 80/tcp     # for Let's Encrypt HTTP-01 challenge
ufw allow 443/tcp    # the actual wss endpoint
ufw --force enable
```

Reconnect as `anton` for the rest of this guide.

---

## Step 2 — Point DNS

Create an A record:

```
relay.acme.example   A   <box-ip>
```

(If you also have IPv6: add an AAAA record.)

Wait for propagation: `dig relay.acme.example` should return your box's IP.

---

## Step 3 — Install Caddy + Docker

```bash
# Caddy from the official repo
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Docker from the official repo
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker anton
# Log out + back in for the group change to take effect.
```

---

## Step 4 — Configure Caddy

Create `/etc/caddy/Caddyfile`:

```caddyfile
relay.acme.example {
    reverse_proxy localhost:8443
    encode zstd gzip
    log {
        output file /var/log/caddy/relay.log
        format json
    }
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

Caddy auto-fetches a Let's Encrypt cert for `relay.acme.example` on first request. Verify:

```bash
curl https://relay.acme.example
# Expected: 502 Bad Gateway (relay isn't running yet — normal). The
# important thing is that TLS handshake succeeded.
```

---

## Step 5 — Get the relay code

Clone the ANTON repo (or its `relay/` sub-directory):

```bash
git clone https://github.com/openexpert/anton.git
cd anton/relay
```

(If openexpert publishes the relay as a standalone package later, replace
this step with `pnpm install -g @anton/mesh-relay` or `docker pull
ghcr.io/openexpert/anton-mesh-relay:0.1.0`.)

---

## Step 6 — Start the relay

Create `.env` next to `docker-compose.yml`:

```env
RELAY_URL=wss://relay.acme.example
RELAY_PORT=8443
RELAY_INSECURE=1
RELAY_AUDIT_LOG_PATH=/app/audit/audit.jsonl
RELAY_MAX_SESSIONS_PER_INSTANCE=64
```

`RELAY_INSECURE=1` is correct here — Caddy handles TLS at the edge; the
relay listens on plain WS on localhost:8443. The relay refuses to start
without either TLS cert/key OR `RELAY_INSECURE=1`.

```bash
docker compose up -d
docker compose logs -f relay
```

Verify:

```bash
curl https://relay.acme.example/healthz
# Expected: {"ok":true,"version":"0.1.0",...}
```

Done. The relay is live.

---

## Step 7 — Tell your ANTON instance to use it

On every ANTON instance whose phones should dial this relay, set the env
var (in `.env` or your service manager):

```env
ANTON_MESH_RELAYS=wss://relay.acme.example
```

If you want redundancy (recommended), spin up a second box following the
same steps with a different domain (e.g. `relay2.acme.example`), then:

```env
ANTON_MESH_RELAYS=wss://relay.acme.example,wss://relay2.acme.example
```

Restart the ANTON instance. New pairings will include both relay URLs.
Existing pairings keep their original `relay_endpoints` baked in — they
still work, but they don't get the second relay until users re-pair.

---

## Step 8 — Verify end-to-end

Pair a phone via the standard flow (operator generates a mesh-transport
QR; phone scans). Send a chat query. Both sides should work seamlessly.

If something goes wrong, see `relay/RUNBOOK.md` § 3 ("my phone can't connect").

---

## Day-2 operations

The full operations runbook is at `relay/RUNBOOK.md`. Highlights:

| Concern | Where |
|---|---|
| New version deployment | RUNBOOK § 1 |
| Investigating rejected HELLOs | RUNBOOK § 2 |
| Investigating "phone can't connect" | RUNBOOK § 3 |
| TLS rotation | RUNBOOK § 4 (auto via Caddy) |
| Adding / removing regions | RUNBOOK § 5–6 |
| Memory / CPU pressure | RUNBOOK § 7 |
| Audit log forensics | RUNBOOK § 9 |

Set up monitoring:

- **Uptime monitoring** — point UptimeRobot / Better Stack at
  `https://relay.acme.example/healthz`. Free tiers cover this.
- **Prometheus** — `curl https://relay.acme.example/metrics` returns
  Prometheus text format. If you already have Grafana, scrape this URL.
- **Audit log retention** — set up `logrotate` per RUNBOOK § 9.

---

## What this relay does NOT do

| Thing | Why |
|---|---|
| Decrypt traffic | Phone and instance run Noise IK end-to-end through the relay. The relay can read connection metadata only. |
| Authenticate users | Per-user auth lives at the ANTON application layer (existing `connected_users` / `app_devices` mechanism), not at the relay. |
| Store data | The relay is stateless except for in-memory match tables. No database, no persistent message store. |
| Serve content | The relay is a byte pipe. It doesn't host the ANTON web UI, files, or any user-facing surface. |

---

## Cost forecasting

Realistic numbers from Phase 1 architecture review:

| Users | Bandwidth (idle PINGs dominate) | Box | €/mo |
|---|---|---|---|
| 100 active users | ~1.5 GiB egress / month | CX11 | €5 |
| 1,000 active | ~15 GiB | CX11 | €5 |
| 10,000 active | ~150 GiB | CX21 (4 GB RAM) | €8 |
| 100,000 active | ~1.5 TiB; needs sharding | 2× CX31 | €30 |

(Idle PINGs at the spec-default 25s interval are ~90% of the bytes. The
v0.2 spec roadmap raises the default to 60s, cutting bandwidth ~3×.)

---

## See also

- `docs/ANTON_MESH_SPEC.md` — the protocol spec
- `docs/ANTON_MESH_THREAT_MODEL.md` — what the relay does + doesn't defend against
- `docs/RELAY_DPIA_TEMPLATE.md` — fill-in-the-blanks template for SMEs that need one
- `relay/RUNBOOK.md` — day-2 operational procedures
