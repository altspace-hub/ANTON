# Agent-to-Agent Commerce Loop — Architecture & Plan

_Investigation 2026-06-18 (8-agent workflow `wf_58353595-c66`). The end-to-end
goal: my agent **discovers** a seller's agent (e.g. a sport store) → **talks /
negotiates** ("Jordans size 43? price?") → **agrees** → **settles on
FutureChain** → seller **fulfils** (ships). Runnable from standalone,
agent-callable (MCP/JSON-RPC) programs._

## Headline

The two HARD legs are already shipped — **DISCOVER** (Portals relay `.anton`
registry) and **SETTLE** (standalone Agent Pay, real on-chain FTC behind a
non-bypassable gate, device-verified). The standalone **Anton Collaboration**
program is **~70% reuse / 30% genuinely net-new**. The net-new 30% is the
*buyer-side negotiation orchestrator* and the *agree↔settle bridge*.

**Settlement is orthogonal to #4** (ANTON Local's own fc-* routes are stub-wired
— real mode only via `mission-budget.ts`). Settle THROUGH the standalone Agent
Pay; #4 only matters if ANTON Local *itself* must be a payer/merchant endpoint.

## Loop map — what exists vs missing

| Step | Status | Where it lives |
|---|---|---|
| **DISCOVER** | ✅ built | `portal-search-engine.ts` (local+LAN+relay merge) + deployed relay `registry/handlers/{search,resolve,submit}` — searchable signed `.anton` descriptors by verb/category; exact `name.namespace` resolve. (Secondary: `remote-agent-client.discoverRemoteAgents()` but only over already-paired Community peers.) |
| **IDENTIFY** | ✅ built | `capability-descriptor/schema.ts` (v `capability-1.0.0`) — signed business profile = address `<name>.<namespace>.portal` + contactHash + Ed25519 pubkey + originEndpoint + 12 commerce verbs. Footgun: two divergent contact-hash algorithms; only raw-32-byte validates relay-side. Resolve gives originEndpoint but NOT the mesh pubkey. |
| **TALK** | ⚠️ partial | Seller: `/agents/public/query` → `agent-processor.processQuery()` (LLM persona + RAG + connector tool-calls, **single tool round**). Buyer caller: `remote-agent-client.queryRemoteAgent()`. Structured verb path → `portal-handler.handleInvoke` writes to an inbox a **human** answers (canned `quoted`/`pending` placeholders — no auto-quote). |
| **NEGOTIATE** | ⚠️ partial | Real signed multi-round counter-offer exists ONLY in `src/comm/services/agreements.ts` (counter, `headBeats` tiebreak, `MAX_COUNTERS=6`) — human-UI-bound, NOT agent-callable, NOT wired to portals/agents. No machine-readable offer/counter schema on the query path. |
| **AGREE** | ⚠️ partial | Two never-combined tiers: **signed** (Comm — mutual Ed25519 assent, private, no on-chain leg) vs **settlement** (Pay/Business — chain-spend echo of `agreementId`, public, no acceptance signature). No single signed+on-chain artifact. Agent Pay attaches `kind:'agreement'` but never computes `proposalHash`/stamps `meta.agreementId` → receiver can't reconcile it. |
| **SETTLE** | ✅ built | `apps/anton-agent-pay` (standalone) — real on-chain PACS.008 via `@futurechain/sdk` behind the modal + spend caps. The model to parallel. |
| **FULFILL** | ❌ missing | Only declarative: `expectedDelivery` field + an owner inbox-respond endpoint; the pay verb *declares* escrow but nothing enforces it. `agent-connector-executor` can fire a webhook ("ship") — the only primitive. No shipment/delivery/escrow/dispute model. |

## Architecture

**Standalone `apps/anton-collaboration`** — clone the agent-pay shell, do NOT
lift ANTON Local's server:
- **Reuse verbatim** (copy into `src/main`): the Fastify JSON-RPC dispatcher +
  `ServerDeps` injection + `runModalFlow` (`server.ts`), `mcp.ts`, `pairing.ts`,
  `modal.ts`/`cli-modal.ts`/`web-confirm.ts` (the human gate → "approve this
  agreement before it settles"), `proposals.ts` generalised → a
  `NegotiationStore`/`AgreementStore`.
- **New shared workspace package `@anton/capability-descriptor`**: extract the
  PURE parts of `capability-descriptor/*` (schema/verbs/builder/signer/validator)
  + `registry-protocol/canonical-json.ts` + `registry-client/relay-submit.ts`
  (make the descriptor cache DB-optional). + a 4th byte-identical copy of the
  `agreements.ts` canonical core (`canonicalFlat`/`computeProposalHash`) with a
  golden-vector test against the existing 3.
- **Treat the seller's ANTON as a remote HTTP service** — do NOT copy
  `agent-processor`/`portal-handler`/`remote-agent-client`/`connector-executor`
  (Postgres + provider-router + community-table coupled). Speak the existing
  wire contracts the seller already exposes (`/api/portals/search`,
  `/portals/visit/:addr/capabilities[/:id/invoke]`, `/api/agents/public/query`).

**Discovery** — reuse the Portals relay registry (live, KYC'd, signature-
verified). Business publishes a signed `.anton` portal bundle → `POST
/v1/portals/submit`; buyer `GET /v1/portals/search` + `/resolve/:address`. The
Comm app already proves a standalone discover+resolve+invoke client
(`src/comm/services/portals.ts`). Small net-new: resolution must also yield the
mesh pubkey + relay endpoints; canonicalise the contact-hash algorithm.

**Settlement** — settle THROUGH a running Agent Pay over its JSON-RPC/MCP:
`proposePayment({to, amountFtc, remittance:{kind:'agreement', decision, terms,
meta:{agreementId, proposalHash}}})`. **Critical glue**: add `proposalHash` +
`meta.agreementId` stamping into Agent Pay's remittance path (today it's
unstamped contract text on a one-way transfer), and port
`reconcileInboundAgreement` (~30 lines) seller-side so the inbound payment binds
to the agreement and sets `settled`. Unifying the signed (mutual-assent) tier
with the on-chain tier is the single biggest correctness gap in the AGREE→SETTLE
seam.

## Phased plan

| Phase | Effort | Deliverable | Deps |
|---|---|---|---|
| **P0** Shared package | M | `@anton/capability-descriptor` (lift schema/verbs/builder/signer/validator + canonical-json + relay-submit; DB-optional) + 4th copy of the agreements canonical core w/ golden-vector test | — |
| **P1** Standalone shell | M | Clone agent-pay's standalone+server+mcp+pairing+modal verbatim; generalise proposals → Negotiation/AgreementStore; thin relay-registry + portal-invoke HTTP clients | P0 |
| **P2** Discovery e2e | S | Buyer discovers a never-seen seller via search+resolve, verifies the descriptor, lists order/inquire verbs; registry→mesh-address fields | P1 |
| **P3** Seller auto-quote | L | Replace the human inbox for inquire/order with an LLM auto-quoter (price/stock without a human); caller auth on the public query path | P1 |
| **P4** Buyer negotiation orchestrator | XL | The keystone net-new: LLM loop goal→inquire→score quote→counter (structured schema)→terms; persist + cap rounds | P2,P3 |
| **P5** Agent-callable AGREE | L | Headless propose/counter/accept/sign between two standalones (lifted canonical core + Node persistence + transport); approve-agreement modal → signed artifact | P0,P4 |
| **P6** Agree↔Settle bridge | L | On approval, call Agent Pay `proposePayment` w/ the agreement; add `proposalHash`+`meta.agreementId` stamping to Agent Pay; port `reconcileInboundAgreement` seller-side | P5 |
| **P7** Fulfil | L | Fulfilment/shipment state machine: obligation tracking, delivery confirmation over the order responseId, escrow release, basic dispute | P6 |
| **P8** Trust hardening | XL | (Optional) deploy the transparency-log registry (Merkle proofs) and/or finish AAP WS transport (real X25519 + envelope signing) | P2,P4 |

## Key decisions (the user's to make)

1. **Settlement venue** — settle through a running Agent Pay (recommended; real, gated, device-verified) vs investing to un-stub ANTON Local's fc-* routes (#4, orthogonal).
2. **AGREE assurance** — is a chain-spend echo (settlement tier) enough, or do autonomous deals REQUIRE cryptographic mutual assent (signed tier)? Drives whether P5/P6 wire two existing tiers or build a new combined primitive.
3. **Seller: human or AI?** — auto-quote (P3, full autonomy) vs human-in-the-inbox. Changes the trust/liability story.
4. **Discovery trust for v1** — relay HTTP registry (KYC'd, trusted operator) vs the dormant transparency-log registry (no trusted operator). Recommend relay for v1.
5. **Negotiation transport** — private mesh sessions (Noise-IK, E2E, needs registry→mesh bridge) vs plain HTTPS to the seller's public originEndpoint.
6. **Contact-hash canonicalisation** — pick ONE algorithm before it hardens into an interop footgun (only raw-32-byte validates relay-side today).
7. **Reuse boundary** — confirm "treat the seller's ANTON as a remote HTTP service; never lift agent-processor/portal-handler/connector-executor into the standalone."
8. **Fulfil scope for v1** — model real shipment/escrow/dispute (P7, large) vs end the loop at `settled` with fulfilment as out-of-band owner-inbox replies.

## Dormant pieces (keep OUT of v1 critical path)
- Transparency-log registry-client (RFC-6962 Merkle proofs) — fully coded, `registry.anton.space` not deployed.
- AAP WS transport — envelope signing = literal `<client-sig>` placeholders, X25519 = `randomBytes`, BUNDLE decrypt = stub; not mounted in `server/index.ts`.
