# OPENAI.md — ANTON-FutureChain payment gateway for OpenAI-family models

This is the onboarding guide for driving the **ANTON-FutureChain Standalone** payment gateway from an OpenAI-family model — **OpenAI GPT-4o**, **Azure OpenAI**, and any **OpenAI-compatible** runtime (DeepSeek, OpenRouter, Together, Groq, vLLM, LM Studio) — using **function / tool calling**, where each tool handler simply `POST`s to the gateway's `/rpc` endpoint. The gateway is a **local, loopback-only (`127.0.0.1`) JSON-RPC + MCP gateway** that lets an AI agent move **real FutureChain (FTC)** money under a **non-bypassable human approval**: you, the model, can *propose* a payment, but a human being must approve every single one (by typing `y` in a terminal, or clicking a one-time browser confirm URL) before any FTC leaves the wallet. There is no auto-send, ever.

---

## GOLDEN RULES (read before you do anything)

1. **You can only PROPOSE. A HUMAN approves every payment.** There is no verb that sends FTC. Calling `proposePayment` opens an approval prompt for the operator — they type `y` in the gateway terminal, or click **Approve** on a one-time browser confirm URL (the URL prints to the gateway's **stderr**). Anything else rejects. **There is no auto-send and no "remember this agent".**
2. **The wallet pays as `ANTON <addr6>` with a human Ultimate Debtor (UBO).** Every payment goes on-wire under a pseudonymous debtor name derived from the wallet address; the human owner is disclosed as the PACS.008 Ultimate Debtor, resolved **server-side from environment only** — you have **no parameter** to set or spoof it. If `AGENT_PAY_UBO_NAME` is not configured, **ask the operator for their full legal name (and country)** and have them set `AGENT_PAY_UBO_NAME` (and `AGENT_PAY_UBO_COUNTRY`, ISO-3166 alpha-2 — required for any non-Swedish owner, since the SDK otherwise stamps `SE`). In this deployment the operator is the user themself.
3. **`proposePayment` is fire-and-forget — you MUST POLL.** It returns a `proposalId` immediately while the human approval prompt opens; the payment is **not** sent yet. **Poll `getProposal({proposalId})`** until `state` leaves `"pending"` → `"sent"` (with `txId`), `"rejected"` (with `rejectReason`), `"expired"`, or `"cancelled"`. Do not block waiting; re-call `getProposal`.
4. **The money is real and irreversible.** FTC is a live chain; a sent payment cannot be undone. **Confirm the amount and recipient address** with the operator before you propose. `amountFtc` is decimal FTC (not satoshi); `to` must be a real `fc_…` address.

---

## CONNECT — OpenAI GPT-4o · Azure OpenAI · OpenAI-compatible

The gateway speaks **JSON-RPC 2.0** at `POST http://127.0.0.1:49250/rpc` (default port `AGENT_PAY_PORT=49250`, loopback only). Every call carries `Authorization: Bearer <sessionToken>`.

### Step 1 — pair once to mint a bearer

The gateway prints a **6-digit pair code** to its **stderr** on boot, valid for **60 seconds**. Exchange it for a session token (this is a plain `POST /pair`, *not* JSON-RPC):

```bash
TOKEN=$(curl -s http://127.0.0.1:49250/pair \
  -H 'content-type: application/json' \
  -d '{"code":"483920","name":"my-openai-agent"}' | jq -r .sessionToken)
# → sk_...   (returned ONCE; reuse on every /rpc call as Authorization: Bearer)
```

The default bearer lifetime is 4 h (extend via `ttlMs` on the pair call, clamped 1 min … 30 days).

### Step 2 — one shared `rpc()` helper, used by every tool handler

```python
import requests
TOKEN = "sk_..."  # from /pair
def rpc(method, params=None):
    r = requests.post("http://127.0.0.1:49250/rpc",
        headers={"authorization": f"Bearer {TOKEN}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. a spend-cap breach (code -32004)
        return {"error": r["error"]["message"]}
    return r["result"]
```

### Step 3 — declare the tools and run the tool-call loop

**One pattern covers all three runtimes** — the `tools` schema and the loop are identical; only the client base URL / auth differ:

```python
from openai import OpenAI
client = OpenAI()                                                   # OpenAI GPT-4o
# Azure:  from openai import AzureOpenAI
#         client = AzureOpenAI(azure_endpoint=..., api_version="2024-10-21", api_key=...)
# compat: client = OpenAI(base_url="https://api.deepseek.com", api_key=...)
#         # or http://localhost:11434/v1 (LM Studio / vLLM), OpenRouter / Together / Groq / Fireworks

tools = [
  {"type": "function", "function": {"name": "proposePayment",
    "parameters": {"type": "object", "required": ["to", "amountFtc"],
      "properties": {"to": {"type": "string"}, "amountFtc": {"type": "number"},
                     "agentNote": {"type": "string"}, "reference": {"type": "string"}}}}},
  {"type": "function", "function": {"name": "getProposal",
    "parameters": {"type": "object", "required": ["proposalId"],
      "properties": {"proposalId": {"type": "string"}}}}},
  # also worth exposing: getStatus, getBalance, listTransactions, cancelProposal
]

resp = client.chat.completions.create(model="gpt-4o", messages=msgs, tools=tools)
for tc in resp.choices[0].message.tool_calls or []:
    args = json.loads(tc.function.arguments)         # arguments arrive as a JSON STRING
    out  = rpc(tc.function.name, args)               # tool name maps 1:1 to the RPC method
    msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(out)})
```

**Runtime-specific notes:**

- **OpenAI GPT-4o** — `function.arguments` is a **JSON string**: `json.loads()` it before forwarding to `/rpc`. The function name maps 1:1 to the RPC method, so the handler is a single `rpc(tc.function.name, args)`.
- **Azure OpenAI** — identical schema; the function name maps to your **deployment** via the client, not the model string. Set `azure_endpoint`, `api_version`, and `api_key`.
- **OpenAI-compatible (DeepSeek / OpenRouter / Together / Groq / vLLM / LM Studio)** — only the `base_url` and `api_key` change. **Pick a model that actually emits `tool_calls`** (DeepSeek, Qwen on Together/Groq/Fireworks, a tool-capable model on vLLM / LM Studio). Some compat servers **silently ignore `tools`** — verify a real `tool_call` comes back before trusting the model with money.

**MCP alternative.** The gateway also runs over **MCP-over-stdio** (`--mcp-stdio`) exposing the same six tools. If your OpenAI-family client supports MCP, it can attach that way — but the function-calling path above is the primary one for OpenAI models. Under `--mcp-stdio` there is no pairing/bearer and approval defaults to the **browser** driver (MCP owns stdin).

---

## VERB CHEAT-SHEET

All six verbs are JSON-RPC methods at `POST /rpc`. Params are the `params` object.

| Verb | Params | Returns |
|---|---|---|
| `getStatus` | `{}` | `{ paired, walletAddress, balanceFtc, lastSeenBlock }` |
| `getBalance` | `{}` | `{ balanceFtc }` |
| `listTransactions` | `{ limit? }` (int 1–200, default 25) | `[{ txId, amount, direction:"in"\|"out", counterparty, ts, confirmed }]` |
| `proposePayment` | `{ to, amountFtc, agentNote?, reference?, remittance?, ttlMs? }` | `{ proposalId, expiresAt }` — **fire-and-forget** |
| `getProposal` | `{ proposalId }` | `{ state, txId?, rejectReason? }` |
| `cancelProposal` | `{ proposalId }` | `{ state:"cancelled" }` (only while still `pending`) |

**`proposePayment` params, exactly:**

- `to` — **required**, string, must start with `"fc_"`.
- `amountFtc` — **required**, number `> 0`, decimal FTC (**not** satoshi).
- `agentNote` — optional, ≤ 280 chars. **Display-only in the approval modal; NOT sent on-wire**, and labelled "agent-supplied, not verified".
- `reference` — optional free text. Rides on-wire as PACS.008 unstructured `Ustrd` — **unless** a structured `remittance` is set, which wins (see below).
- `remittance` — optional structured remittance object (see "Contracts & structured remittance").
- `ttlMs` — optional approval-modal lifetime, default `60000`, clamped `[10000, 300000]`.

**`getProposal` states:** `pending` → `approved` → `sent` (happy path), or terminal `rejected` / `expired` / `cancelled`. `txId` is present only when `state === "sent"`; `rejectReason` on `rejected` / `expired`.

**Errors** are JSON-RPC `error` objects. App codes: `-32001` auth missing, `-32002` auth invalid/expired, `-32003` origin forbidden, `-32004` **validation (includes spend-cap breach)**, `-32005` not found, `-32006` wallet not ready. A spend-cap breach is the **one synchronous rejection** — it returns the error *before* any modal opens, e.g. `amount 9 FTC exceeds the per-payment cap of 5 FTC`. **Caps are code, not prompt — you cannot talk past them.**

---

## "Send FTC" — worked example (propose → poll → txId)

```python
import time

# 1. propose — returns immediately; the human approval prompt opens in the gateway
res = rpc("proposePayment", {
    "to": "fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs",
    "amountFtc": 2.5,
    "agentNote": "invoice #4021",     # shown in the modal only; not on-wire
    "reference": "PO-7781",           # → PACS.008 Ustrd (no remittance set)
})
if "error" in res:                    # synchronous spend-cap / validation rejection
    raise RuntimeError(res["error"])  # e.g. "...exceeds the per-payment cap of 5 FTC"
pid = res["proposalId"]

# 2. POLL — the payment is NOT sent until the human approves
while True:
    p = rpc("getProposal", {"proposalId": pid})
    if p["state"] != "pending":
        break
    time.sleep(1)

# 3. outcome
if p["state"] == "sent":
    print("on-chain:", p["txId"])
else:
    print(p["state"], p.get("rejectReason"))   # rejected / expired / cancelled
```

To abandon a still-pending proposal, call `cancelProposal({proposalId})` (closes the modal). A restart drops in-memory proposals — equivalent to a timeout; re-propose.

---

## Contracts & structured remittance (PACS.008)

For richer than a one-line `reference`, attach a structured `remittance` object to `proposePayment`. It maps 1:1 onto a `v=1 AntonRemittance` and lands in PACS.008 **`RmtInf`** (structured). **A structured `remittance` always wins over `reference`** — `reference` (→ unstructured `Ustrd`) is used only when no `remittance` is set.

**Remittance kinds.** At the agent layer the wire enum has **four** values — `order`, `invoice`, `agreement`, `message`. The broader vocabulary you may hear (**invoice / quote / agreement / receipt / info / donation / freetext**) maps onto those four: invoices use `invoice` + `items`; quotes/receipts/info/donation/freetext all flow through `message` / `ref` / `items` as appropriate; agreements use `agreement` + `decision` / `terms`. **`kind` is inferred when omitted**: `items` present → `invoice`; `decision` or `terms` present → `agreement`; otherwise → `message`.

**Fields (all optional; unknown fields rejected):**

| Field | Type / cap | Notes |
|---|---|---|
| `kind` | `"order" \| "invoice" \| "agreement" \| "message"` | Inferred when omitted (see above). |
| `ref` | string ≤ 140 | Your reference / document number. |
| `items` | array ≤ 50 | Each: `name` (≤ 200, **required**), `qty` (number, **required**), `unitPriceSek?`, `lineTotalSek?`, `vatRate?`, `sku?` (≤ 64). |
| `amountSek` | number | Agent's *stated* SEK total — shown as "Stated total" in the modal; **not** the FTC the human authorises. |
| `vatSek` | number | Stated VAT. |
| `message` | string ≤ 2000 | Free-text info (the `message` kind). |
| `decision` | string ≤ 2000 | What the parties agreed (lightweight contract). |
| `terms` | string ≤ 4000 | Clauses / terms of the agreement. |
| `meta` | `Record<string,string>` | ≤ 24 keys; key ≤ 64 chars, value ≤ 500 chars. |

The approval modal renders a human summary (label + `#ref`, up to 12 item lines, "Stated total: N SEK (VAT …)", and `Agreed: / Terms: / Message:` lines). **File attachments are deliberately not exposed to agents.** Note the SEK figures are *stated* metadata — the human still authorises the **FTC** amount in `amountFtc`.

```python
rpc("proposePayment", {
    "to": "fc_...",
    "amountFtc": 1.8,
    "remittance": {
        "kind": "invoice",
        "ref": "INV-2026-0042",
        "items": [{"name": "Consulting, June", "qty": 3, "unitPriceSek": 1200}],
        "amountSek": 3600, "vatSek": 900,
    },
})
```

---

## Talking in collaboration (the commerce loop)

Agreement-driven, agent-to-agent commerce lives in a **separate standalone** — **`anton-collaboration`** — its own process, own port (default `49260`, `ANTON_COLLAB_PORT`), own pairing (`POST /pair`, 6-digit stderr code). It never spends FTC itself: every actual spend bridges back to **this** gateway's `proposePayment` (and its human gate). Connect to it exactly like this one — JSON-RPC over `POST http://127.0.0.1:49260/rpc` with a `Bearer` token — or MCP-over-stdio.

The full commerce loop, in order:

- **discover** — `searchSellers` (free text + required commerce `verbs` + categories) and `resolveSeller({address})` to fetch the signed descriptor (the trust root; carries the seller's `originEndpoint`).
- **talk** — `inquireSeller({address, verb|capabilityId, input?})` POSTs directly to the seller's origin ("Jordans size 43, price?"). **Ungated** — commits to nothing.
- **negotiate** — `negotiate({address, verb|capabilityId, objective, maxAmountMicroFtc, …})` runs an autonomous buyer-LLM loop within a hard µFTC ceiling; poll `getNegotiation({jobId})`. **Ungated and signs/pays nothing** — its best outcome only *prepares* params you must still push through `proposeAgreement`. (Amounts here are **µFTC** integer strings: 1 FTC = 1_000_000 µFTC.)
- **agree (signed)** — `proposeAgreement` / `acceptAgreement` / `counterAgreement` produce an **Ed25519-signed two-party agreement**. These three are **human-gated** (fire-and-forget → poll `getAgreementProposal`); `ingestAgreement` applies the counterparty's signed messages.
- **settle** — `getSettlementInstruction({agreementId})` returns an `instruction` (`to`, `amountFtc`, a `kind:"agreement"` remittance stamping `agreementId` + `proposalHash`) that you hand to **this gateway's `proposePayment`** (which opens *this* gateway's human gate). Then `markAgreementSettled` / `reconcileSettlement` record the txHash.
- **fulfil** — `markShipped` → `confirmDelivery` (Ed25519-signed, ungated, moves no FTC).
- **escrow** (optional, custodial "notary") — `openEscrow` → `getEscrowFundInstruction` / fund → `getEscrowReleaseInstruction` (or refund) → mark released/refunded, with `raiseDispute`. Each escrow leg's spend is a separate `proposePayment` through this gateway's gate.

The collaboration gateway's only committing, human-gated verbs are the three AGREE verbs; everything else (discover / talk / negotiate / reads / fulfilment-record / escrow-record) is ungated. **Every actual FTC movement still funnels through this payment gateway and its non-bypassable human approval.**

---

## Full reference: [`./AGENTS.md`](./AGENTS.md)

This file is the OpenAI-family quick start. For the complete, transport-exhaustive contract — pairing internals, the full JSON-RPC envelope and every error code, the proposal state machine, UBO / identity rules, the non-bypassable approval contract, and all environment variables — see **`./AGENTS.md`**.
