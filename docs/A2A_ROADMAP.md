# ANTON-to-ANTON roadmap — missions &amp; payments

How two ANTON Local instances work together: discover each other's agents,
delegate mission work, and — the goal of this roadmap — **pay each other for
that work**.

User-facing guide: `docs/help/anton-to-anton.html`.
This document is the engineering plan: where things stand and what is left.

> **2026-07-17 correction (code wins over docs).** The "2026-05" status below and
> the "Phase D — BLOCKED on the FutureChain Rust core" heading are stale. Phase D
> is no longer blocked: `server/services/fc-wallet-service.ts` imports `RpcClient`
> from `@futurechain/sdk/rpc` and calls `client.getBalance()`; the Rust core binary
> was vendored 2026-06-05 (`runtimes-source/futurechain/futurechain.exe`); a real
> agent-to-agent on-chain FTC settlement ran 2026-06-22; and a live mainnet Pay
> payment confirmed 2026-07-04 (tx `5b39f15d`, block 972033). What remains for A2A
> payments is the delegated-brief settlement wiring, not the chain. Read the code /
> GO_LIVE_CHECKLIST.md for current truth; the phase tables below are historical.

---

## Where it stands today (2026-05)

| Capability | Status | Notes |
|---|---|---|
| Connect two instances (contact-hash exchange) | ✅ BUILT | `community_connections`, Ed25519 identity |
| Discover &amp; query a peer's Specialized Agents | ✅ BUILT | `/agents/public/directory` + `/query`, HTTPS |
| Delegate a mission **task** to a peer | ✅ BUILT | `mission-delegation.ts`, migration `120_missions_delegation.sql` |
| Signed brief + signed result, both verified | ✅ BUILT | Ed25519; failure ⇒ `failed`, non-actionable |
| Peer accepts ⇒ local sub-mission created | ✅ BUILT | `origin_delegation_id` back-reference |
| Inbound inbox + outbound delegations UI | ✅ BUILT | `MissionInboxPage`, `OutboundDelegationsTab` |
| "Peer accepted / declined" notification to originator | ✅ BUILT | Phase A — outbound moves `sent → in_progress` / `declined` |
| Delegate a multi-task sub-graph as one unit | ✅ BUILT | Phase B1 — `brief.tasks` + migration 209 |
| Capability-aware peer selection | ✅ BUILT | Phase B2 — `suggestDelegationPeers` ranking endpoint |
| AAP as the delegation transport | 🟡 SPEC + STUB | Delegation rides Community P2P queue; AAP crypto stubbed |
| **A2A payment (real settlement)** | 🟡 STUB | Pipeline + `payment_amount_ftc` field exist; no money moves |

**The cross-cutting blocker:** the FutureChain **Rust core** —
`wallet.rs`, `iso20022_pacs008.rs` and the RPC client — has not been
vendored into the repo. Until it is, the SDK's `wallet.create/sign`,
`pacs008.build` and `rpc.*` calls all throw `NotImplementedError`, so no
payment can actually settle. See `docs/help/status.html#blocker`.

---

## Phase A — Mission delegation polish — ✅ DONE (2026-05-19)

Cross-ANTON missions now feel finished.

- **A1. Accept / decline notification.** ✅ When a peer accepts or declines
  an inbound delegation, it signs a `mission_delegation_status` notice and
  queues it back. The originator's outbound delegation moves
  `sent → in_progress` (accepted) or `sent → declined` (with the reason).
  Signature-bound to the peer; idempotent; best-effort so it never rolls
  back the local accept/decline.
- **A2. Delegation status surfacing.** ✅ The Outbound delegations tab
  renders every status and now polls (25 s), so a peer's accept/decline
  shows up live.
- **A3. Decline reasons.** ✅ The decline reason rides the notice and is
  written to the outbound row's `rejection_reason`, which the tab displays.

*Delivered in: `mission-delegation.ts` (`notifyOriginator`,
`receiveStatusUpdate`), `p2p.ts` (dispatch branch),
`OutboundDelegationsTab.tsx` (poll). Transport: the existing community
queue — AAP migration is Phase C.*

---

## Phase B — Richer delegation — ✅ DONE (2026-05-19)

- **B1. Sub-graph delegation.** ✅ A delegation can carry a connected set of
  tasks — `brief.tasks` with `dependsOn` index edges; migration 209 adds
  `brief_tasks JSONB`. `POST /missions/:id/delegate-graph` creates one; on
  accept, the peer's sub-mission is pre-built with those tasks + dependency
  edges, so no LLM decomposition is needed — the delegated plan IS the plan.
- **B2. Capability-aware peer selection.** ✅ `suggestDelegationPeers()`
  ranks connected peers by `delegation_trust_level` plus an optional
  capability match against their advertised agents.
  `GET /missions/delegations/peer-suggestions?q=` exposes the ranking.
- **B3. Result ingestion.** ✅ On `approveResult`, the peer's result is
  folded back into the originating mission: the delegated task is marked
  `completed` with the result as its output, so the mission can advance
  past it instead of the result sitting inert in `result_payload`.

Delegate-creation UI ✅ — the Outbound delegations tab has a "New
delegation" button opening a modal that selects tasks (a single task or a
multi-task sub-graph), ranks peers via B2, takes the brief, and
creates + sends — tying B1 and B2 together for end users.

*Delivered in: migration 209, `mission-delegation.ts` (service + route),
`OutboundDelegationsTab.tsx`, `CreateDelegationModal.tsx`.*

---

## Phase C — Move delegation onto AAP *(partly done)*

Today delegation rides the **Community P2P queue** (async, signed). AAP —
the ANTON Agent Protocol — is the intended real-time, encrypted transport.

- **C1. Finish AAP crypto.** ⏸ DEFERRED. Wire the stubbed pieces in
  `aap-transport-server.ts` / `aap-transport-client.ts`: the X25519
  ephemeral handshake, real Ed25519 envelope signing, AES-256-GCM bundle
  encrypt/decrypt. (Verification — `verifyEnvelopeSignature` — is already
  real.) Security-critical and two-sided; deferred until a two-instance
  test setup exists so the handshake can be verified end-to-end.
- **C2. BUNDLE apply pipeline.** ⏸ DEFERRED with C1 — decryption depends
  on the C1 shared key.
- **C3. Route delegation over AAP.** ⏸ DEFERRED with C1.
- **C4. Rate limits + quotas.** ✅ DONE (2026-05-19). The AAP server now
  enforces a per-IP HELLO rate limit (`rate_limited` → REJECT) and a
  per-connection message quota (`quota_exceeded` → ERROR) — in-memory
  sliding windows in `aap-transport-server.ts`. Previously these error
  codes existed but never fired.

*C1–C3 are the security-critical handshake completion. They compose the
already-audited `community-crypto.ts` primitives (X25519 / AES-256-GCM /
Ed25519) — no new cryptography — but a subtle bug in a handshake fails
silently, so they need a two-instance end-to-end test before being relied
on. Delegation works today over the Community P2P transport regardless.*

---

## Phase D — A2A payments *(BLOCKED on the FutureChain Rust core)*

The goal: when an originator **approves** a delegated result, the
`payment_amount_ftc` on the brief settles to the peer.

**D0 — pay-on-approval loop wired — ✅ DONE (2026-05-19).**
On `approveResult`, a delegation carrying a `payment_amount_ftc` is routed
through the mission payment pipeline: `proposePayment` (actor
`delegation-system`) → `approvePayment` (the human delegation-approver, so
the pipeline's separation-of-duties rule holds) → the background worker
stub-executes it. Best-effort — a payment failure never un-approves the
result. Requires the mission to have a financial budget + wallet configured
and the peer connection to carry an FC payment address. Real settlement is
a drop-in when D2 lands. *(`mission-delegation.ts` →
`initiateDelegationPayment`.)*

**Blocked until the Rust core is vendored:**

- **D1. Vendor the FutureChain Rust core** — `wallet.rs`,
  `iso20022_pacs008.rs`, the RPC client into `docs/futurechain/`. *(External
  dependency — not an ANTON-side task.)*
- **D2. Implement `RpcClient`.** Real FutureChain JSON-RPC: `getBalance`,
  `submitPacs008Batch`, `getTransaction`. Replaces the stubs in
  `futurechain-sdk/src/rpc/`.
- **D3. Settlement poller.** A background service that watches FutureChain
  for incoming payments and links a peer's received payment to the
  originating delegation.
- **D4. Pay-on-approval wiring.** On `approve` of a delegation result with a
  `payment_amount_ftc`, propose → (auto-)approve → execute a real transaction
  to the peer's wallet. Honour quality-linked terms.
- **D5. Bilateral state (optional).** `fc_channels` for running balances
  between frequently-collaborating instances, to avoid per-task on-chain fees.
- **D6. KYC encryption.** Encrypt the `fc_kyc_profiles` PII fields at rest
  (currently marked-but-plaintext) before any real-money path goes live.

*Effort: large, and gated on an external dependency.*

---

## Recommended order

1. **Phase A** — quick wins, makes cross-ANTON missions feel complete.
2. **Phase D0** — wire stub payments end-to-end so the money loop is
   exercised and reviewable now.
3. **Phase B** — richer delegation, as real cross-ANTON use grows.
4. **Phase C** — AAP migration when real-time / encrypted transport is needed.
5. **Phase D1–D6** — real payments, the moment the FutureChain Rust core is
   available.

---

## Key files

| Area | Path |
|---|---|
| Mission delegation | `server/services/missions/mission-delegation.ts`, `server/routes/mission-delegation.ts` |
| Delegation schema | `server/db/migrations-pg/120_missions_delegation.sql` |
| AAP transport | `server/services/aap-transport-server.ts` / `-client.ts`, `docs/aap/wire-format-v1.md` |
| Remote agents | `server/services/remote-agent-client.ts`, `server/routes/agents.ts` |
| Community P2P | `server/services/community-*.ts`, `peer-transport-service.ts` |
| Payments | `server/services/fc-*.ts`, `server/routes/fc-*.ts`, `mission-budget.ts` |
| FutureChain SDK | `anton-business/packages/futurechain-sdk/src/{wallet,pacs008,rpc,reference}/` |
