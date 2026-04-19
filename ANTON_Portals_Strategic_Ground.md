# ANTON Portals — Strategic Ground Document

**Purpose:** Pressure-test the load-bearing decisions for the three companion reference documents (Registry Protocol, Capability Descriptor Schema, Registry Server Ops) *before* drafting them. This document identifies the decisions that constrain everything downstream, proposes positions, and flags what needs Daniel's personal call.

**Status:** Pre-draft strategic thinking. Nothing here is locked until Daniel signs off.

---

## Part 1 — The three cross-cutting decisions

Three decisions span all three documents. Each must be resolved before any reference document is drafted, because each reshapes what the others look like.

### 1.1 Federation from day one vs. retrofit later

**The question:** Do we design the registry protocol to support multiple federated operators from v0.7.x, while running single-operator in practice? Or do we design single-operator and retrofit federation later?

**Why it matters:** Every protocol decision — how signatures are scoped, how namespaces are trusted, how cross-namespace resolution works — depends on this. Retrofitting federation into a protocol that wasn't designed for it is one of the hardest things in distributed systems. Every major non-federated service that later tried to federate (think: every social network) either failed or became deeply compromised trying.

**What "federation-ready but not federated" means:**
- Every signed operation includes the namespace explicitly (`futurechain`, future `mistral`, future `sovereignEU`).
- Every resolution response declares which registry is authoritative for that namespace.
- Signatures are scoped to namespace + registry operator identity.
- The protocol supports "registry A federating a trust relationship with registry B" as a later add-on without breaking v1 clients.
- But in v0.7.x, only `futurechain` namespace exists and only FutureChain operates a registry.

**Cost of federation-ready design:** Moderately more complex schema (a few extra fields per operation). Longer initial spec. Slightly more code.

**Cost of retrofit later:** Potentially catastrophic. Every existing registration's signature scope has to change. Every client has to upgrade with breaking changes. Trust relationships between registries have no foundation.

**Recommendation:** **Federation-ready from day one.** This is a one-way door. The Apache 2.0 ethos of ANTON, the already-established `<name>.<namespace>.portal` addressing schema, and the realistic roadmap (Mistral partnership, sovereignEU concept) all point the same direction. The cost difference is small now and enormous later.

**What this specifically means for each document:**
- Registry Protocol: every operation signed with explicit namespace binding, registry-operator identity public keys are first-class, cross-namespace resolution is defined (even if there's only one namespace at launch).
- Capability Descriptor: no change — descriptors are already scoped to the portal, which is scoped to the namespace.
- Registry Server Ops: operator identity is a published entity with its own key pair, abuse/coordination protocols between future operators are defined abstractly.

---

### 1.2 Transparency log vs. trust the registry operator

**The question:** Does the registry publish an append-only, publicly-verifiable log of all operations, or do users trust FutureChain to be honest?

**Why it matters:** Without a transparency log, the registry operator is technically capable of rewriting history. They could silently change who owns a name, silently revoke registrations, silently add fake entries. In practice FutureChain won't do this. But "in practice our operator is honest" is a terrible security story, and it's especially terrible for a platform that's supposed to be open-source, Apache-2.0, decentralisation-friendly, and a credible alternative to Big Tech opaque infrastructure.

**What a transparency log looks like:**
- Append-only log of every signed operation (register / update / transfer / revoke).
- Merkle tree computed over the log.
- Merkle root published at regular intervals (e.g. every hour) signed by the registry operator.
- Third parties can download the log and independently verify any claim about who owns what.
- Clients can request inclusion proofs — "prove this registration is in the log at position N."
- Inspired by Certificate Transparency (the system that makes the Web PKI somewhat auditable).

**What the transparency log protects against:**
- Silent rewriting of ownership records.
- Censorship (delisting) without public record.
- Operator collusion with attackers.
- Registry operator being compromised (log makes breach detection possible).

**What it doesn't protect against:**
- Denial of service (operator refuses to process valid operations).
- Collusion at registration time (operator colludes with attacker to register names that should be reserved).
- Operator going dark entirely.

**Cost:** Real but not large. Transparency log is a well-understood pattern. Certificate Transparency libraries exist in most languages. Adds disk space (linear in operation count), some CPU (hash computations), and a published endpoint for log access.

**Recommendation:** **Ship with transparency log from day one.** Same reasoning as federation — this is foundational. Without it, the ANTON story ("we're the decentralised, trustworthy alternative") is compromised. With it, the story becomes genuinely true. This is also crucial for the federation future — federated registries can mutually audit each other using the same transparency log mechanism.

**Openness bonus:** The transparency log becomes a public dataset. Anyone can analyse portal registrations, growth, category trends, revocation patterns. This is pro-ecosystem.

---

### 1.3 Hard key loss vs. social recovery

**The question:** If a user loses their private key, do they lose their portal forever, or is there a recovery mechanism?

**Why it matters:** Most users will lose their keys eventually. Hardware fails, phones get stolen, passphrases get forgotten, family members inherit devices without credentials. The crypto industry has painfully learned that "your keys, your responsibility" is a terrible user experience that kills adoption outside of niche technical users.

**The hard tension:**
- **Hard loss is cryptographically clean.** The key is the identity. No backdoor. No way to impersonate. Matches Bitcoin-style philosophy.
- **Social recovery is user-friendly but introduces trust assumptions.** A set of designated recovery contacts can collectively sign a key rotation. The owner identity is no longer purely their key — it's "their key OR a quorum of their declared recovery contacts."

**Options:**

**Option A: Hard loss only.** Lose your key, lose your portal. Clear, simple, honest. But this will bite users hard and is bad for mainstream adoption.

**Option B: Social recovery via designated contacts.** Owner pre-declares 3–5 ANTON contacts. Quorum (e.g. 3 of 5) can collectively sign a new key for the portal. Recovery contacts can be added/removed by owner at any time. The recovery event is logged in the transparency log so everyone knows.

**Option C: Registry-escrow recovery.** The registry holds an encrypted backup key that it releases after an out-of-band identity verification. This is basically how web services handle "forgot password." But it makes the registry into a custodian, which undermines the whole decentralisation story.

**Option D: Time-delayed recovery.** Anyone can claim an abandoned name, but the real owner has a long time (e.g. 90 days) to counter-sign and block the claim. Works for active users, fails silently for dormant ones.

**Recommendation:** **Design the protocol to support Option B (social recovery) as opt-in, ship v0.7.x with Option A as default + clear communication + mandatory key backup flow.**

This lets us:
- Ship simple (Option A) in v0.7.x.
- Avoid the social-recovery complexity in the first protocol version.
- Reserve protocol fields (`recovery_contacts`, `recovery_quorum`, `recovery_operation`) so social recovery can be added in v1.1 without breaking changes.
- Be honest with users: "back up your keys, there is no recovery today."

Mandatory key backup means: during portal registration, the ANTON client forces the user through a backup flow — encrypted backup to a chosen location, written passphrase, printable recovery card, whatever. User has to complete it before the portal goes live.

**Option C is specifically rejected** — it turns FutureChain into a custodian, which contradicts the decentralisation story and creates regulatory exposure (custody of cryptographic assets is a regulated activity in some jurisdictions).

---

## Part 2 — Registry Protocol Reference: load-bearing decisions

Given the three cross-cutting calls above, here are the specific decisions that define the registry protocol.

### 2.1 Signature and canonicalisation

**Decision:** Ed25519 signatures over RFC 8785 canonical JSON. Detached signatures.

**Rationale:** Ed25519 is already the AAP identity primitive — reuse, don't reinvent. RFC 8785 (JSON Canonicalization Scheme) is a real standard with reference implementations; avoids the trap of hand-rolled canonicalisation which is a classic source of bugs. Detached signatures keep the signed payload human-readable.

**Alternative considered:** CBOR with COSE signatures. Better for bandwidth and signing, worse for debuggability and human review. Trade-off favors JSON for this use case — registry operations are low-volume and being debuggable matters more than being compact.

### 2.2 Operation envelope

Every registry operation carries:

```json
{
  "schemaVersion": "registry-1.0.0",
  "operation": "register",
  "namespace": "futurechain",
  "registryOperator": "ANTON-REG-FUTURECHAIN-V1",
  "timestamp": "2026-09-01T12:00:00.000Z",
  "nonce": "random-128-bit-hex",
  "actor": {
    "contactHash": "ANTON-XXXX-XXXX-XXXX-XXXX",
    "publicKey": "ed25519-public-key-base64"
  },
  "payload": { /* operation-specific */ },
  "priorOperationId": null
}
```

Signed (detached) with the actor's Ed25519 key over the canonical JSON of this envelope.

The `priorOperationId` creates a chain per-portal: every operation references the previous operation's transparency-log ID. This gives ordering guarantees and makes out-of-order replay impossible.

**Replay protection:** Three layers. (1) Timestamp with ±5 minute window. (2) Random nonce, registry rejects duplicates. (3) Per-portal operation chain via `priorOperationId`.

### 2.3 Operation types (v1)

Minimum viable operation set:

- `register` — claim a new name. Actor must not already own 5+ registrations (soft limit, configurable).
- `update_metadata` — change title, description, category, public_index flag.
- `update_capability_summary` — update the flattened capability summary used for discovery.
- `rotate_key` — rotate the actor's public key (v0.7.x: requires current key signature; v1.1+: optional social recovery quorum).
- `transfer` — transfer name to new contact_hash. Requires two signatures (current owner + new owner), both must be valid Ed25519 signatures over the same envelope.
- `revoke` — permanent revocation, signed by current owner. Revoked names enter a 180-day dormancy before becoming available again (prevents impersonation chain attacks).
- `heartbeat` — signed claim that the portal is active. Updates `last_seen_at`. Rate-limited (max one per hour).

**Out of scope for v1:** Namespace creation, registry operator trust relationships, cross-registry queries. These are v2 federation operations.

### 2.4 Namespace semantics

Namespaces are controlled by registry operators. In v0.7.x:

- `futurechain` namespace is operated by FutureChain AB.
- `anton.*` names (including `anton.portal`, `anton.portals`, `anton.help`) are reserved globally across all future namespaces.
- Common names (`admin`, `support`, `www`, `root`, `api`) are reserved per-namespace at the registry operator's discretion.

A v2 federation event will define:
- How namespaces are created (the "gTLD-equivalent" moment).
- How a registry operator publishes their operator identity.
- How registries establish mutual trust (mutual key attestations, governance body, or a permissionless discovery mechanism — TBD).

### 2.5 Homoglyph and confusable protection

Mandatory. Non-negotiable.

- All names normalized per Unicode IDNA 2008.
- Confusable-character detection using Unicode UTS #39.
- Registry rejects registrations that are confusable with:
  - Any existing active registration.
  - Any reserved name.
  - Any recently-revoked name (within the 180-day dormancy window).
- Confusable-detection data is a configurable block-list maintained by registry operator.

### 2.6 Transparency log integration

Every successful operation is appended to the log. Each log entry is:

```json
{
  "logId": "monotonic-sequence-number",
  "timestamp": "server-timestamp",
  "operation": { /* the full signed operation envelope */ },
  "registrySignature": "ed25519-signature-base64"
}
```

Merkle root is computed over the log and signed by the registry operator's identity key every hour. Roots published at a well-known endpoint. Clients can download ranges of the log and verify inclusion proofs.

The log is **append-only with public read access**. Registry operator cannot delete entries. Deletion-style operations (`revoke`) are separate log entries, not mutations of prior entries.

### 2.7 Rate limits (protocol level, not policy level)

Protocol declares rate limits that clients must respect. Registry enforces them:

- Registrations per actor: 5 per 24 hours (burst), 20 per 30 days (sustained).
- Updates per portal: 20 per 24 hours.
- Heartbeats per portal: 24 per 24 hours.
- Transfers per name: 3 per 30 days (prevents rapid-transfer attacks).
- Resolutions per client IP: 10,000 per hour (generous; resolution is cheap).
- Search per client IP: 1,000 per hour.

Exceeded: HTTP 429 with retry-after.

### 2.8 Protocol versioning

Every envelope declares `schemaVersion`. Compatibility rules:

- Additive changes (new optional fields): minor version bump (`1.0.0` → `1.1.0`). All v1.x clients accept v1.y responses.
- Breaking changes: major version bump (`1.0.0` → `2.0.0`). Registry supports both versions during a transition period (minimum 180 days overlap).
- Operation type additions: minor version. Clients that don't recognize an operation type in the log can skip it.

### 2.9 What the document needs to produce

The Registry Protocol Reference document must deliver:

- Every operation type with full payload schema.
- Canonical JSON serialisation rules (reference RFC 8785, specify field ordering and escape conventions).
- Signature format (Ed25519 detached, base64url encoding).
- Transparency log structure, Merkle tree computation, inclusion proof format.
- Rate limit specification.
- Reserved name list.
- Homoglyph block-list maintenance process.
- HTTP API endpoints (exact URLs, methods, status codes).
- Client library guidance.
- Migration strategy for v1 → v2.

---

## Part 3 — Capability Descriptor Schema Reference: load-bearing decisions

### 3.1 The capability taxonomy is the big decision

This is the hardest single decision in the whole portal system. The capability vocabulary determines what portals can do, what Pathfinder can search for, what The Beehive can orchestrate over, what the Marketplace can sell. A bad taxonomy becomes a permanent ceiling.

**The proposed core vocabulary (v1, to pressure-test):**

| Verb | Meaning | Example use |
|------|---------|-------------|
| `contact` | Send a message to a human or agent | "Message Daniel about consulting" |
| `inquire` | Ask a structured question, expect a response | "Is your catering available 15 March?" |
| `request` | Request a structured service | "Book a gap analysis for our company" |
| `order` | Place a commercial order | "Order catering for 50 people" |
| `book` | Reserve time or capacity | "Book Court 3 from 18:00-20:00 Saturday" |
| `subscribe` | Opt into receiving updates | "Notify me when this team posts results" |
| `join` | Request membership | "Apply to join the running club" |
| `query` | Portal answers structured queries | "What's the next match time?" |
| `publish` | Portal makes content discoverable | "What posts has this portal published this month?" |
| `delegate` | Accept task delegation from another ANTON (Layer 4) | "I delegate scheduling for this meeting to your ANTON" |
| `authenticate` | Verify an identity claim | "Confirm this person is a member of your organisation" |

Each verb has:
- Standard input/output shape (JSON Schema baseline).
- Payment coupling (`order` requires a payment method reference; others are free by default).
- Policy defaults (response time SLA, data retention hints).
- Trust level (some verbs are low-trust like `contact`; `delegate` is high-trust and requires additional signatures).

**Escape hatch:** `custom` verb with user-defined input/output schemas. Custom capabilities are less discoverable by Pathfinder (free-text search only) but fully functional.

**Alternative considered: no core taxonomy, all capabilities are custom.** Rejected. Without a standard vocabulary, Pathfinder search becomes impossible (or reduces to full-text over descriptions), Beehive orchestration has no common ground, and marketplace integration breaks. The cost of picking a taxonomy now is small; the cost of not having one is massive.

**Alternative considered: adopt an existing vocabulary (Schema.org, microformats, ActivityStreams).** Considered seriously. Schema.org is closest but designed for web pages, not agent interactions. ActivityStreams is verb-oriented but social-network-shaped. None fit agent-to-agent commerce cleanly. Recommendation: **take inspiration from Schema.org for the discovery metadata** (tags, categories, service areas) but define our own action vocabulary.

### 3.2 Schema evolution

- `schemaVersion` declared per descriptor.
- Additive changes = minor version. Clients ignore unknown fields.
- Breaking changes = major version. Multi-version support in the client.
- Descriptor cache TTL: 24 hours default, respected by all clients. Portal can publish updated descriptor anytime.

### 3.3 Signing

- Descriptor signed by portal's Ed25519 key (same key bound to registry registration).
- Signature detached, over canonical JSON of the descriptor (same RFC 8785 scheme).
- Visitor's ANTON verifies signature against public key fetched from registry.
- Descriptor includes its own `validFrom` and `validUntil` timestamps; expired descriptors are rejected.

### 3.4 Payment integration

This is where FutureChain coupling matters.

**Decision needed from Daniel:** What's the concrete shape of FutureChain payment identifiers?

Proposed loose coupling:

```json
"paymentMethods": [
  {
    "rail": "futurechain",
    "type": "stablecoin",
    "currency": "USDC",
    "settlement": "instant"
  },
  {
    "rail": "futurechain",
    "type": "invoice",
    "currency": "EUR",
    "settlement": "net-30"
  },
  {
    "rail": "external",
    "type": "offline",
    "note": "Bank transfer after phone confirmation"
  }
]
```

The `rail: "futurechain"` cases route through FutureChain infrastructure. The `rail: "external"` cases are human-mediated (portal owner handles it out-of-band).

**What I don't know yet:** whether FutureChain will have multiple settlement modes (instant stablecoin vs net-30 invoice vs escrow), what the fee structure looks like, whether there's a custody/non-custody distinction that needs to be declared. These gaps need FutureChain's own spec to resolve.

**For now the schema supports extensibility** — the payment methods section is an array of objects with required `rail` and `type` fields and free-form additional fields.

### 3.5 Availability / scheduling semantics

Start simple:

```json
"availability": {
  "hoursOfOperation": {
    "mon": [{"open": "09:00", "close": "17:00"}],
    "tue": [{"open": "09:00", "close": "17:00"}],
    "wed": [],
    "thu": [{"open": "09:00", "close": "17:00"}],
    "fri": [{"open": "09:00", "close": "15:00"}],
    "sat": [],
    "sun": []
  },
  "timezone": "Europe/Stockholm",
  "leadTimeDays": 7,
  "bookingHorizonDays": 180,
  "unavailableDates": ["2026-12-24", "2026-12-25"]
}
```

Rich calendar integration (RRULE, multi-capacity booking, etc.) is deferred to v1.1+.

### 3.6 Policies — machine-readable

Every descriptor must declare policies in both human (URL) and machine-readable forms:

```json
"policies": {
  "terms": {
    "url": "pages/terms.html",
    "structured": {
      "jurisdiction": "SE",
      "governingLaw": "Swedish Contract Law 1915:218",
      "disputeResolution": "Swedish courts"
    }
  },
  "privacy": {
    "url": "pages/privacy.html",
    "structured": {
      "controller": "Local Catering AB (559123-4567)",
      "dataRetentionDays": {
        "order": 2555,
        "inquiry": 365,
        "marketing": 0
      },
      "lawfulBasis": ["contract", "legitimate_interest"],
      "transfersOutsideEEA": false
    }
  },
  "dataMinimisation": {
    "inputsCollected": ["name", "email", "event_date", "guest_count"],
    "inputsOptional": ["dietary_requirements"]
  }
}
```

This is what lets a visitor's ANTON say "my user has a policy against 5+ year retention; this portal's order retention is 7 years; flag this before proceeding." Agent-side policy enforcement is a real feature, not theoretical.

### 3.7 Trust and provenance

Descriptors can declare (not prove) trust attestations:

```json
"attestations": [
  {
    "type": "business_registration",
    "issuer": "bolagsverket.se",
    "reference": "559123-4567",
    "note": "Unverified self-declaration"
  },
  {
    "type": "certified_by",
    "issuer": "openEXPERT-marketplace",
    "reference": "cert-2026-12345",
    "signature": "..."
  }
]
```

For v0.7.x, attestations are self-declared (no third-party verification infrastructure). A future Certified Badge / Verified Business layer can add cryptographic attestations signed by trusted issuers (Marketplace cert, Companion App Gateway identity verification, etc.).

### 3.8 What the document needs to produce

- Full JSON Schema for v1 descriptor.
- Every core capability verb with input/output schema examples.
- Payment method vocabulary.
- Policy structure (terms, privacy, data minimisation).
- Availability semantics.
- Attestation types.
- Canonical serialisation and signing rules.
- Cache TTL conventions.
- Migration strategy for schema evolution.

---

## Part 4 — Registry Server Ops Spec: load-bearing decisions

### 4.1 Open source from day one

**Decision:** Registry server software is Apache 2.0 open source. Published on GitHub alongside ANTON core.

**Rationale:** Three reasons. (1) Consistency with the rest of ANTON. (2) Makes federation viable — future operators can spin up compatible registries from the same code. (3) Makes FutureChain's operator role legitimate rather than rent-seeking: anyone could run a registry; FutureChain happens to run the main one and is committed to the open protocol.

**Ops implications:** No proprietary value in the server code. FutureChain's competitive position is in operating the service well, not in the software. This matches the Red Hat model and is the right strategic call for ANTON.

### 4.2 Uptime target

**Decision:** 99.9% target SLO for v0.7.x. Single-region deployment. Multi-region redundancy deferred.

**Math:** 99.9% = ~43 minutes downtime per month. Achievable on a properly-run single VPS with monitoring, reasonable backups, and automated recovery. 99.99% requires multi-region and real SRE staffing — not budget-appropriate for v0.7.x.

**Mitigation of registry downtime:** Clients cache resolutions (see 4.3). Brief registry outages don't break portal access for names already cached. Only new resolutions and operations (register, update) fail during an outage.

### 4.3 Caching strategy

**Decision:** Aggressive client-side caching with registry-dictated TTLs.

- Default resolution cache TTL: 6 hours.
- Recently-updated records: 5 minutes (registry sets this on response).
- Negative cache (name not found): 5 minutes.
- Transparency log: append-only, clients can cache indefinitely up to last-known root.

Benefits: Dramatically reduces registry load. Makes brief outages invisible for cached names. Shifts the registry from "hot path" to "lookup path that runs hourly."

Costs: Revocations and updates propagate slowly. Acceptable for v0.7.x; high-urgency revocation can use shorter TTL or a separate revocation-announcement channel in v1.1.

### 4.4 Abuse pipeline

**The real ops workload.** Budget for it.

**Report types:**
- Impersonation (claiming to be someone else).
- Illegal content (CSAM, incitement, etc.).
- Trademark violation.
- Spam / squatting at scale.
- Protocol abuse (technical misuse of the registry).

**Workflow:**
1. Anyone with an ANTON can submit a signed abuse report.
2. Reports enter a queue with severity classification.
3. High-severity (illegal content, clear impersonation) — reviewed within 48 hours.
4. Low-severity (spam, possible squatting) — reviewed within 7 days.
5. Review outcomes: dismissed / warning / temporary suspension / permanent revocation.
6. All actions logged to transparency log. Appeals accepted within 30 days.

**Report quality control:**
- Reporter contact hash tracked; high-quality reporters (reports that lead to action) gain reputation; abusive reporters (many dismissed reports) face cooldown.
- No anonymous reports in v0.7.x; this simplifies trust-building and prevents harassment.
- Rate limit: max 10 reports per reporter per 7 days.

**Staffing:** v0.7.x will need a human to run the queue. Budget this — it's not a solved-with-code problem. Part-time (few hours a week) is realistic for the first year at expected scale.

### 4.5 GDPR and legal

**Registry operator = data controller** for registry metadata (name, contact_hash, public_key, optional portal metadata, last_seen_at). For EU users this triggers GDPR.

**Required:**
- Privacy policy published before launch, naming FutureChain AB as controller.
- Data subject rights implementable: access (return the user's full registration and operation log), portability (registration is already an exportable signed payload), erasure (equivalent to `revoke` operation + log retention under legitimate-interest basis for security/audit purposes).
- Data minimisation: registry stores only what's operationally required.
- Cross-border transfers: if registry infrastructure is outside EEA, standard contractual clauses needed. Recommend EU-region hosting for launch to avoid this.

**For commercial portal operators:** they are controllers of their own portal data. Registry is not responsible for what happens inside a portal — that's between portal owner and visitors. Analogous to a DNS registry not being responsible for website content.

**Legal entity:** FutureChain AB is operator. ToS, AUP, privacy policy all published on FutureChain domain. DSAR contact published. Swedish jurisdiction for registry operations.

### 4.6 Monitoring and incident response

Standard OSS stack:
- Prometheus + Grafana for metrics.
- Loki or similar for logs.
- Alerting to operator on-call (Slack/SMS/whatever FutureChain uses).
- Uptime monitoring from multiple external points.
- Transparency log publishing monitored — if the Merkle root stops publishing, users notice. This is a feature, not a bug.

Incident response:
- Security incidents (registry compromise, key leak): pre-defined runbook, immediate community notification via transparency log anomaly + public announcement.
- Operational incidents (downtime): status page, ETA updates.
- Legal incidents (court order, LEA request): pre-defined legal response process, transparency report published annually.

### 4.7 Deprecation / continuity

**The uncomfortable question:** What if FutureChain shuts down?

**Answer (already baked in):**
1. Registry software is OSS (4.1). Anyone can take over.
2. Transparency log is public. Ownership history is verifiable by anyone.
3. Federation protocol (v2) supports name migration to another operator.
4. Contingency: FutureChain publishes a "succession trigger" signed message if shutting down, allowing a pre-designated successor or community-elected operator to take over. This is documented but unused in v0.7.x.

This is not theoretical — Daniel being a good steward doesn't mean FutureChain AB will exist forever. Design for graceful exit from day one.

### 4.8 What the document needs to produce

- Deployment architecture (VPS specs, software stack, database migrations).
- Backup and recovery procedures.
- Monitoring stack definition.
- Abuse pipeline workflow and staffing plan.
- Legal documentation checklist (ToS, AUP, privacy policy, DSAR process).
- Incident response runbooks.
- Release process for registry software updates.
- Transparency report template (annual).
- Succession / continuity plan.

---

## Part 5 — Decisions Daniel needs to make before drafting

Resolve these, then the reference documents can be drafted cleanly.

### 5.1 Cross-cutting (all three docs depend on these)

1. **Federation-ready from day one?** Recommendation: **yes.** Small cost now, catastrophic cost later.
2. **Transparency log from day one?** Recommendation: **yes.** Foundational to the trust story.
3. **Key recovery model?** Recommendation: **hard loss in v0.7.x, protocol reserves fields for social recovery in v1.1+.**

### 5.2 Registry Protocol Reference

4. **Default-namespace branding.** Is it literally `futurechain` or neutral `anton` (with FutureChain merely operating it)? Recommendation: **`futurechain`** — honest about operator, creates space for other namespaces to emerge with their own identity.
5. **Reserved name list scope.** Beyond `anton.*`, what else is globally reserved? Recommendation: start with `anton.*`, `root`, `admin`, `support`, `www`, `api`, `system`, `test`. Grow by policy.
6. **Soft cap on registrations per actor.** Recommendation: 5 active, increase via application + review. Prevents squatting without being user-hostile.

### 5.3 Capability Descriptor Schema Reference

7. **The capability taxonomy.** Sign off on the 11 core verbs (`contact`, `inquire`, `request`, `order`, `book`, `subscribe`, `join`, `query`, `publish`, `delegate`, `authenticate`) plus `custom` escape hatch? Anything missing? Recommendation: ship with 11, plus a clear process for proposing new verbs.
8. **Payment method vocabulary.** Needs a FutureChain spec input — what rails/types will FutureChain support at v0.7.x go-live? Can Daniel reach the FutureChain team or scope this himself?
9. **Attestation model.** Self-declared only in v0.7.x? Or should Companion App Gateway identity verification feed into verified portals from day one? Recommendation: self-declared only in v1, structured attestation framework with reserved fields for v1.1 third-party issuer integration.

### 5.4 Registry Server Ops Spec

10. **Hosting region.** EU (to avoid cross-border transfer complexity for EU users) or non-EU? Recommendation: **EU** (Frankfurt, Stockholm, or Amsterdam). GDPR-friendly by default.
11. **Abuse pipeline staffing.** Who reviews reports in v0.7.x? Daniel personally? Outsourced? This is a real ops commitment, not a code problem.
12. **Succession planning.** Is there a pre-designated successor entity or is it "community elects one if needed"? Not urgent to resolve now but should be documented.

### 5.5 Product/strategic

13. **Marketing positioning.** Is this positioned as "the decentralised web of agents" (technical/ideological) or "the ANTON portal network" (product-forward)? The reference documents read differently under each framing. Recommendation: **product-forward externally, technically rigorous internally**. Reference docs lean technical; marketing leans product.
14. **Pathfinder integration priority.** Default-enabled for all users, or opt-in with a "discover portals" promotion? Recommendation: **default-enabled but clearly labelled**, so existing Pathfinder users see portal results alongside web and docs without surprise.
15. **School pillar portal template.** Add "Classroom" / "Teacher" template to the v0.7.x ship set or defer? Recommendation: **add** — school pillar is already core, and humanitarian/education positioning benefits from shipping together.

---

## Part 6 — Recommendation summary for quick scan

If Daniel is time-constrained, the minimum set of decisions:

**Lock in:**
- Federation-ready protocol design, single-operator in v0.7.x.
- Transparency log from day one.
- Hard key loss + mandatory backup UX in v0.7.x, protocol reserves social recovery fields for later.
- Registry server is Apache 2.0 OSS.
- EU hosting for registry.
- 11 core capability verbs + `custom` escape hatch.
- 99.9% uptime target, aggressive client caching to mitigate outages.

**Need Daniel's personal input:**
- FutureChain payment method vocabulary (or Daniel's best-guess placeholder we can iterate on).
- Abuse pipeline staffing commitment.
- Default-namespace branding (`futurechain` vs `anton`).
- School template inclusion in v0.7.x.

**Can be deferred to draft stage:**
- Exact rate limit numbers.
- Reserved name list scope.
- Attestation type enumeration.

---

## Part 7 — What the drafting cadence should look like

Once the above is resolved, suggested order:

1. **Registry Protocol Reference** first. It's the foundational document — everything else references it. Draft, review, lock.
2. **Capability Descriptor Schema Reference** second. Depends on the signing model from the protocol doc.
3. **Registry Server Ops Spec** third. Depends on both above.

All three should be versioned documents with numbered addenda, matching Daniel's preferred spec format. All three should include investigation-first protocols for when implementation begins (same pattern as the main portal spec).

All three documents should be roughly 6,000–12,000 words each. The protocol reference is the longest and most technical. The ops spec is the most operational and least cryptographic.

Each document should end with an "open questions" section matching the pattern of the main portal spec, so Daniel can track unresolved items across addenda.

---

## Appendix A — Cross-document consistency checklist

When drafting, ensure these invariants hold across all three documents:

- [ ] Every signed operation uses the same signature scheme (Ed25519 over RFC 8785 canonical JSON).
- [ ] Every namespace reference is explicit and namespaced (`futurechain`, not implicit).
- [ ] Every payload with a timestamp uses ISO 8601 UTC.
- [ ] Every version declaration uses semver.
- [ ] Every HTTP endpoint returns standard status codes with documented error shapes.
- [ ] Every operation is transparency-log-eligible (or explicitly declared not-logged and why).
- [ ] Every client-caching rule is consistent (TTL semantics, negative caching).
- [ ] Every GDPR-touching field is called out in the privacy analysis.
- [ ] No hand-rolled cryptography; reuse primitives already in ANTON (from `identity.ts` and AAP).

---

## Appendix B — What this document is NOT

- Not a draft of the reference documents. Drafting begins after Daniel signs off on decisions.
- Not a complete protocol. Many details (exact field names, exact error codes, exact JSON shapes) are pending and will emerge during drafting.
- Not binding. Every recommendation is open to pushback.
- Not a sales pitch. This is an honest assessment of the hard decisions and their trade-offs.

---

**End of strategic ground document.**

*Version 0.1 — Pre-draft strategic thinking for portal reference documents. Extend via numbered addenda rather than rewriting. Claude Code should not act on this document — it is input to Daniel's decisions, not instructions to build.*
