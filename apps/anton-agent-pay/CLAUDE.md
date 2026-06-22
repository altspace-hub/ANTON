# CLAUDE.md — Anton Agent Pay (for Anthropic Claude)

This is a local, **loopback-only** (`127.0.0.1`) JSON-RPC 2.0 + MCP gateway that lets an AI agent — you — move **real FutureChain (FTC)** money under a **NON-BYPASSABLE human approval**. You can never send FTC on your own: you only *propose* a payment, and a human approves (or rejects) every single one, either by typing `y` in a terminal or by clicking Approve on a browser confirm URL. There is no auto-send, anywhere, ever.

---

## GOLDEN RULES (read before you do anything)

1. **You can only PROPOSE. A HUMAN approves every payment.** There is no verb that sends FTC. `proposePayment` opens a human approval prompt (terminal `y` + Enter, or a one-time browser confirm URL); the human approves or rejects. If you are looking for an "auto-send" or "force" flag, it does not exist — that is by design.

2. **Before sending, the wallet pays as `ANTON <addr6>` with a human as Ultimate Debtor (UBO).** Every payment goes out under the pseudonymous debtor name `ANTON <addr6>` (derived from the wallet address — you cannot override it). The real human owner is disclosed as the PACS.008 Ultimate Debtor, resolved **server-side from env only** (`AGENT_PAY_UBO_NAME` / `AGENT_PAY_UBO_COUNTRY`) — never an agent parameter. **If `AGENT_PAY_UBO_NAME` is not configured, ASK THE OPERATOR for their full legal name (and country)** and have them set `AGENT_PAY_UBO_NAME` (and `AGENT_PAY_UBO_COUNTRY`, ISO-3166 alpha-2). In this deployment the operator **is the user themself**. Caveat: the SDK defaults country of residence to `SE` for any party with no country — a non-Swedish owner **must** set `AGENT_PAY_UBO_COUNTRY` or they will be stamped SE-resident on-wire.

3. **`proposePayment` is fire-and-forget — POLL `getProposal` until it leaves `pending`.** Propose returns a `proposalId` immediately while the human approval prompt opens. Do **not** assume success. Poll `getProposal({ proposalId })` until `state` is no longer `pending`: `sent` (with `txId`), `rejected` (with `rejectReason`), `expired`, or `cancelled`.

4. **The money is real and irreversible.** A confirmed FTC transfer cannot be undone. **Confirm the amount and the recipient address** with the operator before you propose. Amounts are decimal **FTC**, not satoshi. The recipient `to` must start with `fc_`.

---

## CONNECT — Anthropic Claude

The headline path is **Claude Desktop via MCP over stdio**. Claude API / Claude Code attach over HTTP tool-use.

### Claude Desktop — MCP over stdio (headline path)

Edit `claude_desktop_config.json` (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) and add an `mcpServers` entry:

```jsonc
{
  "mcpServers": {
    "anton-futurechain": {
      "command": "pnpm",
      "args": ["--filter", "@anton/agent-pay", "start:standalone", "--mcp-stdio"],
      "env": {
        "AGENT_PAY_WALLET_DIR": "/Users/you/.anton-fc-standalone",
        "AGENT_PAY_MAX_PER_PAYMENT_FTC": "5",
        "AGENT_PAY_MAX_DAILY_FTC": "25",
        "AGENT_PAY_UBO_NAME": "Your Full Legal Name",
        "AGENT_PAY_UBO_COUNTRY": "SE"
      }
    }
  }
}
```

The MCP transport exposes the **same six tools** as the HTTP path. Two things to know:

- **No pairing / no bearer on this path.** MCP stdio sends no `Origin` and the gateway accepts that; every MCP client is the built-in identity `mcp-stdio`.
- **Approval defaults to the BROWSER under `--mcp-stdio`** (the MCP transport owns stdin, so terminal `y` is unavailable). A one-time confirm URL — `http://127.0.0.1:<port>/confirm/<secret>` — prints to the server's **stderr** (visible in Claude Desktop's MCP logs). Set `AGENT_PAY_WEB_CONFIRM_AUTOOPEN=true` to best-effort auto-open it.

### Claude API / Claude Code — HTTP tool-use

Run the gateway in HTTP mode (omit `--mcp-stdio`): `pnpm --filter @anton/agent-pay start:standalone`. It binds `127.0.0.1:49250` (`AGENT_PAY_PORT`).

**Bootstrap once per agent** — exchange the 60-second pair code (printed to the gateway's **stderr** on boot) for a bearer:

```bash
TOKEN=$(curl -s http://127.0.0.1:49250/pair -H 'content-type: application/json' \
  -d '{"code":"483920","name":"my-agent"}' | jq -r .sessionToken)
```

The `sessionToken` (`sk_...`) is returned **once** — store it. Send it as `Authorization: Bearer <token>` on every `/rpc` call.

Map each gateway verb 1:1 to a Claude tool; each `tool_use` handler just POSTs `/rpc`:

```python
import requests
H = {"authorization": f"Bearer {TOKEN}", "content-type": "application/json"}
def rpc(method, params=None):
    r = requests.post("http://127.0.0.1:49250/rpc", headers=H,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:
        return {"error": r["error"]["message"]}   # e.g. spend-cap breach (code -32004)
    return r["result"]
# In your tool-use loop: on a tool_use block -> rpc(block.name, block.input)
# -> feed the result back as a tool_result block. On a 'pending' proposal,
#    let Claude call getProposal again rather than blocking.
```

The one idiom: tool names map 1:1 to RPC methods, so the handler is a single `rpc(block.name, block.input)`.

---

## VERB CHEAT-SHEET (the six tools)

| Verb | Params | Returns |
|---|---|---|
| `getStatus` | `{}` | `{ paired, walletAddress, balanceFtc, lastSeenBlock }` |
| `getBalance` | `{}` | `{ balanceFtc }` |
| `listTransactions` | `{ limit? }` (int 1–200, default 25) | array of `{ txId, amount, direction, counterparty, ts, confirmed }` (`amount` in FTC) |
| `proposePayment` | `{ to, amountFtc, agentNote?, reference?, remittance?, ttlMs? }` | `{ proposalId, expiresAt }` — **fire-and-forget; then poll** |
| `getProposal` | `{ proposalId }` | `{ state, txId?, rejectReason? }` |
| `cancelProposal` | `{ proposalId }` | `{ state: "cancelled" }` |

`proposePayment` params:
- `to` — **required**, recipient address, must start with `fc_`.
- `amountFtc` — **required**, number `> 0`, decimal **FTC** (not satoshi).
- `agentNote` — optional, ≤ 280 chars. **Display-only** in the approval modal; **NOT sent on-wire**, marked "agent-supplied, not verified".
- `reference` — optional free-text. Rides on-wire as PACS.008 unstructured `Ustrd` — **unless** a structured `remittance` is set (then `remittance` wins).
- `remittance` — optional structured remittance (see Contracts section).
- `ttlMs` — optional modal lifetime, default `60000`, clamped `[10000, 300000]`.

`getProposal` states: `pending | approved | sent | rejected | expired | cancelled`. `txId` is present only when `state === "sent"`; `rejectReason` on `rejected`/`expired`. A `pending` proposal past its TTL flips to `expired` on read.

Error codes you may see (JSON-RPC `error.code`): `-32001` auth missing, `-32002` auth invalid/expired, `-32003` origin forbidden, `-32004` validation **including spend-cap breach**, `-32005` not found, `-32006` wallet not ready.

---

## Send FTC — worked example

```
1. proposePayment({ to: "fc_9aF2k…", amountFtc: 2.5, agentNote: "invoice #4021", reference: "PO-7781" })
   -> { proposalId: "p_abc…", expiresAt: 1234567890123 }
   (The payment is NOT sent. A human approval prompt just opened.)

2. POLL getProposal({ proposalId: "p_abc…" }) until state leaves "pending":
   -> { state: "pending" }     // keep polling
   -> { state: "approved" }    // human said yes; tx submitting
   -> { state: "sent", txId: "0x…" }   // DONE — broadcast on-chain

   Other terminal outcomes:
   -> { state: "rejected", rejectReason: "…" }   // operator rejected, or submit failed
   -> { state: "expired", rejectReason: "…" }    // no decision before TTL
   -> { state: "cancelled" }                      // you called cancelProposal
```

**The one synchronous rejection:** a spend-cap breach (or any param/remittance validation failure) comes back as a JSON-RPC `error` **immediately**, before any modal opens — e.g. `{ "error": { "code": -32004, "message": "amount 9 FTC exceeds the per-payment cap of 5 FTC" } }`, or the 24h-cap message. Caps are enforced in code (`AGENT_PAY_MAX_PER_PAYMENT_FTC`, `AGENT_PAY_MAX_DAILY_FTC` — the daily cap counts sent **+ in-flight** value over a trailing 24h). This is the one thing you cannot talk your way past.

To abort while still `pending`: `cancelProposal({ proposalId })` closes the modal and returns `{ state: "cancelled" }`.

---

## Contracts & structured remittance (PACS.008)

For invoices, orders, agreements, and notes, pass a structured `remittance` object instead of (or alongside) `reference`. It maps **1:1** onto a `v=1 AntonRemittance` and lands in PACS.008 **`RmtInf`** (structured). A structured `remittance` **always wins over** the free-text `reference` — `reference` is only used (as unstructured `Ustrd`) when no `remittance` is set.

`remittance` fields (all optional; unknown fields rejected):

| Field | Type / cap | Notes |
|---|---|---|
| `kind` | `"order" \| "invoice" \| "agreement" \| "message"` | **Inferred if omitted:** `items` present → `invoice`; `decision` or `terms` present → `agreement`; else → `message`. |
| `ref` | string ≤ 140 | Your reference / document number. |
| `items` | array ≤ 50 | Each item: `name` (string ≤ 200, **required**), `qty` (number, **required**), plus `unitPriceSek?`, `lineTotalSek?`, `vatRate?` (numbers), `sku?` (≤ 64). |
| `amountSek` | number | The agent's *stated* SEK figure — "Stated total" in the modal; **NOT** the FTC the human authorises. |
| `vatSek` | number | Stated VAT. |
| `message` | string ≤ 2000 | Free-text / info. |
| `decision` | string ≤ 2000 | What the parties agreed (lightweight contract). |
| `terms` | string ≤ 4000 | Clauses / terms. |
| `meta` | `Record<string,string>` | ≤ 24 keys; key ≤ 64 chars, value ≤ 500 chars. |

**Remittance kinds — the mapping.** The remittance taxonomy you may hear about (invoice / quote / receipt / info / donation / agreement / freetext) maps onto **four** wire-level enum values, labelled `Order / Invoice / Agreement / Note`:

- `invoice` → `invoice` (use `items`).
- `quote`, `receipt`, `info`, `donation`, `freetext` → all flow through `message` (the `Note` kind), with `ref` / `items` as appropriate. There are **no** separate `quote`/`receipt`/`info`/`donation`/`freetext` kinds at this layer.
- `agreement` → `agreement` (use `decision` / `terms`).
- `order` → `order`.

File attachments are deliberately **not** exposed to agents. The modal shows a human summary: label + `#ref`, up to 12 item lines, "Stated total: N SEK (VAT …)", and `Agreed: / Terms: / Message:` lines. The SDK validates `v=1` and enforces an on-wire size cap at encode time; a violation flips the proposal to `rejected` (`"submit failed: …"`) rather than ghost-sending.

---

## Talking in collaboration (agent-to-agent commerce loop)

Payment is one half. The **separate** `anton-collaboration` standalone (its **own** process, **own** port `49260` / `ANTON_COLLAB_PORT`, **own** pairing) runs the full agent-to-agent **commerce loop**. It never spends FTC itself — every actual spend is still gated inside **this** Agent Pay gateway via `proposePayment`. Connect to it the same way (JSON-RPC `POST /rpc` with its own bearer, or `--mcp-stdio`).

The loop, with its verbs:

1. **DISCOVER** (ungated) — `searchSellers` (free text + required commerce verbs + categories) → `resolveSeller` (signed descriptor = trust root; carries the seller's `originEndpoint`).
2. **TALK** (ungated, commits to nothing) — `inquireSeller` POSTs directly to the seller's origin ("Jordans size 43, price?").
3. **NEGOTIATE** (ungated; only *prepares* — signs/pays nothing) — `negotiate` runs an autonomous buyer LLM loop within a hard µFTC ceiling → poll `getNegotiation`; on a `propose_ready` outcome, feed the prepared params into `proposeAgreement`. Requires `ANTHROPIC_API_KEY` (default model `claude-opus-4-8`).
4. **AGREE (signed, HUMAN-GATED)** — `proposeAgreement` / `acceptAgreement` / `counterAgreement` each return a `proposalId` (fire-and-forget; poll `getAgreementProposal`) and, on human approval, produce an **Ed25519-signed** two-party agreement. `ingestAgreement` applies the counterparty's inbound signed messages. **These three committing verbs are the human gate** — under `--mcp-stdio` (no approval driver) they fail closed with `-32011`, so MCP omits them; use the JSON-RPC path for committing.
5. **SETTLE (bridges to this gateway)** — `getSettlementInstruction({ agreementId })` returns an `instruction` (`to`, `amountFtc`, a `kind:'agreement'` remittance stamped with `meta:{ agreementId, proposalHash }`). **Hand `instruction` to this gateway's `proposePayment`** (which opens this gateway's own human gate). Then `markAgreementSettled` (payer records the txHash) / `reconcileSettlement` (payee matches an inbound payment's `proposalHash` to its agreement).
6. **FULFIL** (signed, ungated, moves no FTC) — `markShipped` → `confirmDelivery` (+ `ingestFulfilment`, `getFulfilment`).
7. **ESCROW** (optional custodial "notary"; the actual fund/release/refund SPENDS are gated here in Agent Pay) — `openEscrow` → `getEscrowFundInstruction` → `markEscrowFunded` → `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` → `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute` routing to a human arbiter. Escrow amounts are µFTC base-10 integer strings.

Authoritative collaboration design doc: [`../../docs/AGENT_COLLABORATION_COMMERCE_PLAN.md`](../../docs/AGENT_COLLABORATION_COMMERCE_PLAN.md).

---

## Full reference: ./AGENTS.md
