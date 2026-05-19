# ANTON-to-ANTON roadmap — missions &amp; payments

How two ANTON Local instances work together: discover each other's agents,
delegate mission work, and — the goal of this roadmap — **pay each other for
that work**.

User-facing guide: `docs/help/anton-to-anton.html`.
This document is the engineering plan: where things stand and what is left.

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
| Delegate a multi-task sub-graph as one unit | ❌ NOT STARTED | Only single tasks today |
| Capability-aware peer selection | 🟡 PARTIAL | `delegation_trust_level` exists, not wired to the UI |
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

## Phase B — Richer delegation *(no blockers)*

- **B1. Sub-graph delegation.** Delegate a connected set of tasks as one
  atomic unit, not just a single task. The peer's sub-mission mirrors the
  sub-graph.
- **B2. Capability-aware peer selection.** When delegating, rank connected
  peers by advertised capabilities + trust level (`delegation_trust_level`)
  instead of a manual contact picker.
- **B3. Result ingestion.** On approval, optionally fold the peer's result
  back into the originating mission as a completed task / knowledge atoms,
  rather than leaving it inert in `result_payload`.

*Effort: medium. Touches mission decomposition + the delegation data model.*

---

## Phase C — Move delegation onto AAP *(no hard blocker; sequencing choice)*

Today delegation rides the **Community P2P queue** (async, signed). AAP —
the ANTON Agent Protocol — is the intended real-time, encrypted transport.

- **C1. Finish AAP crypto.** Wire the stubbed pieces in
  `aap-transport-server.ts` / `aap-transport-client.ts`: the X25519
  ephemeral handshake, real Ed25519 envelope signing, AES-256-GCM bundle
  encrypt/decrypt. (Verification — `verifyEnvelopeSignature` — is already real.)
- **C2. BUNDLE apply pipeline.** Implement decryption + the `.anton` bundle
  importer so received BUNDLEs actually take effect.
- **C3. Route delegation over AAP.** Carry `mission_delegation` /
  `mission_delegation_result` as AAP BUNDLE types; keep the Community P2P
  path as the offline/async fallback.
- **C4. Rate limits + quotas.** Implement the `rate_limited` / `quota_exceeded`
  paths that currently exist only as error codes.

*Effort: medium–large. Files: `aap-transport-*.ts`, `docs/aap/wire-format-v1.md`.*

---

## Phase D — A2A payments *(BLOCKED on the FutureChain Rust core)*

The goal: when an originator **approves** a delegated result, the
`payment_amount_ftc` on the brief settles to the peer.

**D0 — testable now, in stub mode (optional, unblocked).**
Wire the delegation's `payment_amount_ftc` into the existing
propose → approve → execute pipeline (`fc-gateway` / `mission-budget`) so the
full pay-on-approval loop runs end-to-end against the *stub* gateway. Real
settlement then becomes a drop-in when D2 lands.

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
