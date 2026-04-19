# Portals — Next-Phase Implementation Plan

**Date:** 2026-04-19
**Status:** Pre-build — three parallel work tracks scoped after Phase 11 audit-fix shipped
**Spec target:** `ANTON_Portals_Spec.md` v0.4 (post-implementation)
**Inputs:** Three parallel investigations spawned 2026-04-19 covering registry server, AAP transport, LLM walkthrough

---

## 0. TL;DR

The Portals build's Phase 1-10 + Phase 11 (audit-fix) work is shipped and production-clean within v0.7.x scope. **Three multi-week tracks remain to make the system match its spec narrative end-to-end**:

| Track | What it unlocks | Honest scope | Blocks what? |
|---|---|---|---|
| **A. Registry server** (separate repo) | Cross-network portal discovery, transparency log, federation | **8-12 ew** to production, **4-6 ew** to beta | Track B-WAN; nothing else |
| **B. AAP transport (LAN-only first)** | Cross-instance portal visiting on same network | **3-4 ew** for v0.7.x LAN, **+5-7 ew** for v0.8.x WAN | The "second ANTON visits your portal" demo Spec §J.1 promises |
| **C. LLM walkthrough integration** | The "AI-led conversational portal build" Spec §E.1 promises | **~3 ew** to beta, **~5 ew** GA | Walkthrough UX quality |

**Total:** ~14-18 engineer-weeks for solo dev to ship "the spec as written". Recommended sequencing: **C → B-LAN → A → B-WAN**, because each later track unblocks something narrower than the previous, and C has the highest user-visible payoff per engineer-week.

These three tracks are independent at the code level. Anyone can be picked up first.

---

## 1. Recommended sequencing rationale

### Why C (LLM walkthrough) first
- Pure server-side + UI work in this repo. No infra dependencies.
- Shipped tomorrow, every portal built feels meaningfully better.
- The engine's `generatePhasePrompt` was designed for this — ~80% wiring, ~20% prompt engineering.
- Cost-bounded: per-walkthrough cap of 16 LLM calls keeps spend predictable.
- Highest UX payoff per engineer-week.

### Why B-LAN (LAN cross-instance) second
- Real demo value — two laptops on the same Wi-Fi visiting each other's portals zero-config is a "wow" moment.
- mDNS infrastructure already exists (`mdns-advertiser.ts`); just needs portal-specific extension.
- Closes the biggest credibility gap from the architecture review ("portal visiting only works if hosted on this instance").
- LAN-only is honest about what doesn't work (WAN) without the operational weight of running rendezvous infrastructure.

### Why A (registry server) third
- Largest single scope (8-12 ew to production).
- Lawyer engagement is the critical path — start it early in calendar time but the dev work itself is deferrable.
- Registry isn't strictly needed for B-LAN to work, but B-WAN depends on it for `lastKnownGatewayUrl` resolution.
- Without it, portals work end-to-end on a single instance + on LAN; cross-network discovery doesn't.

### Why B-WAN (WAN cross-instance) fourth
- Depends on A being live (registry-mediated resolution).
- WebRTC/relay design choices are still open — better to have field experience from B-LAN before committing.
- Operationally heaviest (FutureChain runs the relay) — needs the registry server's deployment maturity in place first.

---

## 2. Track A — Registry server (separate repo)

> **Full plan:** see Section A below. Headline: 8-12 engineer-weeks to production with the lawyer as the critical path.

### A.1 What it is

A separate GitHub repository (`anton-portals-registry`, Apache 2.0) implementing the wire protocol the local `registry-client` already speaks. Single operator (`futurechain` namespace), federation-ready by design, transparency log from day one.

### A.2 Tech stack

- TypeScript-on-Node (matches ANTON; allows lifting `server/services/registry-protocol/` directly)
- **Fastify** HTTP framework (perf headroom for `/resolve`)
- **`pg`** directly + raw SQL, no ORM
- **`@noble/ed25519` + `@truestamp/canonify`** — same as client (canonical-JSON byte-equality is acceptance criterion §15.2)
- **HSM-backed operator key** via PKCS#11 (CloudHSM/YubiHSM)
- **pino** for structured logging, **vitest** for tests, **node-cron** for STH publication

### A.3 Phase plan (8 weeks to beta, 12 to production)

| Week | Deliverable |
|---|---|
| 1 | Repo scaffold, DB schema (10 tables per Ops Spec §4.1), 4 read endpoints, CI |
| 2 | Vendor `protocol/` from ANTON, `POST /operations` for register/update/revoke + replay protection + confusable detection |
| 3 | Remaining ops + transparency log + Merkle tree (RFC 6962) + inclusion/consistency proofs |
| 4 | Hourly STH cron + HSM wiring + STH publication monitoring |
| 5 | Per-actor + per-IP rate limits + abuse report intake + reporter reputation |
| 6 | DSAR endpoint + retention jobs + privacy policy + ToS publication |
| 7 | Hetzner deployment + Prometheus/Grafana/Loki + status page + backup-restore drill |
| 8 | Load testing + failover drill + tabletop exercise + **beta launch** |
| 9-12 | Production hardening, fix what beta surfaces, federation v2 RFC begins |

### A.4 Decisions still pending

| Decision | Proposed default |
|---|---|
| HSM provider | **AWS CloudHSM EU Frankfurt** (€2k/mo, FIPS 140-2 L3) |
| Hosting | **Hetzner Falkenstein DE** primary + Helsinki FI standby |
| Legal entity | FutureChain AB (Swedish) |
| On-call | Daniel personally for v0.7.x → v0.8 |
| Designated successor | Defer 18 months; standing agenda item |
| RFC 8785 library | `@truestamp/canonify` (same as client — byte-identical guaranteed) |
| IDNA library | `tr46` for IDNA 2008; `unicode-confusables` pinned to UCD 16.0 |

### A.5 Bootstrapping back to this codebase

1. Server reaches beta → stand up staging URL
2. Generate operator keypair in HSM, export public key + fingerprint
3. Update `server/services/registry-client/trust-store.ts` placeholder with real entry
4. Set `PORTAL_REGISTRY_URL=https://registry.anton.space/v1` in `.env.example`
5. Cross-instance test: register from one ANTON, resolve from another
6. Cut ANTON release v0.7.6 with trust bundle + URL

### A.6 Hardest 3 problems

1. **Cross-implementation canonical-JSON byte equality** (acceptance criterion §15.2) — *Mitigation:* use only `@truestamp/canonify` on both sides; CI fuzz test against JCS reference impls; never auto-upgrade the canonifier
2. **HSM operations** — outage, key rotation, signing latency in the hot path of hourly STHs — *Mitigation:* HA from day one; circuit breaker; quarterly rotation drills; one-shot offline-signed STH ready for worst case
3. **Confusable detection drift** — UCD upgrades can flip a name from unique to confusable post-registration — *Mitigation:* pin UCD version; re-run check on UCD upgrade as batch job with human review (never auto-revoke); per-namespace policy override

### A.7 Honest scope

**8 ew to beta + 4 ew production hardening = 12 ew total** for one engineer. **The lawyer is the critical path** for production launch (4 weeks calendar of GDPR back-and-forth, ~1 week of dev effort). Engage by week 1. Solo-developer realism: double everything — **16-24 weeks solo, 8-12 weeks with team of 2**.

---

## 3. Track B — AAP transport / cross-instance visiting

> **Full plan:** see Section B below. Headline: 3-4 ew for v0.7.x LAN-only; +5-7 ew for v0.8.x WAN.

### B.1 The honest framing

Today `portal-handler.handleFetch` is a pure local function — there is **no transport leg** out to another ANTON. The Spec already commits to reusing the Companion App Gateway transport. The hard part is **not** the wire format (that's a one-day job); the hard part is **discovery and identity bootstrap** between two ANTONs that have never spoken.

**v0.7.x ships LAN-only.** Real and useful for households, sports clubs, small offices. WAN deferred to v0.8.x with FutureChain rendezvous.

### B.2 LAN discovery (v0.7.x)

`mdns-advertiser.ts` already advertises `_anton._tcp.local`. Two extensions:
1. Add `contactHash` + `pubkey_b64u` to the TXT record (instance is now self-identifying — no registry round-trip on LAN)
2. Add a portal-list endpoint (`GET /api/instance/portals/has?...` + `/list`) so visitors can ask each LAN ANTON which portals it hosts

For typed address `someone-else.futurechain.portal`: visitor browses LAN → asks each instance → on hit, opens Gateway transport using TXT-advertised pubkey.

**No registry needed for LAN.** Killer demo: two laptops on same Wi-Fi visit each other's portals zero-config.

### B.3 WAN options (v0.8.x)

| Option | Pros | Cons |
|---|---|---|
| **Registry rendezvous** (`lastKnownGatewayUrl`) | Reuses existing registry plumbing | Only works if host has public URL |
| **WebRTC** | NAT-traversal works for ~85% of consumers | Complex; TURN servers cost money |
| **FutureChain WSS relay** | Cheap, deterministic, works everywhere | Operator sees social graph (content stays E2E) |

**Recommended:** Tiered fallback for v0.8.x — try direct WAN URL first; FutureChain relay as universal fallback. Skip WebRTC.

### B.4 Wire format

Reuse `app-enrollment-service.verifySignedEnvelope()` pattern verbatim. Three Gateway message types: `portal_fetch`, `capability_invoke`, `capability_inquire` — each a signed envelope with `from`, `to`, `nonce`, `issuedAt`, `expiresAt` (60s window), `payload`.

Response unsigned (WSS leg already authenticated; request replay-bound). Matches existing `PortalFetchResponse` / `CapabilityInquireResponse` / `CapabilityInvokeResponse` discriminated unions in `portal-handler.ts:41-93` verbatim.

### B.5 Phase plan (3-4 ew for LAN)

| Week | Deliverable |
|---|---|
| 1 | Migration `peer_instances` + `peer_instance_replay_nonces`; new `/instance` Socket.IO namespace; `verifyInstanceEnvelope`; **manual peer pairing** (works for already-paired peers) |
| 2 | 3 message handlers in dispatcher; `peer-portal-client.ts`; end-to-end paired-peer-A-visits-paired-peer-B test |
| 3 | mDNS portal discovery; trust-on-first-use with one-time UI confirm (mirror Companion App OOB pairing) |
| 4 | Visitor-side polish — offline card, capability-invoke retry, async response push |
| 5 | Tests + docs + ship v0.7.x LAN-only |
| 6+ | v0.8.x WAN tier (separate cycle) |

### B.6 Hardest 3 problems

1. **NAT traversal** — *Mitigation:* v0.7.x ships LAN-only and is honest about it. v0.8.x adds direct WAN URL + FutureChain relay
2. **Identity verification of unknown peers** — LAN spoofing risk — *Mitigation:* always cross-check LAN-advertised pubkey against registry resolution; pre-registry usage requires explicit user confirmation (OOB code pattern)
3. **Replay/abuse prevention** — *Mitigation:* reuse `app_signed_envelope_nonces` pattern + per-peer rate limiter; suspend abusive peers

### B.7 Decisions Daniel needs

1. **LAN-only ship vs WAN ship for v0.7.x?** — **Recommend: LAN-only.** Honest framing in release notes: "Phase 1 — same-network portals. WAN coming in v0.8.x."
2. **WAN technology — WebRTC vs registry-rendezvous vs relay?** — **Recommend: skip WebRTC; tiered direct-then-relay.** Document metadata leak honestly.
3. **Inter-instance pairing — explicit vs trust-on-first-use?** — **Recommend: hybrid.** LAN: trust-on-first-use with OOB confirm. WAN: explicit pairing required.

---

## 4. Track C — LLM walkthrough integration

> **Full plan:** see Section C below. Headline: ~3 ew to beta. Highest UX payoff per engineer-week.

### C.1 What exists already

The engine is structured perfectly for this. `generatePhasePrompt(sessionId)` was designed for this. `PHASE_SCHEMAS` zod-validate every output. `walkthrough-depth.ts` already maps depth → token budget. The route exists at `GET /portals/walkthroughs/:id/prompt` — UI just doesn't call the LLM yet.

### C.2 UX shape

**AI-as-draft, not AI-as-chat.** Each phase form gets one new control:

> **Suggest with AI** *(estimated ~1.2k tokens · ~$0.003 with Sonnet)*

When clicked: form disabled → slim streaming panel renders proposal → on completion, fields populate directly → user edits in place → existing **Save & continue** advances (engine validates regardless of source). Cost chip in header increments per call. On resume: persisted draft is the most recent suggestion.

### C.3 LLM call pattern

New endpoint `POST /api/portals/walkthroughs/:id/llm-suggest`:
1. `ensureWalkthroughOwner` (existing helper)
2. Get `systemPrompt` from `generatePhasePrompt`
3. Build per-phase `userMessage` (new `portal-prompt-enrichment.ts`)
4. Map `session.depth` → model: simple→Haiku, standard→Sonnet, deep→Opus
5. Call `callChat({ system, messages, maxTokens: maxPhaseOutputTokens(depth) })`
6. Extract JSON, validate against `PHASE_SCHEMAS[phaseId]`
7. On parse failure → 422 with `{ rawText, retryable: true }`
8. Persist as draft (`accumulated_state.__drafts.<phaseId>`)
9. Record cost row in new `portal_walkthrough_llm_calls` table

### C.4 Cost containment

- Per-call: `maxPhaseOutputTokens(depth)` — already enforced
- Per-walkthrough: hard cap of 16 LLM calls (8 phases × 2 retries) via new `llm_calls_used` column
- Pre-call estimate UI shows `~$X` before clicking
- Cost chip in header sums `cost_usd_cents` across the session

### C.5 Per-phase prompt enrichment

| Phase | Inject |
|---|---|
| `intent` | Template label + description + user's free-text scratchpad |
| `identity` | Resolved `intent` JSON + naming hint |
| `content_structure` | Resolved `intent` + `identity` + template's `seedPages[]` as hint list |
| `content_generation` | Resolved `content_structure` + template's seed HTML (stylistic anchor) + interpolation grammar block |
| `capabilities` | Resolved earlier phases + 12-verb taxonomy summary + template's `defaultCapabilities` |
| `aesthetics` | Resolved `identity.category` + curated palette list |
| `review` | Full accumulated state — LLM scores against quality rubric |
| `publish` | Trivial — probably skip AI for this phase |

### C.6 Streaming UX

- `content_generation` (HTML-heavy) → SSE stream so users see the site appearing
- All other phases → all-at-once with phase-appropriate spinner copy ("Drafting your capability set…")

### C.7 Failure modes

| Failure | Server | UI |
|---|---|---|
| Malformed JSON | 422 `{ rawText, retryable, reason: 'parse_error' }` | Show raw text + Retry/Fix-manually buttons |
| Valid JSON, bad shape | 422 `{ partial, zodErrors[], retryable, reason: 'shape_error' }` | Pre-fill accepted fields; show inline zod errors on failed ones |
| User cancel | Abort upstream, mark cancelled | Spinner clears, draft unchanged |
| Cap exceeded | 429 `{ reason: 'cap_exceeded', limit: 16 }` | Disable AI button, "AI quota used" message |
| Provider key missing | 503 `{ reason: 'no_provider' }` | Hide AI buttons, one-time toast |

### C.8 Quality Ratchet integration

At phase 7 (review), call existing `quality-ratchet.ts scoreOutput()` with the rendered portal markdown. Below threshold (overall < 6.0) → pre-populate `flagged_issues[]` + `quality_score`. User can publish anyway — recommender, not gate.

### C.9 Phase plan (~3 ew)

| Week | Deliverable |
|---|---|
| 1 | Migration (`llm_calls_used` + `portal_walkthrough_llm_calls`); `portal-llm-suggest.ts`; `portal-prompt-enrichment.ts`; new endpoint; bare "Suggest with AI" button per phase; vitest 8-phase happy-paths |
| 2 | SSE streaming for `content_generation`; cost chip; per-phase enrichment polish; retry-on-malformed-JSON; Playwright full-AI happy-path |
| 3 | Quality Ratchet hookup; per-walkthrough cap enforcement; "Fix manually" salvage path; telemetry |

### C.10 Hardest 3 problems

1. **Schema-conformant JSON for `content_generation`** (deep recursion → high malformed rate) — *Mitigation:* inject template seed HTML as anchor; use Anthropic tool-use mode for near-100% structural compliance; auto-retry with tool-use
2. **`content_generation` cost ceiling** (16 KB output is hard limit, gets truncated) — *Mitigation:* loop per page server-side, one `callChat` per page capped at 4096 tokens, aggregate as one phase output, count as one against per-walkthrough cap
3. **Drift between phases when user edits AI output** — *Mitigation:* lift the `## So far` recap to full state for `deep` depth; explicit "MUST be consistent with finalised earlier phases" instruction

### C.11 Honest scope

~3 ew to feature-flagged beta. ~5 ew to GA with streaming + cost UI + cap enforcement + ratchet integration polished. **~80% wiring, ~20% prompt engineering.**

---

## 5. Combined dependency graph

```
                    ┌──────────────────────────────┐
                    │  Track C: LLM walkthrough    │
                    │  ~3-5 ew · self-contained    │  ← start here
                    └──────────────────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────────┐
                    │  Track B-LAN: cross-instance │
                    │  ~3-4 ew · uses mDNS         │  ← then
                    │  Self-contained for LAN      │
                    └──────────────────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────────┐
                    │  Track A: registry server    │
                    │  8-12 ew · separate repo     │  ← critical path lawyer
                    │  Lawyer engaged from day 1   │     starts in calendar
                    └──────────────────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────────┐
                    │  Track B-WAN: cross-network  │
                    │  +5-7 ew · needs registry    │  ← finally
                    │  + relay infrastructure      │
                    └──────────────────────────────┘
```

---

## 6. Open questions for Daniel

These can be resolved before any of the three tracks starts:

### For Track A (registry server)
1. Confirm FutureChain AB owns `anton.space` + subdomains
2. Engage Swedish DP lawyer for privacy policy review (long calendar lead time)
3. HSM provider commitment (AWS CloudHSM EU vs YubiHSM fleet vs other)
4. Hosting region commitment (Hetzner DE recommended)

### For Track B (AAP transport)
5. Confirm LAN-only for v0.7.x scope (recommended) vs aim for WAN immediately
6. WAN technology when v0.8.x lands: registry-rendezvous + FutureChain relay (recommended) vs WebRTC vs other
7. Inter-instance pairing model: trust-on-first-use for LAN + explicit for WAN (recommended) vs other

### For Track C (LLM walkthrough)
8. Per-walkthrough cap of 16 LLM calls — comfortable, or tighten?
9. Default model mapping: simple→Haiku, standard→Sonnet, deep→Opus — agreed?
10. Use Anthropic tool-use for structural compliance (recommended) vs natural-language JSON output

---

## 7. What's NOT in any of these tracks

These are real Spec items but explicitly out of scope:
- **Pathfinder engine-registry refactor** (Spec K.7) — adopt `'anton-portal'` as a SearchMode union extension, not a refactor. Phase 11+ if ever.
- **Social key recovery** (Spec K.8 / Registry Protocol §5.9 reserved op type `rotate_key_via_recovery`) — protocol fields reserved in v1.0.0; activated in v1.1+
- **Third-party attestation issuers** (Spec K.9 / Capability Schema §9.4 reserved structure) — same: reserved now, activated v1.1+
- **Optional public read-only bridge** (Spec K.2) — `advisense.anton.space` static-snapshot service, deferred indefinitely
- **ANTON address as email bridge** (Spec K.3) — SMTP integration, deferred
- **Managed always-on hosting** (Spec K.4) — FutureChain-as-a-service offering, deferred
- **Marketplace integration** (Spec K.5) — Layer 5 of ANTON, separate spec
- **The Beehive × Portals** (Spec K.6) — separate spec

These can be re-prioritised when the three tracks above are complete and there's actual usage data to inform what comes next.

---

## 8. How to use this document

- When picking a track to start, jump to its section (2 / 3 / 4 above)
- When making a decision in §6, update both this doc and the Spec
- When a track ships, mark it complete here and update `MEMORY.md`'s `project_portals_v0_7_x.md` entry
- When a new track is identified, add it as a §9 / §10 etc.

The full per-track investigation reports (longer-form) live in the agent traces from 2026-04-19 — they were synthesized down for this doc but the originals are in the conversation history if more detail is needed.

---

**End of plan.**
