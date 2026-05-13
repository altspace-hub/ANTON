# ANTON Portals — Discovery Roadmap

**Status:** Draft for execution
**Owner:** Daniel Bardun / FutureChain AB
**Last updated:** 2026-05-13
**Companion docs:**
- `ANTON_Portals_Spec.md` v0.3 — core spec
- `ANTON_Portals_Registry_Protocol_Reference.md` — wire protocol
- `ANTON_Portals_Capability_Descriptor_Schema_Reference.md` — JSON schema
- `ANTON_Portals_Registry_Server_Ops_Spec.md` — operational spec

---

## Why this document exists

The local portal system is feature-complete. What's missing is the **cross-instance discovery layer** that lets a Comm App user find a portal that lives on someone else's ANTON Local. This document is the roadmap from where we are today to a publicly launched, KYC-gated, three-tier registry deployed on `relay.futurechain.eu`.

The architecture decisions behind this roadmap were captured in chat over 2026-05-13:

1. **Discovery on the relay, not a separate registry service** — co-locate HTTP discovery with the existing WS messaging. One service, one DNS, one cert. Easier to split later than to merge later.
2. **Cached signed index, not source of truth** — the relay stores submitted descriptors but the canonical identity is the Ed25519 signing key. Federation-ready.
3. **Three-tier name model** — Tier 1 reserved (defensive); Tier 2 claimed brand (verified ✓); Tier 3 self-service (light identity check). The ICANN Sunrise pattern.
4. **Identity verification, not content approval** — we vet *who* publishes, not *what* they publish. Reactive moderation handles bad content. This protects the EU hosting safe harbor under DSA Art. 4-5.

---

## Phase A — Legal foundation

Parallel track. Blocks public launch only; friends test can run on a private alpha ToS.

| # | Action | Effort | Status |
|---|---|---|---|
| 1 | Book 1-hour EU IP + DSA lawyer consultation. Take the 8 questions (DSA safe harbor scope; Sweden-specific obligations; Tier 2 evidence sufficiency; DPIA threshold; entity structure; ToS minimums; transparency reporting threshold; Marknadsföringslagen interaction). | 1h prep + scheduling | TODO |
| 2 | Draft three short documents: rejection policy (1 paragraph), Terms of Service skeleton (~2 pages), privacy policy (~2 pages). | 1 day | TODO |
| 3 | Lawyer red-lines Step 2 + answers the 8 questions. | depends on 1, 2 | TODO |
| 4 | Decide entity structure (FutureChain AB or subsidiary), data controller assignment, GDPR DPIA if needed. | depends on 3 | TODO |

**Deliverable:** publishable ToS + privacy policy + rejection policy. Documented legal stance.

---

## Phase B — Registry infrastructure on the relay

Focused engineering. ~6 days.

| # | Action | Effort | Status |
|---|---|---|---|
| 5 | Compile reserved-names list (~7-8K entries). Sources: Forbes Global 2000 + Brand Finance G500 + Tranco top 5K + manual EU/Swedish additions + system terms (`anton`, `admin`, `system`, `root`, `support`, etc.). Dedup, normalise to lowercase ASCII, manual review of ambiguous generics. | 2 days | TODO |
| 6 | Add HTTP server alongside WS in `relay/src/`. Bind to same hostname, different path prefix `/v1/*`. Postgres connection (`relay_registry` DB). Health endpoint, rate-limit middleware. | 1 day | TODO |
| 7 | Migrations for `reserved_names`, `portal_submissions`, `kyc_submissions`, `portals` (schema in §Schema below). | 0.5 day | TODO |
| 8 | Public endpoints: `POST /v1/portals/submit` (Ed25519 envelope verification, queue insert), `GET /v1/portals/submissions/:id/status` (signed status check), `GET /v1/portals/search` (lifted `portal-search-engine.ts`), `GET /v1/portals/resolve/:name.:namespace`. | 2 days (depends on 6, 7) | TODO |
| 9 | Operator endpoints: `GET /v1/admin/submissions?status=pending`, `POST /v1/admin/submissions/:id/approve`, `POST /v1/admin/submissions/:id/reject`. JWT auth. Audit log of every decision. | 0.5 day (depends on 8) | TODO |

**Deliverable:** `relay.futurechain.eu/v1/*` accepts submissions, holds them in a queue, can be approved/rejected via API. Search returns approved portals.

---

## Phase C — Operator UI + ANTON Local + Comm App integration

~4 days focused.

| # | Action | Effort | Status |
|---|---|---|---|
| 10 | Build the operator review UI. Small standalone React app. JWT login, queue list, diff/preview view per submission (descriptor JSON, KYC fields, proposed name), approve/reject with required reason field, audit history per submitter. | 2 days (depends on 9) | TODO |
| 11 | ANTON Local changes: modify `finalizeSession()` to call `/v1/portals/submit` instead of legacy `/register`. Wire `PORTAL_REGISTRY_URL=https://relay.futurechain.eu/v1`. Add status badge in portal management UI (Pending / Approved / Rejected). Edit-and-resubmit on rejection. | 1 day (depends on 8) | TODO |
| 12 | Comm App: set `VITE_COMM_PORTALS_BASE=https://relay.futurechain.eu/v1` in the release build env. Rebuild + re-sign the APK. | 0.5 day (depends on 8) | TODO |

**Deliverable:** end-to-end pipeline. Create a portal in ANTON Local → submit → appears in operator queue → approve → shows up in Comm App search.

---

## Phase D — Friends test

~1-2 weeks elapsed; minimal new code.

| # | Action | Status |
|---|---|---|
| 13 | Recruit 5-10 trusted users. Each creates a portal through the new submit flow. Varied content (personal page, small-business service, hobby project, NGO). | TODO |
| 14 | Process the queue. Time the review experience. Deliberately reject 1-2 to test the rejection-and-resubmit loop. | TODO |
| 15 | Fix UX cracks: rejection message clarity, status polling cadence, search relevance, the operator UI's slowest review steps. | TODO |

**Deliverable:** system has survived 10+ real submitters. Per-submission review time known.

---

## Phase E — Public soft launch readiness

~2-3 weeks elapsed; blocked on Phase A.

| # | Action | Effort | Status |
|---|---|---|---|
| 16 | Activate Tier 1 reservations. `/v1/portals/submit` checks `reserved_names` first; if matched, returns a structured response with a "claim this name" CTA pointing at the Tier 2 flow. | 0.5 day | TODO |
| 17 | Build Tier 2 claim flow. New endpoint `/v1/portals/claim` with stricter required fields (trademark certificate URL, org registration number, domain ownership proof via DNS TXT or HTTP file). Separate operator queue with higher-evidence checklist. **Two-operator approval mandatory for Tier 2** from day 1. Verified ✓ badge in search results. | 3 days (depends on 9) | TODO |
| 18 | Notice-and-takedown surface. Public form at `/abuse-report` or documented email with SLA. Operator UI gets a reports queue. DSA Art. 16. | 1 day | TODO |
| 19 | Marketing/explainer page: "How to publish a portal on ANTON". Public ToS + privacy policy live. Transparency report template. | 1 day eng + writing time (depends on 4) | TODO |

**Deliverable:** registration open to the public. Tier 1 blocks squatters automatically. Tier 2 gives brand owners a clear lane. Tier 3 self-service works at scale. Notice-and-takedown operational.

---

## Phase F — Defer until use-data demands it

Not building now.

| # | Item | When to revisit |
|---|---|---|
| 20 | Merkle transparency log (Registry Protocol §4). Hourly Signed Tree Heads, RFC 6962. | When a second relay operator exists OR when transparency-conscious partners ask |
| 21 | Federation across multiple relays. | When operator capacity is at its limit OR a community fork wants to interoperate |
| 22 | Automated KYC (Onfido / Veriff / Sumsub). | When >100 Tier-2 claims/month justify the contract |
| 23 | Multi-region deployment, read replicas, autoscaling. | When latency or uptime metrics demand it |

---

## Schema (referenced by Steps 7 + 8)

```sql
-- Reserved names. Pre-populated from Forbes / Tranco / manual lists.
CREATE TABLE reserved_names (
  name              TEXT NOT NULL,
  namespace         TEXT NOT NULL DEFAULT 'global',
  basis             TEXT NOT NULL CHECK (basis IN
                    ('famous_brand','system_term','generic_block','tld_collision')),
  basis_evidence    TEXT,                       -- 'forbes-g2000-2026', 'tranco-top1k', etc.
  reserved_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimable         BOOLEAN NOT NULL DEFAULT true,
  claimed_by_submission_id UUID,
  PRIMARY KEY (name, namespace)
);

-- The submission queue. One row per "I want to publish".
CREATE TABLE portal_submissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitter_contact_hash   TEXT NOT NULL,
  signing_pubkey_hex       TEXT NOT NULL,
  proposed_name            TEXT NOT NULL,
  proposed_namespace       TEXT NOT NULL,
  descriptor_json          JSONB NOT NULL,
  descriptor_signature     TEXT NOT NULL,
  kyc_submission_id        UUID,
  status                   TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN
                           ('pending','in_review','approved','rejected','withdrawn')),
  reviewer_id              UUID,
  reviewed_at              TIMESTAMPTZ,
  rejection_reason         TEXT,
  internal_notes           TEXT
);

-- Prevent two pending submissions for the same name.
CREATE UNIQUE INDEX portal_submissions_pending_name
  ON portal_submissions (proposed_name, proposed_namespace)
  WHERE status IN ('pending','in_review');

-- KYC data. Separated so retention/DSR rules can target it independently.
CREATE TABLE kyc_submissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitter_contact_hash   TEXT NOT NULL,
  legal_name               TEXT NOT NULL,
  id_document_type         TEXT NOT NULL,
  id_document_number_hash  TEXT NOT NULL,
  id_document_country      TEXT NOT NULL,
  org_name                 TEXT,
  org_registration_number  TEXT,
  contact_email            TEXT NOT NULL,
  contact_phone            TEXT,
  address_country          TEXT NOT NULL,
  address_city             TEXT NOT NULL,
  address_street           TEXT NOT NULL,
  submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at              TIMESTAMPTZ,
  verifier_id              UUID,
  retention_until          TIMESTAMPTZ NOT NULL
);

-- The live registry. ONLY approved entries land here.
CREATE TABLE portals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id            UUID NOT NULL REFERENCES portal_submissions(id),
  name                     TEXT NOT NULL,
  namespace                TEXT NOT NULL,
  contact_hash             TEXT NOT NULL,
  signing_pubkey_hex       TEXT NOT NULL,
  descriptor_json          JSONB NOT NULL,
  capability_summary       JSONB NOT NULL,
  tier                     TEXT NOT NULL CHECK (tier IN ('tier2_claimed','tier3_selfservice')),
  approved_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at               TIMESTAMPTZ,
  revocation_reason        TEXT
);

CREATE UNIQUE INDEX portals_live_name
  ON portals (name, namespace)
  WHERE revoked_at IS NULL;
```

---

## Risks worth tracking

1. **Lawyer flags an architecture-breaking issue.** Low risk. If it happens, most likely it's around KYC retention or operator entity, not the core registry model.
2. **Reserved-names disputes.** Someone will email "you reserved my brand". Have a response template ready.
3. **Operator capacity bottleneck.** Track per-submission review time from day 1.
4. **Notice-and-takedown SLA failure.** Document the SLA upfront; practice with synthetic reports before public launch.
5. **Tier 2 false approval.** Mandatory two-operator agreement for Tier 2 from day 1.

---

## Critical-path picture

```
Phase A (Legal) ────────────────────────────────────► Phase E (Public launch)
                                                              ▲
                                                              │ gates only the launch
Phase B (Infra) ──► Phase C (Wire up) ──► Phase D (Friends test) ─► Phase E
   ~6 days             ~4 days                ~1-2 weeks elapsed
```

Phase B + C can start before Phase A completes. Friends test (Phase D) can run on a private alpha ToS. Phase E is the only thing that gates on Phase A.

---

## Execution log

(Append entries here as steps complete.)

- **2026-05-13** — Roadmap drafted from chat decisions. Starting execution with Step 6 (relay HTTP scaffold) in parallel with Step 5 (reserved-names list) — both have no prerequisites and Step 6 is the longer engineering pole.
- **2026-05-13** — **Steps 6 + 7 shipped** (commit `0715ea5`). Relay HTTP server alongside WS with graceful 503 when DB is unconfigured. Four-table schema (`reserved_names`, `kyc_submissions`, `portal_submissions`, `portals`) + idempotent migration runner. 7 new dispatcher tests; relay suite 206 passing.
- **2026-05-13** — **Step 8 shipped** (commit `9fc1d59`). Public endpoints: `POST /v1/portals/submit`, `GET /v1/portals/submissions/:id/status`, `GET /v1/portals/search`, `GET /v1/portals/resolve/:address`. 17 integration tests against real Postgres. Total relay suite 223.
- **2026-05-13** — **Step 9 shipped** (commit `965b35c`). Operator endpoints: `POST /v1/admin/login`, `GET /v1/admin/submissions`, `GET /v1/admin/submissions/:id`, `POST /v1/admin/submissions/:id/approve`, `POST /v1/admin/submissions/:id/reject`. HMAC-SHA256 JWT with operator self-declared sub. 16 new tests; total 239. **Schema tweak**: `reviewer_id` + `verifier_id` columns changed from `UUID` → `TEXT` to hold operator IDs like `op-daniel`.
- **2026-05-13** — **Step 11 shipped** (commit `433e816`). ANTON Local now submits to relay via new `server/services/registry-client/relay-submit.ts`. Bridges format conversion (88-hex SPKI → 64-hex raw pubkey) + computes the relay-style contact hash (raw 32-byte SHA-256, distinct from ANTON Local's SPKI-derived hash). `finalizeSession()` accepts optional `kyc` parameter; gated by `RELAY_PORTAL_SUBMIT_URL` env var. New `GET /portals/:id/relay-status` endpoint syncs metadata from the relay. 12 unit tests.
- **2026-05-13** — **Step 12 shipped** (commit `e8ac5e3`). Comm App's `src/comm/services/portals.ts` rewritten against the relay's `/v1/*` endpoints. `searchPortals` and `fetchPortalDescriptor` now hit the relay; `invokeCapability` reshaped to take a descriptor and POST directly to the per-capability `aapEndpoint` (relay does discovery only). Default base URL is `https://relay.futurechain.eu`; overrideable via `VITE_COMM_PORTALS_BASE`. 25/25 Comm App tests still pass.

**Phase B + C engineering complete.** 7 deployable units across 5 commits. Steps 10 (operator UI) and 5 (reserved-names list compilation) deferred — both are content/UI work that doesn't block end-to-end testing. The submit → approve → search → resolve flow is fully exercisable via curl + ANTON Local + the rebuilt Comm App APK once the relay's new HTTP routes are deployed to `relay.futurechain.eu`.
