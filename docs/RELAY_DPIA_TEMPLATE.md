# ANTON Mesh Relay — DPIA Template

A fill-in-the-blanks Data Protection Impact Assessment template for SMEs
running ANTON who need to explain to clients (or to their own legal /
compliance team) what data the openexpert-operated mesh relay does and
doesn't see.

**Status:** template, not legal advice. Adapt to your jurisdiction +
client requirements. Your DPO / lawyer should sign off on the final form.

---

## 1 · Overview

ANTON's Companion App reaches its paired ANTON instance over an
end-to-end encrypted tunnel that traverses a third-party "relay" service.
This DPIA covers that relay leg only — the rest of ANTON's data
processing is documented separately.

| Field | Value |
|---|---|
| **Controller** | _[Your firm name]_ |
| **Processor** | _[openexpert org / self-hosted; one of the two]_ |
| **Relay operator** | openexpert org _OR_ _[your firm, if self-hosted]_ |
| **Relay endpoints** | `wss://r1.openexpert.org`, `wss://r2.openexpert.org` _(or self-hosted equivalent)_ |
| **Hosting region(s)** | _[Frankfurt + NYC for openexpert; or your own]_ |
| **Hosting jurisdiction** | _[Germany + USA; or your own]_ |
| **Date** | _[YYYY-MM-DD]_ |
| **Reviewer** | _[Name + role]_ |

---

## 2 · What the relay processes

The relay is a **byte-forwarding service** in the protocol sense. It
matches a Companion App connection to an ANTON instance connection by
a 16-byte `instance_id`, then forwards opaque encrypted bytes between
them. It cannot decrypt the traffic.

### Data the relay sees

| Category | Field | Retention |
|---|---|---|
| Connection metadata | Source IP address (truncated to /32 for IPv4, /64 for IPv6 in audit logs) | 30 days in audit logs |
| Connection metadata | `instance_id` (16-byte SHA-256 prefix of instance pubkey) | 30 days in audit logs, only first 8 hex chars retained |
| Connection metadata | `session_id` (16-byte random per matched session) | Memory only; never persisted |
| Connection metadata | TLS handshake metadata (TLS version, ciphersuite, SNI hostname) | Standard webserver logs, 30 days |
| Connection metadata | Connection timestamps (open / close / ENVELOPE rate) | 30 days in audit logs |
| Operational counters | Aggregated metrics (HELLO accept/reject rates, bandwidth) | Indefinite (numerical aggregates only, no per-user data) |

### Data the relay does NOT see

| Category | Why |
|---|---|
| Message contents (chat queries, AI responses, files) | Encrypted end-to-end with Noise IK between the phone and the instance. The relay forwards opaque ciphertext only. |
| User identity (name, email, contact details) | The relay never receives these. They live in the ANTON instance, behind the encrypted channel. |
| Org / employer identity | Same — encrypted. |
| Authentication tokens | Same — encrypted. |
| Cryptographic private keys | Phone keys live on the phone (biometric-protected); instance keys live on the instance (encrypted at rest). The relay never holds either. |

---

## 3 · Lawful basis (GDPR Article 6)

The lawful basis for relay processing depends on your client relationship.
Most common selections:

| Basis | When it applies |
|---|---|
| **6(1)(b) Contract performance** | The relay is a necessary technical component for the phone-to-instance connection your client contracted you for. |
| **6(1)(f) Legitimate interests** | The relay's metadata processing (rate limiting, abuse detection) is necessary to keep the service available. The data minimisation in §2 is the proportionality argument. |

**Special-category data:** the relay never processes special-category
data (health, biometric, etc.) because the encrypted tunnel is opaque to
it. If your client engagement involves processing such data via ANTON,
the lawful basis applies at the ANTON-instance layer, not the relay layer.

---

## 4 · Data subjects

Two categories of data subject have data flowing through the relay:

| Subject | Data exposed to relay |
|---|---|
| **The operator** (you / your client) running the ANTON instance | Source IP of the instance; instance_id derived from operator-controlled pubkey |
| **End users** of the Companion App (employees / family / clients) | Source IP of their phone; nothing else |

Pseudonymisation: `instance_id` is a SHA-256 truncation of a public key
the operator generated; it does not directly identify the operator unless
the public key has been published elsewhere.

---

## 5 · Recipients

| Recipient | What they see |
|---|---|
| openexpert org (relay operator) | Connection metadata per §2 |
| Hosting provider (Hetzner / DigitalOcean / etc., for openexpert relays) | TLS-decrypted source IP + bandwidth (no payload because the tunnel is E2E encrypted) |
| Cloudflare / DDoS provider _if used_ | Same as above |
| **Self-hosted alternative** | Replace all of the above with "your own org's IT / hosting team only" |

No third-party sub-processors beyond the hosting stack.

---

## 6 · International transfers

For openexpert-operated relays:

| Data | Origin | Destination | Transfer mechanism |
|---|---|---|---|
| Connection metadata to r1 | _[client country]_ | Germany (EU) | Intra-EU; no SCCs needed |
| Connection metadata to r2 | _[client country]_ | USA | SCCs (EU-US Data Privacy Framework if applicable) |

For self-hosted relays under your own org's control: no third-country
transfers unless your hosting choice introduces them.

---

## 7 · Retention + deletion

| Data | Retention |
|---|---|
| Audit logs (source IP buckets, instance_id prefixes, error codes, timestamps) | 30 days, then automatic rotation/deletion via logrotate |
| In-memory match table (active sessions) | Cleared on disconnect, max 30 minutes if a session goes idle (v0.2 idle-eviction) |
| Aggregate operational metrics (anonymous counters) | Indefinite — no per-user data |

No long-term retention of personal data.

---

## 8 · Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Relay operator compromise reveals message contents** | Low | Low (no data decryptable at relay) | Noise IK end-to-end encryption — the relay can't decrypt even if it tries. |
| **Relay operator builds a metadata graph (which phones talk to which instances when)** | Medium | Medium | Source IPs are bucketed (/32 v4, /64 v6) and aggregated; instance_id only retains first 8 hex chars. For higher protection, **self-host the relay** — eliminates the third-party operator entirely. |
| **Relay outage** | Low (multi-region, redundant) | Low (mesh transport falls over to next relay; pairings keep working) | Multiple relays per pairing; automatic failover. |
| **DDoS against the relay** | Medium | Medium (service degradation during attack) | Per-IP-bucket + per-instance rate limiting; firewall rules; (optional) Cloudflare Spectrum. |
| **TLS cert compromise (relay endpoint impersonation)** | Very low | Limited (Noise IK still authenticates the instance independently of the TLS cert) | The phone pins the operator's `(ed_pk, x_pk, binding_sig)` triple at pairing — TLS cert change doesn't affect trust. |

---

## 9 · Data subject rights

| Right | Applicability to the relay |
|---|---|
| Access (Article 15) | Audit logs contain limited per-bucket data; targeted access typically not possible because the relay does not directly identify a data subject. Refer to the ANTON-instance layer for application data. |
| Rectification (16) | N/A for the relay — no editable data is stored. |
| Erasure (17) | Audit log retention is bounded at 30 days. Earlier deletion can be requested. |
| Portability (20) | N/A for the relay (no application data). Refer to the ANTON-instance layer. |
| Objection (21) | If a data subject objects to relay processing, they can use the `public_https` transport instead (no relay involvement). |

---

## 10 · Sign-off

- [ ] DPO / legal review by _[name]_
- [ ] Technical review by _[name]_
- [ ] Approved by _[name]_ on _[date]_

---

## Appendix A — Self-hosting alternative

For clients who require zero third-party processors, the ANTON Mesh Relay
is open source (Apache 2.0, `relay/` directory in the ANTON repo). Stand
up the relay on your own infrastructure following
`docs/RELAY_OPERATOR_GUIDE.md`. The relay code, threat model, and protocol
spec are public; the only thing you'd add is your own hosting + monitoring.

When self-hosted, the rows in §5 collapse to "your firm only."

---

## Appendix B — References

- ANTON Mesh Spec: `docs/ANTON_MESH_SPEC.md` (protocol-level guarantees)
- Threat Model: `docs/ANTON_MESH_THREAT_MODEL.md` (what the relay defends against, what it doesn't)
- Operator Guide: `docs/RELAY_OPERATOR_GUIDE.md` (self-hosting steps)
- Operations Runbook: `relay/RUNBOOK.md` (day-2 ops)
