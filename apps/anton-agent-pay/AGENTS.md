# ANTON-FutureChain Standalone — Canonical Agent Reference

This is a **local, loopback-only JSON-RPC + MCP gateway** that lets an AI agent move **real FTC** (FutureChain's native currency) under a **non-bypassable human approval**. It runs headless on `127.0.0.1` only, exposes six tools (`getStatus`, `getBalance`, `listTransactions`, `proposePayment`, `getProposal`, `cancelProposal`), and never sends money on its own — the agent can only *propose* a payment; a human approves every single one, either by typing `y` at a terminal or clicking a one-time browser confirm URL. This file is the source-of-truth that every per-model connection guide points to; it is the most thorough document in the app.

---

## GOLDEN RULES (read these before anything else)

1. **You can only PROPOSE. A HUMAN approves every payment.** There is no JSON-RPC or MCP verb anywhere that sends FTC. `proposePayment` opens an approval modal on the operator's machine; they must type `y` + Enter at the terminal, or click **Approve** at a browser confirm URL. There is **no auto-send** and no agent-side override. If you want money to move, you ask — and then you wait for the human.

2. **The wallet pays as `ANTON <addr6>`, with a human Ultimate Debtor (UBO).** Every payment goes out under the pseudonymous debtor name `ANTON <addr6>` (the first 6 Base58 chars after the `fc_` prefix of the wallet address). The real human owner is disclosed as the PACS.008 **Ultimate Debtor** (`UltmtDbtr`), resolved **server-side from environment only** — you cannot set or spoof it. **If `AGENT_PAY_UBO_NAME` is not configured, ASK THE OPERATOR for their full legal name (and country) and have them set `AGENT_PAY_UBO_NAME` (and `AGENT_PAY_UBO_COUNTRY`).** In this deployment the operator is the user themself. Without a country, the SDK stamps the owner as **`SE`-resident** by default — a non-Swedish owner must set `AGENT_PAY_UBO_COUNTRY`.

3. **`proposePayment` is fire-and-forget — POLL `getProposal` until it leaves `pending`.** Proposing returns a `proposalId` *immediately* while the approval modal opens elsewhere. The payment is **not** sent yet. Poll `getProposal({ proposalId })` until `state` is no longer `pending`: `sent` (success, `txId` populated), `rejected` (`rejectReason` populated), `expired` (no decision in time), or `cancelled` (you cancelled it).

4. **Money is real and irreversible. Confirm amount + recipient before proposing.** FTC payments are on-chain and cannot be clawed back. Double-check `to` (must start with `fc_`) and `amountFtc` (decimal FTC, **not** satoshi) before every proposal. Treat a typo as a permanent loss.

---

## CONNECT (canonical reference — model-agnostic)

The gateway exposes the **same six tools** over two transports. Pick one.

### Transport A — JSON-RPC 2.0 over HTTP (most agents)

- Single endpoint: `POST http://127.0.0.1:49250/rpc` (port = `AGENT_PAY_PORT`, default `49250`, bound to loopback only).
- Every `/rpc` call requires `Authorization: Bearer <sessionToken>`.
- When an `Origin` header is present it must be allowlisted (`null`, `localhost`, or `127.0.0.1`).

**Bootstrap (once per agent): exchange the 60-second pair code for a bearer.** On boot the gateway prints a 6-digit pair code to **stderr**, valid for 60 seconds. Trade it for a session token via `POST /pair` (this is *not* a JSON-RPC call):

```bash
TOKEN=$(curl -s http://127.0.0.1:49250/pair \
  -H 'content-type: application/json' \
  -d '{"name":"my-agent","code":"483920","ttlMs":14400000}' \
  | jq -r .sessionToken)
```

The bearer (`sk_...`) is returned **once** and never again (the server stores only its SHA-256 hash). Send it on every `/rpc` call. See the [Pairing flow](#pairing-flow-httpjson-rpc-only) section for the full request/response shapes and `ttlMs` clamps.

### Transport B — MCP over stdio

Run the gateway with `--mcp-stdio`. The same six tools appear as MCP tools with the same names. **MCP has no pairing** — every MCP client is the built-in identity `mcp-stdio`, so no pair code and no bearer are needed (MCP sends no `Origin` header, which the gateway accepts). Because the MCP transport owns stdin, **approval defaults to the browser driver** — the confirm URL prints to the server's **stderr** (visible in your MCP client's server logs). Set `AGENT_PAY_WEB_CONFIRM_AUTOOPEN=true` to best-effort auto-open it.

Example MCP server entry (Claude Desktop-style config; works for any MCP host):

```jsonc
{
  "mcpServers": {
    "anton-futurechain": {
      "command": "pnpm",
      "args": ["--filter", "@anton/agent-pay", "start:standalone", "--mcp-stdio"],
      "env": {
        "AGENT_PAY_WALLET_DIR": "/Users/you/.anton-fc-standalone",
        "AGENT_PAY_MAX_PER_PAYMENT_FTC": "5",
        "AGENT_PAY_MAX_DAILY_FTC": "25"
      }
    }
  }
}
```

Both transports funnel through the **same** approval path (`runModalFlow`) — there is no transport that bypasses the human gate.

---

## VERB CHEAT-SHEET

| Verb | Params | Returns |
|---|---|---|
| `getStatus` | `{}` | `{ paired, walletAddress, balanceFtc, lastSeenBlock }` |
| `getBalance` | `{}` | `{ balanceFtc }` |
| `listTransactions` | `{ limit? }` (int 1–200, default 25) | `[{ txId, amount, direction, counterparty, ts, confirmed }]` |
| `proposePayment` | `{ to, amountFtc, agentNote?, reference?, remittance?, ttlMs? }` | `{ proposalId, expiresAt }` (fire-and-forget) |
| `getProposal` | `{ proposalId }` | `{ state, txId?, rejectReason? }` |
| `cancelProposal` | `{ proposalId }` | `{ state: "cancelled" }` |

`proposePayment` only: `to` (REQUIRED, starts `fc_`), `amountFtc` (REQUIRED, number > 0, decimal FTC), `agentNote` (optional ≤ 280 chars, **display-only — never on-wire**), `reference` (optional free-text → PACS.008 `Ustrd` unless a `remittance` is set), `remittance` (optional structured object — see below), `ttlMs` (optional modal lifetime, default 60000, clamped `[10000, 300000]`).

---

## "Send FTC" worked example (propose → poll → txId)

```bash
# 1. Propose — returns immediately; a human-approval modal opens on the operator's machine.
PID=$(curl -s http://127.0.0.1:49250/rpc \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"proposePayment",
       "params":{"to":"fc_9aB3xY...","amountFtc":2.5,"agentNote":"invoice #4021","reference":"PO-7781"}}' \
  | jq -r .result.proposalId)

# 2. Poll getProposal until state leaves "pending".
curl -s http://127.0.0.1:49250/rpc \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"getProposal\",\"params\":{\"proposalId\":\"$PID\"}}"
# -> {"jsonrpc":"2.0","id":2,"result":{"state":"pending"}}            (keep polling)
# -> {"jsonrpc":"2.0","id":2,"result":{"state":"sent","txId":"0x..."}} (human approved — done)
# -> {"jsonrpc":"2.0","id":2,"result":{"state":"rejected","rejectReason":"..."}} (human declined)
```

Python (using the shared `rpc()` helper at the bottom of this file):

```python
p = rpc("proposePayment", {"to": "fc_9aB3xY...", "amountFtc": 2.5, "agentNote": "invoice #4021"})
if "error" in p:                       # synchronous spend-cap / validation rejection (-32004)
    raise RuntimeError(p["error"])
pid = p["proposalId"]
import time
while True:
    st = rpc("getProposal", {"proposalId": pid})
    if st["state"] != "pending":
        break
    time.sleep(1.5)
if st["state"] == "sent":
    print("paid:", st["txId"])
else:
    print("not paid:", st["state"], st.get("rejectReason"))
```

**The one synchronous rejection.** A spend-cap breach (or any param/remittance validation failure) returns a JSON-RPC `error` **immediately, before any modal opens** — this is the *only* thing you cannot talk the human past:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32004,
  "message": "amount 9 FTC exceeds the per-payment cap of 5 FTC" } }
```

or `"this payment (9 FTC) would exceed the 24h cap of 25 FTC (18.0000 FTC already sent or in-flight in the last 24h)"`.

---

## Pairing flow (HTTP/JSON-RPC only)

`POST /pair` is the bootstrap that mints the bearer. It is **not** a JSON-RPC call.

**Request body:**

```json
{ "name": "my-script", "code": "483920", "ttlMs": 14400000 }
```

- `name` — REQUIRED string, 1–64 chars. Shown in the approval modal as the agent identity.
- `code` — REQUIRED, exactly 6 digits (`^\d{6}$`). Printed on gateway boot to **stderr**, valid **60 s** (`PAIRING_CODE_TTL_MS`). Single-use; a new boot code invalidates the prior one. A *wrong* code does **not** burn the pending code (typo-tolerant).
- `ttlMs` — optional bearer lifetime. Default **4 h** (`PAIRING_DEFAULT_TTL_MS`); clamped to `[60_000, 2_592_000_000]` (1 minute … **30 days**).

**Success (HTTP 200):**

```json
{ "agentId": "a_<base64url>", "sessionToken": "sk_<base64url>", "expiresAt": 1234567890123 }
```

- `sessionToken` (`sk_` + 32 random bytes) is returned **once** and never again; the server stores only its SHA-256 hash. Use it as `Authorization: Bearer sk_...` on every `/rpc` call.
- `agentId` is `a_` + 8 random bytes. `expiresAt` is epoch-ms.

**Failure:** HTTP 400 `{ "error": "<validation msg>" }` (bad body) or HTTP 401 `{ "error": "<msg>" }` — one of `"no pending pairing code"`, `"pairing code expired"`, `"pairing code does not match"`, `"name must be a non-empty string ≤ 64 chars"`.

**On `/rpc`:** an expired/invalid bearer → JSON-RPC error `-32002` `"invalid or expired session token"` (HTTP 401). A missing bearer → `-32001` `"Authorization: Bearer required"` (HTTP 401).

---

## JSON-RPC envelope & error codes

**Request:** `{ "jsonrpc": "2.0", "id": <string|number|null>, "method": "<verb>", "params": { ... } }`
**Success:** `{ "jsonrpc": "2.0", "id": ..., "result": <shape> }`
**Error:** `{ "jsonrpc": "2.0", "id": ..., "error": { "code": <int>, "message": "<str>" } }`

| Code | Meaning |
|---|---|
| `-32700` | parse error |
| `-32600` | invalid request |
| `-32601` | method not found |
| `-32603` | internal error |
| `-32001` | auth missing (`Authorization: Bearer required`) |
| `-32002` | auth invalid/expired session token |
| `-32003` | origin forbidden |
| `-32004` | validation — **includes spend-cap breach** (the one synchronous propose rejection) |
| `-32005` | not found (unknown proposal id) |
| `-32006` | wallet not ready |

---

## Full verb reference (params + response shapes)

### `getStatus` — params `{}`

```json
{ "paired": true, "walletAddress": "fc_...", "balanceFtc": 22.5, "lastSeenBlock": 184321 }
```

`walletAddress` is `"fc_NO_WALLET_YET"` and the numbers zero if no wallet has been imported. Stays responsive even when the chain is unreachable.

### `getBalance` — params `{}`

```json
{ "balanceFtc": 22.5 }
```

### `listTransactions` — params `{ "limit": 25 }`

`limit` optional, integer 1–200, default 25. Returns an array of:

```json
{ "txId": "0x...", "amount": 2.5, "direction": "in", "counterparty": "fc_...", "ts": 1234567890, "confirmed": true }
```

`amount` is always FTC; `direction` is `"in"` or `"out"`. Best-effort: merges the durable sent-ledger with fetched received rows, and returns the persisted ledger even when the node is unreachable.

### `proposePayment` — **fire-and-forget**

```json
{
  "to": "fc_...",                  // REQUIRED. Must start with "fc_".
  "amountFtc": 2.5,                // REQUIRED. number > 0 (decimal FTC, NOT satoshi).
  "agentNote": "invoice #4021",    // optional, <= 280 chars. Display-only in the modal; NEVER sent on-wire.
  "reference": "PO-7781",          // optional free-text. Rides on-wire as PACS.008 Ustrd (unless a remittance is set).
  "remittance": { },               // optional STRUCTURED remittance (see below).
  "ttlMs": 60000                   // optional modal lifetime. Default 60000; clamped [10000, 300000].
}
```

**Success result** (proposal accepted, modal opening — payment **not** sent yet):

```json
{ "proposalId": "p_<base64url>", "expiresAt": 1234567890123 }
```

**Synchronous rejection** (spend-cap breach or validation failure — returned before any modal opens): a JSON-RPC `error` with code `-32004`. Other validation messages: `"to must be an fc_ address"`, `"amountFtc must be a positive number"`, `"validation: invalid remittance"` (MCP) / a zod path message (HTTP).

### `getProposal` — params `{ "proposalId": "p_..." }` (REQUIRED)

```json
{ "state": "pending"|"approved"|"sent"|"rejected"|"expired"|"cancelled",
  "txId": "0x...",          // present ONLY when state === "sent"
  "rejectReason": "..." }   // present on "rejected" / "expired"
```

Lazy expiry: a `pending` proposal past its `expiresAt` flips to `expired` on read. Unknown id → `-32005` `"unknown proposal"`.

### `cancelProposal` — params `{ "proposalId": "p_..." }` (REQUIRED)

Cancels a still-`pending` proposal and closes the modal. Result `{ "state": "cancelled" }`. If the proposal is not pending or is unknown → `-32005` `"proposal not pending or unknown"`.

---

## Contracts & structured remittance (PACS.008)

For anything richer than a free-text `reference`, attach a structured `remittance` object to `proposePayment`. It maps **1:1** onto a `v=1 AntonRemittance` and lands in the PACS.008 **`RmtInf`** (structured remittance information) field.

### The remittance object

All fields optional; unknown properties are rejected.

| Field | Type / cap | Notes |
|---|---|---|
| `kind` | enum `"order" \| "invoice" \| "agreement" \| "message"` | **Inferred when omitted**: `items` present → `invoice`; `decision` or `terms` present → `agreement`; otherwise → `message`. |
| `ref` | string ≤ 140 | Your reference / document number. |
| `items` | array ≤ 50 of item objects | Each item: `name` (string ≤ 200, **required**), `qty` (number, **required**), `unitPriceSek?`, `lineTotalSek?`, `vatRate?` (numbers), `sku?` (string ≤ 64). |
| `amountSek` | number | The agent's *stated* SEK figure — shown as "Stated total" in the modal; **not** the FTC the human authorises. |
| `vatSek` | number | Stated VAT. |
| `message` | string ≤ 2000 | Free-text info (the `message` kind). |
| `decision` | string ≤ 2000 | What the parties agreed (lightweight contract). |
| `terms` | string ≤ 4000 | Clauses / terms of the agreement. |
| `meta` | `Record<string,string>` | **≤ 24 keys**; each key ≤ 64 chars, each value ≤ 500 chars. These caps keep the encoded remittance well under the SDK's 100 KB on-wire cap, so it can never throw at submit after approval. |

### Remittance "kinds" terminology

The wire-level labels are **`Order` / `Invoice` / `Agreement` / `Note`** (the four enum values `order` / `invoice` / `agreement` / `message`). The conceptual remittance kinds you may hear about — **invoice / quote / agreement / receipt / info / donation / freetext** — all flow through these four enum values: `invoice` and `order` carry `items`; `agreement` carries `decision` / `terms`; **quote, receipt, info, donation, and freetext all map onto `message`** (with `ref` / `items` as appropriate). There are **no** separate `quote` / `receipt` / `info` / `donation` / `freetext` kinds at this layer, and **file attachments are deliberately not exposed to agents**.

### How it maps to PACS.008 (structured wins over reference)

- **A structured `remittance` wins over `reference`.** When a `remittance` is set, its encoded form is placed in PACS.008 `RmtInf` (structured). The free-text `reference` is used **only** when no `remittance` is set, and then it rides on-wire as unstructured **`Ustrd`**.
- The SDK validates `v=1` and enforces the 100 KB size cap at encode time; a violation **throws → the proposal flips to `rejected`** (`"submit failed: …"`), never a ghost send.
- `agentNote` is **never** placed on-wire — it is display-only in the approval modal and is marked "agent-supplied, not verified".

The modal shows a human summary: label + `#ref`, up to 12 item lines, `"Stated total: N SEK (VAT …)"`, and `Agreed:` / `Terms:` / `Message:` lines (each truncated to 200 chars).

---

## Identity / UBO — the agent cannot spoof who pays

Every payment leaves as a **pseudonymous agent debtor**: PACS.008 `Dbtr.Nm = "ANTON <addr6>"`, where `addr6` is the first 6 Base58 chars after the `fc_` prefix of the wallet address. **The agent has no field to override this** — it is derived purely from the wallet address.

The human owner is disclosed as the **Ultimate Debtor** (`UltmtDbtr` / UBO), resolved **server-side from environment only**:

- `AGENT_PAY_UBO_NAME` — owner legal name (e.g. `"Daniel Bardun"`). If unset/blank → **no UBO disclosed** (the payment still goes out under `ANTON <addr6>`, just with no `UltmtDbtr`).
- `AGENT_PAY_UBO_COUNTRY` — ISO 3166 alpha-2 (e.g. `"SE"`). **Caveat:** the SDK defaults `CtryOfRes` to **`SE`** for any party with no country. A non-Swedish owner **must** set `AGENT_PAY_UBO_COUNTRY` or be stamped SE-resident on-wire.

The UBO is environment/operator-controlled and is **never** an agent-supplied parameter — an agent cannot attribute a payment to a different human. **If you (the agent) find `AGENT_PAY_UBO_NAME` is not configured, ask the operator for their full legal name and country and have them set these two env vars before transacting.**

---

## The non-bypassable human-approval contract

1. The agent can only **propose**. There is no JSON-RPC or MCP verb that sends FTC.
2. `proposePayment` is **fire-and-forget**: it returns a `proposalId` immediately and opens the **same** modal driver the Electron app uses. There is no code path that submits without it.
3. A human approves via **terminal** (type `y` + Enter; anything else rejects) **or** **browser** (a one-time `http://127.0.0.1:<port>/confirm/<confirmSecret>` URL printed to **stderr**; click Approve/Reject and type the wallet passphrase if the wallet is protected). Approval mode is `terminal` by default, but **`web` by default under `--mcp-stdio`** (because MCP owns stdin). Force it with `AGENT_PAY_APPROVAL=terminal|web`.
4. The agent **polls `getProposal`** until `state` leaves `pending`:
   - `sent` → success, `txId` populated.
   - `rejected` → `rejectReason` populated (operator rejected, modal error, or a post-approval submit failure `"submit failed: …"`).
   - `expired` → no decision before the TTL.
   - `cancelled` → the agent called `cancelProposal`.
5. **No ghost payments.** A transaction is broadcast only if approval lands on `approved`; if the proposal was cancelled or expired between modal-open and the operator's click, submit is skipped.
6. **Caps are code, not prompt.** Enforced *before* the modal opens: `maxPerPaymentFtc` rejects any single over-cap amount; `maxDailyFtc` rejects when *sent + in-flight (pending/approved)* value over the trailing 24 h plus this amount would exceed the ceiling (in-flight value is released on reject/expire/cancel). A breach is the single synchronous `-32004` rejection — the only thing the model cannot talk its way past.
7. **The browser confirm secret** is a single-use 256-bit capability printed only to stderr; a second `pageNonce` must be echoed on the POST; the decision POST requires a loopback `Host`, an allowlisted `Origin`, and `Sec-Fetch-Site: same-origin`, accepts no bearer, and is served under a locked CSP + `X-Frame-Options: DENY`. `getProposal` never exposes the secret.

---

## Proposal state machine & IDs

States: `pending → approved → sent` (happy path), or `pending → rejected | expired | cancelled` (terminal). `markSent` only fires from `approved`. A proposal id is `p_` + 16 random bytes (base64url). Default TTL 60 s; clamp `[10_000 ms, 300_000 ms]`. Proposals are in-memory and session-scoped — a gateway restart drops them (equivalent to a timeout + re-propose).

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_PAY_PORT` | `49250` | HTTP port (bound to `127.0.0.1` only). |
| `AGENT_PAY_WALLET_DIR` | `~/.anton-fc-standalone` | Encrypted wallet file + durable tx ledger location. |
| `AGENT_PAY_MNEMONIC` | — | BIP-39 mnemonic, imported **on first run only** (never overwrites an existing wallet). |
| `AGENT_PAY_MAX_PER_PAYMENT_FTC` | ∞ | Hard per-payment cap; over-cap proposal → synchronous `-32004`. |
| `AGENT_PAY_MAX_DAILY_FTC` | ∞ | Rolling-24h cap counting sent **+ in-flight** value. |
| `AGENT_PAY_APPROVAL` | `terminal` (`web` under `--mcp-stdio`) | Force approval mode `terminal` or `web`. |
| `AGENT_PAY_WEB_CONFIRM_AUTOOPEN` | `false` | In web mode, best-effort auto-open the confirm URL. |
| `AGENT_PAY_NODE_URL` | `https://rpc.futurechain.eu` | FutureChain RPC endpoint. |
| `AGENT_PAY_API_KEY` | — (auto-enrolls if a wallet exists) | Bearer for auth-required submit endpoints; absence → unattested submits (reads + receive still work). |
| `AGENT_PAY_UBO_NAME` | — | Human owner's legal name → PACS.008 `UltmtDbtr`. Unset → no UBO disclosed. |
| `AGENT_PAY_UBO_COUNTRY` | — (SDK falls back to `SE`) | Owner ISO-3166 alpha-2 → `UltmtDbtr` `CtryOfRes`. |

The transaction fee is a fixed `~0.001 FTC` (`DEFAULT_FEE_SATOSHI = 100` at `1 FTC = 1e8 satoshi`); it is surfaced in the modal and as `feeFtc`, and is **not** an agent parameter.

---

## Talking in collaboration (the agent-to-agent commerce loop)

There is a **separate standalone** — **ANTON Collaboration** (`@anton/collaboration`, `apps/anton-collaboration/`) — that runs the full agent-to-agent **commerce loop**: discover sellers in the `.anton` registry, talk to them, autonomously negotiate, reach an **Ed25519-signed two-party agreement** (human-gated), then **settle** by handing a payment instruction to *this* Agent Pay gateway, then track fulfilment and optional custodial escrow. It is **its own process, its own port, and its own pairing** — it never spends FTC itself; every actual spend is gated here in Agent Pay's `proposePayment`.

### Transport, port, pairing (distinct from Agent Pay)

- JSON-RPC 2.0 over `POST http://127.0.0.1:49260/rpc` — bound to `127.0.0.1` only; loopback-origin allowlist. Default port **49260** (`ANTON_COLLAB_PORT`). Every method needs `Authorization: Bearer <sessionToken>`.
- Pairing: `POST /pair` with `{ name, code, ttlMs? }` → `{ agentId, sessionToken, expiresAt }`. The 6-digit code prints to stderr on startup, valid 60 s.
- MCP over stdio (`--mcp-stdio`): same verbs, with the committing AGREE verbs omitted (see below).
- Key env: `ANTON_COLLAB_RELAY_BASE` (default `https://relay.futurechain.eu`), `ANTON_COLLAB_CONTACT_HASH` (buyer hash), `ANTON_COLLAB_STORE_DIR`, `ANTON_COLLAB_ALLOW_INSECURE_ORIGIN` (allow `http` sellers), `ANTHROPIC_API_KEY` (enables `negotiate`), `ANTON_COLLAB_NEG_MODEL` (default `claude-opus-4-8`).

### The human gate (critical invariant)

Only **three** verbs commit and are human-gated: **`proposeAgreement`, `acceptAgreement`, `counterAgreement`**. They return a `proposalId` and run fire-and-forget; poll `getAgreementProposal`. Under `--mcp-stdio` there is no approval driver, so these three commit verbs **fail closed** (`-32011`) and are omitted from the MCP tool list. **`negotiate` is UNGATED talk** — it signs nothing and spends nothing; its best outcome only *prepares* params you must still push through `proposeAgreement`. **Every actual FTC spend (settlement, escrow fund/release/refund) is gated separately here in Agent Pay's `proposePayment`.** Collab error codes add `-32010` (upstream/relay), `-32011` (no approval driver — fail-closed), `-32012` (engine not configured).

### The commerce loop

**DISCOVER → TALK → NEGOTIATE → AGREE (signed) → SETTLE (bridges to `proposePayment`) → FULFIL → ESCROW.** Amounts in Collaboration are **µFTC** base-10 integer strings (`1 FTC = 1_000_000 µFTC`, string-typed to be BigInt-safe).

- **DISCOVER (ungated):** `searchSellers` (free text + required commerce verbs like `["order"]` + categories → relay registry results) and `resolveSeller` (resolve an address like `"kicks.sthlm.portal"` to its signed descriptor, verbs, and `originEndpoint`).
- **TALK (ungated):** `inquireSeller` — POSTs directly to the seller's `originEndpoint` (one of `verb` or `capabilityId` required; SSRF-guarded https-only unless `ANTON_COLLAB_ALLOW_INSECURE_ORIGIN`). This is "ask the sport store: Jordans size 43, price?".
- **NEGOTIATE (ungated, autonomous, only PREPARES):** `negotiate` runs a buyer LLM loop (requires `ANTHROPIC_API_KEY`) with a hard `maxAmountMicroFtc` ceiling; counters must strictly lower the ask (monotonic). Poll `getNegotiation` → terminal `outcome` of `propose_ready` (feed `prepared` into `proposeAgreement`), `walked_away`, or `no_agreement`. `cancelNegotiation` aborts it. **Never signs or pays.**
- **AGREE (Ed25519-signed):** committing/human-gated — `proposeAgreement` / `acceptAgreement` / `counterAgreement` (poll `getAgreementProposal`; `cancelAgreementProposal` to abort). Ungated companions: `declineAgreement`, `withdrawAgreement`, `ingestAgreement` (apply the counterparty's inbound signed message, verifying signature + byte-for-byte order), `getAgreement`, `listAgreements`.
- **SETTLE (bridges to Agent Pay — spend gated here):** `getSettlementInstruction({ agreementId })` returns an `instruction` (`to` = payee `fc_` address, `amountFtc`, `remittance` of kind `agreement` carrying `ref: agreementId`, `decision`, `terms`, and `meta: { agreementId, proposalHash }`). **Hand `instruction` straight to this gateway's `proposePayment`** — which opens Agent Pay's own human gate. After broadcast, the payer records the txHash with `markAgreementSettled({ agreementId, txHash })`; the payee matches an inbound payment via `reconcileSettlement({ proposalHash, txHash })`.
- **FULFIL (Ed25519-signed, ungated — moves no FTC):** `markShipped` (seller) → `confirmDelivery` (buyer); `ingestFulfilment` applies the counterparty's signed shipment/delivery; `getFulfilment` reads status (`awaiting | shipped | delivered`).
- **ESCROW (custodial "notary" — the spends are gated here):** an arbiter holds an escrow address; buyer funds it, then on confirmed delivery the arbiter releases to the seller or refunds the buyer. `escrowAddress`/`releaseTo`/`refundTo` are fixed at open and immutable. Verbs: `openEscrow`, `getEscrowFundInstruction` / `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (each yields an `instruction` you hand to **`proposePayment`**), `markEscrowFunded` / `markEscrowReleased` / `markEscrowRefunded`, `raiseDispute`, `ingestDispute`, `reconcileEscrow`, `getEscrow`.

**Settlement bridge in one line:** Collaboration's `getSettlementInstruction` (and the escrow `get*Instruction` verbs) produce an `instruction` object; you pass that object's fields into **this gateway's `proposePayment`**, and the human approves the actual FTC movement here. The `meta: { agreementId, proposalHash }` stamp lets the payee reconcile the on-chain payment back to the exact signed agreement.

The authoritative Collaboration design doc is `docs/AGENT_COLLABORATION_COMMERCE_PLAN.md` (there is no separate README in that app).

---

## Security properties (summary)

- **Loopback only.** Both gateways bind `127.0.0.1`; never a public interface. Origin allowlist (`null` / `localhost` / `127.0.0.1`); MCP stdio sends no Origin and is accepted.
- **Bearer auth.** The session token (`sk_...`) is shown once; only its SHA-256 hash is stored. Pair codes are 6-digit, single-use, 60-second TTL, typo-tolerant.
- **Non-bypassable human approval.** No verb sends FTC. Every payment requires a terminal `y` or a browser confirm-URL click; both transports use the same modal path. No ghost payments — submit happens only from `approved`.
- **Caps are code.** `maxPerPaymentFtc` and a rolling-24h `maxDailyFtc` (counting in-flight value) reject over-cap proposals *before* the modal — the single synchronous `-32004` the model cannot argue past.
- **Identity cannot be spoofed.** Debtor name is derived from the wallet address (`ANTON <addr6>`); the human UBO comes from server-side env only — never an agent parameter.
- **Agent text never rides on-wire.** `agentNote` is display-only. Structured remittance is SDK-validated and size-capped at encode time, so it can never throw a "ghost send" after approval.
- **Browser confirm hardening.** Single-use 256-bit confirm secret (stderr only) + a second `pageNonce`; decision POST requires loopback Host + allowlisted Origin + `Sec-Fetch-Site: same-origin`, takes no bearer, served under a locked CSP and `X-Frame-Options: DENY`. The secret is never returned by `getProposal`.
- **Money is real and irreversible.** Confirm `to` and `amountFtc` every time.

---

## Appendix — shared `rpc()` helper

The body of every tool handler in the per-model connection guides:

```python
import requests
def rpc(method, params=None):
    r = requests.post("http://127.0.0.1:49250/rpc",
        headers={"authorization": f"Bearer {TOKEN}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:
        return {"error": r["error"]["message"]}   # e.g. spend-cap breach (-32004)
    return r["result"]
```

This `AGENTS.md` is the full reference. The per-model files (`AGENTS.<model>.md`) point here for the complete contract.
