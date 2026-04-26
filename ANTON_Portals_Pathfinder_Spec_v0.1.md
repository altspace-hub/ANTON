# ANTON Portals, Pathfinder, and the Unified Public Surface

**Spec version:** 0.1 (strategic / architecture)
**Author:** Claude (strategic thinking partner), for Daniel Bardun
**Target delivery:** v0.7.0 build batch
**Prerequisite builds:** v0.6.0 (ANTON Missions, Beehive foundations, Talent Discovery specs, Output Formats, AAP wire-format v0.1)

---

## 1. Executive Summary

The current six-layer vision (Individual → Intelligent → Network → Collaborative Intelligence → Marketplace → Economy) has been mapped to a set of conceptually distinct features: Beehive, Marketplace, Talent Discovery, ANTON Missions, FutureChain payments. These have been specified as separate build streams.

**Claim of this spec:** Portals are the unified form factor for everything public-facing. Beehive, Marketplace, and the new Recruitment/Candidate offerings are **portal types**, not standalone products. Pathfinder is the single public discovery surface. This is a simplification, not an expansion — it collapses 3+ parallel "identity / trust / discovery / payment" builds into one.

One substrate: `.anton/portal.json` manifest + AAP + Pathfinder + FutureChain.

---

## 2. Investigation-First Protocol (for Claude Code)

Before writing any code, Claude Code must audit the existing codebase:

```bash
# .anton bundle format (17 existing types)
grep -r "bundle_type" server/ --include="*.ts"
grep -r "BundleType" server/ --include="*.ts"
view server/services/anton-bundler.ts
view server/services/antonImport.ts
view server/services/antonExport.ts

# AAP scaffolding (if present from v0.6.0)
grep -rn "AAP\|agent-protocol\|aap" server/ --include="*.ts"
find . -name "*aap*" -type f
find . -name "*agent-protocol*" -type f

# Identity layer (from v0.6.0 Companion App Gateway)
view server/services/identity.ts

# Existing Talent Discovery spec implementation status
find . -path ./node_modules -prune -o -name "*talent*" -print
find . -path ./node_modules -prune -o -name "*recruitment*" -print
grep -rn "aspiration" server/ --include="*.ts"

# Pathfinder (if referenced anywhere yet)
grep -rn "Pathfinder\|pathfinder" .

# Marketplace scaffolding
grep -rn "marketplace" server/ --include="*.ts"

# Existing public-surface code (what can we reuse vs replace?)
find server/routes -type f -name "*.ts" | head -50
```

If AAP is not yet built, AAP v0.1 wire format becomes the FIRST build in this sequence before any portal work.

---

## 3. Architectural Model

### 3.1 The Portal

A **portal** is a publicly-discoverable ANTON instance. Every portal has:

| Primitive | Description |
|---|---|
| **Manifest** | `.anton/portal.json` — signed, typed, declares identity, capabilities, AAP endpoints |
| **AAP endpoint** | P2P interaction surface (inherits from AAP v0.1 spec) |
| **Identity** | Ed25519 keypair + contact hash format `ANTON-XXXX-XXXX-XXXX-XXXX` |
| **Trust surface** | Attestations received, completion records, Quality Ratchet signals (opt-in publication) |
| **Specialisation** | Declared portal type(s): `company`, `recruitment`, `candidate`, `marketplace`, `service`, `community`, `beehive-host` |

### 3.2 Portal Types (v0.7.0 scope)

| Type | Purpose | Reuses |
|---|---|---|
| `company` | Organisation presents itself publicly; can host a Beehive | ANTON platform + manifest |
| `recruitment` | Employer-side hiring (job ads, applications, audit trail) | Talent Discovery spec (existing) |
| `candidate` | Individual-side career profile, portable | `.anton` career-profile bundle (existing spec) |
| `marketplace` | Lists/sells `.anton` bundles | FutureChain payment rail (planned) |
| `service` | Offers a specific service (e.g., AML review, code review) via AAP | ANTON Missions Action Layer |
| `community` | Discussion / shared knowledge around a topic | Workflow + Collaborative Canvas |
| `beehive-host` | Runs cross-portal Beehive sessions | Beehive spec (v0.6.0) |

A single portal can combine types (a consultancy might be `company + service + recruitment`).

### 3.3 `.anton/portal.json` Schema (v0.1 draft)

```json
{
  "bundle_type": "portal-manifest",
  "spec_version": "0.1",
  "portal_id": "ANTON-XXXX-XXXX-XXXX-XXXX",
  "display_name": "Advisense FCP",
  "description": "Nordic financial crime prevention consultancy",
  "portal_types": ["company", "service", "recruitment"],
  "identity": {
    "ed25519_public_key": "base64...",
    "signed_at": "2026-04-21T08:00:00Z",
    "signature": "base64..."
  },
  "endpoints": {
    "aap_primary": "https://portal.advisense.com/aap",
    "aap_federated": ["..."],
    "web": "https://portal.advisense.com"
  },
  "capabilities": {
    "modules_offered": ["fcp-gap-analysis", "amlr-data-readiness", "..."],
    "service_areas": ["aml", "sanctions", "cdd"],
    "anton_bundle_types_accepted": ["career-profile", "..."],
    "jurisdictions": ["SE", "NO", "DK", "FI", "EU"],
    "languages": ["en", "sv"]
  },
  "trust": {
    "public_attestations": "https://portal.advisense.com/aap/attestations",
    "quality_publication_scope": ["fcp-gap-analysis"],
    "verified_identity": false
  },
  "economics": {
    "futurechain_address": "...",
    "accepts_payment": true,
    "free_tier_available": true
  },
  "listings": {
    "jobs_endpoint": "https://portal.advisense.com/aap/jobs",
    "marketplace_endpoint": null,
    "services_endpoint": "https://portal.advisense.com/aap/services"
  }
}
```

Extend `anton-bundler.ts` to support bundle type #18 (`portal-manifest`). Same import/export pattern as existing 17 types.

### 3.4 AAP as the Only Cross-Portal Protocol

Every cross-portal interaction is AAP:
- Pathfinder query for capabilities → AAP
- Candidate applying for a job → AAP
- Marketplace bundle purchase → AAP + FutureChain
- Beehive session initiation → AAP
- Trust attestations → AAP-signed messages

No parallel HTTP API. No REST alternative. AAP is non-negotiable (per existing architecture decision).

---

## 4. Pathfinder Design

### 4.1 What Pathfinder Is Not

Pathfinder is **not** a web crawler and is **not** a link-based search engine. It does not index HTML content on portal websites. It does not run PageRank or similar link-graph algorithms. It does not attempt to understand natural-language web content from portals.

### 4.2 What Pathfinder Is

A **manifest-first, capability-vector, trust-weighted, intent-routing discovery layer**.

Four internal layers:

**Layer 1 — Manifest Registry**

Lightweight directory of signed `.anton/portal.json` files. Portals submit manifests; Pathfinder validates signatures, stores them, re-validates on a schedule (hourly / daily based on tier). Not content indexing — just manifest indexing.

**Layer 2 — Capability Vector Index**

For each registered portal, Pathfinder generates embeddings from:
- `capabilities.modules_offered`
- `capabilities.service_areas`
- `capabilities.jurisdictions`
- `description`
- Declared supported bundle types

Embeddings stored in a vector database (pgvector if we've migrated to Postgres; otherwise SQLite + FAISS). Semantic search maps user queries → portal capabilities.

**Layer 3 — AAP Attestation Log**

Every successful AAP interaction can produce a signed completion record. Example: company portal A hires candidate portal B via recruitment portal C. All three sign a completion attestation. These are:
- Cryptographically verified (both counterparties signed)
- Privacy-respecting (content optional; existence public)
- Stored in Pathfinder's attestation log
- Used as trust signal input

This is the **cannot-fake-it** signal. Critical.

**Layer 4 — Intent Router**

A search is not the end. Depending on query type, Pathfinder can:
- Return ranked portals (like a search engine)
- Dispatch AAP queries to top-N portals to check availability/fit
- Route a full Mission to the most-suited portal(s)
- Return a Beehive session proposal (multi-portal deliberation on a question)

### 4.3 Trust Score Composition

Weighted composite, displayed transparently:

| Signal | Default weight | Gameability | Source |
|---|---|---|---|
| AAP completion attestations (both parties signed) | 40% | Very low | AAP log |
| Quality Ratchet scores on opted-in deliverables | 20% | Low | Quality Ratchet |
| Portal-to-portal attestations | 15% | Medium (sybil possible at scale) | AAP log |
| Time-in-network (age, consistency) | 10% | Low | Manifest history |
| Explicit user ratings | 10% | High | User submissions |
| Verified identity badge | 5% (multiplicative bonus) | Low | Verification process |
| Time decay | Modifier | — | Exponential, half-life 180d |

Rendered on a result page as: "Ranks #1 because 47 completed engagements, 91/100 avg quality, 12 peer endorsements, 2 years in network." No opaque algorithm.

### 4.4 Pathfinder Hosting Model

**v0.1 (v0.7.0 delivery):** Centralised. FutureChain AB hosts the canonical Pathfinder registry. Portals submit manifests over HTTPS. Single point of discovery.

**v0.2 (v0.8.0+):** Federated hooks designed in from day one but disabled in v0.1. Additional registries can be stood up; registries can gossip manifest changes. Models: ActivityPub-style federation, with FutureChain's registry as the primary index.

---

## 5. Recruitment & Candidate Portals (the "LinkedIn 2.0" work)

### 5.1 Positioning (Public Framing)

Do not use "LinkedIn 2.0" externally. Public framing: **ANTON Work Portals** (or just "Work" as the public-facing surface of the Work pillar). Positioning: "Owned career, explained matches, auditable hiring."

### 5.2 What We Lift from the Internal Talent Discovery Spec

The four Talent Discovery spec documents already produced for internal HR/Work contain:
- Three job ad variants with dual-model bias auditor
- EU AI Act Annex III compliance posture
- EU Pay Transparency Directive alignment
- Internal mobility opt-out aspiration profile pattern
- `.anton` career-profile bundle type

**All reusable.** The v0.7.0 Portal work does not re-spec these; it exposes them publicly through two portal types.

### 5.3 Recruitment Portal (Employer-Side)

A company's public hiring surface. Functions:

- Publish jobs (dual-model bias audit attached; mandatory)
- Salary range mandatory (EU Pay Transparency)
- Receive applications via AAP (signed `.anton` career-profile bundles)
- Explain every match ("this candidate surfaced because X, Y, Z")
- Audit trail for every accept/reject decision
- Privacy-by-default for candidate identity (see 5.5)

Reuses:
- Talent Discovery module (existing)
- `anton-bundler.ts` for career-profile bundles (existing after career-profile bundle type implementation)
- AAP for application handoff
- Quality Ratchet for matching transparency

### 5.4 Candidate Portal (Individual-Side)

Individual's public (or private) professional surface. Functions:

- Hold the `.anton` career-profile bundle, signed by the candidate
- Declare aspiration profile (opt-out default)
- Control visibility: public / discoverable-by-query / fully-private
- Skills demonstrated via Quality Ratchet outputs from work done in ANTON (structural verification, not self-report)
- Portable — candidate owns the profile, takes it anywhere
- Revocation: candidate can pull identity from Pathfinder at any time

### 5.5 Double-Blind Matching

Critical for "opt-out aspiration profile everyone has" to actually work:

- Candidate portal is queryable **by structure** ("anyone with AMLR + sanctions + Swedish") without revealing identity
- Match surfaces to recruiter as anonymous `candidate_id: ANTON-XXXX-XXXX-...`
- Recruiter can send an AAP interest signal
- Candidate approves or rejects the reveal before identity is shared
- No passive scraping of candidate identities by recruiters

This is the single most important privacy feature for the product to work. Current employers must not be able to identify their own employees on the network.

### 5.6 EU AI Act Conformance

Both the Recruitment Portal (matching candidates to jobs) and Pathfinder (ranking portals for employment queries) are Annex III high-risk systems under the EU AI Act. Conformance posture from Talent Discovery spec applies at the platform level, not just module level:

- Risk management system
- Data governance (training/test data logs)
- Technical documentation
- Record-keeping (audit logs — we already have this)
- Transparency (explanations — we already have this)
- Human oversight (mandatory; already designed in)
- Accuracy, robustness, cybersecurity (Quality Ratchet + existing security arch)

Need a platform-level conformance document separate from the module-level one.

---

## 6. Marketplace as a Portal Type

### 6.1 No New Architecture

A Marketplace Portal is a portal with:
- `portal_types: ["marketplace"]` in manifest
- `listings.marketplace_endpoint` populated
- AAP handlers for listing queries, purchases, bundle delivery
- FutureChain integration for settlement
- Free and/or paid bundles

### 6.2 Federated Marketplaces

Do not build a single canonical marketplace. Let anyone stand up a marketplace portal. Domain specialisations will emerge naturally (FCP bundles, legal bundles, Swedish municipal bundles, medical compliance bundles). FutureChain handles settlement regardless of which marketplace the transaction happened on.

FutureChain AB can run a **reference marketplace** — seeded with Advisense FCP bundles — to demonstrate the pattern. Not as the One True Marketplace.

### 6.3 Bundle Discovery

Pathfinder queries for bundles route through marketplace portals. Example: "`.anton` bundles for AMLR gap analysis" → Pathfinder identifies marketplace portals with those listings → returns results with trust scores + prices.

---

## 7. Hosting & Economics

### 7.1 Hosting Model

| Role | Host | Cost |
|---|---|---|
| Pathfinder registry (v0.1) | FutureChain AB | Operational overhead on FutureChain |
| Reference portal (Advisense demo) | FutureChain AB | Operational |
| Self-hosted portals | Anyone | Apache 2.0; run on their own infra |
| Managed portal hosting | FutureChain AB (optional commercial) | Paid tier |
| Federated registries (v0.2+) | Community | Their own infra |

### 7.2 Monetisation (Red Hat pattern — consistent with existing decisions)

Free:
- Self-hosted portal
- Self-hosted ANTON
- Manifest submission to Pathfinder registry
- Basic Pathfinder search
- Bundle sharing

Paid:
- Managed portal hosting
- Verified identity badge (KYC-backed verification)
- Premium Pathfinder placement (transparently marked as paid; does not replace organic ranking, sits alongside)
- Enterprise Beehive features (private sessions, advanced governance)
- Marketplace transaction fees via FutureChain

This preserves the "platform is free" promise while creating real revenue surfaces that do not poison network quality.

---

## 8. Risks & Open Questions

### 8.1 AAP is Critical Path

Everything here depends on AAP. If AAP is not built in v0.6.0, it becomes the first v0.7.0 build item. No portals without AAP. Treat AAP v0.1 wire format as a hard prerequisite.

### 8.2 Moderation / Legal Exposure

Running Pathfinder = running a search/discovery surface. Regulatory exposure:

- EU DSA (Digital Services Act): Pathfinder may be a "very large online platform" or at minimum an online intermediary; notice-and-action obligations apply
- UK Online Safety Act: content moderation duties for user-generated content (portal descriptions, reviews)
- Defamation exposure from user ratings

Must-have before launch:
1. Terms of inclusion for the registry (what portals are allowed)
2. Notice-and-takedown process (with defined SLAs)
3. Appeals process
4. Prohibited content list (illegal services, hate content, etc.)
5. Transparency report (annual; required under DSA for meaningful platforms)

### 8.3 EU AI Act at Platform Level

Pathfinder, when ranking portals for employment-related queries, is itself a high-risk Annex III system. Platform-level conformance document required. This is in addition to the module-level conformance work already in Talent Discovery spec.

### 8.4 Sybil Resistance

Cheap account creation = cheap fake reviews and fake portals. Mitigations:

- Contact hash format `ANTON-XXXX-XXXX-XXXX-XXXX` with Ed25519
- Non-zero cost to register (even nominal; raises the floor)
- Verified identity tier (paid, KYC-backed)
- AAP attestations weighted highest because they require a real counterparty
- Time-in-network weighted positively

### 8.5 Cold Start

Network is worthless empty. Seeding strategy:

1. Advisense FCP as reference portal at launch
2. Crypto company (existing positive signal, per memory)
3. Mistral / EU partners (outreach underway)
4. A handful of `.anton` marketplace bundles from existing Advisense work
5. One public Beehive session as a launch demonstration

"1 portal at launch" is fine if the 1 portal is worth finding and is honestly marketed as a reference deployment.

### 8.6 Open Decisions for Daniel

1. **v0.6.0 vs v0.7.0 for Portals:** Claude's recommendation = v0.7.0, with Beehive and Talent Discovery landing *into* the Portal substrate in v0.7.0 rather than as standalone v0.6.0 features. Requires resequencing v0.6.0.
2. **Pathfinder centralised-first vs federated day-one:** Claude's recommendation = centralised v0.1, federated hooks designed in but disabled.
3. **Advisense publicly referenced as launch reference portal:** Requires Daniel's alignment with Advisense leadership before any launch materials are produced.
4. **Verified identity provider:** Build vs buy? Nordic options (BankID for SE/NO, MitID for DK, FTN for FI) are attractive for credibility; pan-EU eIDAS is the scalable answer. Decision affects who we partner with.
5. **Prohibited portal types:** Explicit list needed before launch. Minimum: illegal services, known scam patterns, content that violates Nordic/EU law. Moderation is cheap if you set the rules early.

---

## 9. Phased Build Order

### Phase 0 — Prerequisites (end of v0.6.0 or start of v0.7.0)

1. AAP v0.1 wire format specification and reference implementation
2. `identity.ts` hardened for cross-portal signing (extend from Companion App Gateway identity layer)
3. PostgreSQL migration (already on roadmap; needed for pgvector)

### Phase 1 — Portal Primitives

4. `portal-manifest` added to `anton-bundler.ts` as bundle type #18
5. "Go public" flow in ANTON admin UI: generate manifest, sign, submit to Pathfinder
6. Portal lifecycle: create, sign, publish, update, revoke

### Phase 2 — Pathfinder v0.1

7. Manifest registry service (ingest, validate, store signed manifests)
8. Capability vector index (embeddings over capabilities field)
9. Basic search UI: keyword + capability semantic search
10. Trust score calculator (initially using just manifest age + explicit ratings; attestations added in Phase 3)
11. Transparent ranking display ("ranks #X because...")

### Phase 3 — Trust & Attestations

12. AAP completion attestation message type
13. Attestation ingestion and verification in Pathfinder
14. Full trust score composition (all signals per §4.3)
15. Quality Ratchet publication opt-in flow

### Phase 4 — Recruitment & Candidate Portals

16. Implement `.anton` career-profile bundle type (per existing Talent Discovery spec)
17. Candidate Portal type with visibility controls
18. Recruitment Portal type with mandatory bias audit
19. Double-blind matching flow
20. Audit trail for hiring decisions (reuse existing audit_log)

### Phase 5 — Marketplace

21. Marketplace Portal type
22. FutureChain payment hooks in AAP
23. Listing management UI
24. Purchase + delivery flow via AAP

### Phase 6 — Beehive on Portals

25. Cross-portal Beehive session initiation via AAP
26. Signed attribution in multi-portal deliberations (already in Beehive spec)
27. Collaborative `.anton` bundle type for joint outputs

### Phase 7 — Intent Router (Pathfinder smart routing)

28. Dispatch AAP queries to top-N on search
29. Mission routing through Pathfinder
30. Beehive session proposal from a search

---

## 10. Acceptance Criteria (per phase summary)

| Phase | Must pass |
|---|---|
| 0 | AAP wire format documented; two ANTON instances exchange signed AAP messages |
| 1 | Portal manifest can be exported as `.anton`, signed, validated on another instance |
| 2 | Pathfinder returns ranked results for a natural-language capability query; ranking explanation visible |
| 3 | AAP completion between two portals produces a verifiable attestation indexed in Pathfinder |
| 4 | Candidate creates profile, is discoverable by query but not by identity; employer can signal interest without revealing candidate identity first |
| 5 | Marketplace portal lists a `.anton` bundle; another portal purchases via AAP + FutureChain; bundle delivered; attestation created |
| 6 | Two portals owned by different people run a Beehive session; joint `.anton` bundle produced with signed attribution from both |
| 7 | Pathfinder search triggers AAP dispatch; top-3 portals respond; user receives live availability |

---

## 11. Affected Files (Investigation Map)

For Claude Code to audit before changes:

```
server/services/anton-bundler.ts           # add portal-manifest bundle type
server/services/antonImport.ts             # portal import flow
server/services/antonExport.ts             # portal export flow
server/services/identity.ts                # cross-portal signing
server/services/prompt-builder.ts          # context for portal-aware prompts
server/services/quality-ratchet.ts         # publication opt-in

server/routes/                             # new: portal.ts, pathfinder.ts, aap.ts, attestations.ts

client/src/pages/                          # new: PortalPage, PathfinderPage, RecruitmentPortalPage, CandidatePortalPage, MarketplacePortalPage

server/db/migrations/                      # new tables per §12
```

---

## 12. New Database Tables (v0.7.0)

Rough scope. Refine during Phase 1:

- `portal_manifests` — signed manifests, versioning, lifecycle
- `portal_identities` — Ed25519 keys, contact hashes, verification status
- `aap_messages` — signed message log for replay / audit
- `aap_attestations` — completion records, both counterparty signatures
- `pathfinder_capability_vectors` — embeddings for semantic search
- `pathfinder_registrations` — registry state, submission history
- `trust_scores` — computed scores with component breakdown
- `trust_score_history` — time series for trend analysis
- `candidate_profiles_public` — opt-in discoverable career bundles (structure only; identity hidden by default)
- `recruitment_postings` — jobs with mandatory bias audit reference
- `application_flows` — double-blind matching state
- `marketplace_listings` — bundle offers, prices, futurechain addresses
- `marketplace_transactions` — completed purchases linked to attestations

Approximately 13 new tables. Manageable within v0.7.0 if prerequisites (PostgreSQL, AAP) are done.

---

## 13. What This Does to the Six-Layer Vision

Layer 3 (The Network), Layer 4 (Collaborative Intelligence), and Layer 5 (The Marketplace) collapse into **one build surface**: Portals. Pathfinder is the cross-layer discovery and trust mechanism. FutureChain is the cross-layer economic mechanism.

The narrative arc simplifies:

- **Layer 1–2 (Individual, Intelligent ANTON):** What ANTON does for one person or one organisation. Private.
- **Layer 3–5 (Portals, Beehive, Marketplace):** What ANTON does between portals. Public, via Pathfinder + AAP + FutureChain.
- **Layer 6 (The Economy):** The cumulative effect of a living network of portals, attestations, bundles, and transactions.

The four-part tagline still holds:

> *"The prompt is the product. Context is the competitive advantage. The network is worth more than any single node. The network is the economy."*

Part 4 of the whitepaper is exactly where this architectural unification belongs.

---

## 14. Immediate Next Steps

1. Daniel decides on the three open decisions in §8.6
2. If aligned, AAP v0.1 wire format spec becomes the first Claude Code brief
3. Portal manifest spec (§3.3) goes into a standalone reference document
4. Platform-level EU AI Act conformance document drafted (separate from module-level)
5. Whitepaper Part 4 outline updated to land on the Portals-as-unification framing

---

*End of spec v0.1. Iterate before handing to Claude Code.*
