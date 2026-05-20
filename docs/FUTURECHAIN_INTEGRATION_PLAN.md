# FutureChain Integration Plan — ANTON × FutureChain

**Status:** Draft for review · **Date:** 2026-05-19 · **Owner:** FutureChain AB

> Wires ANTON's payment capability to **real FutureChain transactions**. Today every
> payment path in ANTON is stubbed; this plan replaces the stubs with a real
> Ed25519 signer, a real RPC client, an embedded light node, and the app/relay
> plumbing — so ANTON-local, the three apps, and the companion app can all make and
> receive on-chain payments.

This document has two halves: **§1–§4 the investigation synthesis** (what exists
today, established by a five-agent deep dive of both repos) and **§5–§9 the plan**.

---

## 1. Locked decisions

Agreed 2026-05-19:

| # | Decision | Choice |
|---|----------|--------|
| 1 | The transaction signer | **Pure-TypeScript** reimplementation in `@futurechain/sdk`, gated by conformance test-vectors generated from the Rust canonical signer. |
| 2 | Custody model for the 3 apps | **Self-custody** — each user's Ed25519 key lives on their phone; the app signs and broadcasts. |
| 3 | ANTON-local OS targets | **Windows-first** — bundle the light node into the existing Windows portable bundle; macOS/Linux later. |
| 4 | Sequencing | **Foundation-first** — build the shared SDK before anything else. |

---

## 2. Target architecture

```
                    ┌──────────────────────────────────────────┐
                    │  FutureChain network                     │
                    │  Full + Heimdall COMPLIANCE node(s)       │  screens every tx,
                    │  miners · archive nodes                   │  mines or rejects
                    └───────────────▲──────────────────────────┘
                                    │  light hubs forward submissions
                                    │  here for compliance screening
              ┌─────────────────────┴────────────────────┐
              │                                          │
   ┌──────────┴───────────┐                  ┌───────────┴────────────┐
   │ Bahnhof LIGHT-HUB    │                  │ ANTON-local            │
   │ node — public,       │                  │ bundled LIGHT-HUB node │
   │ HTTPS RPC, API-keyed │                  │ — loopback only        │
   └──────────▲───────────┘                  └───────────▲────────────┘
              │ POST /submit_signed_transaction          │ loopback RPC
              │ (client-signed, no password)             │
   ┌──────────┴───────────┐                  ┌───────────┴────────────┐
   │ comm / pay / business│                  │ ANTON-local server     │
   │ apps — SELF-CUSTODY, │                  │ holds agent + human    │
   │ key on device, sign  │                  │ wallets, signs locally │
   │ on device            │                  └───────────▲────────────┘
   └──────────────────────┘                              │ mesh tunnel
                                                          │ over the relay
                                              ┌───────────┴────────────┐
                                              │ companion app          │
                                              │ sends a payment        │
                                              │ INSTRUCTION; holds no   │
                                              │ key — ANTON-local signs │
                                              └─────────────────────────┘
```

Three transaction paths, one shared signer:

1. **ANTON-local** bundles a FutureChain light-hub node. Its server holds an **agent
   wallet** (ANTON acting autonomously) and a **human wallet** (the owner). Both sign
   locally and submit to the bundled node over loopback.
2. **comm / pay / business** apps are **self-custody** — each user's key is on the
   phone. The app signs locally and submits to the **Bahnhof** light-hub node over
   HTTPS.
3. The **companion app** holds no key. It sends a payment *instruction* to its paired
   ANTON-local over the existing **relay** mesh tunnel; ANTON-local signs and submits
   through its own bundled node.

Both light hubs (Bahnhof and ANTON-local's) forward every submission to a Full +
Heimdall **compliance node** — there is no path to the chain that skips screening.

---

## 3. Investigation synthesis — current state

Established by a five-agent read-only deep dive of `/home/daniel/openexpert/ANTON`
and `/home/daniel/FutureChain/futurechain`.

### 3.1 What ANTON is

ANTON (`openexpert` v0.7.5) is a local-first AI workspace — React/Vite + an Express
server on `localhost:3001` — built by FutureChain AB. Four mobile/companion products
build from the one monorepo:

| App | Source | Android | App ID | State |
|-----|--------|---------|--------|-------|
| Communication | `src/comm/` | `android-comm/` | `com.futurechain.anton.communication` | Mature messenger + a Wallet tab |
| Pay | `src/pay/` | `android-pay/` | `com.futurechain.anton.pay` | WIP — scan-QR-and-pay skeleton |
| Business | `src/business/` | `android-business/` | `com.futurechain.anton.business` | WIP — merchant POS skeleton |
| Companion | `src/app/` | `android/` | `com.futurechain.anton.companion` | Shipped — phone remote for an ANTON instance |

"ANTON local" = the main `localhost:3001` instance (Express + React). It runs in four
forms; the **Windows portable bundle** is the preferred distribution and already
supervises three bundled runtimes (PostgreSQL, Ollama, the Node server) via
PID-file PowerShell scripts (`scripts/portable/run-anton.ps1`).

### 3.2 What already exists — the assets

The integration is **not greenfield**. Real, usable foundations:

- **FutureChain has a `light-hub` node type** (`futurechain/src/main.rs:148-152`,
  `compliance_gateway.rs:20-30`) — no mining, no Heimdall, windowed memory, forwards
  submissions upstream for screening. Bahnhof already runs one.
- **`POST /submit_signed_transaction`** (`futurechain/src/rpc/mod.rs:847`) accepts a
  fully client-signed transaction with **no wallet password** — the exact endpoint a
  self-custody client needs. Functionally complete on the Rust side.
- **The companion ↔ relay ↔ ANTON-local transport is already built** — the companion
  app's `mesh` transport (`src/app/services/transports/mesh.ts`) tunnels `/api/app/*`
  RPC over a Noise-encrypted connection through `relay.futurechain.eu`; ANTON-local
  connects as an "instance leg" (`server/services/mesh/`). It works today for
  chat/approvals. **The relay needs no changes for payments.**
- ANTON's DB **already models the agent/human split** —
  `fc_wallets.wallet_type ∈ {human, agent}` and `fc_connection_config`
  (`node_url`, `cli_binary_path`, `wallet_dir`) in migration
  `server/db/migrations/081_futurechain_foundation.sql`.
- The **`@futurechain/sdk`** package (`anton-business/packages/futurechain-sdk/`)
  has the right shape — five namespaces. Its `reference` (ADR-004 remittance) and
  `tax` modules are **fully real and tested**.
- `docs/A2A_ROADMAP.md` already lays out a Phase D1–D6 plan for this work.

### 3.3 The gap — every payment path is stubbed

- **Two disconnected, fully-stubbed stacks.** A server-side one
  (`server/services/fc-*.ts`) where `fc-transaction-service.ts:26` literally writes a
  `STUB_TX_…` id and self-confirms; and the phone-app SDK whose `RpcClient` throws
  `NotImplementedError` (`futurechain-sdk/src/rpc/index.ts:34-48`). Neither touches a
  real node. They will be converged onto the one shared SDK (§5, Phase 1).
- The **A2A pay-on-approval loop** (`server/services/missions/mission-delegation.ts`
  → `mission-budget.ts:316-332`) runs but settles nothing — the budget ledger moves,
  no money does.
- **pay and business have zero networking code** — fully offline (IndexedDB +
  keychain); "make a payment" writes a local receipt and a PACS.008 *draft* only.
- **No light node is bundled** in ANTON-local; nothing spawns or supervises one.

### 3.4 The FutureChain node — what it offers a client

- **Signing scheme: Ed25519** (`futurechain/src/secure_crypto.rs`). Address =
  `fc_` + Base58( `0x46` ‖ SHA-256(pubkey)[0:20] ‖ double-SHA-256 checksum[0:4] )
  (`secure_crypto.rs:190-199`). The hybrid FALCON-512 signature is shadow-mode only
  and may be `null` today.
- **The canonical signing message** is `signing_message_v2`
  (`futurechain/src/transaction.rs:593-632`): a precise string over
  inputs/outputs/fee/timestamp/encrypted-data-hash/metadata-hash; the Ed25519
  signature is over `SHA-256(signing_message_v2)`. The **same 64-byte signature
  goes on `tx.signature` and on every input**; `txid` of a PACS.008 tx is its UETR.
  Canonical reference implementation: `futurechain/src/transaction_client.rs:134-294`.
- A light hub **forwards** `/submit_signed_transaction` to a P2P-discovered
  compliance node (or `UPSTREAM_RPC`); the Full node screens via Heimdall and mines
  or rejects (`futurechain/src/rpc/mod.rs:900-951`). Fail-closed if no upstream.
- RPC binds **`127.0.0.1`** by default (`RPC_BIND_ADDRESS` to change); RPC TLS is
  off by default — a reverse proxy is expected. Optional `LIGHT_HUB_API_KEYS` gate.

### 3.5 Blockers — must be addressed before anything settles

1. **Crypto mismatch.** ANTON's apps generate **secp256k1** keys with Ethereum-style
   (Keccak) addresses (`src/{comm,pay,business}/services/wallet.ts`,
   `futurechain-sdk/src/wallet/index.ts` — the address algo is a documented
   placeholder). FutureChain is **Ed25519** + the `fc_`/Base58/SHA-256 format above.
   **Every wallet the apps create today is on the wrong curve.** No correct
   TypeScript signer exists anywhere. → Phase 1.
2. **Bahnhof is not reachable.** Its RPC binds to loopback, and Android release
   builds block cleartext HTTP to a bare IP (`android-*/.../network_security_config.xml`).
   Bahnhof needs a domain + HTTPS. → Phase 0.2.
3. **Compliance discovery is single-hop.** The compliance *model* (Model A — forward
   to a compliance node) and *enforcement* (mempool + block validation reject
   unstamped txs, every node) are correct and solid — an unscreened tx can never be
   mined. But `ComplianceAnnouncement` is single-hop (`network/mod.rs:2783-2826`): a
   node not directly peered with a compliance node never discovers one and is stuck
   fail-closed (cannot transact). Must be fixed for an open network. → Phase 0.4.

---

## 4. Cross-cutting principles

- **One shared signer.** `@futurechain/sdk` becomes the single real implementation,
  imported by the phone apps *and* ANTON-local's server — this converges today's two
  stacks.
- **Conformance-locked.** The pure-TS signer is only trusted because every release is
  diffed byte-for-byte against vectors from the Rust canonical signer (Phase 0.1). A
  signing divergence means rejected or unrecoverable funds — this is the gate.
- **No compliance bypass.** Every transaction — from a phone app, from ANTON-local,
  from the companion — reaches the chain only via a light hub that forwards to a
  Full + Heimdall node. Screening is structural.
- **Self-custody discipline.** Once a lost key means lost funds, **mnemonic
  backup/recovery is a launch-blocking feature**, not a nice-to-have.

---

## 5. The plan — phased

### Phase 0 — Prerequisites *(before / alongside Phase 1)*

- **0.1 Conformance test vectors.** Generate known-good signed transactions from
  FutureChain's Rust signer (`transaction_client.rs`): for each, the input, the
  derived `signing_message_v2`, the signature, the txid, and the address. These are
  the TS signer's test oracle. **Hard prerequisite for Phase 1.**
- **0.2 Bahnhof reachable RPC.** *Dev now:* set `RPC_BIND_ADDRESS=0.0.0.0` and
  `RPC_CORS_ORIGINS` on Bahnhof so debug builds can hit `http://79.136.1.113:8545`
  directly (no domain needed yet — see §7.2). *Before the apps ship:* a domain + TLS
  reverse proxy (Caddy) + `LIGHT_HUB_API_KEYS`.
- **0.3 Compliance node.** FutureChain AB's existing Full + Heimdall node is the
  compliance node (§7.1) — no new node. It must be network-reachable (HTTPS) by the
  remote light hubs in production.
- **0.4 Compliance routing hardening — FutureChain core (go-live prerequisite).**
  _**✓ DONE 2026-05-19** — commits `da13f34` (gossip keystone, #1+#4) + `add48e5`
  (#2–#7), merged via `a2a5eec`, pushed, and deployed to Bahnhof. Verified by
  `futurechain/test_compliance_gossip.py` (3-node chain A←B←C; node C two hops
  away discovers the compliance node via gossip and persists it to disk) and by
  re-running the regression suite (89/96 — same as the pre-Phase-0.4 baseline,
  no regression; Cat 14.1 `registry_enabled` flipped from False to True — visible
  effect of the unconditional wiring)._

  A code trace + patent review confirmed the compliance *model* is correct (Model A —
  RPC-forward to a discoverable compliance node, matching patent Claims 2/7/12) and
  *enforcement* is solid (the mempool gate `mempool.rs:177-209` and block validation
  `blockchain.rs:366-385` both reject unstamped PACS.008, every node independently —
  an unscreened tx can never be mined). The weak link is **discovery/routing** — for
  an open network of independently-run light hubs it must be finished. FutureChain-
  repo work, ~1 week:
  - **Gossip the compliance announcement.** Today `ComplianceAnnouncement` is
    single-hop — `network/mod.rs:2783-2826` registers it locally and never
    re-broadcasts, so a node >1 hop from a compliance node never discovers one.
    Re-broadcast verified announcements with a dedup set + TTL, mirroring the working
    `NewTransaction` flood.
  - **Bootstrap seed + registry persistence.** Ship a hard-coded compliance-node
    seed list (the genesis wallets' canonical endpoints); persist the
    `/compliance/nodes` registry to disk — a fresh light hub must not depend on a
    lucky direct peering.
  - **Multi-target failover.** `rpc/mod.rs:909-951` picks one upstream and posts
    once — iterate `get_active_nodes()` on transport failure.
  - **Always wire discovery** — the registry is enabled only behind an ISO-sync flag
    today (`main.rs:1456`); wire it unconditionally.
  - **TLS + endpoint pinning on the forward** — it carries full PACS.008 / KYC data
    over plain HTTP today.
  - Real `measure_latency` (a stub today) + delete the dead `network/discovery.rs`.

- **0.5 P2P compliance forwarding — FutureChain core (security hardening; replaces
  the 0.4 RPC-forward path).** Removes the requirement that a compliance node expose
  an HTTP RPC publicly. The compliance-screen request flows over the same
  TLS-encrypted P2P channel that `NewTransaction` / `NewBlock` /
  `ComplianceAnnouncement` already use — only direct P2P peers ever touch a
  compliance node, the way blocks already propagate. With this, a node anywhere in
  the network ("cluster 3", many hops from a compliance node in "cluster 1") can
  submit a transaction with **no compliance-node RPC reachable from its side**.
  FutureChain-repo work, ~1 week. Decided 2026-05-20.

  - **New P2P message** — `ComplianceScreenRequest { request_id,
    originator_address, transaction }` in `network/messages.rs`; classified as
    broadcast (priority 6, same tier as `NewTransaction`). Re-broadcast on first
    sight, dedup'd by `request_id` via a TTL'd `seen_screen_requests` set —
    mirrors the Phase 0.4 `ComplianceAnnouncement` gossip pattern exactly.
  - **Compliance-node side.** A node that holds a `ComplianceGateway`, on first
    sight of a new request: per-`originator_address` rate-limit check (reuses
    `security::rate_limiter`); screens via
    `ComplianceGateway::process_iso20022_transaction` → Heimdall; attaches the
    compliance signature; **broadcasts the result as a normal `NewTransaction`**.
    The appearance of the stamped tx IS the response — no separate
    `ComplianceScreenResponse` type, no synchronous reply path. The mempool
    admission rule (`mempool.rs:177-209`) and block-validation rule
    (`blockchain.rs:366-385`) — unchanged — admit the stamped tx network-wide.
  - **Receiving-node side.** `POST /submit_signed_transaction` on a node with a
    local gateway: still processes locally (no change). On a light-hub: builds a
    `ComplianceScreenRequest`, broadcasts via P2P, returns `{status: "queued",
    request_id, tx_id}`. Client polls `GET /transaction/{tx_id}` for confirmation
    (same poll the wallet UIs will already do for block inclusion).
    `POST /submit_pacs008_batch` follows the same pattern (signs each tx with the
    wallet on the receiving node, broadcasts one `ComplianceScreenRequest` per tx).
  - **Remove the 0.4 RPC-forward path.** Delete `build_upstream_candidates` and
    `forward_to_upstream` from `rpc/mod.rs`; remove the forward blocks in the two
    submit handlers. P2P gossip becomes the only forwarding transport. The
    `endpoint` field in `ComplianceAnnouncement` is then informational only
    (still useful for `/compliance/nodes` display); the network no longer depends
    on it being reachable. Update `09_NETWORK_SECURITY.md` to describe the
    P2P-only forwarding model. Drop `COMPLIANCE_FORWARD_REQUIRE_TLS` (the env
    gate added in Phase 0.4 becomes moot — there is no HTTP forward to gate).

  **Verified by** a new integration test extending `test_compliance_gossip.py`
  into a 4-node chain A↔B↔C↔D — A is the compliance node, D is a "cluster 3"
  node three hops away that submits a tx and watches it land in a block; the
  existing 3-node gossip test (for `ComplianceAnnouncement`, regression); and
  the regression suite end-to-end.

  **Security posture won.** No compliance node needs its RPC exposed beyond its
  own host. The TLS-1.3 P2P port — mutual peer authentication, dedup-protected
  gossip — is the only contact surface, identical to the surface that `NewBlock`
  and `NewTransaction` already use. An attacker on the public internet has the
  same view of a compliance node as they do of any other node — no extra HTTP
  service to attack. The patent's compliance-stamp-required-for-mining rule is
  unchanged; only the *transport* for the screen request moves from HTTP to P2P.

### Phase 1 — `@futurechain/sdk`: the foundation *(~1.5 weeks)*

Replace the three stub modules; this is the shared core.

- **`wallet/`** — Ed25519 keygen (`@noble/ed25519`); FutureChain's non-standard HD
  derivation `SHA-256(seed‖account‖index)` (not BIP-32); the real
  `fc_`/Base58/SHA-256+checksum `addressFromPublicKey` (replacing the Ethereum
  placeholder); `sign`/`verify`; BIP-39 24-word mnemonic.
- **`pacs008/`** — PACS.008 message builder, the exact `signing_message_v2` canonical
  string, `canonicalize`/`hash`.
- **`rpc/`** — real `RpcClient` against the actual endpoints:
  `submitSignedTransaction`, `getBalance`, `getUtxos`, `getTransaction`, `getInfo`,
  `getIsoReceived`. (Note: target `/submit_signed_transaction` — the banner-advertised
  `/submit_pacs008` paths do not exist.)
- **Transaction builder** — UTXO selection, build inputs/outputs + fee, the dual
  tx-level + per-input signature placement, txid = UETR for PACS.008.
- **Conformance suite** — run against the 0.1 vectors in CI; byte-exact or fail.

*Deliverable:* a published `@futurechain/sdk` that can build, sign, and submit a real
FutureChain transaction, proven against the Rust canonical.

### Phase 2 — ANTON-local + bundled light node, Windows *(~1.5 weeks)*

- Bundle the `futurechain` Windows binary as a **4th supervised runtime** in the
  portable bundle — extend `fetch-runtimes.ps1`, `build-portable.ps1`,
  `run-anton.ps1` (spawn `futurechain node --node-type light-hub
  --light-hub-window-days 7 --connect <seed> --rpc-port <local>`, PID-file
  supervised), `stop-anton.ps1`.
- Replace the `fc-*` server stubs with the real SDK: `fc-wallet-service` creates real
  Ed25519 **agent + human** wallets; `fc-transaction-service.submitTransaction` builds
  + signs + POSTs to the **loopback** light hub (no TLS/auth needed on loopback); add
  a confirmation poller. Encrypt wallet keys at rest (reuse the
  `INSTANCE_KEY_ENCRYPTION_KEY` pattern).
- Result: the agent path (`/api/gateway/pay`) and human path (`FCWalletsPage`) settle
  for real; the A2A pay-on-approval stub at `mission-budget.ts` is closed
  (A2A_ROADMAP Phase D).

### Phase 3 — The 3 apps → Bahnhof, self-custody *(~2.5 weeks)*

- Swap each app's wallet from secp256k1 → the SDK's Ed25519. Existing app wallets are
  wrong-curve — a one-time re-create (acceptable pre-production; see §7).
- Add an RPC-client layer to each app (pay & business have none) → Bahnhof's HTTPS
  URL, configurable in settings.
- **Self-custody essentials:** on-device Ed25519 key in the OS keychain,
  PIN/biometric-gated; a **24-word mnemonic backup + recovery flow** (launch-blocking).
- Wire **send** (build + sign PACS.008 → `/submit_signed_transaction` on Bahnhof) and
  **receive** (poll `/balance` + `/iso_received`) across pay, business, and the comm
  Wallet tab.

### Phase 4 — Companion → relay → ANTON-local *(~1 week)*

- New biometric-gated `POST /api/app/.../wallet/transaction` on the app-gateway —
  accepts a payment *instruction* (payee, amount, purpose).
- ANTON-local builds + signs with its own wallet (Phase 2) and submits via its
  bundled light hub.
- Send/confirm UI in `src/app/` (today an empty stub) — reuse the existing
  approvals / signed-envelope pattern.
- No relay changes. Update the stale "never relays through any third party" wording
  in `ANTON_COMPANION_APP_SPEC.md` to reflect the blind Mesh relay.

### Phase 5 — Infra & hardening *(parallel)*

Bahnhof HTTPS + API keys; the compliance node; per-user rate limits; a DPIA note on
routing payment instructions over the relay; fix `fc_kyc_profiles` (PII columns named
`*_enc` but stored plaintext) before any real-money path goes live.

---

## 6. Dependencies & critical path

```
0.1 ──► Phase 1 ──► Phase 2 ──► Phase 4
                │
                └─► Phase 3   (also needs 0.2)
0.3 ──► the compliance node itself; gates all real settlement
0.4 ──► FutureChain core; gates open-network go-live (Bahnhof + shipped ANTON-locals)
0.5 ──► supersedes 0.4's RPC-forward with P2P gossip — no public compliance RPC ever
Phase 5 runs in parallel
```

Critical path: **0.1 → 1 → 2 → 4**. Phase 3 branches off Phase 1 (+ 0.2). Nothing
settles end-to-end until 0.3 exists; **Phase 0.4 gates the open-network go-live** and
is FutureChain-repo work that can run in parallel with Phases 1–2.

**Rough total: ~6–8 weeks** ANTON-side + **~1 week** FutureChain-core (Phase 0.4),
parallelisable.

---

## 7. Open items / decisions still needed

1. **Compliance node — RESOLVED (2026-05-19).** FutureChain AB operates the
   Full + Heimdall compliance node — the existing one in the current setup. Bahnhof
   and ANTON-local light hubs do **not** run Heimdall. Light hubs discover where to
   forward via the **compliance-announce** mechanism — the `/compliance/nodes`
   registry, populated from signed `ComplianceAnnouncement` P2P messages (shipped as
   bug #5 / #12). Two items to nail down in Phase 0:
   - *Propagation — confirmed by code trace, now Phase 0.4.* `ComplianceAnnouncement`
     is **single-hop**: the receiver registers it locally (`network/mod.rs:2783-2826`)
     and never re-broadcasts, so a node >1 hop from a compliance node never discovers
     one; discovery is also wired only behind an ISO-sync flag (`main.rs:1456`). The
     designed behaviour is gossiped propagation (whitepaper §10.2; patent Claim 12).
     Fixed in **Phase 0.4** — gossip the announce, bootstrap seed, always-wire.
   - *Reachability — superseded by Phase 0.5.* The compliance node's RPC does NOT
     need to be reachable from the public internet — Phase 0.5 routes
     compliance-screen requests over the same TLS-encrypted P2P gossip channel
     that `NewTransaction` / `NewBlock` already use, so only direct P2P peers
     ever touch a compliance node. Until 0.5 lands, the interim model (Phase 0.4)
     keeps RPC-forward as the only path and would require public RPC in production
     — hence 0.5 is the security-hardening end-state.
   - *Model — Phase 0.5 replaces Model A with Model B.* The patent's
     gateway-stamp invention (mempool admission + block validation reject
     unstamped PACS.008) is unchanged in either model — Phase 0.5 only changes
     the *transport* of the screen request, from HTTP RPC (Model A) to P2P
     gossip with the stamped result re-broadcast as `NewTransaction` (Model B).
     Phase 0.5 removes the RPC-forward path entirely; P2P becomes the sole
     forwarding transport.
2. **Bahnhof domain — RESOLVED for now (2026-05-19).** No domain yet; development
   uses the **direct IP `79.136.1.113`**. Fine through Phases 0–2 and Phase 3 *dev*
   (debug builds; Bahnhof needs `RPC_BIND_ADDRESS=0.0.0.0` + `RPC_CORS_ORIGINS`). A
   domain + TLS cert becomes required **before the phone apps ship** — Android
   release builds block cleartext HTTP to a bare IP, and IP-only TLS certs are
   impractical. Tracked as a pre-release item, not an upfront blocker.
3. **Heimdall throughput.** ~110 msg/s screening is ample for ANTON's expected
   volumes; flag if bursts are expected.
4. **Existing app wallets.** Any secp256k1 wallets already created on testers' phones
   are wrong-curve and will be discarded on upgrade. Assumed acceptable
   (pre-production, stub balances) — confirm no real value is held.
5. **Naming.** "Bahnhof" is overloaded — the FutureChain light-hub node (79.136.1.113)
   vs. Bahnhof AB the GDPR hosting provider in `HOSTED_ANTON_COMPLIANCE_PLAN.md`.
   Disambiguate in future docs.

---

## 8. Key file references

**FutureChain (`/home/daniel/FutureChain/futurechain/`)**
- `src/main.rs:148-157` — `--node-type`, `--light-hub-window-days`
- `src/rpc/mod.rs:847` — `/submit_signed_transaction`; `:900-951` — light-hub forwarding
- `src/transaction.rs:593-632` — `signing_message_v2`
- `src/transaction_client.rs:134-294` — canonical signer (the conformance oracle)
- `src/secure_crypto.rs:190-199` — address derivation

**ANTON (`/home/daniel/openexpert/ANTON/`)**
- `anton-business/packages/futurechain-sdk/src/{rpc,wallet,pacs008}/index.ts` — the stubs to fill
- `server/services/fc-transaction-service.ts:26` — the settlement stub
- `server/services/fc-connection-service.ts`, `fc-wallet-service.ts`, `fc-gateway.ts`
- `server/db/migrations/081_futurechain_foundation.sql` — `fc_connection_config`, `fc_wallets`
- `server/services/missions/mission-delegation.ts`, `mission-budget.ts:316-332` — the A2A loop
- `scripts/portable/{fetch-runtimes,build-portable,run-anton,stop-anton}.ps1` — the bundle
- `src/{comm,pay,business}/services/wallet.ts` — the wrong-curve app wallets
- `src/app/services/transports/mesh.ts`, `server/routes/app-gateway.ts` — companion + relay
- `docs/A2A_ROADMAP.md` — the project's existing D1–D6 plan

---

*Draft prepared 2026-05-19 from a five-agent investigation. Phases, estimates, and
the §7 open items are for review before implementation begins.*
