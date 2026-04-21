# Portals Track B-WAN — Gap Audit

**Date:** 2026-04-21
**Context:** D4 of the deferred follow-ups. Audit of the Portals Spec §C.4
("Transport — Companion App Gateway, not a separate AAP layer") against the
current codebase, producing a concrete next-session punch list.

**TL;DR.** LAN discovery (Track B-LAN) is fully wired. WAN discovery via the
registry is fully wired. **The gap is the transport layer for remote portal
visits** — today a visitor's ANTON calls the origin's `/portals/visit/...`
routes over raw HTTPS, with no Ed25519 envelope wrap, no `app_messages`
persistence, and no `app_checkpoints` store-and-forward. The spec §C.4
mandates Gateway reuse for all three of those properties.

---

## What's in code today (as of 2026-04-21)

### Server-side (origin)

* `server/services/portals/portal-handler.ts` — `handleFetch`,
  `handleInquire`, `handleInvoke` with proper descriptor validation +
  capability dispatch. Correct business logic.
* `server/routes/portals.ts` — REST surface:
  * `GET /portals/visit/:address/page?path=…`
  * `GET /portals/visit/:address/asset/*`
  * `GET /portals/visit/:address/capabilities`
  * `POST /portals/visit/:address/capabilities/:capId/inquire`
  * `POST /portals/visit/:address/capabilities/:capId/invoke`
* `server/services/portals/portal-lan-discovery.ts` — mDNS advertiser +
  consumer for same-LAN peer discovery (Track B-LAN).
* Migrations 145–151 — portals schema, capability invocations,
  walkthroughs, LAN discovery cache.

### Client-side (visitor)

* `server/services/registry-client/*` — registry protocol client with
  cache, nonce store, rate limiter, transparency log verification, trust
  store, transport. Wired to STH gap monitor.
* `server/services/registry-protocol/*` — 6 operation builders + homoglyph
  detection (audit #3 work).

### What reuses the Gateway already

* `app-enrollment-service.ts` — Ed25519 envelope builder + verifier +
  nonce replay protection.
* `app_messages` (migration 094) — persisted exchanges between paired
  ANTONs.
* `app_checkpoints` (migrations 130 / 131) — store-and-forward queue.
* Push dispatch (`app-push-service.ts`) — opaque `{event_id, severity,
  title, deep_link}` payload.

---

## What the Spec §C.4 mandates that is NOT yet wired

### 1. Three new Gateway message types

Spec §C.4:
> Three new Gateway message types are added for portals:
> - `portal_fetch` — request a portal page or asset.
> - `capability_invoke` — invoke a declared capability with the input schema.
> - `capability_inquire` — ask for a quote or status without committing.

**Current state:** these literal strings appear ONLY in comments
(`portal-handler.ts` header). They're not declared in the Gateway
message-type enum, not dispatched by `app-websocket.ts`, not handled by
`app-gateway.ts`. The handler today is reachable only via the direct HTTPS
routes in `portals.ts`.

### 2. Ed25519-signed envelope wrap on visit traffic

Spec §C.4 explicitly requires reuse of `app-enrollment-service.ts:148-150`
(envelope construction) and `:518-540` (verification + nonce replay). A
remote visitor's `/portals/visit` call today is raw HTTPS with no signed
envelope, no nonce check, no replay protection. That's the audit #3 STH-
style integrity defence missing from the per-visit path.

### 3. `app_messages` persistence for portal exchanges

Every signed exchange between paired ANTONs is supposed to land in
`app_messages` for audit + replay-safety. Current portal visits don't touch
this table at all — they're ephemeral HTTP request/response cycles.

### 4. `app_checkpoints` store-and-forward when origin is offline

Spec §C.1:
> If step 4 fails (origin offline or unreachable): Portal Viewer renders
> the standard offline card…

AND §C.4:
> the Gateway already handles … `app_checkpoints` for store-and-forward
> when the origin is offline. Portals reuse this entirely.

**Ambiguity.** §C.1 says "no stored snapshot, no cached content" — visit
attempts against an offline origin fail immediately with the offline card.
§C.4 says store-and-forward. The reconciliation is: `portal_fetch` (a
GET-like read) correctly fails offline per §C.1 — stale snapshots would
leak impressions. `capability_invoke` (a POST-like write that targets a
specific action and may be idempotent) IS eligible for store-and-forward
— the invocation envelope is signed, the origin can process it when it
comes online, and the visitor's ANTON tracks it like a checkpoint.

Current code: neither path uses `app_checkpoints`. `handleInvoke` and
`handleInquire` return immediately on offline-origin.

### 5. NAT traversal beyond mDNS

Spec §C.4:
> the Gateway already handles HTTPS for WAN, mDNS for same-LAN…

**Current state:** mDNS works. WAN is HTTPS-direct. There's no fallback
path when the origin is behind NAT without an open HTTPS port. The
Companion App Gateway does have `app-websocket.ts` which can reverse-
direction (origin opens a long-poll to a relay) — portals don't use this
at all. An origin-behind-NAT can't be reached today by a visitor unless
the origin has a public HTTPS endpoint.

### 6. Canonical address form is client-shorthand

Spec §C.5 says `<name>.<namespace>.portal` is canonical and `name.portal`
(namespace omitted) is shorthand expanded client-side. Current
`portal-handler.ts` + `portals.ts` accept both forms but don't explicitly
canonicalise before cache lookup. If one visitor caches `foo.portal` and
another caches `foo.futurechain.portal`, they have two cache entries for
the same logical portal. Minor, but it's a spec-vs-code drift.

---

## Punch list for a future session

In rough dependency order:

1. **Extend the Gateway message-type enum** with `portal_fetch`,
   `capability_invoke`, `capability_inquire`. Touch:
   `server/services/app-websocket.ts` (message dispatch),
   `server/services/app-gateway.ts` (validation), and any schema in
   `app_messages` that enumerates valid types.

2. **Wire portal-handler behind the Gateway dispatcher.** Create a
   `portal-gateway-adapter.ts` that translates incoming
   `portal_fetch`/`capability_invoke`/`capability_inquire` Gateway
   envelopes into calls on `portal-handler.handleFetch` /
   `handleInvoke` / `handleInquire`, and wraps responses in a signed
   response envelope.

3. **Client-side envelope wrapping for visitor traffic.** Add a
   `portal-visit-client.ts` under `server/services/registry-client/`
   (or a new `portal-client/`) that:
   * resolves the portal address via the registry (already done),
   * opens a Gateway WebSocket to the origin (new),
   * wraps the fetch/invoke/inquire call as a signed envelope (new),
   * records the exchange in a visitor-side `app_messages`-equivalent
     table OR reuses `app_messages` if the visitor treats the origin as
     a "paired instance" for this call's duration.

4. **Store-and-forward for `capability_invoke` only.** Add a
   `portal_invocation_pending` table (or reuse `app_checkpoints`
   directly) for signed invocations made against an offline origin. The
   origin processes them on next connection; the visitor receives a
   signed acknowledgement. `portal_fetch` and `capability_inquire`
   remain fail-fast per §C.1.

5. **NAT-traversal fallback.** Use the existing `app-websocket.ts`
   reverse-direction capability so an origin behind NAT can serve
   portals by maintaining a long-poll to a relay. Needs a relay
   component — might be a Portals Track A deliverable since it's
   infrastructure, not client code.

6. **Address canonicalisation helper.** Single function in
   `portal-resolver.ts` that normalises `<name>.portal` →
   `<name>.<namespace>.portal` before cache lookup + registry query.
   Update `portal_descriptor_cache` consumers.

---

## Out of scope for this audit / not in this repo

* **Portals Track A** (registry server itself — separate repo). The
  registry protocol client is here; the server is not.
* **Federation across multiple `registryOperator` values.** Spec §C.2
  flags this as "federation-ready but single-namespace in v0.7.x." Real
  multi-operator routing is a later-version concern.
* **Attestation / social recovery.** Reserved in Registry Protocol §5.9
  but not v0.7.x scope.

---

## Risk if Track B-WAN stays as-is

* **Impersonation window.** A visitor's `/portals/visit/...` request
  over raw HTTPS has no Ed25519 proof-of-origin beyond TLS. An attacker
  who can present a valid certificate for the origin's hostname
  (malicious CA, mis-issued cert) can impersonate the origin. The
  signed-envelope layer is the defence the spec relied on.
* **No audit trail for cross-ANTON calls.** Operators can't answer
  "which other ANTONs have hit my portal in the last week?" without
  HTTP access logs — and access logs don't include the signed identity.
* **Fragile under NAT.** Self-hosted portals on laptops behind a home
  router are unreachable without ad-hoc port forwarding — the Gateway's
  long-poll fallback isn't used.

None of these is an emergency at the current user scale (single-user
deployments, self-visited portals). They become real the moment any
portal outside FutureChain's VPS fleet goes live.
