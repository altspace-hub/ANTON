# ANTON Portals — Registry Server Ops Spec

**Document:** Registry Server Ops Spec
**Version:** 1.0.0-draft
**Target implementation version:** v0.7.x
**Status:** Draft for implementation — operational spec
**Owner:** Daniel Bardun / FutureChain AB
**Depends on:** Registry Protocol Reference, Capability Descriptor Schema Reference
**Companion to:** ANTON_Portals_Spec.md, ANTON_Portals_Strategic_Ground.md

---

## 0. Read this first

This document defines **how the `anton.portals` registry service is run**, not what it does. The protocol reference defines the wire format; this document defines the deployment, monitoring, abuse pipeline, legal posture, and continuity planning.

**For the implementer (Claude Code + ops team):**

1. The registry server software is Apache 2.0 OSS. No proprietary logic. FutureChain's competitive position is operational excellence, not closed-source advantage.
2. EU hosting is mandatory for v0.7.x (GDPR-friendly default).
3. 99.9% uptime SLO is realistic and achievable. Don't over-engineer for 99.99%.
4. Transparency log publication is load-bearing. A registry that silently stops publishing its Merkle root is treated by clients as compromised.
5. Abuse pipeline staffing is a real commitment. Budget for it.
6. GDPR compliance is mandatory. Designate data controller, DSR workflow, privacy policy before launch.

---

## 1. Scope and non-scope

### 1.1 In scope

- Deployment architecture (single-region, scalable to multi-region).
- Software stack.
- Backup, recovery, monitoring.
- Abuse pipeline workflow and staffing.
- GDPR / legal posture.
- Incident response.
- Release process for registry software.
- Transparency report.
- Succession and continuity planning.

### 1.2 Out of scope

- Wire protocol definition (Registry Protocol Reference).
- Capability descriptor schema (Capability Descriptor Schema Reference).
- Client-side behaviour (tracked in ANTON_Portals_Spec.md).
- FutureChain payment rail operations (separate FutureChain spec).

---

## 2. Open source posture

### 2.1 License

Apache 2.0. Same as ANTON core. No dual-licensing, no proprietary extensions.

### 2.2 Repository

Public GitHub repo under the FutureChain or ANTON organisation. CI/CD visible. Issue tracker open. Pull requests welcome.

### 2.3 Rationale

Three reasons the server is OSS:

1. **Consistency with the platform.** ANTON is Apache 2.0 end-to-end.
2. **Federation enablement.** Future operators (Mistral, sovereignEU) can spin up compatible registries from the same codebase.
3. **Trust legitimacy.** A closed-source registry run by a single commercial entity undermines the decentralisation story. Open source lets auditors, researchers, and the community verify the server does what the protocol says.

### 2.4 What FutureChain still owns commercially

Operating the registry well. Specifically:

- Infrastructure investment.
- Uptime and SRE commitment.
- Abuse pipeline staffing.
- Legal compliance.
- Trust bundle signing (operator identity key is FutureChain's).
- Managed hosting (Red Hat model) for users who want always-on portals without running their own box.

These are operational moats, not software moats. This is the correct Apache-2.0-aligned business model.

---

## 3. Deployment architecture

### 3.1 Topology (v0.7.x launch)

**Single region, single active instance, hot standby.**

- **Primary region:** EU (Frankfurt / Stockholm / Amsterdam — pick one based on provider availability and latency to FutureChain's location).
- **Active instance:** primary registry server.
- **Hot standby:** warm replica, PostgreSQL streaming replication. Automatic failover on primary failure.
- **Read replica (optional for launch):** for scale-out of read traffic (resolve, search, log reads). Add if read load exceeds single-instance capacity.

### 3.2 Stack

Align with existing ANTON stack where possible.

- **Language:** TypeScript (Node.js), matching ANTON's server-side convention.
- **HTTP framework:** whatever ANTON uses (likely Express or Fastify — confirm during investigation).
- **Database:** PostgreSQL 15+ (already standard for ANTON). Separate instance from ANTON client deployments — the registry is its own service.
- **Reverse proxy:** Nginx or Caddy for TLS termination, rate limiting, WAF.
- **TLS:** Let's Encrypt via ACME for public HTTPS endpoint. Note: this is the registry's *public* endpoint; portal-to-portal traffic uses AAP transport, which is separate.
- **Process manager:** PM2 or systemd (match ANTON server deployment convention).
- **Secrets management:** HashiCorp Vault or cloud-provider KMS. Operator identity private key in HSM (AWS CloudHSM / Azure Dedicated HSM / equivalent).

### 3.3 Infrastructure provider

Provider choice driven by: EU region availability, HSM availability, GDPR-friendly DPA, cost.

Candidates: Hetzner (EU native, cost-effective), OVHcloud (EU native, enterprise tier), AWS Frankfurt/Stockholm, Azure North Europe / Sweden Central.

**Recommendation:** Hetzner for launch (cost-effective, EU-native, established). Migrate to AWS/Azure if scale or HSM requirements demand it.

### 3.4 Multi-region (deferred to v1.1+)

Plan for multi-region exists but is not v0.7.x scope:

- Read replicas in other EU regions once traffic justifies.
- Full active-active multi-region once scale requires.
- Cross-region failover with automated DNS update.

Design principle: the protocol is region-agnostic. Adding regions doesn't require protocol changes.

---

## 4. PostgreSQL schema (operational)

This builds on the protocol-defined schema in the Registry Protocol Reference.

### 4.1 Core tables

```sql
-- From Registry Protocol Reference with operational additions
CREATE TABLE portal_registrations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  namespace TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  public_key TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  public_index BOOLEAN DEFAULT FALSE,
  capability_summary JSONB,
  descriptor_hash TEXT,
  registered_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  metadata JSONB,
  UNIQUE (namespace, name)
);

CREATE INDEX idx_portal_registrations_contact_hash ON portal_registrations(contact_hash);
CREATE INDEX idx_portal_registrations_public_index ON portal_registrations(public_index) WHERE public_index = TRUE;
CREATE INDEX idx_portal_registrations_revoked_at ON portal_registrations(revoked_at);
CREATE INDEX idx_portal_registrations_capability_verbs
  ON portal_registrations USING gin ((capability_summary->'capabilityVerbs'));
CREATE INDEX idx_portal_registrations_tags
  ON portal_registrations USING gin ((capability_summary->'tags'));

-- Full-text search (simplified; tune tsvector config for multi-language)
ALTER TABLE portal_registrations ADD COLUMN search_vector tsvector;
CREATE INDEX idx_portal_registrations_search ON portal_registrations USING gin(search_vector);
-- Trigger to maintain search_vector on title/description updates

-- Transparency log
CREATE TABLE transparency_log (
  log_id BIGSERIAL PRIMARY KEY,
  appended_at TIMESTAMPTZ NOT NULL,
  operation_type TEXT NOT NULL,
  portal_id UUID REFERENCES portal_registrations(id),
  actor_contact_hash TEXT NOT NULL,
  signed_envelope JSONB NOT NULL,
  signatures JSONB,                           -- for two-signature operations
  registry_signature TEXT NOT NULL,
  entry_hash TEXT NOT NULL                    -- SHA-256 for Merkle tree leaf
);

CREATE INDEX idx_transparency_log_portal_id ON transparency_log(portal_id);
CREATE INDEX idx_transparency_log_actor ON transparency_log(actor_contact_hash);
CREATE INDEX idx_transparency_log_operation_type ON transparency_log(operation_type);

-- Signed tree heads
CREATE TABLE signed_tree_heads (
  tree_size BIGINT PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  signature TEXT NOT NULL
);

-- Operations deduplication (replay protection)
CREATE TABLE operation_nonces (
  nonce TEXT NOT NULL,
  actor_contact_hash TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_contact_hash, nonce)
);

CREATE INDEX idx_operation_nonces_seen_at ON operation_nonces(seen_at);
-- Periodic cleanup: DELETE FROM operation_nonces WHERE seen_at < now() - interval '48 hours';

-- Reserved names
CREATE TABLE reserved_names (
  name TEXT NOT NULL,
  namespace TEXT,                             -- NULL for global reservation
  skeleton TEXT NOT NULL,                     -- UTS #39 skeleton for confusable detection
  reason TEXT,
  reserved_at TIMESTAMPTZ NOT NULL,
  reserved_by_operation_id BIGINT REFERENCES transparency_log(log_id),
  UNIQUE (namespace, name)
);

CREATE INDEX idx_reserved_names_skeleton ON reserved_names(skeleton);

-- Abuse reports
CREATE TABLE abuse_reports (
  id UUID PRIMARY KEY,
  registration_id UUID REFERENCES portal_registrations(id),
  reporter_contact_hash TEXT,
  report_type TEXT NOT NULL,
  severity TEXT NOT NULL,                     -- low / medium / high / critical
  signed_payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB,
  status TEXT DEFAULT 'pending',              -- pending / triaged / valid / rejected / escalated
  triaged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_action TEXT,                     -- dismissed / warning / suspension / revocation
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_abuse_reports_status ON abuse_reports(status);
CREATE INDEX idx_abuse_reports_registration ON abuse_reports(registration_id);
CREATE INDEX idx_abuse_reports_reporter ON abuse_reports(reporter_contact_hash);

-- Reporter reputation (abuse-report quality tracking)
CREATE TABLE reporter_reputation (
  reporter_contact_hash TEXT PRIMARY KEY,
  reports_submitted INTEGER DEFAULT 0,
  reports_valid INTEGER DEFAULT 0,
  reports_rejected INTEGER DEFAULT 0,
  last_report_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,                 -- set when reporter shows abuse pattern
  notes TEXT
);

-- Heartbeats (NOT in transparency log — §5.7 of protocol)
CREATE TABLE portal_heartbeats (
  portal_id UUID REFERENCES portal_registrations(id),
  heartbeat_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (portal_id, heartbeat_at)
);

-- Auto-clean heartbeats older than 30 days

-- Rate limiting state
CREATE TABLE rate_limit_counters (
  bucket_key TEXT NOT NULL,                   -- e.g. "register:ANTON-XXXX:24h"
  count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);

-- DSAR requests (GDPR)
CREATE TABLE dsr_requests (
  id UUID PRIMARY KEY,
  subject_contact_hash TEXT NOT NULL,
  request_type TEXT NOT NULL,                 -- access / portability / erasure / rectification
  received_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  response_package_location TEXT,
  notes TEXT
);
```

### 4.2 Migrations

Follow ANTON's standard migration convention. Every registry schema change is a forward-only migration with an operational rollback plan. Pre-production and post-production environments track migration state identically.

### 4.3 Backup

- **Continuous WAL archival** to encrypted object storage.
- **Daily full backups** with 30-day retention.
- **Monthly archival backups** with 7-year retention (matches maximum data retention for regulatory purposes).
- **Cross-region backup replication** — backup in a different EU region from primary.
- **Backup restore tested quarterly.** Untested backups are not backups.

---

## 5. Transparency log operations

### 5.1 Append pipeline

Every successful non-heartbeat operation:

1. Persist operation to `transparency_log` table.
2. Compute leaf hash per protocol §7.3.
3. Update in-memory Merkle tree.
4. Return `logId` to client.

### 5.2 Hourly Merkle root publication

Scheduled job runs every hour:

1. Compute current Merkle root from the log.
2. Construct signed tree head (STH) per protocol §7.4.
3. Sign with operator identity key (HSM-resident).
4. Persist to `signed_tree_heads` table.
5. Publish via `/v1/sth/latest` endpoint.

### 5.3 STH publication SLO

The hourly STH publication is load-bearing. Missed publication = visible warning to every client.

- **Target:** 100% of hourly STHs published within 5 minutes of the scheduled time.
- **Alert threshold:** STH more than 30 minutes late → on-call paged.
- **Critical threshold:** STH more than 90 minutes late → public incident declared, status page updated.

### 5.4 Log integrity monitoring

Independent third-party log monitors are encouraged. The registry exposes sufficient data for any third party to:

- Download full log history.
- Verify all STH signatures.
- Verify consistency between STHs.
- Raise public alarms on anomalies.

FutureChain operates a **primary log monitor** as an internal check. Third-party monitors are listed on the registry's public info page.

### 5.5 Log growth projections

Assume conservative volumes for capacity planning:

- Year 1: 10,000 registrations, ~50,000 total operations → ~5 MB compressed log.
- Year 3: 500,000 registrations, ~5M operations → ~500 MB compressed log.
- Year 10: Unknown — but log must remain queryable at any scale.

PostgreSQL handles the storage without concern at these volumes. Merkle tree in-memory representation stays small because only internal hashes are kept; leaf data is on disk.

---

## 6. Abuse pipeline

### 6.1 Report types

- **Impersonation** — claim to be someone the reporter knows the registrant is not.
- **Trademark violation** — name conflicts with reporter's trademark.
- **Illegal content** — portal hosts CSAM, terrorist content, or content illegal in the registry's jurisdiction. Note: the registry doesn't host portal content, but can de-register portals whose content is reported as illegal.
- **Spam/squatting** — registrant holds multiple names without legitimate use.
- **Protocol abuse** — technical misuse (flooding, invalid operations, exploit attempts).
- **Phishing/scam** — portal used to defraud users.

### 6.2 Severity classification

| Severity | Triage SLA | Examples |
|----------|-----------|----------|
| Critical | 4 hours | CSAM, active phishing causing financial harm, safety threats. |
| High | 48 hours | Clear impersonation of verified business, illegal content. |
| Medium | 7 days | Trademark disputes, suspected squatting. |
| Low | 14 days | Ambiguous cases, low-impact spam. |

### 6.3 Workflow

1. **Submission.** Reporter submits signed report via `POST /v1/reports`. Report is signed by reporter's ANTON identity — anonymous reports are not accepted in v0.7.x.
2. **Intake.** Auto-classified by severity based on report type. Entered into `abuse_reports` queue.
3. **Triage.** Ops reviewer (human) checks the report within SLA window. Gathers additional evidence if needed.
4. **Decision.** One of:
   - **Dismissed** — no violation found. Reporter notified. Reporter reputation updated.
   - **Warning** — registrant notified with 7-day grace period to remediate.
   - **Temporary suspension** — registration flagged `suspended` (resolution returns `E_PORTAL_SUSPENDED`); reinstated after remediation.
   - **Permanent revocation** — registration revoked per protocol `revoke` operation. Logged in transparency log with operator signature + note "administrative revocation per abuse report [ID]".
5. **Appeal.** Registrant has 30 days to appeal. Appeals reviewed by a second reviewer. Successful appeals reverse the action.
6. **Logging.** All actions recorded. Resolution notes visible to future reviewers handling related reports.

### 6.4 Reporter reputation

Tracked in `reporter_reputation`. Rules:

- First 3 reports: full weight regardless of history.
- Beyond 3 reports: reports from reporters with <30% valid-rate get lower priority.
- Reporters with 10+ rejected reports and <20% valid-rate: 30-day cooldown.
- Pattern of clearly malicious reporting (coordinated harassment): indefinite ban from the report endpoint.

Reputation is not publicly visible. It is an internal ops tool.

### 6.5 Rate limits on report submissions

- Max 10 reports per reporter per 7 days.
- Max 100 reports globally per hour (protects against DoS of the abuse pipeline itself).

### 6.6 Staffing

**v0.7.x reality:** Daniel (or a designated delegate) personally reviews reports until volume requires otherwise.

**Expected load in year 1:** low (few reports per week). Part-time commitment, probably a few hours per week.

**Escalation path:** when volume exceeds ~20 reports/week, hire part-time abuse reviewer. When volume exceeds ~50/day, full-time trust & safety role.

**Training:** reviewer needs baseline understanding of the protocol, legal fundamentals (DMCA in the US, equivalent EU procedures), and escalation procedures for critical severity (especially CSAM reporting to national authorities per legal obligations).

### 6.7 External authority engagement

Some reports require engagement with external authorities:

- **CSAM reports:** must be reported to the relevant national authority immediately (INHOPE member / national hotline). CSAM is not reviewed internally beyond confirming it is what it is.
- **Terrorist content:** reported to national authority per applicable law (Sweden: Säkerhetspolisen).
- **Law enforcement subpoenas:** handled by legal counsel. Transparency report (§10) publishes aggregate statistics annually.

### 6.8 Automated pre-filtering (future)

v1.0.0 has no automated content classification. v1.1+ may add:

- Simple heuristics (names matching known abuse patterns).
- Optional AI pre-classification (with human-in-the-loop).

All decisions remain human-reviewed in v1. No fully-automated revocation.

---

## 7. GDPR and legal

### 7.1 Data controller

FutureChain AB is the data controller for registry metadata. Registry entries contain:

- `contact_hash` — pseudonymous identifier, but can identify a natural person.
- `public_key` — cryptographic key.
- `name`, `title`, `description`, `category` — portal metadata (may identify natural persons, e.g. personal portals).
- Operation history in transparency log.

Publication of registry metadata has a **legitimate interest basis** for registry operation. GDPR balancing test performed and documented.

### 7.2 Privacy policy

Published at `privacy.anton.space` (or equivalent). Covers:

- Identity of controller (FutureChain AB, registration number, contact details).
- What data is processed and why.
- Legal basis for each processing activity.
- Retention periods.
- Data subject rights (access, portability, rectification, erasure).
- How to submit a data subject request.
- Data transfers (in-EU hosting, no transfers outside EEA in v1).
- Complaints (supervisory authority = Integritetsskyddsmyndigheten for Sweden).

Privacy policy version-controlled. Updates announced in transparency log.

### 7.3 Data subject rights

**Access:** Returns full registration record + operation history from transparency log. Because the log is public, this is mostly a convenience.

**Portability:** Signed operation envelopes are already portable — user can export their own operations. Registry provides a convenience export.

**Rectification:** Most fields are user-updatable via protocol operations. Non-user-updatable metadata (e.g. operational timestamps) is not rectifiable per GDPR recital (legitimate interest in log integrity).

**Erasure:** The core tension. Registry metadata can be soft-deleted (via `revoke`), but transparency log entries cannot be erased — doing so would break the cryptographic integrity of the log. Legal basis:

- **Retention under legitimate interest:** maintaining log integrity is required for the security and integrity of the registry service. This is a documented legitimate interest.
- **Pseudonymisation option:** contact_hash can be flagged as `erased_subject`, which suppresses display in search/resolve responses while preserving log integrity. Not a full erasure, but a documented compromise.
- **Clear user communication:** privacy policy explicitly states this limitation. Users register knowing the log is permanent.

This is not a comfortable position legally. It is defensible (legitimate interest in system integrity) but not airtight. **Consult Swedish data protection lawyer before v0.7.x launch.**

### 7.4 Data retention

| Data | Retention | Reason |
|------|-----------|--------|
| Active registrations | Indefinite while active | Registry operation |
| Revoked registrations | 180-day dormancy, then name released; full record retained 7 years | Prevent impersonation chain attacks, regulatory |
| Transparency log entries | Indefinite | Log integrity |
| Signed tree heads | Indefinite | Log integrity |
| Nonces | 48 hours | Replay protection window |
| Abuse reports | 7 years | Legal defensibility |
| DSR requests | 7 years | Legal audit trail |
| Heartbeats | 30 days | Operational only |
| Rate limit counters | 24 hours | Operational only |
| Access logs (server) | 90 days | Security investigation |

### 7.5 Cross-border transfers

**v0.7.x:** All data processing in EEA. No transfers outside. This avoids SCC/TIA complexity.

**Non-EU expansion:** Handled under Standard Contractual Clauses + Transfer Impact Assessment when it happens. Not a v0.7.x concern.

### 7.6 Terms of Service

Published alongside privacy policy. Covers:

- Acceptable use (no illegal content, no impersonation, no abuse).
- Limitation of liability.
- Indemnification.
- Operator rights (suspend/revoke per abuse pipeline).
- Governing law (Swedish).
- Dispute resolution.

### 7.7 Acceptable Use Policy (AUP)

Specific prohibitions:

- CSAM or any content harmful to minors.
- Terrorist content per EU terrorist content online regulation.
- Content inciting violence or hatred.
- Trademark/copyright violation.
- Commercial fraud or scams.
- Systematic impersonation.
- Technical abuse (registration flooding, operation flooding, probing).

### 7.8 DMCA-equivalent takedown

Sweden applies the EU's copyright directive, not DMCA. Copyright infringement reports flow through the standard abuse pipeline with legal escalation where necessary. FutureChain is not a safe harbour for copyright infringement — the registry is a directory service, not a content host, so most copyright claims are misdirected. Clear guidance published explaining that portal content is hosted by the portal owner, not the registry.

---

## 8. Monitoring

### 8.1 Metrics (Prometheus + Grafana)

**Availability:**
- Uptime percentage.
- HTTP success rate per endpoint.
- Latency percentiles per endpoint (p50, p95, p99).

**Protocol health:**
- Operations per minute by type.
- Rejection rate by error code.
- STH publication latency.
- Merkle tree size.

**Database:**
- Connection pool utilisation.
- Query latency distribution.
- Replication lag (if read replicas).
- Storage utilisation.

**Abuse pipeline:**
- Reports per day by severity.
- Triage time (received → resolved).
- Queue depth by severity.
- Reporter reputation distribution.

**GDPR:**
- DSR requests per month.
- DSR response time.

### 8.2 Logging (Loki + Grafana)

Structured JSON logs:

- Request logs (method, path, status, latency, actor).
- Error logs (stack traces, context).
- Security logs (rate limit hits, signature failures, suspicious patterns).
- Abuse pipeline actions.

Log retention: 90 days hot, 12 months cold storage, encrypted at rest.

### 8.3 Alerting

Tiers:

**Critical (page on-call immediately):**
- Registry down (health check fails).
- STH publication >30 minutes late.
- Database primary failure.
- Signature failures spiking (possible key compromise).
- HSM unreachable.

**High (notify on-call within 15 min):**
- Rejection rate spike (possible attack).
- STH publication >15 minutes late.
- Replication lag >5 minutes.

**Medium (notify on-call within 1 hour):**
- Error rate elevated.
- Resource utilisation elevated.
- Abuse report queue backing up.

### 8.4 External monitoring

- **Uptime monitoring** from multiple external points (Pingdom, UptimeRobot, or equivalent).
- **Public status page** at `status.anton.space`. Historical uptime published.
- **Transparency log watchdogs** — independent monitors verify STH publication cadence and signature validity. FutureChain publishes the URL of its own monitor; third-party monitors can register.

---

## 9. Incident response

### 9.1 Runbook categories

- **Availability incident** (registry down, high latency).
- **Security incident** (key compromise, intrusion detected, DDoS).
- **Data incident** (breach, unauthorised access, accidental exposure).
- **Legal incident** (subpoena, regulatory inquiry, court order).
- **Protocol incident** (log inconsistency, STH failure, cryptographic anomaly).

Each has a pre-written runbook. Runbooks are maintained in the OSS repo — but access to specific incident response playbooks (with contacts, escalation paths) is restricted.

### 9.2 Security incident response

If the operator identity key is suspected compromised:

1. **Immediate:** STH publication paused. Status page updated.
2. **Within 1 hour:** Public incident declared. Public announcement on transparency log channel, FutureChain site, and ANTON client update channel.
3. **Within 24 hours:** New operator key generated (HSM). Trust bundle update prepared.
4. **Within 48 hours:** Trust bundle rolled out via ANTON update channel. Both old and new keys trusted during overlap.
5. **Post-incident:** Full forensic analysis. Public post-mortem. Transparency report entry.

The protocol already handles key rotation (§13.2 of Protocol Reference) — this runbook uses the designed pathway.

### 9.3 Data breach response

- Incident confirmed within 4 hours of detection.
- Supervisory authority (Integritetsskyddsmyndigheten) notified within 72 hours per GDPR Article 33.
- Affected data subjects notified where high risk per Article 34.
- Public disclosure via status page and transparency report.

### 9.4 Post-mortem process

Every critical incident has a public post-mortem within 14 days. Blameless, technical, actionable. Published at `postmortems.anton.space` or equivalent.

---

## 10. Release process

### 10.1 Protocol version changes

Changes to the wire protocol follow versioning rules in Protocol Reference §12. Coordinating client and registry releases:

- **Patch version:** registry ships; clients can upgrade at leisure.
- **Minor version:** registry ships; client update strongly recommended.
- **Major version:** registry serves both old and new versions for minimum 180 days. Client update mandatory within that window.

### 10.2 Registry software releases

- **Semantic versioning** for the software (distinct from the protocol version).
- **Changelog** public.
- **Staging environment** for all non-patch releases. Minimum 7 days in staging.
- **Blue-green deployment** for production. Automated rollback on error rate spike.
- **Release announcements** via GitHub releases + status page.

### 10.3 Trust bundle releases

When a new operator key is added (rotation, new namespace operator):

- Trust bundle incremented.
- Signed by outgoing key (if rotation) or by bootstrap process (if new).
- Distributed via ANTON update channel.
- Overlap period: both old and new bundles valid for minimum 30 days.

---

## 11. Transparency report

Published annually. Covers the previous calendar year.

### 11.1 Contents

- Total registrations (new, active, revoked).
- Operations by type.
- STH publication record (missed publications with explanation).
- Abuse reports (received, by type, by severity, by outcome).
- Law enforcement requests (count by type, compliance, refusals).
- Data subject requests (count, types, response times).
- Incidents (count, types, summary).
- Legal/regulatory changes affecting operations.

### 11.2 Publication

- Published at `transparency.anton.space` or equivalent.
- Permanent, versioned. Old reports remain available.
- Format: markdown + PDF.

### 11.3 Aggregate-only

No identification of specific portals or users except where already public (e.g., a revoked portal remains in the public transparency log with its revocation reason).

---

## 12. Succession and continuity

### 12.1 The uncomfortable question

What if FutureChain AB ceases to operate?

Users of `futurechain` namespace would lose resolution service. Their portals become unreachable. This is a real risk and must be planned for.

### 12.2 Planned succession

v0.7.x plan:

1. **OSS codebase** — anyone can run a compatible registry.
2. **Transparency log is public** — all ownership history verifiable externally.
3. **Federation protocol** (v2.0) — enables namespace migration to a new operator.
4. **Succession trigger** — FutureChain publishes a signed "succession initiated" message if winding down, with:
   - Announcement of wind-down timeline.
   - Designated successor entity (if identified) or community-governance fallback.
   - Instructions for portal owners to migrate to alternative namespace.

### 12.3 Designated successor (post-launch decision)

Not required for v0.7.x but should be identified within 18 months of launch. Options:

- A peer organisation (another EU entity committed to open infrastructure).
- A community-governed non-profit.
- A multi-operator consortium.

Recommendation: defer the decision, but document it as a standing agenda item.

### 12.4 Bankruptcy / acquisition scenarios

Legal counsel advised structures:

- Registry infrastructure held separately from commercial IP where possible.
- Explicit provisions in ToS preventing privileged data sale.
- Operator identity key in escrow for succession purposes (to be structured carefully — this is its own ops design).

### 12.5 Community fallback

If no successor is designated before failure:

- Transparency log is fully replicable (anyone with a copy can prove ownership).
- OSS codebase allows any party to start a successor registry.
- Community-elected operator takes over, bootstrapped via public announcement + cryptographic transition.

This is a worst case, not a planned case. It's a backstop, not a strategy.

---

## 13. Cost model (informative)

Rough v0.7.x operational costs, for budget planning:

- **Infrastructure** (registry + replica + backups, Hetzner tier): €200–500/month.
- **HSM** (cloud HSM for operator key): €500–2000/month depending on provider.
- **Monitoring & alerting** (Grafana Cloud or self-hosted): €50–200/month.
- **Uptime monitoring external**: €20–100/month.
- **Legal** (privacy policy drafting, ongoing counsel, DPA reviews): €5,000–15,000/year.
- **Abuse pipeline staffing**: €0 in year 1 (Daniel personally), €50–100/hour × ~4 hours/week = €800–1600/month when hired.
- **Incident response reserve**: €5,000–10,000/year.

Total year 1: ~€20,000–40,000, heavily back-loaded as volume grows. Sustainable as part of FutureChain's budget.

---

## 14. Affected files (registry server codebase)

Not an ANTON-client-codebase file listing — the registry is its own repo.

- `server/src/api/*` — HTTP endpoint handlers.
- `server/src/protocol/*` — protocol validation (shared schemas with client).
- `server/src/db/*` — database layer.
- `server/src/log/*` — transparency log append + Merkle tree.
- `server/src/sth/*` — STH publication job.
- `server/src/abuse/*` — abuse pipeline services.
- `server/src/gdpr/*` — DSR handling.
- `server/src/monitoring/*` — metrics and health.
- `server/config/*` — deployment configuration.
- `docs/*` — operational docs, runbooks (public where appropriate).
- `deploy/*` — infrastructure as code (Terraform, Ansible, or equivalent).

---

## 15. Acceptance criteria

### 15.1 Functional

- [ ] All protocol operations implemented per Registry Protocol Reference.
- [ ] STH publication runs hourly without manual intervention.
- [ ] Transparency log integrity verifiable by external party.
- [ ] Abuse reports pipeline functional end-to-end.
- [ ] DSR workflow functional for all four GDPR right types.
- [ ] Backup and restore tested successfully.
- [ ] Failover primary → hot standby tested successfully.

### 15.2 Non-functional

- [ ] 99.9% uptime achieved over 90-day observation period pre-launch.
- [ ] p95 latency for `/resolve` under 100ms.
- [ ] p95 latency for `/operations` (register) under 500ms.
- [ ] STH publication within 5 minutes of schedule in 99% of cases.
- [ ] Horizontal scaling tested to 10x expected launch volume.

### 15.3 Legal

- [ ] Privacy policy published and reviewed by Swedish data protection lawyer.
- [ ] ToS published.
- [ ] AUP published.
- [ ] Data processing register documented (Article 30 GDPR).
- [ ] DPA templates ready for any sub-processors.
- [ ] Incident response plan tested (tabletop exercise).

### 15.4 Operational

- [ ] Monitoring dashboards functional.
- [ ] On-call rotation defined (even if 1-person in v0.7.x).
- [ ] Runbooks written for all critical and high-severity incident types.
- [ ] Status page live.
- [ ] Public transparency report template ready for year-end.

---

## 16. Open questions

1. **HSM provider.** AWS CloudHSM vs Azure Dedicated HSM vs dedicated hardware (YubiHSM fleet) — choose during procurement.
2. **On-call rotation.** Who covers nights/weekends before a dedicated ops team exists?
3. **Swedish data protection lawyer** — engagement needed before launch. Identify and engage.
4. **Designated successor** — decide within 18 months of launch. Placeholder process acceptable at launch.
5. **Public incident disclosure threshold** — what's the minimum severity for public disclosure vs internal-only? Current draft says "any critical incident." Refine.
6. **Community-monitored log watchdog** — who, specifically? Identify candidates.
7. **Registry reserved subdomains.** `status.anton.space`, `privacy.anton.space`, `transparency.anton.space`, `postmortems.anton.space` — confirm FutureChain owns the base domain and can issue these.

---

## 17. Glossary

| Term | Meaning |
|------|---------|
| **Registry** | The `anton.portals` service operated by FutureChain AB. |
| **Operator** | The entity running a registry. v0.7.x: FutureChain AB for `futurechain` namespace. |
| **STH** | Signed Tree Head. Hourly Merkle root commitment. |
| **HSM** | Hardware Security Module. Stores operator identity private key. |
| **DSR** | Data Subject Request (GDPR). |
| **DPA** | Data Processing Agreement. |
| **AUP** | Acceptable Use Policy. |
| **Dormancy** | 180 days after revocation during which a name cannot be re-registered. |
| **Trust bundle** | Signed collection of operator identity public keys distributed to clients. |
| **Succession trigger** | Signed message initiating registry handover to a successor. |

---

**End of Registry Server Ops Spec v1.0.0-draft.**

*Extend via numbered addenda (1.0.0-A1, etc.) for operational clarifications. Significant operational changes produce 1.1.0. This document is expected to evolve more actively than the protocol documents — operational reality changes faster than protocols should.*
