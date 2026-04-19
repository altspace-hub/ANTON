# ANTON Portals — Implementation Specification

**Target version:** v0.7.x (post go-live)
**Status:** Specification — investigation complete, Phases 1-10 + audit-fix Batches A-F shipped
**Version:** 0.3 (2026-04-19)
**Layer:** Infrastructure (Layer 3: The Network, with reach into Layer 4 Collaborative Intelligence, Layer 5 Marketplace, Layer 6 Economy)
**Owner:** Daniel Bardun / FutureChain AB
**Classification:** Core platform capability — sits alongside the Companion App Gateway, the bundler, and Pathfinder

**Companion documents (all v1.0.0-draft, locked):**
- `ANTON_Portals_Strategic_Ground.md` — pre-draft pressure-tests of load-bearing decisions
- `ANTON_Portals_Registry_Protocol_Reference.md` — wire protocol between clients and the `anton.portals` registry (signing, envelopes, transparency log, HTTP API)
- `ANTON_Portals_Capability_Descriptor_Schema_Reference.md` — JSON schema for the machine-readable half of every portal (12 verbs + payment + policies + attestations)
- `ANTON_Portals_Registry_Server_Ops_Spec.md` — how the registry service is run (deployment, abuse pipeline, GDPR, monitoring, succession)

**Investigation note (mandatory reading):** `investigation/portals-investigation.md` — consolidated findings from running the three Investigation Protocols against the actual codebase. v0.2 of this spec lifts every actionable finding from there.

---

## Changelog

### v0.3 (2026-04-19)

Audit-fix amendment after Phases 1-10 shipped. Captures the 6-batch fix
pass that closed all 21 findings from the 5-expert review (security ·
database · backend · React/UX · architecture/honest-scope). No protocol
or architecture changes — this is the spec catching up to what now ships.

New env vars:
- **`PORTAL_REGISTRY_URL`** — registry submission target. Unset by
  default in v0.7.x; `finalizeSession` logs a one-line "registry skipped"
  info and returns `registeredOk: false`. The local portal is fully
  usable without the registry.
- **`INSTANCE_KEY_ENCRYPTION_KEY`** — 32-byte hex. When set, portal
  private keys are encrypted at rest via AES-256-GCM (envelope
  `enc:v1:<iv-base64>:<ct+tag-base64>` inline in the existing
  `private_key_pem` TEXT column). Falls back to plaintext + a one-time
  `childLogger.warn()` when unset. Same key the Companion App uses for
  `instance_identity.privkey_encrypted`.

New endpoints:
- **`GET /portals/trust-bundle/status`** (public) — surfaces whether the
  bundled FutureChain operator key is the placeholder. Lets the UI show
  a "registry not yet wired" banner instead of failing silently.
- **`GET /portals/inbox`** (auth, scoped to caller's `metadata.ownerId`)
  — cross-portal aggregator: every capability invocation across all the
  caller's portals, joined to portal name/namespace/title, ordered by
  `received_at DESC`. Filterable by `status` query param.
- **`PUT /portals/walkthroughs/:id/draft`** (auth, owner-scoped) —
  debounced auto-save target. Stores the in-flight phase draft under
  `accumulated_state.__drafts.<phaseId>` so users don't lose work mid-phase.
  Does NOT advance phase or validate against the phase schema.

Auth: every owner endpoint now requires `requireAuth` (per CLAUDE.md
§Coding Patterns 4) plus a `requirePortalOwner` middleware that checks
the JWT `req.user.id` against `portals.metadata.ownerId`. Walkthrough
sessions get an inline `assertSessionOwner()` check against
`portal_walkthrough_sessions.owner_id`. Visitor endpoints
(`/portals/visit/*`), `/portals/templates`, `/portals/search`, and
`/portals/trust-bundle/status` remain public.

New manifest field:
- **`bundleKind: 'template' | 'concrete'`** in the portal `.anton`
  manifest. Concrete bundles MUST have a verifiable descriptor signature.
  Template bundles intentionally skip signature verification at import
  (they don't represent a real portal — the importer adapts them via
  the walkthrough's adaptation phase). Legacy bundles without the field
  default to `'concrete'` — closes the previous bypass where an
  attacker could craft a manifest with the `ANTON-TMPL-TMPL-TMPL-TMPL`
  contact_hash + null adaptation points to be inferred-as-template and
  skip signature checks.

Pathfinder behaviour:
- `searchMode === 'anton-portal'` now bypasses the LLM web-search
  dispatch entirely. `dispatchPortalSearch()` queries the local
  `portal-search-engine` and formats hits as `localSources` with
  `/portals/p/<address>` URLs. Cost is zero (no LLM tokens). Direct
  address lookups (`name.namespace.portal`) are recognised and
  short-circuited to a namespace-scoped exact match.

Visitor render:
- Owner-authored HTML is now rendered inside an `<iframe sandbox="">`
  (no allow-* — blocks scripts, forms, popups, navigation, plugins,
  same-origin access). Closes the previous XSS surface where a
  malicious portal owner could exfiltrate the visitor's
  `localStorage['openexpert-token']` via `<script>` injected into
  `portal_pages.html`. A `wrapForSandbox()` helper inlines a minimal
  CSS reset that mirrors `.prose-output` so portal pages still look
  right inside the sandbox.

Migration 149: 5 missing performance indexes
- `(metadata->>'ownerId')` expression — drives every "list my portals"
- `(status) WHERE public_index = TRUE` — search candidate set
- GIN+`jsonb_path_ops` on `capability_summary` — backs the new SQL
  filters in portal-search-engine via `jsonb_exists_any(col, ?::text[])`
- `(status, received_at DESC)` composite — inbox lookups
- `(portal_id, sort_order, path)` — page list ordering

Lifecycle scheduling:
- `setInterval(registryClient.pruneExpiredCaches(), 1h)` registered in
  `server/index.ts` next to the existing CSRF prune. Without this, the
  resolution cache, descriptor cache, and outbound replay-nonce table
  grew unbounded forever.

Capability notifications:
- `handleInvoke` now fires a best-effort `app_checkpoint` to the
  portal owner's paired phone via the existing `app-checkpoint-service`.
  Lookup chain: `portal.metadata.ownerId` → `connected_users` →
  `app_devices` (where `revoked_at IS NULL`). Non-blocking — visitor's
  response shape is unaffected by push delivery.

Backoff differentiation:
- Registry-client `transport.ts` now takes a `kind: 'read' | 'write'`
  parameter on retries. Reads keep the 16-min cap (idempotent, user
  rarely blocking). Writes cap at 30s total because a 14-minute hang
  on "Register portal" is user-hostile. `postSignedEnvelope` passes
  `'write'`; `get` passes `'read'`.

Visitor rate limit:
- `POST /portals/visit/:address/capabilities/:capId/invoke` is now
  rate-limited via `express-rate-limit` (30 invokes / minute / IP).
  Owner's inbox would otherwise be a DoS target.

Client-side validation:
- `PortalBuilderPage` now validates per phase via a `validatePhase()`
  helper. Required fields are surfaced inline; "Save & continue" is
  disabled until valid; tooltip names what's missing. Mobile-responsive
  via `grid-cols-1 sm:grid-cols-12`. Draft auto-save (1.5s debounce)
  to the new draft endpoint. Beforeunload guard. Phase N of 8 indicator.

Capability dialog a11y:
- `PortalVisitorPage` capability invoke dialog now has `aria-modal`,
  `aria-labelledby`, `aria-describedby`, Esc-to-close, backdrop-click-
  close, and a labelled close button.

### v0.2 (2026-04-19)

Reconciles the v0.1 spec with (a) the three companion reference documents that arrived after v0.1 and (b) the consolidated investigation note `investigation/portals-investigation.md`. Substantive changes:

- **Reframed AAP transport.** The "abstract AAP layer" assumed in v0.1 does not exist in the codebase. The only `aap-*.ts` file is a 29-line bridge for hardware-patch checkpoints. v0.2 adopts the Companion App Gateway (HTTPS + WebSocket + Ed25519 signed envelopes + `app_checkpoints` store-and-forward queue) as the transport. Three new Gateway message types replace the v0.1 PORTAL_FETCH abstraction.
- **Replaced `getPromptTier()`.** The function was referenced 3 times in v0.1 and does not exist. v0.2 adds a small new helper `getWalkthroughDepth(modelId, userThinkingLevel)` that maps `MODEL_CAPABILITIES` + `AntonThinkingLevel` to a walkthrough depth. ~30 lines.
- **Dropped the "seven-layer prompt architecture" wording.** `prompt-builder.ts` actually exposes 5 build functions. The portal walkthrough adds one more on top. v0.2 says "the prompt-builder layered pipeline" without a number.
- **Pathfinder integration: tactical add, not refactor.** `SearchMode` is a hardcoded type union — no engine-registry pattern exists. v0.2 extends `SearchMode` directly with `'anton-portal'`. The strategic refactor to a true engine registry is parked as Phase 11+ work.
- **Validation library scope:** zod for everything ANTON-internal (already universal). New ajv dependency (Draft 2020-12) ONLY for capability descriptor input/output schemas. They coexist without conflict.
- **Crypto:** wire format is `node:crypto` + base64url unpadded public keys; internal storage stays hex DER. New dependency `@truestamp/canonify` for RFC 8785 canonicalisation.
- **Bundle handler:** mirrors the `hardware-project` bundle type structure — closest existing analogue.
- **i18n:** nested JSON, not dot-path keys. (The Capability Schema Reference §11 dot-path examples need a v1.0.0-A1 addendum.)
- **12 verbs (not 11).** The Capability Schema added `pay` distinct from `order`. Strategic Ground still says 11; harmless drift.
- **Added transparency log + key-recovery sections.** v0.1 was silent on both; v0.2 references Registry Protocol §7 (Merkle log) and §5.1 (`recoveryFieldsReserved`).
- **Concrete file paths throughout** — every new file the build will create is named explicitly.

### v0.1 (initial)
First investigation-first brief. Identified scope, locked the strategic decisions in Part A, defined architecture, walkthrough, capability descriptor sketch.

---

## 0. Read this first

This is an implementation brief for Claude Code. **The Investigation Protocol (Part B) has been executed** — see `investigation/portals-investigation.md`. Code can now begin from Part I, in the order given.

The rule for this spec is the same as for every other ANTON brief: **extend existing systems, never duplicate.** Where the v0.1 spec assumed infrastructure that does not exist in the codebase (AAP layer, `getPromptTier()`, Pathfinder engine registry), v0.2 is honest about it and prescribes the minimum-viable extension instead.

This document contains:

- **Part A — Strategic context & locked decisions** (the decisions not being relitigated during build)
- **Part B — Investigation Protocol** (already executed; see investigation note)
- **Part C — Architecture** (network model, registry, origin, transport, addressing)
- **Part D — Portal `.anton` bundle type** (schema and handling)
- **Part E — Conversational AI-led portal build** (the walkthrough)
- **Part F — AAP capability descriptor** (high-level — full schema in companion ref doc)
- **Part G — anton.portal discovery surface** (Pathfinder integration)
- **Part H — Affected files** (concrete paths)
- **Part I — Implementation order**
- **Part J — Acceptance criteria**
- **Part K — Future phases** (documented, not in scope for v0.7.x)
- **Part L — Scope guardrails: what this is NOT**
- **Part O — Open questions for Daniel** (status updated)

---

## Part A — Strategic context & locked decisions

### A.1 What ANTON Portals are

An ANTON Portal is a **user-created, conversationally-built web space that lives inside the ANTON network**. It is simultaneously two things:

1. **A human-facing site.** HTML pages with content, images, links, forms — whatever the user wants, rendered inside the ANTON client.
2. **A machine-readable AAP endpoint.** A capability descriptor that tells other ANTONs what this portal can do, who it is, and how to transact with it.

Every portal is both. This is the feature that no other site builder can ship, because no other site builder has an AI agent sitting behind the page.

### A.2 What ANTON Portals are NOT

- **Not accessible from the public web.** You need ANTON to reach a portal. No public DNS, no public TLS for the portal itself.
- **Not a social network.** The analogy to early-web personal sites is about *capability* (low-friction self-publishing), not aesthetics or positioning.
- **Not a CMS or blogging platform.** Portals are presence + endpoint, not publishing infrastructure.
- **Not Anthropic-hosted or FutureChain-hosted.** The origin for every portal is the user's own ANTON instance (laptop, Pi, small server — user's choice).

### A.3 Locked strategic decisions

These decisions were resolved during spec design (and reinforced by the three companion reference docs) and are **not open for redesign during implementation**. If an implementation question appears to require reopening one of these, stop and escalate.

1. **Accessibility is ANTON-only.** Portals are not reachable via public browsers. The ANTON client is the resolver, renderer, and transport.
2. **No public DNS, no public TLS for portals.** Addressing is handled by an application-layer registry. Transport encryption is handled by the same Ed25519/X25519/AES-256-GCM cryptography the Companion App Gateway uses (see `app-enrollment-service.ts`). The registry server itself uses public HTTPS via Let's Encrypt — that's standard infrastructure, not portal infrastructure.
3. **Origin is local to the user.** HTML + local PostgreSQL (per portal) + handler all run on the user's ANTON instance. FutureChain does not host portal content.
4. **FutureChain runs the registry, federation-ready by design.** `anton.portals` is FutureChain-operated in v0.7.x. The Registry Protocol Reference makes federation a v2 deployment decision, not a protocol redesign — every operation declares its `namespace` + `registryOperator`. Mistral, sovereign-EU, etc. namespaces can be added without breaking v1 clients.
5. **Transparency log from day one.** Every successful operation (except `heartbeat`) is appended to a Merkle log per Registry Protocol §7, with hourly Signed Tree Heads (RFC 6962-compatible). Without the log, the trust story is broken.
6. **Hard key loss in v1, social recovery reserved.** Registry Protocol §5.1 ships `recoveryFieldsReserved: { recoveryContacts: null, recoveryQuorum: null }` in every register payload. §5.9 reserves operation types `rotate_key_via_recovery` and `declare_recovery_contacts` for v1.1+. v0.7.x ships hard-loss + mandatory key backup UX.
7. **Offline behaviour is generic.** If a portal's origin doesn't answer, the visitor's ANTON renders a neutral "offline, try later" card. No snapshot mirror.
8. **Portals are packaged as a new `.anton` bundle type.** Portable, exportable, versionable, shareable. Mirrors the `hardware-project` bundle type structurally (closest existing analogue per the investigation note §C.2). Extends `anton-bundler.ts`, does not parallel it.
9. **Portal building is AI-led.** Same pattern as Discovery Mode and Coding Area — conversational walkthrough adapted by template × user type × knowledge level × area. Users do not drag widgets.
10. **"ANTON address" schema** (`localpart@name.namespace.portal`) works as a Companion-Gateway routing target from day one. SMTP email bridging is deferred to Part K.
11. **`anton.portal` discovery is Pathfinder-powered.** Tactically: add `'anton-portal'` to the existing `SearchMode` union (per investigation note §E.3 path A). Strategically: a true engine-registry refactor is Phase 11+ work.
12. **License & monetisation unchanged.** Apache 2.0 core, including the registry server software (Registry Server Ops Spec §2). Registry operation, managed always-on hosting, and certified portal templates are candidate value-added layers (Red Hat model). FutureChain is the sole payment rail when commerce flows arrive.
13. **12-verb capability taxonomy.** Per Capability Schema §4: `contact`, `inquire`, `request`, `order`, `pay`, `book`, `subscribe`, `join`, `query`, `publish`, `delegate`, `authenticate`, plus `custom` escape hatch.
14. **EU hosting for the registry.** Per Ops Spec §3.3: Hetzner EU recommended for launch, in-EEA processing only.

### A.4 Why this is a v0.7.x feature, not a go-live feature

Portals have real operational and protocol surface area: registry schema, addressing format, capability descriptor format, bundle format, walkthrough flow, Pathfinder integration. The v1 registry schema is load-bearing — once addresses are in use, changing it is expensive. The April/May go-live cannot absorb this scope safely.

The go-live narrative *benefits* from Portals being announced as the next chapter — it makes the six-layer vision concrete and gives the whitepaper arc a clear forward trajectory. What ships at go-live is the tease, not the system.

---

## Part B — Investigation Protocol (COMPLETE)

The Investigation Protocols from this spec, the Registry Protocol Reference, and the Capability Schema Reference were executed in parallel on 2026-04-19. Findings consolidated in `investigation/portals-investigation.md`.

**Headline conclusions** (full detail in the investigation note):

1. Identity layer reuses `node:crypto` (not `@noble/ed25519` or tweetnacl). Public keys are hex SPKI DER on disk; convert to base64url unpadded for wire format.
2. Contact hash format `ANTON-XXXX-XXXX-XXXX-XXXX` exists, but two generators disagree on charset. Portals use `deriveContactHashFromPublicKey()` (Crockford-style); the conflicting validation regex in `community-crypto.ts:24` is a known bug, not a Portals problem.
3. RFC 8785 canonicalisation does not exist — add `@truestamp/canonify`.
4. Native `fetch()` + `AbortSignal.timeout()` is the HTTP standard. No axios.
5. Existing `audit_log` table + `auditLogger.writeAuditEntry()` is the audit hook.
6. zod is universal for internal validation. ajv (Draft 2020-12) is added strictly for descriptor input/output schemas.
7. **No abstract AAP transport layer exists** (this is the biggest finding). The Spec was wrong about this in v0.1. Reuse the Companion App Gateway transport instead.
8. `getPromptTier()` does not exist. Replace with `getWalkthroughDepth()`.
9. `prompt-builder.ts` exposes 5 layers, not 7. Don't claim 7.
10. Pathfinder is not pluggable today — extend `SearchMode` directly.
11. Discovery Mode has 6 hardcoded phases — portal walkthrough is a sibling engine with 8 portal-specific phases.
12. i18n uses nested JSON, not dot-path keys.

If a future engineer encounters one of these and is tempted to "just add an AAP layer" or "implement getPromptTier first," stop and re-read the investigation note. Those gaps are real and decided.

---

## Part C — Architecture

### C.1 Network model

```
┌─────────────────────────────────────────────────────────────────┐
│                        VISITOR'S ANTON                          │
│                                                                 │
│   ┌───────────────┐   ┌──────────────────┐   ┌──────────────┐  │
│   │ Portal Viewer │──▶│ Portal Resolver  │──▶│ Gateway      │  │
│   │ (renders HTML)│   │ (name → hash)    │   │ Transport    │  │
│   └───────────────┘   └────────┬─────────┘   └──────┬───────┘  │
│                                │                    │          │
└────────────────────────────────┼────────────────────┼──────────┘
                                 │                    │
                                 ▼                    ▼
                  ┌────────────────────┐   ┌────────────────────┐
                  │  FutureChain       │   │  ORIGIN (other     │
                  │  Registry          │   │  user's ANTON)     │
                  │  anton.portals     │   │                    │
                  │  (HTTPS public)    │   │  ┌──────────────┐  │
                  │                    │   │  │ Portal DB    │  │
                  │  name ─→ hash      │   │  │ (local PG)   │  │
                  │  name ─→ metadata  │   │  └──────────────┘  │
                  │  hash ─→ routing   │   │  ┌──────────────┐  │
                  │  + transparency    │   │  │ Portal       │  │
                  │    log             │   │  │ Handler      │  │
                  │                    │   │  │ (Gateway     │  │
                  │  (always online,   │   │  │  routes)     │  │
                  │   EU-hosted)       │   │  └──────────────┘  │
                  └────────────────────┘   │                    │
                                           │  (may be offline)  │
                                           └────────────────────┘
```

**Resolution flow:**

1. User types `daniel.bardun.portal` in their ANTON client (Portal Viewer).
2. Portal Resolver queries the `anton.portals` registry over public HTTPS with the canonical name `daniel.bardun.futurechain.portal` (per Registry Protocol §3).
3. Registry returns contact hash + public key + routing hints (+ optional metadata: title, category, capability summary).
4. Visitor's ANTON opens a Gateway transport connection to Daniel's ANTON using the contact hash. The handshake reuses the existing `app-enrollment-service` Ed25519 + signed-envelope pattern.
5. Daniel's Portal Handler serves HTML + a hash reference to the embedded capability descriptor.
6. Visitor's Portal Viewer renders the HTML inline. Visitor's ANTON (separately) fetches `/capabilities` for the descriptor; it's verified and cached per Capability Schema §13-14.

**If step 4 fails (origin offline or unreachable):** Portal Viewer renders the standard offline card: portal name, last-known metadata from the registry response, "This portal is currently offline. Try again later." No stored snapshot, no cached content, no stale impressions.

**If step 3 fails (name not in registry):** Portal Viewer shows a not-found state with optional "search for similar names" using the `anton.portal` discovery surface (Part G).

### C.2 The registry (`anton.portals`)

The wire protocol, schema, transparency log, signing, and HTTP API for the registry are fully specified in `ANTON_Portals_Registry_Protocol_Reference.md`. The operational deployment, abuse pipeline, GDPR posture, and incident response are in `ANTON_Portals_Registry_Server_Ops_Spec.md`.

**Key facts you need from this Spec:**

- The registry is operated by FutureChain AB (operator identity `ANTON-REG-FUTURECHAIN-V1`).
- v0.7.x runs single-namespace (`futurechain`) but the protocol is federation-ready (every signed operation declares `namespace` + `registryOperator`).
- Every operation except `heartbeat` is appended to a Merkle transparency log (RFC 6962-compatible). Hourly Signed Tree Heads. Inclusion + consistency proofs.
- v0.7.x ships hard-key-loss recovery model with reserved fields for v1.1+ social recovery.

The registry server lives in its own repo (separate from this codebase). This Spec is concerned with the **client** side of the protocol — the registry-client library, local caching, signature verification, audit-log integration.

### C.3 Origin (user's ANTON)

The origin is the user's own ANTON instance. It hosts:

- **Portal content database.** A PostgreSQL schema-per-portal in the user's local PostgreSQL instance. Stores pages, content blocks, asset references, structured data (e.g. product listings for a commerce portal, match results for a sports portal). PostgreSQL is mandatory — the SQLite era is over per the broader migration. Desktop deployments ship with embedded PostgreSQL or a companion container.
- **Portal handler.** A new Gateway-routed handler that responds to portal-fetch requests. When another ANTON requests "give me the index page of `daniel.bardun.portal`", the handler reads from the local portal database and returns rendered HTML over the Gateway transport.
- **Portal capability descriptor.** A signed JSON document served at the Gateway endpoint `/capabilities`. Other ANTONs fetch this to discover what they can transact with this portal.

**Key design constraint:** Each portal's database (schema) must be addable and removable cleanly. A user can create multiple portals (personal + business + sports team), and deleting one must not touch the others.

### C.4 Transport (HONEST: this is Companion App Gateway, not a separate AAP layer)

**v0.1 of this Spec was wrong.** It assumed an "AAP transport layer" that does not exist in the codebase — only `aap-rollout-bridge.ts` (29 lines, hardware-patches only) lives there. v0.2 reuses the Companion App Gateway:

- HTTPS + WebSocket (`server/services/app-gateway.ts` + `app-websocket.ts`).
- Ed25519 signed envelopes (`app-enrollment-service.ts:148-150` for construction, `:518-540` for verification + nonce replay protection).
- `app_messages` table (migration 094) for persisted exchanges between paired ANTON instances.
- `app_checkpoints` table (migrations 130/131) as the store-and-forward queue when the destination is offline.
- Push notifications carry only `event_id + severity + opaque title + deep_link` — full payload never crosses APNs/FCM.

**Three new Gateway message types** are added for portals (declared in Capability Schema §3.3):
- `portal_fetch` — request a portal page or asset.
- `capability_invoke` — invoke a declared capability with the input schema.
- `capability_inquire` — ask for a quote or status without committing.

These are Gateway message types, not new AAP types. The Spec's previous PORTAL_FETCH abstraction is dropped.

**NAT traversal:** the Gateway already handles HTTPS for WAN, mDNS for same-LAN, and `app_checkpoints` for store-and-forward when the origin is offline. Portals reuse this entirely.

### C.5 Addressing

**Canonical form:** `<name>.<namespace>.portal` per Registry Protocol §3.1.

Examples:
- `daniel.bardun.futurechain.portal`
- `advisense.futurechain.portal`
- `local-catering.futurechain.portal`

**Shorthand:** within a user's default registry namespace, the namespace can be omitted. If a user's default is `futurechain`, `daniel.bardun.portal` resolves to `daniel.bardun.futurechain.portal`. Shorthand is client-side only — never appears on the wire.

**Name rules:** per Registry Protocol §3.3 — 3-63 Unicode code points after NFC normalisation, IDNA 2008 compliant, lowercased, subject to UTS #39 confusable detection.

**ANTON address form** (for Gateway routing and future email bridging): `<localpart>@<name>.<namespace>.portal`

Examples:
- `daniel@daniel.bardun.futurechain.portal`
- `orders@local-catering.futurechain.portal`
- `coach@soccer-team-xyz.futurechain.portal`

The localpart is resolved by the portal's capability descriptor — each portal defines which localparts it accepts.

**Reserved names:** per Registry Protocol §3.5. Globally reserved: `anton`, `antons`, `anton-portal`, `anton-portals`, `anton-help`, `anton-support`, `anton-admin`, `anton-system`. Per-namespace reservations: `admin`, `root`, `support`, `help`, `security`, `abuse`, `postmaster`, `noreply`, `www`, `api`, `mail`, `system`, `test`, `example`, `status`, `staging`, `docs`, `dev`.

### C.6 Deployment topologies

Supported deployment topologies for portal origins:

1. **Laptop.** User's ANTON runs on their laptop. Portal is online when laptop is on and ANTON is running. Offline card shows otherwise. Acceptable for personal portals.
2. **Small always-on box.** Raspberry Pi, mini PC, home server. ANTON runs 24/7. Portal stays reachable. Recommended for businesses, sports teams, communities.
3. **VPS.** User rents a small VPS and runs ANTON there. Same as the always-on box, just hosted.
4. **Organisation deployment.** The org runs a single ANTON instance (already specced in Companion App Gateway work). Portals attached to that instance are hosted on the same infrastructure. Members connect as `connected_user` clients.

FutureChain does not provide hosting in v0.7.x. Managed hosting is a candidate value-added offering in the Red Hat model (Part K).

---

## Part D — Portal `.anton` bundle type

### D.1 Why portals are bundles

Portals must be portable. A user should be able to:

- Export a portal as an `.anton` file and import it on another ANTON instance (laptop → VPS migration).
- Version a portal. Every change is a new version; the previous can be restored.
- Share a portal template. A sports club builds a portal template and shares it with other clubs — they import, adapt, and their portal is live.
- Back up a portal.

Portals are a new bundle type added to `anton-bundler.ts`. **Mirror the `hardware-project` bundle type** (`anton-bundler.ts:116`) — it's the closest existing structural analogue (content + schema + lifecycle + assets).

### D.2 Portal bundle manifest

```json
{
  "bundleType": "portal",
  "bundleVersion": "1.0.0",
  "schemaVersion": "portal-1.0.0",
  "name": "daniel.bardun",
  "namespace": "futurechain",
  "displayTitle": "Daniel Bardun — Personal",
  "category": "personal",
  "template": "personal-standard",
  "createdAt": "2026-09-01T12:00:00.000Z",
  "updatedAt": "2026-09-15T14:00:00.000Z",
  "author": {
    "contactHash": "ANTON-XXXX-XXXX-XXXX-XXXX",
    "displayName": "Daniel Bardun"
  },
  "capabilityDescriptorRef": "capability-descriptor.json",
  "pagesRef": "pages/",
  "assetsRef": "assets/",
  "dataSchemaRef": "schema.sql",
  "dataSeedRef": "data-seed.sql",
  "walkthroughTranscriptRef": "walkthrough.json",
  "adaptationPoints": [
    {
      "id": "owner_name",
      "label": "Portal owner's display name",
      "currentValue": "Daniel Bardun",
      "type": "string",
      "required": true
    }
  ],
  "dependencies": {
    "minAntonVersion": "0.7.0",
    "requiredModules": [],
    "requiredAreas": []
  }
}
```

### D.3 Portal bundle contents

A portal bundle is a ZIP (same as every existing bundle):

```
portal-daniel.bardun.anton/
├── manifest.json                  the manifest above
├── capability-descriptor.json     full descriptor per Capability Schema §3
├── schema.sql                     portal database schema
├── data-seed.sql                  initial content (posts, pages)
├── pages/
│   ├── index.html
│   ├── about.html
│   └── ...
├── assets/
│   ├── logo.png
│   └── ...
├── walkthrough.json               transcript of the AI-led build conversation
└── README.md                      human-readable description
```

### D.4 Export, import, adaptation

**Export flow:** on the portal management page, click export. Bundler packages the portal's database contents, rendered pages, capability descriptor, and walkthrough transcript into an `.anton` file. Adaptation points (user-specific values like owner name, business name) are extracted and listed explicitly in the manifest — the user can choose to redact or parameterise them before export.

**Import flow:** drag `.anton` into ANTON. Same preview pattern as any existing bundle. Reuse the path-traversal validation in `antonImport.ts` (already battle-tested). If the bundle is shared as a template (adaptation points marked `currentValue: null` with guidance notes), the import triggers a guided adaptation session.

**Adaptation session pattern:** use the existing Discovery Mode conversation engine. ANTON walks the importer through each adaptation point, explains why it matters, proposes a default, and lets the user confirm or change.

### D.5 Integration with existing bundler

Extend `anton-bundler.ts`:

- Add `'portal'` to the `BUNDLE_TYPE_REGISTRY` (line 78-121) with `contentsKey: 'portals'` and `primaryContentDir: 'portals/'`.
- Add a portal-specific export handler (mirror `hardware-project`).
- Add a portal-specific import handler with schema validation and registry-conflict handling.
- Reuse all existing bundle infrastructure: preview, selective import, audit logging on import, CC-BY-4.0 format spec compliance.

---

## Part E — Conversational AI-led portal build

### E.1 The walkthrough philosophy

Users do not drag widgets. Users describe what they want, and ANTON builds it. This is the commercial expression of "the prompt is the product" — a portal is the output of a structured conversation with an expert AI.

The walkthrough follows the same shape as Discovery Mode digital guided conversations:

- **Structured progression.** Broad → narrow. Context → requirements → content → capabilities → review.
- **Adaptive questioning.** Next question depends on previous answers.
- **Expert perspective injection.** Different questions are asked by different expert personas — design for aesthetics, product manager for feature selection, legal for commerce, community moderator for community portals.
- **Model-aware depth.** A new helper `getWalkthroughDepth(modelId, userThinkingLevel)` (lives at `server/services/portals/walkthrough-depth.ts`) maps `MODEL_CAPABILITIES` + `AntonThinkingLevel` to one of `simple|standard|deep`. On smaller local models, the walkthrough uses fewer branches and simpler templates. On Opus 4.7 with `think_hard`, full multi-perspective depth.
- **Output is structured.** The walkthrough produces a structured portal specification document + generated HTML + populated capability descriptor + portal database schema + seed data — all in one session.

### E.2 Portal templates (initial set)

The v0.7.x ship set. Each template is a structured walkthrough configuration + starter pages + default capability descriptor shape.

1. **Personal** — "this is me" portal. About, contact, links, optional blog. Default capability: identity + messaging.
2. **Business** — small business homepage. About, services, contact, hours, location, optional listings. Default capability: identity + messaging + service-inquiry endpoint.
3. **Community / Group** — shared interest. About, members, events, discussions. Default capability: identity + messaging + join-request endpoint.
4. **Commerce** — product or service sales. Catalog, pricing, ordering flow, FutureChain payment integration. Default capability: identity + messaging + ordering endpoint + payment endpoint.
5. **Team** (sports / project / any team) — roster, schedule, results, announcements. Default capability: identity + messaging + schedule endpoint + results endpoint.
6. **Creator** — artist, writer, musician showcase. Portfolio, works, news, booking. Default capability: identity + messaging + booking-inquiry endpoint.
7. **Bulletin** (lightweight) — single-page announcement or event page. Default capability: identity + messaging.

Additional templates (Classroom, Teacher per the School pillar) ship in v0.7.x if time permits, otherwise post-v0.7.x.

### E.3 User type × knowledge level × area

The walkthrough adapts along three dimensions:

**User type:** private individual / business or sole trader / organisation (multi-person) / community-club-team / creator-artist-professional.

**Knowledge level:** beginner / intermediate / advanced.

**Area:** user can invoke relevant ANTON expert areas to inform the portal. Business portal can pull in FCP for compliance disclosures. Commerce can pull in Legal for T&Cs. School portal for a tutor can pull in Education area expertise.

The walkthrough engine uses these three dimensions plus `getWalkthroughDepth()` to pick the right questions, the right pace, and the right expert personas.

### E.4 Walkthrough phases (8)

Every portal build goes through these phases:

1. **Intent.** What kind of portal? Who is it for? Who will visit? What do you want visitors to be able to do?
2. **Identity.** Name, category, claim the name in the registry (signs the `register` operation per Registry Protocol §5.1). Description, tagline.
3. **Content structure.** What pages? What sections? What goes where? ANTON proposes a structure based on template + intent; user confirms or changes.
4. **Content generation.** ANTON writes (or co-writes) the content. User provides raw input; ANTON drafts page content; user reviews and edits.
5. **Capabilities.** What can visitors do? Send a message? Place an order? Book time? Join? Each maps to a capability per the 12-verb taxonomy (Capability Schema §4). ANTON asks structured questions and generates input/output schemas.
6. **Aesthetics.** Colours, fonts, layout. ANTON proposes a design palette based on category; user can override. Advanced users get a richer customisation interface.
7. **Review.** ANTON renders a preview. User walks through it. ANTON runs a structured review (design persona + content persona + legal persona for commerce). Quality Ratchet scores the output; Apprentice records the session.
8. **Publish.** Portal is written to local database, registered in `anton.portals` (signed `register` operation), descriptor served at the Gateway `/capabilities` endpoint, and goes live.

Each phase produces structured output that feeds into the next. Full transcript saved as `walkthrough.json` in the portal bundle.

### E.5 Walkthrough implementation

A new engine in `server/services/portals/portal-walkthrough-engine.ts`. Mirrors the structure of `discovery-engine.ts` (hardcoded per-phase prompts, structured-output extraction at each phase boundary), but with 8 portal-specific phases instead of Discovery's 6.

A new Area called "Portals" with a Landing page and the template gallery. Each template launches the walkthrough engine. Mirrors the Coding Area structure — landing page + tier/template selector + guided flows.

Implementation reuses:
- The prompt-builder layered pipeline (5 existing layers + a new `buildPortalWalkthroughLayer()`).
- Knowledge source system (user uploads brand assets, ANTON uses them as knowledge for design).
- Quality Ratchet (portal output scored at Phase 7).
- Apprentice Model (users progress through portal-building autonomy levels).

---

## Part F — AAP capability descriptor

### F.1 What it is

The capability descriptor is the machine-readable half of a portal. It is a JSON document served at the Gateway endpoint `/capabilities` on the portal's origin. Another ANTON fetches this descriptor, understands what the portal can do, and transacts with it directly via Gateway message types `capability_invoke` and `capability_inquire`.

**Full specification:** `ANTON_Portals_Capability_Descriptor_Schema_Reference.md`. This Spec gives the high-level shape and integration points only.

### F.2 Capability verb taxonomy (12 verbs)

Per Capability Schema §4.1:

| Verb | Purpose | Payment default | Trust |
|------|---------|----|----|
| `contact` | Free-form message | Free | Low |
| `inquire` | Structured question, structured response | Free | Low |
| `request` | Structured service request without commercial commitment | Usually free | Medium |
| `order` | Place a commercial order | Paid | Medium-high |
| `pay` | Send money without ordering — donation, invoice, transfer | Paid | Medium |
| `book` | Reserve time or capacity | Free or paid | Medium |
| `subscribe` | Opt into receiving updates | Free | Low |
| `join` | Request membership | Free or paid | Medium |
| `query` | Ask a structured question whose answer the portal publishes | Free | Low |
| `publish` | Declare that the portal publishes discoverable content | Free | Low |
| `delegate` | Accept delegated tasks from another ANTON | Varies | High |
| `authenticate` | Verify an identity or membership claim | Usually free | High |

Plus `custom` for capabilities outside the core. Custom capabilities are less discoverable (full-text search only, not verb-filtered).

### F.3 Signing and verification

- Descriptor signed by portal's Ed25519 key (same key bound to registry registration).
- RFC 8785 canonical JSON; Ed25519 detached signature; base64url unpadded.
- Visitor's ANTON verifies signature against public key fetched from registry.
- Descriptor includes `validFrom` and `validUntil`; expired descriptors rejected.
- Descriptor SHA-256 hash bound to registry entry via `update_capability_summary` operation.

### F.4 Policy enforcement (the agent half)

Capability Schema §7 defines machine-readable policies. The visitor's ANTON cross-references portal policies against the user's preferences:

- User policy "don't share data with portals retaining beyond 5 years" → flag before invoking `order` on a portal with `retentionDays: 2555` (7 years).
- User policy "EU-only data processing" → flag any portal with `transfersOutsideEEA: true`.
- User is 16 → block portals with `ageRequirement.minimumAge > 16`.

This is functional, not aspirational. v0.2 of this Spec confirms: visitor-side policy enforcement is a v0.7.x feature, not deferred.

---

## Part G — `anton.portal` discovery surface (Pathfinder integration)

### G.1 The pragmatic plan

Pathfinder is **not pluggable today.** `pathfinder-engine.ts:58` defines `SearchMode` as a hardcoded type union (7 modes); `MODE_INSTRUCTIONS` and `MODE_HINTS` are hardcoded dicts. There is no `registerEngine()`.

**Decision (per investigation note §E.3 Path A):** Extend `SearchMode` directly with `'anton-portal'`. Add corresponding entries in `MODE_INSTRUCTIONS` and `MODE_HINTS`. Wire the mode handler to the registry's `/search` endpoint and capability-summary indexing.

The strategic refactor to a true engine-registry pattern (Path B) is parked as Phase 11+ work. v0.2 of this Spec adopts the tactical add.

### G.2 What gets added

**SearchMode union extension** — `pathfinder-engine.ts:58` gains `'anton-portal'`.

**MODE_INSTRUCTIONS entry:** instructs the IRE to (1) use the registry `/search` endpoint, (2) match capability-verb filters to the canonical verb list, (3) rank by `last_seen_at` recency, public-index opt-in, and capability fit.

**Intent flow** for portal queries:
- "Find a service." "I need a caterer in Stockholm who handles events of 50-200 people." → IRE pre-search refines intent → registry search engine matches `verb=order AND tags=[catering] AND serviceArea=SE-AB` → post-search council ranks and summarises.
- "Find a person." "Does Jonas Karlsson have a portal?" → direct registry lookup with fuzzy name matching.
- "Find a community." "Are there any running clubs with ANTON portals in my area?" → capability-descriptor + tag search.
- "Browse." → high-quality recent portals in a category.
- "Compare." → existing comparison mode with portal capability descriptors as the data source.

The Pathfinder council (pre-search + post-search) is reused — it handles fuzzy human queries and result synthesis cleanly.

### G.3 Indexing

The registry maintains an index over public-index portals, fed from registry metadata + capability-summary `discoveryMetadata` (tags, service areas, capability verbs, languages). Queryable via full-text + filters (category, tag, service area, capability verb).

Privacy: portals with `public_index: false` are never indexed and never appear in `anton-portal` search results.

### G.4 `anton.portal` landing page

Typed address `anton.portal` (without a specific name) lands on the Pathfinder portal-discovery surface. Pre-configured with `anton-portal` mode enabled, featuring:

- Search box with IRE intent refinement.
- Category browse.
- Featured / New / Recently active lists (from registry metadata).
- Fair commerce toggle (surfaces non-commercial portals when enabled).
- User's own portal quick-access.

`anton.portal` (and the other reserved names per Registry Protocol §3.5) is rejected by the registry on attempted registration.

---

## Part H — Affected files

This is the concrete impact surface, derived from the investigation note.

### H.1 New files

**Migrations:**
- `server/db/migrations-pg/145_portals_client.sql` — local portal management tables (per-portal schemas, portal handler routes, capability descriptor cache, registry resolution cache).

**Registry protocol primitives:**
- `server/services/registry-protocol/canonical-json.ts` — RFC 8785 wrapper using `@truestamp/canonify`.
- `server/services/registry-protocol/envelope.ts` — envelope construction, validation, replay protection.
- `server/services/registry-protocol/signatures.ts` — sign/verify wrapper around `node:crypto`.
- `server/services/registry-protocol/operations/{register,update_metadata,update_capability_summary,rotate_key,transfer,revoke,heartbeat}.ts` — one file per operation type.

**Registry client library:**
- `server/services/registry-client/index.ts` — public client API.
- `server/services/registry-client/trust-store.ts` — operator key bundle.
- `server/services/registry-client/log-verifier.ts` — STH and inclusion-proof verification.
- `server/services/registry-client/cache.ts` — resolution cache with TTL.
- `server/services/registry-client/audit-writer.ts` — writes via existing `auditLogger.writeAuditEntry()`.
- `server/services/registry-client/rate-limiter.ts` — client-side respect for protocol rate limits.

**Portal-side services:**
- `server/services/portals/portal-walkthrough-engine.ts` — the 8-phase guided builder.
- `server/services/portals/walkthrough-depth.ts` — `getWalkthroughDepth(modelId, userThinkingLevel)`.
- `server/services/portals/portal-database-service.ts` — schema-per-portal CRUD in local PostgreSQL.
- `server/services/portals/portal-renderer.ts` — turns portal database rows into HTML.
- `server/services/portals/portal-handler.ts` — Gateway-routed handler responding to `portal_fetch`, `capability_invoke`, `capability_inquire`.
- `server/services/portals/portal-publisher.ts` — orchestrates Phase 8 (write to DB → register in registry → activate handler).

**Capability descriptor:**
- `server/services/capability-descriptor/schema.ts` — JSON Schema definitions (Draft 2020-12).
- `server/services/capability-descriptor/validator.ts` — uses ajv (new dependency, scoped here).
- `server/services/capability-descriptor/signer.ts` — reuses Registry Protocol signing primitives.
- `server/services/capability-descriptor/builder.ts` — constructs descriptors from walkthrough output.
- `server/services/capability-descriptor/hash.ts` — descriptor SHA-256 hash for registry binding.
- `server/services/capability-descriptor/verbs/{contact,inquire,request,order,pay,book,subscribe,join,query,publish,delegate,authenticate,custom}.ts` — one file per verb with baseline schema.

**Routes:**
- `server/routes/portals.ts` — local CRUD on the user's own portals.
- (Registry server endpoints live in the separate registry-server repo.)

**Pages:**
- `src/pages/PortalsLandingPage.tsx` — `/portals`, area landing + template gallery.
- `src/pages/PortalBuilderPage.tsx` — `/portals/build/:templateId`, the AI-led walkthrough.
- `src/pages/PortalManagePage.tsx` — `/portals/:id/manage`, edit / republish / export / revoke.
- `src/pages/PortalViewerPage.tsx` — `/p/:portalAddress`, renderer for visiting another portal.

**Components:**
- `src/components/portal/PortalRenderer.tsx`, `CapabilityInvocationPanel.tsx`, `PolicyWarningBanner.tsx`, `OfflineCard.tsx`, `WalkthroughPhaseStepper.tsx`.

**Area scaffold:**
- `server/areas/portals/area.json` — area metadata (id, label, icon, color).
- `server/areas/portals/area-context.md` — narrative context for the area.
- `server/areas/portals/modules/{portal-classifier,portal-content-writer,portal-capability-designer,portal-aesthetic-designer,portal-reviewer}/` — at least 5 modules supporting the walkthrough phases.
- `src/lib/area-patches/portals-patch.ts` — `PORTAL_MODULES` array, spread into `MODULES`.

### H.2 Existing files to extend

- `server/services/anton-bundler.ts` — add `'portal'` to `BUNDLE_TYPE_REGISTRY` (line 78-121); add export and import handlers mirroring `hardware-project`.
- `server/services/antonExport.ts` — add portal export branch.
- `server/services/antonImport.ts` — add portal import branch + adaptation-session trigger.
- `server/services/identity.ts` — add `publicKeyToWireFormat()` helper (hex DER → base64url unpadded).
- `server/services/auditLogger.ts` — add registry-operation event types to the type union (no schema change).
- `server/services/pathfinder-engine.ts` — extend `SearchMode` union with `'anton-portal'`; add `MODE_INSTRUCTIONS` + `MODE_HINTS` entries; add registry-search engine handler.
- `server/services/discovery-engine.ts` — no changes; portal walkthrough is a sibling engine, not an extension.
- `server/services/prompt-builder.ts` — add `buildPortalWalkthroughLayer()` for context injection during walkthrough phases.
- `server/services/quality-ratchet.ts`, `apprentice.ts` — no internal changes; the portal walkthrough invokes existing entry points (`scoreOutput()`, `recordSession()`).
- `src/lib/constants.ts` — add `'portals'` entry to `AREAS` const.
- `src/App.tsx` — register the four new portal routes.

### H.3 New dependencies

- `@truestamp/canonify` (or vetted equivalent) — RFC 8785 canonical JSON.
- `ajv` + `ajv-formats` — JSON Schema Draft 2020-12 validation, scoped strictly to capability descriptors.

### H.4 NOT in this spec (separate deliverables)

- **Registry server implementation.** Lives in its own repo. Operations, deployment, abuse pipeline, GDPR per `ANTON_Portals_Registry_Server_Ops_Spec.md`.
- **The wire protocol itself.** Defined in `ANTON_Portals_Registry_Protocol_Reference.md`.
- **The descriptor format itself.** Defined in `ANTON_Portals_Capability_Descriptor_Schema_Reference.md`.

---

## Part I — Implementation order

The three companion reference docs are now drafted. Implementation order is:

1. **Investigation note finalised.** ✓ Done — `investigation/portals-investigation.md`.
2. **Migration 145** — local portal tables.
3. **Registry-protocol primitives** (signing, canonicalisation, envelope construction) — atomic, testable in isolation.
4. **Registry-client library** (with trust store + log verifier + cache + audit writer + rate limiter).
5. **Capability descriptor** — schema + validator + signer + builder + hash + verb baselines.
6. **Portal bundle handler** — extend `anton-bundler.ts` with `'portal'` type. Round-trip empty bundles to validate the manifest.
7. **Portal database service** — schema-per-portal CRUD in local PostgreSQL.
8. **Portal handler** — Gateway-routed handler for `portal_fetch`, `capability_invoke`, `capability_inquire`. Serves hardcoded HTML for testing first.
9. **Portal renderer** — turns DB rows into HTML. Templating engine TBD during this step (see Part O.4).
10. **Portal Viewer page** — UI rendering another user's portal. Resolve → Gateway fetch → render. Implements offline card.
11. **Portal walkthrough engine** — 8-phase guided builder.
12. **Portal Builder page + Portals landing + template gallery.**
13. **Walkthrough conversation templates** — the 7 starter templates.
14. **Portal Manage page** — edit / republish / export / revoke.
15. **Pathfinder `anton-portal` mode** — extend `SearchMode`, wire to registry search.
16. **`anton.portal` landing page** — the Pathfinder-powered discovery surface.
17. **End-to-end validation.** Build a real portal via the walkthrough. Register it. Visit from a second ANTON instance. Verify capability discovery. Export, import on a third instance, adapt, republish.
18. **Polish, documentation, release notes.**

### Non-negotiable ordering constraints

- Steps 3-5 must complete before step 6 (bundle handler depends on descriptor format).
- Step 4 (registry client) must be at least beta before step 10 (portal viewer needs to resolve names).
- Step 13 (templates) must complete before step 12 (UI without templates is empty).
- Step 17 must pass fully before any external announcement.

### Critical path note

The registry **server** (separate repo) must be at least in beta before step 10 of this spec. That work runs in parallel and is owned by FutureChain ops, not this codebase.

---

## Part J — Acceptance criteria

### J.1 Functional

- [ ] A user builds a portal end-to-end through the AI-led walkthrough without writing HTML or SQL directly.
- [ ] `getWalkthroughDepth(modelId, userThinkingLevel)` returns sensible values across all supported models; smaller models get simpler walkthroughs.
- [ ] All 7 template types produce functioning portals.
- [ ] A built portal is registered in `anton.portals` (signed `register` operation per Registry Protocol §5.1) and resolvable from a second ANTON instance.
- [ ] A second ANTON visiting the portal renders the HTML and can fetch + verify the capability descriptor.
- [ ] A visitor can invoke a capability (e.g. `capability_invoke` for an `order`) and the origin's ANTON receives it via the Gateway transport.
- [ ] If the origin is offline, visitor sees the generic offline card — not stale content, not an error page.
- [ ] A portal exports as `.anton`, imports on another instance, adapts via guided session, republishes.
- [ ] Portal handler reuses Companion App Gateway transport — no new TLS management, no parallel handshake.
- [ ] `anton.portal` search surfaces public-indexed portals via Pathfinder.
- [ ] A portal marked `public_index: false` is invisible in `anton.portal` search but resolvable by direct name.
- [ ] Portal names are unique within a namespace and rejected by registry confusable detection.
- [ ] A portal owner updates metadata, revokes, or transfers the name with signed operations per Registry Protocol §5.
- [ ] Transparency log inclusion proofs verify on the client for the user's own operations.
- [ ] Visitor-side policy enforcement: data-retention mismatch, EEA-only mismatch, age-gate all surface visible warnings.

### J.2 Non-functional

- [ ] Portal-fetch latency from second ANTON (origin online) under 500ms on typical broadband.
- [ ] Walkthrough completion time for a basic Personal portal under 10 minutes on Opus 4.7.
- [ ] No duplication of bundling logic — `anton-bundler.ts` handles portals exactly as it handles other bundle types.
- [ ] No parallel search UI — `anton.portal` is a Pathfinder mode.
- [ ] No new TLS management for portal-to-portal.
- [ ] No public DNS zone for portals.
- [ ] All registry operations signed end-to-end and verifiable.
- [ ] Offline card renders in under 200ms after resolve-success-then-fetch-fail.

### J.3 Quality

- [ ] Output HTML passes WCAG AA accessibility checks on the standard templates.
- [ ] Capability descriptors validate against the descriptor schema (ajv) before publish.
- [ ] Every portal bundle validates against the portal manifest schema on export and import.
- [ ] Audit log captures every registry operation on the user's own ANTON (resource_type='portal').
- [ ] Walkthrough output scored by Quality Ratchet; portals below threshold trigger a review before publish.
- [ ] Apprentice records portal-builder sessions with quality scores.

---

## Part K — Future phases (documented, not in scope for v0.7.x)

### K.1 Registry federation deployment

The protocol is federation-ready (per Registry Protocol §11). Deployment of federated registries (Mistral, sovereign-EU) is a v2 ops decision, not a protocol redesign.

### K.2 Optional public read-only bridge

A portal owner flips a switch: "render a static, read-only copy on the public web." FutureChain provides a bridge service that fetches the portal once per hour and publishes a static snapshot on public HTTPS. Dynamic features (capability invocation, ordering) still require ANTON.

### K.3 ANTON address as email bridge

`owner@local-catering.futurechain.portal` bridged to real SMTP. Ops problem more than tech problem (deliverability, spam reputation). The addressing schema already supports it.

### K.4 Managed always-on hosting

Red Hat-model value-added offering: FutureChain runs your ANTON instance to keep your portal online. Portal content remains portable as `.anton` bundles.

### K.5 Marketplace integration

Commerce-category portals are natural marketplace members. Integration with the ANTON Marketplace (Layer 5) means a portal can list products/services discoverable from the Marketplace, with FutureChain payment rails.

### K.6 The Beehive × Portals

Multi-ANTON deliberation (The Beehive) consumes portal capability descriptors when relevant portals exist. Specifying how Beehive sessions discover and call capabilities is its own spec.

### K.7 Pathfinder engine-registry refactor

The strategic refactor (per investigation note §E.3 Path B) — turn Pathfinder's `SearchMode` enum into a true plugin registry. Phase 11+ work. Enables third-party engines without a code change.

### K.8 Social key recovery

v1.1+ of the Registry Protocol activates `rotate_key_via_recovery` and `declare_recovery_contacts` operations (already reserved in v1.0.0 envelope). Pre-declared recovery contacts collectively sign a key rotation.

### K.9 Third-party attestation issuers

v1.1+ of the Capability Schema activates signed attestations (already reserved). Trust registry of issuers (openEXPERT-marketplace, futurechain-gateway, futurechain-kyc).

---

## Part L — Scope guardrails: what this is NOT

To prevent scope creep during build, the following are explicitly NOT in scope for v0.7.x and must be rejected if they surface:

- **Not a public website builder.** No public HTTPS for portal content, no public DNS, no SEO, no Google indexing.
- **Not a blogging platform.** Portals may have post-like pages, but no blog infrastructure (feeds, subscriptions, comment threads) in v1.
- **Not a social network.** No timelines, friend requests, follows, mentions, notifications.
- **Not a payment processor.** FutureChain payment rails are a separate deliverable. Commerce portals expose payment capability *descriptors*; v0.7.x does not process payments end-to-end.
- **Not a CMS.** No content versioning UI beyond portal-level export/import. No editorial workflow.
- **Not a custom-domain service.** No `bardun.se` pointing at a portal. Addressing is `<name>.<namespace>.portal`, period.
- **Not a DMCA / moderation bureau.** FutureChain runs a registry abuse-report queue (Ops Spec §6). It does not proactively moderate portal content.
- **Not federated in v1.** Registry is FutureChain-only deployment. Federation protocol is designed but not deployed.
- **Not a public read-only bridge in v1.** Deferred to K.2.
- **Not an email service in v1.** ANTON addresses work for Gateway routing only. Deferred to K.3.
- **Not a Pathfinder refactor.** Tactical extension only. Engine-registry refactor deferred to K.7.

If during implementation a feature request matches any of the above, stop and escalate.

---

## Part N — Glossary

- **Portal** — A user-created ANTON-only web space, simultaneously a human-facing site and a Gateway endpoint with a machine-readable capability descriptor.
- **Registry** — The always-online service (`anton.portals`) that maps portal names to contact hashes. Run by FutureChain AB (operator id `ANTON-REG-FUTURECHAIN-V1`). Spec: Registry Protocol Reference + Server Ops Spec.
- **Origin** — The user's own ANTON instance, where a portal's content and handler live.
- **Portal Viewer** — The renderer inside the visitor's ANTON client.
- **Portal Handler** — The Gateway-routed handler on the origin that serves portal content.
- **Capability descriptor** — The signed JSON document exposing machine-readable intent of a portal. Spec: Capability Descriptor Schema Reference.
- **ANTON address** — `<localpart>@<portal-name>.<namespace>.portal`, used as Gateway routing target.
- **Namespace** — The registry-scoped name space (e.g. `futurechain`, future `mistral`).
- **Template** — A portal starter pattern (Personal, Business, Commerce, etc.) — walkthrough configuration + starter content + default capability descriptor.
- **Walkthrough** — The AI-led 8-phase guided conversation that builds a portal.
- **Transparency log** — Append-only public record of all successful registry operations except heartbeats. Hourly Signed Tree Heads. RFC 6962-compatible.
- **STH** — Signed Tree Head. Registry's signed commitment to the current Merkle root.
- **Investigation note** — `investigation/portals-investigation.md`, the consolidated findings from running the three Investigation Protocols.
- **Walkthrough depth** — Replacement for `getPromptTier()`. `getWalkthroughDepth(modelId, userThinkingLevel)` returns `simple|standard|deep`.

---

## Part O — Open questions for Daniel before build

Most v0.1 open questions resolved by the three reference docs. What's still open as of v0.2:

1. **FutureChain payment vocabulary.** Capability Schema §6 is structurally locked but `type` enum values are placeholders (`stablecoin`, `native`, `invoice`, `escrow`, `offline`). Confirm with FutureChain payment team before v1.0.0 freeze of Capability Schema.
2. **Templating engine for the portal renderer.** Handlebars / Mustache / React-server-render-to-static / custom. Decide during step 9 of Part I implementation, based on what's already in the codebase.
3. **Hosting region commitment.** Ops Spec §3.1 recommends Hetzner EU. Confirm.
4. **HSM provider for operator identity key.** Ops Spec §16. Decide during procurement.
5. **Swedish data protection lawyer engagement.** Ops Spec §16. Identify and engage before launch.
6. **Designated registry succession entity.** Ops Spec §12.3. Defer decision, but document as standing agenda item.
7. **School pillar templates (Classroom, Teacher) in v0.7.x ship set?** If yes, walkthrough engine ships with 9 templates instead of 7.
8. **Pathfinder `anton-portal` mode default-on or opt-in?** Strategic Ground recommends default-enabled but clearly labelled. Confirm.
9. **Reserved-name regex bug fix.** Known issue: `community-crypto.ts:24` regex rejects valid identity-derived contact hashes. Fix as a separate cleanup, not part of Portals build, but track.
10. **Capability Schema dot-path → nested-JSON addendum.** Capability Schema §11 currently uses dot-path; existing `public/locales/*.json` is nested. Issue v1.0.0-A1 of the Capability Schema Reference to switch to nested.

---

## Part P — Cross-document consistency checklist

When implementing, verify these invariants hold:

- [ ] Every signed operation uses the same scheme: Ed25519 over RFC 8785 canonical JSON via `@truestamp/canonify`.
- [ ] Every namespace reference is explicit (`futurechain`), never implicit.
- [ ] Every payload timestamp uses ISO 8601 UTC with millisecond precision and `Z` suffix.
- [ ] Every version declaration uses semver.
- [ ] Every HTTP endpoint returns standard status codes with the documented error envelope (Registry Protocol §8).
- [ ] Every operation is transparency-log-eligible OR explicitly declared not-logged (heartbeat is the only exception).
- [ ] Every client-caching rule consistent (TTL semantics, negative caching).
- [ ] Every GDPR-touching field called out in privacy analysis (Ops Spec §7).
- [ ] No hand-rolled cryptography; reuse `node:crypto` via the existing identity layer.
- [ ] No hand-rolled canonicalisation; reuse `@truestamp/canonify`.
- [ ] No new transport layer; reuse Companion App Gateway.
- [ ] No new audit table; reuse `audit_log` via `auditLogger.writeAuditEntry()`.
- [ ] No new HTTP client; reuse native `fetch()` + `AbortSignal.timeout()`.

---

**End of specification v0.2.**

*Extend via numbered addenda (0.2-A1, 0.2-A2, etc.) for clarifications. Substantive scope changes produce v0.3. Companion documents — Registry Protocol Reference v1.0.0-draft, Capability Descriptor Schema Reference v1.0.0-draft, Registry Server Ops Spec v1.0.0-draft — are at lockable state pending Daniel's sign-off on the open questions in Part O.*
