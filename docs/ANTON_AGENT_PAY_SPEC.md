# ANTON_AGENT_PAY_SPEC.md

**Status:** Draft 1 (2026-05-24). Pre-code spec — Daniel sign-off requested on the design decisions in §11 before scaffolding starts.

**Purpose:** Anton Agent Pay is a small downloadable **desktop** application that wraps just the pay-flow of ANTON Pay and exposes it to **third-party AI agents** (OpenCLAW, ChatGPT-with-tools, Claude Desktop, custom LangGraph bots) via a local server. The agent asks Agent Pay to send a payment; Agent Pay shows an OS-native confirmation modal; the human clicks (or doesn't); the payment goes (or doesn't). This is the **Anton2Anton USP** in its standalone form — the smallest possible surface an AI agent needs to participate in FTC payments without bundling the full ANTON ecosystem.

---

## 1. Why

FutureChain's strategic differentiator is "agent-to-agent payments" — autonomous AI agents transacting in compliance-screened FTC over our chain. Today ANTON Pay is a mobile-only consumer wallet; ANTON Business is a heavyweight back-office. Neither is a comfortable fit for "ChatGPT just made me a cup of coffee with my crypto wallet". Agent Pay closes that gap with three properties:

1. **One-binary install.** No iOS/Android prerequisites; runs where the agent runs.
2. **Local server, language-agnostic API.** Any agent runtime that can speak JSON-RPC or MCP can drive it.
3. **Non-negotiable human confirmation on every send.** The agent proposes, the human disposes. There is NO headless auto-send mode — by design, by spec, by code.

The two-out-of-three trilemma here is real: easy enough for AI integration, safe enough that a prompt-injected agent can't drain a wallet, fast enough that a tap-to-approve feels natural. We pick safe-and-fast, accept the friction of "you have to be at your keyboard".

---

## 2. Threat model

This is the **new** threat surface — AI-driven payments — alongside the existing wallet threats.

| Threat                                                        | Where it lands                              | Defence                                                                                       |
|---------------------------------------------------------------|---------------------------------------------|-----------------------------------------------------------------------------------------------|
| Prompt injection sends a malicious payment                    | Agent ↔ Agent Pay JSON-RPC                  | **OS-native modal shows recipient + amount + fee in a window the agent CANNOT spoof.** User has to click. |
| Compromised agent runtime                                     | Agent process                               | Same modal — the agent can lie to the user IN the chat, but the modal shows the actual payload Agent Pay received. |
| Compromised Agent Pay binary                                  | Local machine                               | Code signing (notarised on macOS, signed on Windows, Flatpak verified on Linux); auto-update via signed deltas only. |
| Cross-origin web attack on the local 127.0.0.1 port           | Browser running malicious JS on a tab      | (a) Bind explicitly to `127.0.0.1` not `0.0.0.0`. (b) Require an `Origin` header check. (c) Per-session bearer issued via an OS-native pairing flow. |
| Local-machine attacker (already root)                         | Local                                       | Out of scope — at that point they have keystroke + screenshot access. |
| Stolen pairing bearer reused after agent exit                 | Network of one machine                     | Pairing bearers expire (default 4h) + the issuing flow shows the agent identity to the user. |
| Headless auto-send via "remember my decisions"                | UX choice                                  | **Not implementable**. There is no API to bypass the modal. The closest thing is per-recipient allowlists with strict caps (§7.5), and even those still show the modal — they just pre-fill it. |

The **load-bearing safety property** is "every send shows an OS-native modal the agent cannot spoof". Everything else is defence-in-depth.

---

## 3. Scope

### In scope (MVP)
- Single binary for Win/Mac/Linux, code-signed where the platform supports it.
- Wallet create + import (24-word mnemonic) + show recovery phrase. Same wallet model as ANTON Pay — Ed25519 + FALCON-512 envelope v3.
- Pairing flow for an agent client (one-time, produces a session bearer).
- JSON-RPC server on `127.0.0.1:PORT` with a small set of methods: `getStatus`, `getBalance`, `listTransactions`, `proposePayment`, `getProposal`.
- MCP wrapper exposing the same methods as MCP tools (so Claude Desktop / any MCP-aware agent picks them up natively).
- OS-native confirmation modal showing recipient, amount, fee, recent activity summary, and the agent identity that proposed it.
- Connects to Bahnhof's public RPC by default; advanced setting for custom node URL.
- Reuses Bahnhof's signed-challenge enrollment for the install's bearer.

### Out of scope (MVP)
- Multiple wallets in one Agent Pay install (just one wallet per install).
- Hardware-wallet integration (Ledger, Trezor) — Phase 2.
- Browser extension / WebUSB.
- Headless mode of any kind.
- iOS / Android (those are ANTON Pay's job).
- Receive-payment notifications (just show on next `getStatus` poll, not push).

### Explicitly NOT shipped (design choice, not roadmap)
- No "remember my decisions" / no auto-approve / no whitelist that bypasses the modal.
- No JSON-RPC method that returns a private key.
- No CLI flag that disables the modal in production builds. (Dev build has one for testing; the production-build pipeline strips it.)

---

## 4. Architecture

```
  ┌──────────────────────────────────────────────────────────┐
  │                  USER'S DESKTOP MACHINE                  │
  │                                                          │
  │   ┌──────────────┐       ┌────────────────────────┐     │
  │   │  AI agent    │ ───▶  │  Anton Agent Pay       │     │
  │   │  (Claude     │       │  (Electron app,        │     │
  │   │   Desktop,   │       │   127.0.0.1:PORT)      │     │
  │   │   OpenCLAW,  │ ◀─── │                        │     │
  │   │   etc)       │       │  ┌──────────────────┐  │     │
  │   └──────────────┘       │  │ JSON-RPC server  │  │     │
  │          ▲               │  │ + MCP wrapper    │  │     │
  │          │               │  └────────┬─────────┘  │     │
  │     human prompts       │           │            │     │
  │     in chat              │           ▼            │     │
  │                          │  ┌──────────────────┐  │     │
  │                          │  │ OS-NATIVE MODAL  │  │     │
  │                          │  │ (the safety      │  │     │
  │                          │  │  boundary)       │  │     │
  │                          │  └────────┬─────────┘  │     │
  │                          │           │            │     │
  │                          │           ▼ on Approve │     │
  │                          │  ┌──────────────────┐  │     │
  │                          │  │ pay-app services │  │     │
  │                          │  │ (reused from     │  │     │
  │                          │  │  ANTON Pay)      │  │     │
  │                          │  └────────┬─────────┘  │     │
  │                          └───────────┼────────────┘     │
  └──────────────────────────────────────┼──────────────────┘
                                         │ HTTPS
                                         ▼
                          ┌─────────────────────────────┐
                          │  rpc.futurechain.eu         │
                          │  (Bahnhof public RPC)       │
                          │  X-API-Key (install bearer) │
                          │  X-Attestation-Token        │
                          └─────────────────────────────┘
```

The Electron app houses two processes — the **main process** owns the OS-native modal + private keys; the **renderer process** runs the local JSON-RPC server + agent-facing API. Private keys never enter the renderer; signing happens in the main process after the modal returns Approve.

---

## 5. Wallet handling

### 5.1 Identity & storage

Wallet model is **identical to ANTON Pay envelope v3** (see `[[PAY_WALLET_PASSPHRASE_SPEC]]`):
- 24-word BIP-39 mnemonic
- Ed25519 priv (HD-derived from seed)
- FALCON-512 keypair (non-deterministic, stored with the priv)
- Optional passphrase wrap (PBKDF2 600k + AES-256-GCM)

Storage tier per OS:
| OS      | Storage                                                |
|---------|--------------------------------------------------------|
| macOS   | Keychain via `keytar` (touch-bound where supported)    |
| Windows | DPAPI (user-bound) via `keytar`                        |
| Linux   | libsecret (gnome-keyring / kwallet) via `keytar`, fallback to AES-GCM file with KDF from a machine-id mixin |

The fallback Linux tier is explicitly weaker; the install flow warns the user when libsecret isn't available and suggests installing gnome-keyring before proceeding.

### 5.2 Create vs import vs link

- **Create new wallet** — fresh Ed25519 + FALCON keypair + mnemonic, displays the 24 words for backup (with explicit confirmation that user has written them down).
- **Import from mnemonic** — paste 24 words; derives Ed25519 + generates a fresh FALCON keypair (FALCON keygen is non-deterministic so this is a new FALCON identity for the same Ed25519 address; tracked under [[task #289]] for the eventual rotation UX).
- **Link from ANTON Pay** — Phase 2: a QR-code pairing flow where ANTON Pay exports an encrypted wallet envelope to Agent Pay. Not in MVP.

One wallet per install in MVP. Multi-wallet UI is Phase 2.

### 5.3 Bahnhof enrollment

The Agent Pay install is its own enrolled client (separate `install_id` from any ANTON Pay install on the same user). It:
1. Calls `POST /enroll` to get an install bearer.
2. Calls `POST /register_address` with the wallet's signed-challenge proof of control.
3. Stores the install bearer + install_id in secure storage.
4. From here on, every chain RPC carries the bearer.

The Bahnhof side doesn't need new endpoints — Agent Pay is just another enrolled client.

---

## 6. JSON-RPC server

### 6.1 Protocol

- JSON-RPC 2.0 over HTTP POST.
- Bound to `127.0.0.1:PORT` only (never `0.0.0.0`).
- Default PORT is auto-selected at install time (random in the 49152–65535 ephemeral range); written to a `~/.anton-agent-pay/server.json` discoverable file so agents can find it.
- All requests require:
  - `Origin` header matches an allowlist (in MVP: `null`, `localhost:*`, `127.0.0.1:*`, and explicitly-paired agent origins).
  - `Authorization: Bearer <session_token>` header where the session token was issued via the pairing flow.
- Errors per JSON-RPC 2.0 (numeric code + message + optional data).

### 6.2 Methods

| Method                | Args                                        | Returns                                                          | Modal? |
|-----------------------|---------------------------------------------|------------------------------------------------------------------|--------|
| `getStatus`           | none                                        | `{ paired, wallet_address, balance_ftc, last_seen_block }`       | no     |
| `getBalance`          | none                                        | `{ balance_ftc, utxo_count }`                                    | no     |
| `listTransactions`    | `{ limit? }`                                | `[{ tx_id, amount, direction, counterparty, ts, confirmed }]`    | no     |
| `proposePayment`      | `{ to, amount_ftc, reference?, agentNote? }` | `{ proposal_id, expires_at }`  — DOES NOT SEND                  | **yes** — opens modal |
| `getProposal`         | `{ proposal_id }`                           | `{ state: pending|approved|rejected|sent|expired, tx_id? }`     | no     |
| `cancelProposal`      | `{ proposal_id }`                           | `{ state: cancelled }`                                           | no     |

`proposePayment` returns immediately with a `proposal_id`; the agent then polls `getProposal` until the user has approved (or rejected, or expired). The modal lifetime defaults to 60 s and is configurable per proposal up to 5 min. **There is no "send_payment" method** — proposing is the only way in, and the modal is in the path.

### 6.3 MCP wrapper

The same methods are exposed via the Model Context Protocol so Claude Desktop and other MCP-aware agents discover them natively. The MCP tool definitions mirror the JSON-RPC method names (`proposePayment` etc.), and the Claude Desktop / agent UI naturally surfaces "Anton Agent Pay" as a tool group. MCP transport: stdio for Claude Desktop, optional WebSocket for other MCP clients.

---

## 7. The OS-native modal

### 7.1 What it shows

```
┌─────────────────────────────────────────────┐
│  Confirm payment                            │
│                                             │
│  AGENT: claude-desktop                      │
│         (paired 14h ago)                    │
│                                             │
│  Send  3.50 FTC                             │
│  To    fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs │
│         (Acme Corp coffee shop — seen 4×)   │
│  Fee   0.001 FTC                            │
│                                             │
│  Agent note: "two espressos"                │
│                                             │
│  Wallet balance after: 41.50 FTC            │
│                                             │
│           [Reject]   [Approve]              │
└─────────────────────────────────────────────┘
```

Recipient is shown both as raw address and (if a label / past-interaction exists) as a recognised counterparty. "Seen 4×" lifts past transactions to give the user a quick "yes I trust this" signal. Agent note is the optional free-text the agent supplies (e.g. "two espressos"); it's clearly marked as agent-supplied and not chain-validated.

### 7.2 What's required to approve

- Explicit click on `Approve`.
- If wallet has a passphrase: passphrase entry (text field with same back-off as ANTON Pay — 5 attempts then 30 s lockout doubling).
- If OS supports biometric (Touch ID, Windows Hello): biometric prompt is offered as a faster alternative to the passphrase.
- No auto-confirm timer. No "remember this counterparty for next time". No "remember this agent".

### 7.3 What's required to reject

- Single click on `Reject`. No reason field required (low-friction reject by design — we want users to reject easily).
- Modal close (X / Esc) counts as Reject.

### 7.4 Implementation

Electron's `BrowserWindow` with `frame: false`, `alwaysOnTop: true`, `skipTaskbar: false`, and `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }`. The renderer for this window is a minimal isolated HTML page that ONLY shows the modal — no third-party JS, no remote loads. The main process passes the payment payload via Electron IPC `webContents.send()`.

This is a real OS window, not an in-app HTML overlay. The agent's renderer cannot overlay or hide it.

### 7.5 Future: pre-filled recipient allowlists

Phase 2 idea (NOT MVP): a user-managed allowlist of `(recipient_address, max_amount_per_tx, max_amount_per_day)`. A `proposePayment` to an address on the allowlist opens the modal with `Approve` pre-focused so the user can press Enter to confirm. The modal still appears — the allowlist is just a focus hint. There is no "auto-approve" tier.

---

## 8. Pairing flow

When a new agent wants to use Agent Pay:

1. Agent opens Agent Pay (or directs the user to do so).
2. User clicks `Settings → Pair an agent`.
3. Agent Pay shows a 6-digit one-time code.
4. Agent POSTs `/pair` with `{ name, code }` (name = "Claude Desktop", "OpenCLAW", etc.) within 60 s.
5. Server returns `{ session_token, expires_at }`.
6. Agent stores `session_token` and uses it on all subsequent requests.

A paired agent identity is shown in the modal so the user always knows who's proposing the payment ("AGENT: claude-desktop, paired 14h ago"). Long-lived pairings (>30 days) trigger a re-pair prompt.

---

## 9. Bahnhof + chain integration

Mostly unchanged from ANTON Pay:
- Same SDK (`@futurechain/sdk`) for tx construction, RPC, signing.
- Same install bearer enrollment (`/enroll` + `/register_address`).
- Reuses the device-attestation provider (see `[[PAY_DEVICE_ATTESTATION_SPEC]]`) — **with a caveat**: Play Integrity doesn't apply to desktop. Phase 1: Agent Pay sends `DEV_NO_ATTESTATION:<install_id>` and Bahnhof rejects in prod (so initially Agent Pay is dev-only against prod, or against a separate dev-only Bahnhof env). Phase 2: define a desktop-attestation primitive — likely a signed code-signature challenge that Bahnhof verifies against the official Agent Pay public key. **This is the only piece that's net-new vs Pay.** See §11.

---

## 10. Code layout (proposed)

In the ANTON monorepo:

```
apps/anton-agent-pay/
├── package.json           # Electron + electron-builder + the JSON-RPC stack
├── electron-builder.yml   # Win/Mac/Linux build config + code signing
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # app bootstrap, server lifecycle, modal owner
│   │   ├── modal.ts       # confirmation modal logic (uses BrowserWindow)
│   │   ├── server.ts      # JSON-RPC HTTP server (express or fastify)
│   │   ├── pairing.ts     # /pair endpoint + session-token store
│   │   ├── proposals.ts   # in-memory proposal store with TTLs
│   │   └── mcp.ts         # MCP wrapper (stdio + websocket)
│   ├── renderer/
│   │   ├── modal/         # the modal's minimal HTML page
│   │   └── settings/      # Settings window (pair, wallet, RPC URL)
│   └── shared/
│       └── ipc-types.ts   # main↔renderer IPC contracts
├── docs/
│   └── README.md          # user-facing setup
└── tests/
    ├── unit/              # vitest — modal, proposals, pairing logic
    └── e2e/               # Playwright — full pair → propose → approve flow
```

Reused as-is from the existing ANTON tree:
- `src/pay/services/wallet-passphrase.ts` (envelope v3 + FALCON keypair gen)
- `src/pay/services/enrollment.ts` (install bearer + signed-challenge)
- `src/pay/services/payment.ts::executePayment()` (the actual send)
- `src/pay/services/device-attestation.ts` (with the desktop caveat in §9)
- `@futurechain/sdk` (tx construction, RPC client)

Imported via the monorepo path `@anton-pay-services/*` (new package mapping).

---

## 11. Open design questions — Daniel sign-off needed before code

1. **Repo location.** Monorepo at `apps/anton-agent-pay/` OR new repo? My recommendation: **monorepo** for MVP speed + shared code; split later if Agent Pay open-sources separately.
2. **Desktop framework.** Electron (faster MVP, larger bundle, shares TS wholesale) OR Tauri (smaller, Rust backend, less mature ecosystem). My recommendation: **Electron for MVP**; revisit Tauri once we know what the bundle-size + startup-time pain points actually are.
3. **MCP support in MVP.** Ship JSON-RPC + MCP together OR ship JSON-RPC first + MCP in Phase 2? My recommendation: **both**. MCP is what makes Claude Desktop a one-click integration; without it Agent Pay is "yet another JSON-RPC server".
4. **Desktop attestation.** Phase 1 = dev-only (DEV_NO_ATTESTATION); Phase 2 = define a signed-code-signature challenge primitive. My recommendation: **Phase 1 as defined**; capture Phase 2 as a separate task because it touches the Bahnhof verifier.
5. **Modal customisation.** Should the user be able to skin / dismiss / resize the modal? My recommendation: **NO** — the modal is the safety boundary; it stays a fixed size + style. (Settings includes a "modal preview" so users can see what it'll look like.)
6. **Linux storage fallback.** When `libsecret` isn't available, fall back to encrypted file + warn (current spec) OR refuse to start? My recommendation: **fall back + loud warning** so headless Linux servers can still try Agent Pay; recommend gnome-keyring in the install docs.
7. **Default port discovery.** `~/.anton-agent-pay/server.json` (cross-platform but in HOME) OR system-standard locations (`/var/run/` etc.)? My recommendation: **`~/.anton-agent-pay/server.json`** — works without root, easy for agents to find.

---

## 12. Acceptance criteria (MVP)

- [ ] Single-binary install on Win/Mac/Linux. macOS notarised, Windows code-signed.
- [ ] Wallet create + import + show-recovery-phrase work; FALCON keypair stashed.
- [ ] JSON-RPC server starts on a free port; the server.json discovery file is written.
- [ ] `getStatus`, `getBalance`, `listTransactions`, `proposePayment`, `getProposal`, `cancelProposal` all work via curl + Origin/auth-token checks.
- [ ] MCP wrapper appears as a tool group in Claude Desktop with the same methods.
- [ ] Pairing flow works: 6-digit code → session_token → bearer reuse.
- [ ] OS-native modal opens on `proposePayment`, shows recipient + amount + fee + agent identity + counterparty history.
- [ ] Approve → tx submitted → mined → `getProposal` returns `state: sent, tx_id`.
- [ ] Reject (or X / Esc) → tx not submitted → `getProposal` returns `state: rejected`.
- [ ] Modal expiry (60 s default) → `state: expired`.
- [ ] No JSON-RPC method bypasses the modal. No CLI flag in production builds bypasses the modal.
- [ ] Bahnhof attestation: Agent Pay successfully attests with `DEV_NO_ATTESTATION:<install_id>` against a dev Bahnhof.
- [ ] Telemetry / logs: all proposals + their outcome are written to a local audit log (rotating, JSON lines).

## 13. Tests

- **Unit** (`tests/unit/`, vitest): proposal store TTLs, pairing-code generation + validation, JSON-RPC routing, modal payload construction (without an actual window — uses ipc-types contracts), MCP tool-definition shape.
- **Integration** (`tests/integration/`, vitest + a stubbed Electron main): pair flow → propose → fake-approve → SDK called with the right payload.
- **E2E** (`tests/e2e/`, Playwright + Electron): start the app, programmatically pair, propose a payment, screenshot the modal, programmatically click Approve, assert the tx was submitted.

## 14. Phases (post-MVP polish)

- **Phase 2a**: Desktop-attestation primitive (signed-code-signature challenge + Bahnhof verifier).
- **Phase 2b**: Hardware-wallet integration (Ledger / Trezor signing path).
- **Phase 2c**: Pre-filled allowlist (still shows modal, just pre-focuses Approve).
- **Phase 2d**: Browser-extension bridge (so web-based agents — e.g. ChatGPT browser plugin — can reach Agent Pay via window.postMessage to a content script).
- **Phase 2e**: Cross-machine relay (one Agent Pay install acts as the "wallet" for agents running on other machines on the same trust boundary).
- **Phase 3**: ANTON Pay ↔ Agent Pay wallet sync via the encrypted-envelope QR pairing flow.

## 15. References

- `[[PAY_WALLET_PASSPHRASE_SPEC]]` — envelope v3 schema (reused)
- `[[PAY_DEVICE_ATTESTATION_SPEC]]` — Phase 1 attestation (reused, with desktop caveat)
- `[[project_anton_integration]]` — strategic context for A2A
- `[[project_roadmap_may24_2026]]` — Agent Pay is item #286 in the top-3 next
- Model Context Protocol — https://spec.modelcontextprotocol.io
- Electron security checklist — https://www.electronjs.org/docs/latest/tutorial/security
