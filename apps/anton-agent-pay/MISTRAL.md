# MISTRAL.md — Onboarding for Mistral (La Plateforme / Le Chat / codestral · devstral)

**What this is.** ANTON Agent Pay is a **local, loopback-only** (`127.0.0.1`) JSON-RPC 2.0 + MCP gateway that lets you — an AI agent driven by a Mistral model via function/tool calling — move **real FutureChain (FTC)** money, but only under a **non-bypassable human approval**. You connect with Mistral's tool-calling loop, call a small set of verbs, and `proposePayment` opens a prompt that a **human** must approve (by typing `y` in a terminal, or clicking a one-time browser confirm URL) before any FTC ever leaves the wallet. You can ask; only the human approves. Use `mistral-large-latest` (or any tool-capable La Plateforme / Le Chat model) for these money tools — `codestral`/`devstral` are code models, not for tool orchestration.

---

## GOLDEN RULES (read before you touch money)

1. **You can only PROPOSE — a human approves every payment.** There is no verb that sends FTC. `proposePayment` opens a prompt the operator approves in their **terminal** (type `y` + Enter) or via a **one-time browser confirm URL** (click Approve / Reject). There is no auto-send, no allow-list, no "remember this agent". If you are not willing to wait for a human, do not call `proposePayment`.

2. **The wallet pays as `ANTON <addr6>` with a human Ultimate Debtor (UBO).** Every payment goes out pseudonymously as `ANTON <addr6>` (the first 6 Base58 chars of the wallet address — you cannot change this). The real human owner is disclosed as the PACS.008 `UltmtDbtr`, resolved **server-side from env only** (`AGENT_PAY_UBO_NAME`, `AGENT_PAY_UBO_COUNTRY`). You have **no parameter** to set it. **If `AGENT_PAY_UBO_NAME` is not configured, ASK THE OPERATOR for their full legal name (and country)** and have them set `AGENT_PAY_UBO_NAME` (e.g. `"Daniel Bardun"`) and `AGENT_PAY_UBO_COUNTRY` (ISO 3166 alpha-2, e.g. `"SE"`) before paying. In this deployment **the operator is the user themself.** Caveat: with no country the SDK stamps the party **`SE`** — a non-Swedish owner must set `AGENT_PAY_UBO_COUNTRY`.

3. **`proposePayment` is fire-and-forget — POLL `getProposal` until it leaves `pending`.** The call returns a `proposalId` immediately while the human prompt opens. You must loop `getProposal({proposalId})` until `state` is no longer `pending`: `sent` (success, `txId` present) / `rejected` (`rejectReason`) / `expired` / `cancelled`. Do not assume success from the propose call.

4. **The money is real and irreversible.** FTC moves on-chain; there is no undo. **Confirm the amount and the recipient `fc_` address** with the operator before proposing. `amountFtc` is decimal FTC (not satoshi). A bad address or wrong amount cannot be clawed back.

---

## CONNECT — attaching a Mistral model

### Option A — MCP over stdio (Le Chat / any MCP host)

Run the gateway with `--mcp-stdio`; it exposes the **same six tools** as MCP tools. MCP has **no pairing and needs no bearer** (the built-in identity is `mcp-stdio`). Because the MCP transport owns stdin, approval defaults to the **browser** driver — the confirm URL prints to the gateway's **stderr**. Set `AGENT_PAY_WEB_CONFIRM_AUTOOPEN=true` to auto-open it.

```jsonc
{
  "mcpServers": {
    "anton-futurechain": {
      "command": "pnpm",
      "args": ["--filter", "@anton/agent-pay", "start:standalone", "--mcp-stdio"],
      "env": {
        "AGENT_PAY_WALLET_DIR": "/home/you/.anton-fc-standalone",
        "AGENT_PAY_MAX_PER_PAYMENT_FTC": "5",
        "AGENT_PAY_MAX_DAILY_FTC": "25",
        "AGENT_PAY_UBO_NAME": "Daniel Bardun",
        "AGENT_PAY_UBO_COUNTRY": "SE"
      }
    }
  }
}
```

### Option B — La Plateforme API tool calling over JSON-RPC HTTP

Pair once for a bearer (the 6-digit code prints to the gateway's **stderr** on boot, valid **60 s**), then drive Mistral's tool loop. Mistral's tool schema is OpenAI-shaped; `function.arguments` arrives as a **JSON string**, so `json.loads()` it before forwarding. The `tool` reply message **requires `name`** alongside `tool_call_id`, and `tool_call_id` must be the exact id Mistral emitted.

```python
import json, time, requests
from mistralai import Mistral

BASE = "http://127.0.0.1:49250"
TOKEN = requests.post(f"{BASE}/pair",
    json={"code": "483920", "name": "mistral-agent"}).json()["sessionToken"]
H = {"authorization": f"Bearer {TOKEN}", "content-type": "application/json"}

def rpc(method, params=None):
    r = requests.post(f"{BASE}/rpc", headers=H,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. spend-cap breach (-32004)
        return {"error": r["error"]["message"]}
    return r["result"]

client = Mistral(api_key=KEY)
tools = [{"type": "function", "function": {"name": "proposePayment",
  "parameters": {"type": "object", "required": ["to", "amountFtc"],
    "properties": {"to": {"type": "string"}, "amountFtc": {"type": "number"},
      "agentNote": {"type": "string"}, "reference": {"type": "string"}}}}},
  {"type": "function", "function": {"name": "getProposal",
    "parameters": {"type": "object", "required": ["proposalId"],
      "properties": {"proposalId": {"type": "string"}}}}}]

resp = client.chat.complete(model="mistral-large-latest", messages=msgs,
                            tools=tools, tool_choice="auto")
for tc in resp.choices[0].message.tool_calls or []:
    out = rpc(tc.function.name, json.loads(tc.function.arguments))   # arguments = JSON string
    msgs.append({"role": "tool", "name": tc.function.name,
                 "tool_call_id": tc.id, "content": json.dumps(out)})
```

> The one idiom: some compat servers ignore `tools` silently — confirm a real `tool_call` comes back before trusting a model with money. On a `pending` proposal, let the model call `getProposal` again rather than blocking the whole turn.

---

## VERB CHEAT-SHEET (the six tools)

| Verb | Params | Returns (shape) |
|---|---|---|
| `getStatus` | `{}` | `{ paired, walletAddress, balanceFtc, lastSeenBlock }` |
| `getBalance` | `{}` | `{ balanceFtc }` |
| `listTransactions` | `{ limit? }` (int 1–200, default 25) | `[{ txId, amount, direction:"in"\|"out", counterparty, ts, confirmed }]` |
| `proposePayment` | `{ to, amountFtc, agentNote?, reference?, remittance?, ttlMs? }` | `{ proposalId, expiresAt }` — **fire-and-forget** |
| `getProposal` | `{ proposalId }` | `{ state, txId?, rejectReason? }` |
| `cancelProposal` | `{ proposalId }` | `{ state:"cancelled" }` |

`proposePayment` params, precisely:
- `to` — **required**, must start with `fc_`.
- `amountFtc` — **required**, number > 0, decimal FTC (not satoshi).
- `agentNote` — optional, ≤ 280 chars. **Display-only in the modal; NOT sent on-wire.** Marked "agent-supplied, not verified".
- `reference` — optional free text. Rides on-wire as PACS.008 unstructured `Ustrd` — **unless** a `remittance` is set (then `remittance` wins).
- `remittance` — optional **structured** remittance object (see next section).
- `ttlMs` — optional modal lifetime; default `60000`, clamped `[10000, 300000]`.

`getProposal` `state` ∈ `pending | approved | sent | rejected | expired | cancelled`. `txId` appears only on `sent`; `rejectReason` on `rejected`/`expired`. Unknown id → `-32005`. `cancelProposal` only works while `pending`.

**Spend caps are code, not prompt.** A per-payment or rolling-24h cap breach (counting sent **+ in-flight** value) is the **one synchronous rejection** — `proposePayment` returns a JSON-RPC `error` **before any modal opens** (code `-32004`), e.g. `"amount 9 FTC exceeds the per-payment cap of 5 FTC"`. Other validation: `"to must be an fc_ address"`, `"amountFtc must be a positive number"`. You cannot talk your way past the caps.

---

## "Send FTC" — worked example (propose → poll → txId)

```python
# 1. PROPOSE — returns immediately; a human-approval prompt opens in the gateway
res = rpc("proposePayment", {
    "to": "fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs",
    "amountFtc": 2.5,
    "agentNote": "invoice #4021",   # shown to the human; not on-wire
    "reference": "PO-7781",         # on-wire Ustrd (no structured remittance here)
})
if "error" in res:                  # e.g. spend-cap breach -32004
    raise RuntimeError(res["error"])
pid = res["proposalId"]

# 2. POLL until it leaves "pending" — the operator types y / clicks Approve
while True:
    p = rpc("getProposal", {"proposalId": pid})
    if p["state"] != "pending":
        break
    time.sleep(1)

# 3. OUTCOME
if p["state"] == "sent":
    print("sent on-chain, txId:", p["txId"])
else:
    print(p["state"], p.get("rejectReason"))   # rejected / expired / cancelled
```

The fee is a fixed `~0.001 FTC`, surfaced in the modal — never an agent parameter.

---

## Contracts & structured remittance (PACS.008)

Pass a structured `remittance` object on `proposePayment` to attach machine-readable order/invoice/agreement/note data. A **structured `remittance` wins over `reference`**: when present, it is encoded into PACS.008 **structured `RmtInf`**; the free-text `reference` is only used as unstructured `Ustrd` when no `remittance` is set. The remittance maps 1:1 onto a `v=1 AntonRemittance`; the SDK validates it and enforces a size cap at encode time (a violation flips the proposal to `rejected` — never a ghost send).

**Wire-level kinds** are only four: `order | invoice | agreement | message`. The broader terminology you may hear — **quote / receipt / info / donation / freetext** — has **no separate kind at this layer**; they all flow through these four (`message` / `ref` / `items` as appropriate). The `kind` is **inferred when omitted**: `items` present → `invoice`; `decision` or `terms` present → `agreement`; else → `message`. File attachments are deliberately not exposed to agents.

`remittance` fields (all optional; unknown properties rejected):

| Field | Type / cap | Notes |
|---|---|---|
| `kind` | `"order" \| "invoice" \| "agreement" \| "message"` | Inferred if omitted (see above). |
| `ref` | string ≤ 140 | Your reference / document number. |
| `items` | array ≤ 50 | Each item: `name` (≤200, **required**), `qty` (**required**), `unitPriceSek?`, `lineTotalSek?`, `vatRate?`, `sku?` (≤64). |
| `amountSek` | number | Agent's **stated** SEK total — shown as "Stated total"; **not** the FTC the human authorises. |
| `vatSek` | number | Stated VAT. |
| `message` | string ≤ 2000 | Free-text info (the `message` kind). |
| `decision` | string ≤ 2000 | What the parties agreed (lightweight contract). |
| `terms` | string ≤ 4000 | Clauses / terms. |
| `meta` | `Record<string,string>` | ≤ 24 keys; key ≤ 64 chars, value ≤ 500 chars. |

Example — an invoice remittance (the human still approves the **FTC** amount, not the stated SEK):

```python
rpc("proposePayment", {
    "to": "fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs",
    "amountFtc": 2.5,
    "remittance": {
        "kind": "invoice",
        "ref": "INV-4021",
        "items": [{"name": "Consulting, 1h", "qty": 1, "lineTotalSek": 1200, "vatRate": 25}],
        "amountSek": 1200, "vatSek": 240,
        "meta": {"po": "PO-7781"}
    }
})
```

---

## Talking in collaboration (agent-to-agent commerce)

There is a **separate standalone** — **ANTON Collaboration** (its own process, its own port **49260** `ANTON_COLLAB_PORT`, its own `POST /pair` + bearer, loopback-only) — for the full agent-to-agent commerce loop. It **never spends FTC itself**; every real spend bridges back into this gateway's `proposePayment` (and its human gate). Its commerce loop:

- **discover** — `searchSellers` (free text + required commerce verb + category) → `resolveSeller` (fetch the signed descriptor; `originEndpoint` is where to talk).
- **talk** — `inquireSeller` (ungated; POSTs a capability invoke directly to the seller's origin — "Jordans size 43, price?").
- **negotiate** — `negotiate` (ungated autonomous buyer LLM loop within a hard µFTC ceiling; **signs nothing, pays nothing**) → `getNegotiation` (on `propose_ready`, feed `prepared` into `proposeAgreement`). Requires `ANTHROPIC_API_KEY`.
- **agree (signed)** — `proposeAgreement` / `acceptAgreement` / `counterAgreement` produce **Ed25519-signed** two-party agreements and are **human-gated** (return a `proposalId`; poll `getAgreementProposal`). Reads/inbound (`ingestAgreement`, `getAgreement`, `declineAgreement`, `withdrawAgreement`) are ungated. Under `--mcp-stdio` the three committing verbs are **omitted** (no approval driver → they'd fail closed).
- **settle** — `getSettlementInstruction` (read-only) returns an `instruction { to, amountFtc, remittance(kind:'agreement', meta:{agreementId, proposalHash}), ... }`. **Hand `instruction` to this gateway's `proposePayment`** — which opens *its* human gate. Then `markAgreementSettled` (payer) / `reconcileSettlement` (payee) records the txHash.
- **fulfil** — `markShipped` → `confirmDelivery` (Ed25519-signed, ungated, moves no FTC).
- **escrow** (optional, custodial notary) — `openEscrow` → `getEscrowFundInstruction` (→ `proposePayment`) → `markEscrowFunded` → `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (arbiter-only, → `proposePayment`) → `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute` / `ingestDispute`.

Amounts in Collaboration are **µFTC** base-10 integer strings (1 FTC = 1,000,000 µFTC); the settlement instruction also carries `amountFtc` for the bridge. Every FTC leg still terminates in this gateway's `proposePayment` and its non-bypassable human approval.

---

## Full reference: ./AGENTS.md

This file is the Mistral-specific quickstart. For the complete, authoritative contract — every verb, every param/cap, the pairing and JSON-RPC envelope, error codes, the proposal state machine, UBO resolution, and the full security model — see **[./AGENTS.md](./AGENTS.md)**.
