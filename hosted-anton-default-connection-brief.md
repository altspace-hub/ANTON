# Hosted ANTON as Default Connection — Architecture Brief

**For:** Claude Code
**Date:** 8 May 2026
**Status:** Build brief — pending architectural decisions flagged below
**Related:** AAP (`30-aap-protocol.md`), Companion App Gateway (`31-companion-app-gateway.md`), Portals (`33-portals-pathfinder.md`), v0.8.0 Visitor Layer

---

## 1. What we are building

A hosted ANTON instance — referred to in this brief as **the default connection** — that the Companion App connects to automatically on first launch. It serves the social and transactional layer (chat, Portals visitor layer, and a payment seam ready for FutureChain) without requiring the user to install or have access to a local ANTON.

**Privacy posture, stated upfront.** The operator of the hosted instance can see *who connects when* and *who messages whom* — connection metadata, peer identifiers, message timing, message-size patterns. The operator **cannot** see message content; everything is end-to-end encrypted with keys that never leave the user's device. This is the same trade Signal makes versus Briar. It is the central architectural trade-off of this whole brief and must be stated this way to users on first launch, in the privacy notice, and in developer documentation. The hosted instance is not a back door for content; it is a known metadata controller, with the legal status that follows (see Phase 0.5).

This is **not a separate "Light ANTON" application.** The Companion App remains a single product, using its existing multi-connection capability (already used for local ANTON and organisation ANTONs). The hosted instance is the default connection on first launch. Users can add local or organisation ANTONs as further connections without losing identity, contacts, or history — the user is the durable entity, the connection is not. **The default connection is fully demotable**: a user with another working connection (local or organisation ANTON) can disconnect from hosted entirely and operate purely peer-to-peer. Without this, the architecture contradicts the rest of the project's sovereignty posture and creates a back door to centralisation.

The hosted instance **does not run AI or Work modules.** Those remain on local and organisation ANTONs. The hosted instance is strictly:

- Identity registry and contact hash resolution
- AAP message routing (chat, both 1:1 and group)
- Group key coordination
- Encrypted media blob storage
- Portals visitor layer (public surface)
- Payment-message transport (stub in v1, real integration via FutureChain later)

Both transports are supported: mesh (AAP via `relay.futurechain.eu`) and HTTPS, mirroring the dual-transport setup already running for chat and Portals.

---

## 2. Mandatory investigation phase

**Do not begin implementation until the gap analysis below is produced and reviewed.** The platform has materially evolved past prior architecture docs; this brief assumes the codebase is the source of truth.

### 2.1 AAP transport and message types

```bash
find . -type f -name "*.ts" -path "*/aap/*" | head -50
grep -rn "MessageType\|message_type" --include="*.ts" | head -50
grep -rn "interface.*Message\|type.*Message" --include="*.ts" | grep -iE "aap|chat" | head -30
```

Document: existing message-type union, dispatch points, encryption envelope, handshake flow, and which message types already exist for chat 1:1, groups (if any), media, and Portals.

### 2.2 Companion App connection management

```bash
find . -path "*companion*" -type f \( -name "*.ts" -o -name "*.tsx" \) | head -50
grep -rn "connection\|Connection" --include="*.ts" --include="*.tsx" | grep -iE "companion|gateway|workspace|org" | head -40
find . -name "*.ts" -path "*gateway*" | head -30
```

Document: the current shape of a "connection," how multiple connections are stored on-device, how connection switching works, and where the default endpoint would be configured.

### 2.3 Identity, keys, and contact hash

```bash
grep -rn "ANTON-XXXX\|contactHash\|contact_hash\|generateIdentity" --include="*.ts" | head -40
find . -name "*.ts" -path "*identity*" | head -30
find . -name "*.ts" -path "*crypto*" | head -30
grep -rn "Ed25519\|X25519\|AES-256-GCM" --include="*.ts" | head -30
```

Document: identity generation flow, key storage on-device, contact-hash derivation, and any recovery primitives already in place.

### 2.4 Existing chat infrastructure

```bash
find . -path "*/chat/*" -type f \( -name "*.ts" -o -name "*.tsx" \) | head -50
grep -rn "groupChat\|group_chat\|GroupMessage\|SenderKey\|MLS" --include="*.ts" | head -30
```

Document: 1:1 chat protocol as it stands, any group-chat scaffolding (this is the most likely surprise area), media handling.

### 2.5 Portals state (v0.8.0 visitor layer)

```bash
find . -path "*/portals/*" -type f | head -50
grep -rn "VisitorLayer\|visitor_layer\|/portals/" --include="*.ts" --include="*.tsx" | head -30
```

Document: visitor-layer build state, what is served over HTTPS today, what depends on a local heavy ANTON. Note the open `/portals/mine` 500 regression — flagged as mandatory fix before further Portals work.

### 2.6 Mesh + HTTPS dual transport

```bash
grep -rn "mesh\|relay.futurechain" --include="*.ts" | head -40
find . -name "*.ts" -path "*transport*" | head -30
grep -rn -iE "transport.*(https|mesh)|(https|mesh).*transport" --include="*.ts" | head -20
```

Document: how transport selection works today, **whether the HTTPS path runs AAP-over-HTTPS (same encryption envelope, transport-pluggable) or a separate REST-style protocol with different semantics.** This is critical — see Decision 1.

### 2.7 PostgreSQL schemas

```bash
ls -la db/migrations/ 2>/dev/null
find . -name "*.sql" -path "*migration*" | head -50
grep -rn "CREATE TABLE\|CREATE SCHEMA" --include="*.sql" | head -80
```

Document: which schemas exist, which tables relate to identity / chat / portals / connections / payments, and which schemas the hosted minimal configuration will need versus which it will not.

### 2.8 AST scan with `ts-morph`

Run a structured scan to enumerate:

- All AAP message-type union members and their dispatch sites
- All `Transport` interface implementations
- All `Connection` interface implementations
- Every binding point where AI / Work modules are loaded — confirm they can be excluded by configuration **without code branches** in the AAP, chat, or Portals paths. If branches are required, that is a refactor in Phase 1.

### 2.9 Investigation deliverable

Produce `docs/briefs/hosted-anton-investigation.md` containing:

- Confirmed answers to **Decision 1** and **Decision 7** based on what the codebase reveals
- Gap list: features the hosted minimal configuration needs that do not yet exist
- Risk list: any place where AI/Work modules are not cleanly separable from the social/transaction layer
- File-level inventory of everything Phases 1–6 will touch

---

## 3. Architectural decisions to flag (do not resolve unilaterally)

These must be answered by Daniel before the corresponding phase begins. The investigation should surface evidence for each, not pick.

| # | Decision | Blocks phase | Evidence to gather |
|---|---|---|---|
| 1 | AAP-over-HTTPS (transport-pluggable, same envelope) or separate REST protocol on the HTTPS path? | Phase 1 | Inspect HTTPS chat/Portals code; same encryption envelope or different? |
| 2 | Group chat protocol: MLS, Signal-style Sender Keys, or constrained semantics for v1? | Phase 3 | Existing scaffolding; maintenance cost; library availability |
| 3 | Media blob hosting: relay-only initially, or peer-hosted from day one (heavy ANTONs as stores)? | Phase 3 | Existing storage patterns; cost projection for relay-only |
| 4 | Identity recovery: encrypted backup to hosted instance, recovery phrase, both, or neither? | Phase 5 | Existing recovery primitives if any |
| 5 | Naming of the default connection (`ANTON Network`, `connect.anton.network`, no badge, etc.) | Phase 2 (UX copy) | Pure product decision |
| 6 | Pricing posture for the hosted default (free forever, eventually tiered) | Phase 1 (abuse limits, quota config) | Pure product decision |
| 7 | Written scope rule: what the hosted instance runs and does not run | Phase 1 | Where AI/Work module binding currently sits |
| 8 | Private mesh-only portals as a future seam (in scope or out for v1)? | Phase 4 | Visitor-layer architecture |
| 9 | Operator legal entity: FutureChain itself, or a dedicated subsidiary? | Phase 0.5 (the whole phase) | Existing FutureChain corporate structure; AMLR-obligated-entity exposure if FutureChain takes both communications-controller and payments-rail roles; tax/jurisdiction implications; supervisory-authority venue (Sweden vs elsewhere) |

Decisions 1, 7, and 9 are critical-path. Decision 9 in particular precedes every other Phase 0.5 task — without a named entity there is no controller to register, no DPO to appoint, no party to sign sub-processor DPAs. The others can be flagged when their phase begins.

---

## 4. Build phases

### Phase 0.5 — Compliance and legal entity

**Working document:** `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md` — the full plan with controller-status analysis, lawful bases per operation, DPIA scope, Article 30 records framework, DPO options, Article 26 joint-controller template, Article 32 TOMs, retention rules designed into code, and the GDPR/AMLR conflict resolution. Read that document for detail; what follows is the summary.

**Not optional and not "writing this between sprints."** Operating `connect.anton.network` and `relay.futurechain.eu` makes the operator a GDPR controller for connection metadata on both transports. CJEU *Breyer* (C-582/14) and *La Quadrature du Net* (C-511/18) make the e-Commerce Directive "mere conduit" defence unavailable for data protection. Status: controller for connection metadata on mesh and HTTPS, not controller for E2E content because it cannot decrypt. Confirm with EU data-protection counsel before staging — this brief is not legal advice.

**Scope (summary)**

- Legal entity: registered operator for `connect.anton.network` and `relay.futurechain.eu`, with registered address and DPO contact published
- DPIA (Article 35), Article 30 records, DPO appointment, Article 26 joint-controller template, Article 28 sub-processor DPAs (Bahnhof + others)
- Privacy notice with Article 13 disclosures including honest "we cannot decrypt your content" statement
- First-launch privacy summary in the Companion App before identity is generated
- Retention and logging policies enforced *in code* with automated tests — not just documented
- Phase 1 schema must reserve AMLR-scope tables now, so Phase 6 doesn't migrate live data
- Joint GDPR + AMLR compliance plan, not two separate plans

**Affected files** — `docs/HOSTED_ANTON_COMPLIANCE_PLAN.md`, privacy-notice page, ToS, schema retention metadata, logging middleware, relay configuration, Companion App first-launch surface.

**Acceptance** — every gate in §16 of the compliance plan closed. Counsel sign-off converts the plan from Draft to Active.

**Critical-path dependency.** DPO appointment → DPIA drafting → DPIA sign-off → Phase 2 production unblock. Even with an external DPO firm engaged immediately, this chain is plausibly 6–10 weeks elapsed time. Plan the schedule around this: kick off DPO selection on **day one** of Phase 0.5, in parallel with Decision 9 (legal entity), not sequentially after entity registration completes. Otherwise Phase 2 sits ready and shipping-blocked while the legal sequence catches up.

**Blocks** — Phase 2 production rollout. Phase 2 staging-internal work can proceed in parallel.

---

### Phase 1 — Hosted ANTON instance scaffold

**Scope**

- A deployable ANTON configuration that runs only the hosted-minimal subset: identity registry, AAP routing, group key coordination, Portals visitor layer, encrypted blob storage, payment-message transport stub
- AI and Work modules disabled by configuration (per Decision 7) — without code branches in the AAP / chat / Portals paths
- DNS and endpoint provisioned (per Decision 5); placeholder `connect.anton.network`
- PostgreSQL schema for the hosted-minimal subset (dedicated schema or feature flag — investigation determines which is correct). **AMLR-scope tables (counterparty, amount, timestamp, KYC inputs, sanctions-screening results) reserved now even if empty**, per compliance plan §15.2 — this is the only way to avoid migrating live identity rows in Phase 6
- Relay binding to `relay.futurechain.eu` confirmed working from the hosted instance

**Affected files** — emerge from investigation; expect deployment configs, module loader, AAP routing layer, the schema migration directory (including the AMLR-reservation migration).

**Acceptance**

- Hosted instance deploys to staging
- AAP messages route end-to-end between two test peers connected to it
- AI/Work module endpoints return feature-flagged-disabled responses
- Portals visitor layer serves public content over HTTPS
- Operational basics in place: structured logs, metrics, abuse rate-limits, uptime monitoring
- AMLR-scope tables exist in the schema (empty until Phase 6) and are documented in the Article 30 records and compliance plan
- Documented runbook for restart, schema migration, key rotation

### Phase 2 — Default connection in the Companion App

**Scope**

- First-run onboarding: generate identity on-device (Ed25519 / X25519), derive `ANTON-XXXX-XXXX-XXXX-XXXX`, register with hosted instance, persist locally
- Connection management UI extended: hosted is the **default first connection but is fully demotable** (per §1). A user with at least one other working connection (local or organisation ANTON) can disconnect from hosted entirely and operate purely peer-to-peer
- Hosted endpoint stored as configurable, with a sensible compiled-in default
- Push-notification registration: APNs (iOS) and FCM (Android). Push tokens are personal data and APNs/FCM dispatch flows to US infrastructure — covered by SCCs / adequacy paperwork in Phase 0.5 (compliance plan §10). Payload contains only an opaque event identifier + severity, never message content (Companion App spec §8.7)
- First-launch privacy-summary surface (per compliance plan §4.2) shown before identity is generated

**Affected files** — Companion App onboarding screens, connection store, identity module, first-launch privacy surface, push registration adaptor.

**Acceptance**

- Fresh install completes onboarding without any user-supplied configuration
- Identity persists across app launches and uninstall/reinstall on the same device
- Contact hash is visible to the user and shareable via copy / QR
- A second connection (e.g. a local ANTON on the LAN) can be added alongside the default
- Switching between connections is non-destructive — no state loss
- A user with at least one other working connection can fully remove the hosted default; identity, contacts, and history persist
- Push tokens registered and stored per identity, never logged in plaintext, payloads carry no message content
- First-launch privacy-summary surface is shown and acknowledged before identity registration

### Phase 3 — Chat over hosted (1:1, groups, media)

**Scope**

- 1:1 chat: verify the existing mesh-chat path works through the hosted connection over both transports (mesh and HTTPS)
- Group chat: implement chosen protocol from Decision 2; key rotation on member add / remove
- Media: encrypted upload to blob store per Decision 3; on-device compression for photos and short videos; decryption on receipt
- Voice and video calls explicitly out of scope for v1

**Affected files** — AAP message-type dispatcher, chat UI, media pipeline, blob-storage adapter.

**Acceptance**

- 1:1 chat works between two Companion App users connected only to the hosted default
- N-participant group chat (N specified by Decision 2) works with key rotation on membership change
- Photos send and receive end-to-end encrypted
- Videos under a defined size limit send and receive end-to-end encrypted
- Read receipts and delivery state behave consistently across both transports
- Offline queueing: messages composed offline send on reconnect

### Phase 4 — Portals visitor layer over hosted

**Scope**

- Extend the visitor layer (already in the v0.8.0 build) to be served from the hosted instance as HTTPS-primary
- The 15 category destinations and two tiers are unchanged; the change is reach — anyone with the Companion App can browse without a local ANTON
- Resolve the `/portals/mine` 500 regression if not already done — mandatory before further Portals work

**Affected files** — Portals routing, visitor-layer renderer, Companion App Portals view.

**Acceptance**

- A fresh Companion App install with only the hosted connection can browse the visitor layer
- Public portals load over HTTPS without authentication
- `/portals/mine` returns 200 for authenticated users
- Per Decision 8, either explicitly-out-of-scope private portals are flagged as a future seam, or a stub for them exists

### Phase 5 — Identity recovery

**Scope** — blocked on Decision 4. Implementation flows from the chosen recovery model. If Decision 4 = "neither," Phase 5 is a no-op and the privacy notice plus first-launch surface state plainly that device loss = identity loss.

**Acceptance — applies if Decision 4 ≠ "neither":**

- A user can lose their device, install the Companion App on a new device, and recover identity and message history per the chosen model
- The recovery flow does not require trust assumptions inconsistent with the privacy posture — if the recovery model relies on the hosted instance, the privacy notice says so explicitly
- Recovery is testable end-to-end in CI

**Acceptance — applies if Decision 4 = "neither":**

- Both the first-launch surface and the privacy notice state explicitly that device loss = permanent identity loss
- No recovery-related affordances exist in the UI that could mislead users into believing recovery is available

### Phase 6 — Payment seam stubs

**Scope**

- Add `payment_request` and `payment_confirmation` message types to AAP
- Add wallet identifier binding to the identity schema (`contact_hash` ↔ wallet)
- Stub the FutureChain transport hooks — interfaces present, implementation throws "not yet wired"
- No real payments
- **Reserve schema fields for KYC, sanctions, and transaction-monitoring metadata** that the future payment integration will require under AMLR. Daniel's domain expertise applies here — flag these fields for review rather than designing them unilaterally.

**Affected files** — AAP message-type registry, identity schema, FutureChain transport adaptor module.

**Acceptance**

- New message types serialise and deserialise correctly across both transports
- Wallet binding persists per identity
- AMLR-scope tables (reserved in Phase 1 per compliance plan §15.2) verified to match the documented field-level retention and access annotations; access controls enforced and tested
- Article 30 record for AMLR-scope processing populated and reviewed by the DPO before any real payment operation can wire
- Hooks for compliance event emission (e.g. `onPaymentInitiated`, `onCounterpartyResolved`) exist as no-ops

---

## 5. Caveats and honest constraints

- **Hosted infrastructure is ongoing operational responsibility.** Cost, uptime, and abuse handling — none of which are part-time work once user counts grow. Metadata-controller status and the privacy posture that follows are addressed in §1 and Phase 0.5.
- **Group chat protocol choice is real engineering work.** MLS is the rigorous standard but a substantial implementation. Sender Keys are simpler but less robust under membership churn. Constrained semantics (small groups, simple membership) is a v1 path that buys time. None are quick wins; the schedule must reflect the chosen path.
- **Identity recovery is a UX problem first, a backend problem second.** Getting it wrong loses users their identities permanently. The decision should be made with that gravity.
- **Compliance hooks for payments must be designed in now, not retrofitted.** AMLR will apply to the FutureChain rail. Even if v1 ships no payments, the schema and message-type design should anticipate KYC, transaction monitoring, and sanctions screening.
- **PostgreSQL on the hosted instance.** SQLite is removed from the platform; the Companion App's local-cache use of SQLite / IndexedDB on-device is unchanged and unrelated.
- **No Llama weights bundled** — Meta licence remains incompatible with Apache 2.0. Not directly relevant here, but flagged so it is not forgotten if anything in Phase 1 starts pulling model assets.
- **The hosted instance is not a back door.** It must not become a place where AI / Work modules quietly accrete because "it's just one feature." The scope rule from Decision 7 is the gate. Any future pillar wanting hosted presence requires an explicit brief.

---

## 6. Out of scope for this brief

- Voice and video calling (defer to a separate brief)
- AI / Work module access via the hosted connection
- Marketplace functionality beyond the future-payment-seam preparation
- Full Beehive participation from a hosted-only client
- Private mesh-only portals (Decision 8 may move this in or out for a future brief)
- Migration of existing local-only Companion App users onto a hosted default — UX is a separate brief, but the *legal* mechanics under Article 26 (joint controllership) apply from the moment such a user connects to the hosted relay, regardless of when the UX brief lands. See compliance plan §8

---

## 7. What good looks like

A new user downloads the Companion App, completes a sub-30-second onboarding, sees their `ANTON-XXXX-XXXX-XXXX-XXXX`, and can immediately:

- Message any other ANTON user (light or heavy) 1:1 or in a group, with photo and video sharing
- Browse the public Portals visitor layer
- See a place reserved in the protocol for future FutureChain payments

They later install a local ANTON and add it as connection #2 without losing anything — same identity, same contacts, same history. The two clients see the same user, on the same network, with different capabilities exposed by the connection they are using.
