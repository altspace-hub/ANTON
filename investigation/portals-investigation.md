# ANTON Portals — Consolidated Investigation Notes

**Date:** 2026-04-19
**Scope:** Findings from running three Investigation Protocols in parallel:
- `ANTON_Portals_Registry_Protocol_Reference.md` §2 (the Registry Protocol)
- `ANTON_Portals_Capability_Descriptor_Schema_Reference.md` §2 (the Capability Schema)
- `ANTON_Portals_Spec.md` Part B (the main implementation Spec)

**Working tree:** C:\ANTON_PostgreSQLv2 at commit `990ff6a` (post-Phase 10.1 hardening)
**Latest migration on disk:** `144_hardware_hardening.sql`

This single file consolidates what the three protocols ask for separately. It is the source of truth for v0.2 of the main Spec — every "rewrite item" at the end of this doc is reflected in the v0.2 Spec.

---

## A. Identity & cryptography

### A.1 Ed25519 layer

**Library:** Node.js native `crypto` module — NOT `@noble/ed25519`, NOT tweetnacl. Confirmed at `server/services/identity.ts:8`:
```
import { createHash, randomBytes, generateKeyPairSync, sign, verify, createPublicKey } from 'crypto'
```

**Implication for v0.2 Spec:** All signing/verifying reuses `node:crypto`. No new cryptographic dependency required.

### A.2 Public key format

**On disk and over the wire today:** hex-encoded SPKI DER (88 hex chars = 44 bytes). `server/services/identity.ts:49-55` returns `{ publicKeyHex, privateKeyPem, contactHash }`. `app-enrollment-service.ts:224-225` verifies with `crypto.verify(null, ..., { format: 'der', type: 'spki' }, ...)`.

**Spec asks for:** base64url unpadded (RFC 4648 §5).

**Decision for v0.2:** Wire format = base64url unpadded (matches Registry Protocol Reference §4.2 and avoids the 88-char hex bloat). Internal storage stays hex DER; conversion at envelope construction. Add helper in `server/lib/portal-crypto.ts`.

### A.3 Contact hash

**Format on the wire:** `ANTON-XXXX-XXXX-XXXX-XXXX`. Two independent generators in the codebase:

- `identity.ts:19-32` — `deriveContactHashFromPublicKey()` does SHA-256(publicKeyHex), then maps bytes through a 32-char Crockford-style alphabet `'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` (no 0/O/1/I).
- `community-crypto.ts:13-14` — generates 16 random bytes → uppercase hex → 4-char groups (uppercase HEX charset only, A-F + 0-9).

**Validation regex:** `community-crypto.ts:24` uses `/^ANTON-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/` — uppercase hex only. **This rejects valid identity-derived contact hashes** (which contain G-Z and 2-9). Existing bug, not Portals-specific.

**Decision for v0.2:** Portals use `deriveContactHashFromPublicKey()` everywhere (deterministic, one-way, anchored to public key). The validation regex must be widened to the full Crockford set in a separate cleanup PR. Filed as a known-issue in v0.2 Spec Part O.

### A.4 Canonicalisation (RFC 8785)

**Status: does not exist in the codebase.**

- No `@truestamp/canonify` in `package.json`.
- No grep hits for `canonicalize`, `canonify`, `RFC 8785`, `JCS`.
- `app-enrollment-service.ts:262, 466` uses vanilla `JSON.stringify()` for signing payloads (works because the existing AAP signed envelope is a flat string `${token}.${nonce}.${pubkey}`, not a JSON object).

**Decision for v0.2:** Add `@truestamp/canonify` dependency. New file `server/services/registry-protocol/canonical-json.ts` wraps it. Used by both registry envelopes and capability descriptors.

### A.5 Timestamp format

**Status: consistent across services.** `.toISOString()` (which produces `2026-09-01T12:34:56.789Z` — ISO 8601 UTC with millisecond precision and Z suffix) is the canonical form. Verified:
- `app-enrollment-service.ts:249, 465`
- `anton-bundler.ts:214, 929`
- All recent migrations use `TIMESTAMPTZ` and pass through `.toISOString()` from JS

`Date.now()` is used for numeric millisecond comparisons (e.g. `app-websocket.ts:80, 176, 214`). No conflict.

**Decision for v0.2:** Adopt `.toISOString()` everywhere. No new infrastructure.

### A.6 Signed envelope pattern (existing)

`app-enrollment-service.ts` already implements signed envelopes:

- **Construction (line 148-150):** `payload = "${token}.${nonce}.${device_pubkey}"`; `signature = crypto.sign(null, Buffer.from(payload, 'utf8'), privKeyDer)`.
- **Verification (line 518-540):** `verifySignedEnvelope()` recomputes payload, calls `crypto.verify`, then INSERTs nonce into `app_signed_envelope_nonces` (REPLACE-style — duplicate insert means replay).

**What's missing for the Registry Protocol Reference §4 envelope:**
- Timestamp window enforcement (±5 min server-side check) — not implemented.
- Nonce uniqueness window of 48 hours — current implementation is "ever seen" via PK constraint, which is stricter and fine.
- Per-portal operation chain via `priorOperationId` — entirely new concept.

**Decision for v0.2:** Reuse the `crypto.sign/verify` pattern. New envelope wrapper in `server/services/registry-protocol/envelope.ts`. Timestamp window and chain continuity added there. Reuse `app_signed_envelope_nonces` or a dedicated `registry_operation_nonces` table — track in v0.2 Spec.

---

## B. Service infrastructure

### B.1 HTTP client

**Standard: Node.js native `fetch()`.** Confirmed at:
- `remote-agent-client.ts:39, 96`
- `message-queue-service.ts:84` (uses `AbortSignal.timeout()` for cancellation)

No axios, ky, got, or node-fetch in `server/services/`.

**Decision for v0.2:** Registry client uses native `fetch()` + `AbortSignal.timeout()`.

### B.2 Audit log

**Existing infrastructure:** `audit_log` table + `server/services/auditLogger.ts` wrapper.
- `auditLogger.ts:79-114` — `writeAuditEntry()` insert pattern.
- Used by `app-gateway.ts:770-783` via `audit-queue.ts` for asynchronous enqueue.

**Decision for v0.2:** Registry client writes via `auditLogger.writeAuditEntry()` with `resource_type='portal'`, `resource_id=<portal_id>`, `action=<operation>`. No new audit table.

### B.3 Standard error response

**Current shape (`server/lib/error-response.ts:8-10`):** `safeError()` returns a string only (`"An error occurred"` in prod, `err.message` in dev). Routes wrap as `{ error: safeError(err) }` or via `validate.ts:13-14` as `{ error: string, details: object }`.

**Phase 10.1 added:** `server/lib/hardware-helpers.ts` `statusFromError(err)` returns `{ status: number; message: string }`.

**Spec asks for:** `{ status: 'ok'|'error', error: { code, message, details } }` (Registry Protocol §8.3).

**Decision for v0.2:** The Registry Protocol envelope is a *new wire contract* between ANTON clients and the registry server. It does NOT need to match ANTON's internal error shape. Local routes keep `safeError()` / `statusFromError()`. Registry server endpoints adopt the protocol envelope via a thin `respondOk()` / `respondError()` wrapper in `server/services/registry-server/response.ts`.

### B.4 Retry / backoff

**No shared utility.** Two implementations exist:
- `message-queue-service.ts:115-117` — exponential `Math.min(Math.pow(2, n), 16) * 60` seconds.
- `workflow-executor.ts:147-163` — fixed `[2000, 4000, 8000]` ms.

**Decision for v0.2:** Registry client uses message-queue-style exponential backoff with jitter (1-16 min cap). Document that a shared `server/lib/retry.ts` is a future refactor opportunity but out-of-scope for Portals v0.7.x.

### B.5 JSON Schema validation

**Status: zod is universal.** `server/lib/validate.ts:1-52` exports `validate()`, `validateQuery()`, `validateParams()` middleware factories using `zod`. Confirmed in `atlas-pack-loader.ts:23, 43`, hardware routes, etc.

**Spec asks for:** JSON Schema Draft 2020-12 in capability descriptor `inputSchema` / `outputSchema`.

**Decision for v0.2:** Capability descriptor schemas are stored AND served as JSON Schema Draft 2020-12 (the wire contract — visitors' agents need a portable format). Internal validation uses zod where possible; we add `@apidevtools/json-schema-ref-parser` + `ajv` (JSON Schema Draft 2020-12 support) ONLY for descriptor validation. Two validators coexist, scoped to their domains. Spec v0.2 calls this out explicitly.

---

## C. Bundle infrastructure

### C.1 BundleTypeEntry shape (`anton-bundler.ts:71-76`)

```typescript
interface BundleTypeEntry {
  label: string;
  description: string;
  contentsKey: string;          // key in the contents-count object
  primaryContentDir: string;    // subdirectory under contents/
}
```

`BUNDLE_TYPE_REGISTRY` (`anton-bundler.ts:78-121`) holds 33 types. Adding `'portal'` is a one-line registry entry plus per-handler glue.

### C.2 Closest existing structural match

`hardware-project` (`anton-bundler.ts:116`) — bundles content (requirements, BoM), schema-equivalent material (wiring schematics), pages-equivalent (lifecycle history), and assets (firmware binaries). Mirrors the portal layout (manifest + capability-descriptor + pages/ + assets/ + schema.sql + walkthrough.json).

**Decision for v0.2:** Portal bundle handler in `anton-bundler.ts` mirrors `hardware-project` patterns. New bundle type `'portal'`.

### C.3 antonImport.ts / antonExport.ts (the validators)

- `antonExport.ts` (~92 lines) — scans `server/areas/`, reads `module.json` + `system-prompt.md`, constructs manifest, zips.
- `antonImport.ts` (~164 lines) — validates ZIP (50-file limit, path-traversal check), validates manifest required fields (`formatVersion`, `type`, `id`, `name`), runs `INJECTION_PATTERNS` scan on prompt content, writes to `server/areas/<area>/modules/<moduleId>/`.

**Decision for v0.2:** Portal export/import paths mirror these. Reuse the path-traversal check (already battle-tested). Adapt the validators to portal-specific manifest fields.

---

## D. AAP / transport reality check

### D.1 The honest finding

**There is no abstract AAP transport layer in the codebase.** The Spec assumes one. What actually exists:

- `aap-rollout-bridge.ts` (132 lines, ~29 of real implementation) — one purpose-built bridge that, when a hardware patch rollout uses `delivery_channel='aap-store-and-forward'`, creates one `app_checkpoint` per device on the project owner's paired phone. This is the Phase 9 hardware integration, not a general transport.
- No PORTAL_FETCH, capability_invoke, capability_inquire message-type enums anywhere.
- No `aap_endpoints` registration table.

### D.2 What IS the real transport

The Companion App Gateway (`app-gateway.ts`, ~1,155 lines) is the closest analogue:
- HTTPS + WebSocket (`app-websocket.ts`).
- Ed25519 signed envelopes (via `app-enrollment-service.ts`).
- `app_messages` table (migration 094) for persisted exchange.
- `app_checkpoints` (migration 130/131) for the store-and-forward queue (pending until device comes online).
- Push notifications (APNs/FCM/web-push) carry only `event_id + severity + opaque title + deep_link` — full payload never crosses the push provider.

### D.3 Decision for v0.2

The Spec must drop the "AAP transport reuse" framing. Replace with one of two options:

**Option 1 (recommended):** Portals reuse the **Companion App Gateway transport** as a starting point, since it already has Ed25519 pairing, signed envelopes, store-and-forward, and online/offline semantics. The portal-fetch flow is HTTPS+WebSocket between the visitor's ANTON client and the portal-host's ANTON instance, not a new AAP layer. NAT traversal handled the same way Gateway handles it (HTTPS for WAN, mDNS+local LAN for same-network, store-and-forward queue when origin is offline).

**Option 2:** Build a real AAP transport layer first (PORTAL_FETCH message type, store-and-forward relay generalised, NAT traversal). This is multi-month work and almost a Phase 11 capability.

v0.2 Spec adopts Option 1 explicitly. Three new message types declared in the Capability Descriptor (`portal_fetch`, `capability_invoke`, `capability_inquire`) become Gateway message types, not new AAP message types. Implementation surface drops by ~70%.

---

## E. Discovery / Pathfinder / module patterns

### E.1 prompt-builder.ts — actually 5 layers, not 7

`server/services/prompt-builder.ts:262–582` exports 5 build functions:
1. `buildOrgContextLayer()` (line 262) — org name, jurisdiction, risk appetite.
2. `buildResumeContextLayer()` (line 302) — session pause/resume.
3. `buildKnowledgePackLayer()` (line 344) — active regulatory knowledge packs.
4. `buildAtomLayer()` (line 382) — knowledge atoms via hybrid BM25+vector.
5. `buildHardwareHkpLayer()` (line 582) — hardware reference packs.

There's no single `assemblePrompt()` orchestrator. Each caller composes layers in its own order (typically: org → resume → knowledge-pack → atom → hardware-hkp).

**Decision for v0.2:** Drop the "seven-layer" framing in the Spec. Use "the prompt-builder layered pipeline" without a number. Portal-builder modules add their own walkthrough layer on top.

### E.2 `getPromptTier()` — does not exist

Confirmed via exhaustive grep. The Spec references it 3 times (B.2, E.1, J.1) as the model-aware-depth mechanism.

**What actually exists:** `server/config/model-capabilities.ts` (641 lines):
- `MODEL_CAPABILITIES` registry keyed by model id, with `maxContextWindow`, `maxOutputTokens`, `requires1MBetaHeader`, `supportsCompaction`, `supportsAdaptiveThinking`, `supportsExtendedThinking`, pricing.
- `AntonThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate'` — these are *user-controlled* prompt depth knobs, not model tiers.

**Decision for v0.2:** Replace `getPromptTier()` references with a small new helper `getWalkthroughDepth(modelId, userThinkingLevel)` in `server/services/portals/walkthrough-depth.ts` that maps `MODEL_CAPABILITIES` + `AntonThinkingLevel` → one of `simple|standard|deep`. This is a 30-line helper, not new infrastructure.

### E.3 Pathfinder engine extensibility

`pathfinder-engine.ts:58` defines `SearchMode` as a hardcoded type union (7 modes). `MODE_INSTRUCTIONS` and `MODE_HINTS` are hardcoded dicts. **No `registerEngine()` pattern.** Adding `anton-portal` requires editing the type union and dict.

**Decision for v0.2:** Two paths:

**Path A:** Add `'anton-portal'` to the `SearchMode` union directly. Add corresponding `MODE_INSTRUCTIONS` + `MODE_HINTS`. Tactical, fast, fits the codebase. Matches how all other modes were added.

**Path B:** Refactor Pathfinder to a true engine-registry pattern, then add anton-portal as a registered engine. Strategic, slow, breaks the rest of the codebase if not careful.

v0.2 Spec adopts Path A. Path B becomes a Phase 11+ refactor noted in the spec's "Future" section.

### E.4 Discovery Mode

`discovery-engine.ts` (~67 KB) defines `DiscoveryPhase = 'context' | 'work_mapping' | 'pain_finding' | 'readiness' | 'opportunity_mapping' | 'action_planning'` (line 10) — exactly 6 phases. `PHASE_CONFIG` maps tier to phase sequences (lite/standard/professional/expert tiers). Templates are hardcoded inside the service in a large `DISCOVERY_SYSTEM_PROMPT` (line 284) and `getPhasePrompt()` (line 328).

**Decision for v0.2:** Portal-builder walkthrough is a NEW engine in `server/services/portals/portal-walkthrough-engine.ts` that follows the same pattern (phases, hardcoded per-phase prompts, structured-output extraction at each phase boundary). Phases mirror the Spec's E.4: Intent → Identity → Content structure → Content generation → Capabilities → Aesthetics → Review → Publish (8 phases — different from Discovery's 6, scoped to portal building).

### E.5 Module input/output schemas

Modules today use `guidedInputs` (UI form-field declarations) in `module.json`. Example: `server/areas/academic/modules/literature-review/module.json:1-92` has `guidedInputs: Array<{id, type, label, description, required, options?}>` and `defaults: {thinking, creativity, outputFormats, transparencyLevel, knowledgeSources}`. **No `inputSchema` / `outputSchema` exists today.**

**Decision for v0.2:** Capability descriptor `inputSchema` / `outputSchema` are net-new infrastructure scoped to Portals — not extending an existing module pattern. The walkthrough-builder generates them from user answers (Phase 5 of the portal walkthrough).

### E.6 i18n / localisation

`public/locales/en.json` etc. (30 languages per CLAUDE.md) use **nested JSON**, not dot-path keys. Standard i18next-compatible structure.

**Decision for v0.2:** Capability descriptor `localizations` adopts nested JSON to match. Update Capability Schema Reference §11 in a v1.0.0-A1 addendum (cosmetic change). v0.2 Spec calls this out.

### E.7 Quality Ratchet + Apprentice integration

Both exist (`quality-ratchet.ts`, `apprentice.ts`). Coding integration (`coding-integration.ts:71`) is the reference pattern: scoreOutput → recordSession with the score. Modules invoke explicitly; no automatic wiring.

**Decision for v0.2:** Portal-builder invokes both at Phase 7 (Review) — Quality Ratchet scores the proposed portal HTML + descriptor, Apprentice records the session under a new `portal-builder` module id with the score.

---

## F. PostgreSQL conventions

- Migrations: `server/db/migrations-pg/NNN_name.sql`, latest = 144.
- Patterns observed: `IF NOT EXISTS` guards, partial indexes with `WHERE`, JSONB columns + `json_build_object()`, `DEFERRABLE INITIALLY DEFERRED` for soft FKs, `LISTEN/NOTIFY` triggers via `pg_notify()`.
- Phase 10.1 (`144_hardware_hardening.sql`) is the closest reference for the patterns we'll use in the registry schema.

**Decision for v0.2:** Portal client-side schema = migration 145 (`145_portals_client.sql`). Registry server-side schema lives in the separate registry-server repo and is NOT part of ANTON_PostgreSQLv2.

---

## G. Area / pillar scaffold (mirror for "Portals" area)

**Reference:** `server/areas/hardware-engineering/` directory:
```
area.json                     metadata (id, label, icon, color, modules)
area-context.md               narrative (~6.4 KB)
modules/                      hw-classifier, hw-diagnose-*, hw-maintain-*, etc.
personas/                     (optional)
skills/                       reusable prompt fragments
```

**Module patches:** `src/lib/area-patches/hardware-patch.ts` exports `HARDWARE_MODULES: ModuleDefinition[]`, spread into `MODULES` in `src/lib/constants.ts`. The `AREAS` constant (`src/lib/constants.ts:2633-2732`) gets a new entry with `id`, `label`, `shortLabel`, `icon`, `color`, `moduleIds`.

**Decision for v0.2:** Mirror exactly. Create `server/areas/portals/` with `area.json` + `area-context.md` + `modules/`. Add `src/lib/area-patches/portals-patch.ts`. Add `'portals'` entry to `AREAS`.

---

## H. v0.2 Spec changes — concrete edit list

This is what the v0.2 rewrite folds in. Each item references the original Spec section being changed.

### H.1 Reframe AAP (biggest structural change)
- Replace every "reuse AAP transport" reference with "reuse Companion App Gateway transport."
- Drop assumed PORTAL_FETCH AAP message-type. Replace with Gateway message-type extension.
- Note that the Capability Schema's `supportedMessageTypes: ["portal_fetch", "capability_invoke", "capability_inquire"]` map to Gateway routes, not new AAP types.

### H.2 Replace `getPromptTier()` references
- New helper `getWalkthroughDepth(modelId, userThinkingLevel)` in `server/services/portals/walkthrough-depth.ts`.
- Update Part B.2, E.1, J.1.

### H.3 Drop "seven-layer prompt architecture" wording
- Use "the prompt-builder layered pipeline" without a number.
- Note that portal-builder adds its own walkthrough layer on top of the existing 5.

### H.4 Pathfinder integration concrete plan
- Adopt Path A: extend `SearchMode` union with `'anton-portal'`, add to `MODE_INSTRUCTIONS` + `MODE_HINTS`.
- Note Path B (engine-registry refactor) as future work, not v0.7.x.

### H.5 Validation library scoping
- zod for internal/local validation.
- ajv (Draft 2020-12) for capability descriptor input/output schemas — new dependency, scoped.

### H.6 Crypto + signing
- Reuse `node:crypto` (already in identity.ts).
- Add `@truestamp/canonify` for RFC 8785 canonicalisation.
- Wire format public keys = base64url unpadded; internal storage = hex DER (conversion at envelope construction).

### H.7 Bundle handler details
- Mirror `hardware-project` bundle type.
- Reuse `antonImport.ts` path-traversal validation.

### H.8 i18n
- Use nested JSON for capability descriptor localizations. File a Capability Schema Reference v1.0.0-A1 addendum for the cosmetic change.

### H.9 Module input/output schemas
- Acknowledge these are new infrastructure, scoped to Portals.
- Walkthrough Phase 5 (Capabilities) generates them from structured questions.

### H.10 12 verbs (not 11)
- Spec already mostly silent here. Cap Schema §4 has 12. Sync the main Spec's E.5/F sections.

### H.11 Add transparency log + key-recovery sections
- Reference Registry Protocol §7 (transparency log).
- Reference Registry Protocol §5.1 (`recoveryFieldsReserved` in register payload).

### H.12 Specific file paths
- Migration: `server/db/migrations-pg/145_portals_client.sql` (next free number).
- Portal walkthrough engine: `server/services/portals/portal-walkthrough-engine.ts`.
- Walkthrough depth helper: `server/services/portals/walkthrough-depth.ts`.
- Registry client: `server/services/registry-client/index.ts` + `trust-store.ts` + `log-verifier.ts` + `cache.ts` + `audit-writer.ts`.
- Registry protocol primitives: `server/services/registry-protocol/canonical-json.ts` + `envelope.ts` + `signatures.ts` + `operations/*.ts`.
- Capability descriptor: `server/services/capability-descriptor/{schema,validator,signer,builder,hash}.ts` + `verbs/*.ts`.
- Portal handler (the AAP endpoint serving content): `server/services/portal-handler/{index,renderer,capabilities-endpoint}.ts`.
- Routes: `server/routes/portals.ts`.
- Pages: `src/pages/{PortalsLandingPage,PortalBuilderPage,PortalManagePage,PortalViewerPage}.tsx`.
- Components: `src/components/portal/{CapabilityInvocationPanel,PolicyWarningBanner,...}.tsx`.
- Area: `server/areas/portals/{area.json,area-context.md,modules/}` + `src/lib/area-patches/portals-patch.ts`.

---

## I. Things this investigation did NOT cover (parked for next pass)

- Specific FutureChain payment vocabulary (still flagged "placeholder" in Capability Schema §6).
- Choice of HSM provider (Ops Spec §16).
- Designated successor entity (Ops Spec §12.3).
- Swedish data protection lawyer engagement (Ops Spec §16).
- Templating engine choice (Spec O.4) — needs a separate small investigation when implementation actually begins (Handlebars vs React-server-render-to-static vs custom).

---

## J. Summary one-liners (for quick recall)

- **Crypto:** `node:crypto` + add `@truestamp/canonify`. Public key wire format = base64url; internal = hex DER.
- **Audit:** existing `audit_log` table + `auditLogger.writeAuditEntry()`. No new table.
- **HTTP:** native `fetch()` + `AbortSignal.timeout()`. No axios.
- **Validation:** zod for ANTON-internal; ajv (Draft 2020-12) for descriptor input/output schemas.
- **Bundles:** mirror `hardware-project` type; reuse `antonImport.ts` validators.
- **Transport:** drop "AAP" framing; reuse Companion App Gateway (HTTPS+WebSocket+Ed25519 envelope, `app_checkpoints` for store-and-forward).
- **Prompt builder:** 5 layers, not 7. Add a walkthrough layer on top.
- **`getPromptTier()`:** doesn't exist. Replace with `getWalkthroughDepth(modelId, userThinkingLevel)`.
- **Pathfinder:** add `'anton-portal'` to `SearchMode` union (tactical). Engine-registry refactor is future work.
- **Discovery mirror:** new portal-walkthrough engine with 8 phases (Intent → Identity → Content structure → Content gen → Capabilities → Aesthetics → Review → Publish).
- **i18n:** nested JSON, not dot-path. Cap Schema needs v1.0.0-A1 addendum.
- **Module schemas:** new infrastructure scoped to Portals.
- **Area:** mirror `hardware-engineering/` exactly.
- **Migration:** next free is 145.

---

**End of investigation note.** Spec v0.2 lifts every actionable finding above into the relevant section.
