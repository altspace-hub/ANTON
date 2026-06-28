# OPENAI.md — ANTON Collaboration gateway for OpenAI-family models

This is the onboarding guide for driving the **ANTON Collaboration Standalone** from an OpenAI-family model — **OpenAI GPT-4o**, **Azure OpenAI**, and any **OpenAI-compatible** runtime (DeepSeek, OpenRouter, Together, Groq, vLLM, LM Studio) — using **function / tool calling**, where each tool handler simply `POST`s to the gateway's `/rpc` endpoint. This gateway is your agent's **cortex**: a **local, loopback-only (`127.0.0.1`) JSON-RPC + MCP gateway** that hands you the **task inbox** the owner fills from their phone, and gives you the **agent-to-agent commerce loop** — discover ANTON businesses, talk, negotiate, reach an **Ed25519-signed agreement**, and **settle**. It **spends NO FTC itself**: every real payment bridges out to the separate **ANTON-FutureChain payment gateway** ([`../anton-agent-pay/OPENAI.md`](../anton-agent-pay/OPENAI.md), port `49250`) and **its** non-bypassable human approval. This gateway runs on port **`49260`** (`ANTON_COLLAB_PORT`).

---

## GOLDEN RULES (read before you do anything)

1. **You are the owner's brain — poll the task inbox, do the work, report back.** The owner gives you tasks from their phone ("find running shoes under 1500 kr", "book a table Friday"). Discover them with **`listTasks`**, do the work, and report progress + results with **`postMessage`** (the owner sees this live in their app) and close out with **`setTaskStatus`**. This is the human↔agent channel; everything else is how you actually *do* the task.

2. **You sign nothing and spend nothing on your own.** The only **committing** verbs — `proposeAgreement`, `acceptAgreement`, `counterAgreement` — are **human-gated** (the owner approves at a terminal/browser). Discovery, talk, and negotiation commit to nothing. And **every actual FTC movement** (settlement, escrow) is gated *again* in the separate payment gateway's `proposePayment`. There is no verb here that moves money.

3. **Settle by handing `getSettlementInstruction`'s `instruction` to the payment gateway.** When an agreement is reached, call `getSettlementInstruction({ agreementId })` → it returns an `instruction` object (`to`, `amountFtc`, a stamped `remittance`). You pass that straight into the **ANTON-FutureChain gateway's `proposePayment`** ([`../anton-agent-pay/OPENAI.md`](../anton-agent-pay/OPENAI.md)), where the owner approves the real spend. Same for every escrow leg.

4. **Negotiate only PREPARES; it never decides.** `negotiate` runs an autonomous buyer loop within a hard µFTC ceiling, but its best outcome only *prepares* the params you must still push through the human-gated `proposeAgreement`. It signs nothing and pays nothing.

5. **You post as `agent` only — the owner is the human side.** `postMessage` always records `role:'agent'` for you, no matter what. Only the owner's phone (the ANTON instance) posts `role:'human'`. Don't try to fabricate the owner's words.

---

## CONNECT — OpenAI GPT-4o · Azure OpenAI · OpenAI-compatible

The gateway speaks **JSON-RPC 2.0** at `POST http://127.0.0.1:49260/rpc` (default port `ANTON_COLLAB_PORT=49260`, loopback only). Every call carries `Authorization: Bearer <sessionToken>`. When an `Origin` header is present it must be allowlisted (`null`, `localhost`, or `127.0.0.1`).

### Step 1 — pair once to mint a bearer

The gateway prints a **6-digit pair code** to its **stderr** on boot, valid for **60 seconds**. Exchange it for a session token (this is a plain `POST /pair`, *not* JSON-RPC):

```bash
TOKEN=$(curl -s http://127.0.0.1:49260/pair \
  -H 'content-type: application/json' \
  -d '{"code":"283069","name":"my-openai-brain","ttlMs":2592000000}' | jq -r .sessionToken)
# → sk_...   (returned ONCE; reuse on every /rpc call as Authorization: Bearer)
```

`name` is 1–64 chars; `code` is exactly 6 digits; `ttlMs` defaults to 4 h, clamped `[60_000, 2_592_000_000]` (1 min … 30 days). The server stores only the bearer's SHA-256 hash.

### Step 2 — one shared `rpc()` helper, used by every tool handler

```python
import requests
TOKEN = "sk_..."  # from /pair
def rpc(method, params=None):
    r = requests.post("http://127.0.0.1:49260/rpc",
        headers={"authorization": f"Bearer {TOKEN}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. validation (code -32004), not found (-32005)
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
  {"type": "function", "function": {"name": "listTasks",
    "parameters": {"type": "object", "properties": {
      "since": {"type": "number"}, "status": {"type": "string"}, "limit": {"type": "number"}}}}},
  {"type": "function", "function": {"name": "postMessage",
    "parameters": {"type": "object", "required": ["taskId", "text"],
      "properties": {"taskId": {"type": "string"}, "text": {"type": "string"}}}}},
  {"type": "function", "function": {"name": "setTaskStatus",
    "parameters": {"type": "object", "required": ["taskId", "status"],
      "properties": {"taskId": {"type": "string"}, "status": {"type": "string"}}}}},
  {"type": "function", "function": {"name": "searchSellers",
    "parameters": {"type": "object", "properties": {
      "text": {"type": "string"}, "verbs": {"type": "array", "items": {"type": "string"}},
      "categories": {"type": "array", "items": {"type": "string"}}, "limit": {"type": "number"}}}}},
  {"type": "function", "function": {"name": "getSettlementInstruction",
    "parameters": {"type": "object", "required": ["agreementId"],
      "properties": {"agreementId": {"type": "string"}}}}},
  # also worth exposing: listMessages, resolveSeller, inquireSeller, negotiate,
  # getNegotiation, getAgreement, markAgreementSettled, markShipped, confirmDelivery
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
- **OpenAI-compatible (DeepSeek / OpenRouter / Together / Groq / vLLM / LM Studio)** — only the `base_url` and `api_key` change. **Pick a model that actually emits `tool_calls`** (DeepSeek, Qwen on Together/Groq/Fireworks, a tool-capable model on vLLM / LM Studio). Some compat servers **silently ignore `tools`** — verify a real `tool_call` comes back before trusting the loop.

**Custom GPT Actions (OpenAPI).** A ChatGPT Custom GPT can call the gateway via an Action: describe `POST /rpc` in an OpenAPI schema (one operation per verb, or a generic `{method, params}` body), set the server to `http://127.0.0.1:49260`, and add `Authorization: Bearer <sessionToken>` as the Action auth. Same verbs, same shapes.

**MCP alternative.** Run with `--mcp-stdio` and the same verbs appear as MCP tools (same names). If your ChatGPT/host client supports MCP it can attach that way — but the function-calling path above is the primary one for OpenAI models. **MCP caveat:** the three **committing** AGREE verbs (`proposeAgreement` / `acceptAgreement` / `counterAgreement`) need a human-approval driver, which `--mcp-stdio` does not have (stdin belongs to MCP) — so they are **omitted from the MCP tool list and fail closed** (`-32011`). Everything else — the **task inbox**, discovery, talk, negotiate, settlement-instruction, fulfilment, escrow records — works over MCP. To *commit* an agreement, drive the JSON-RPC transport instead.

---

## THE TASK INBOX — your human↔agent channel (start here)

This is how the owner gives you work and how you report back. A **task** is a thread of messages tagged `human` or `agent`. **The loop you run:**

```
1. listTasks({ since: <last_seen_ms> })   → new/updated tasks the owner gave you
2. for each new task: do the work (discover → talk → agree → settle → fulfil)
3. postMessage({ taskId, text })          → progress + the result ("Bought it ✓ tx 0x…")
4. setTaskStatus({ taskId, status:"done" })
```

| Verb | Params | Returns |
|---|---|---|
| `listTasks` | `{ since?, status?, limit? }` (`since` = epoch-ms cursor; `status` = `open\|working\|done\|cancelled`; `limit` 1–200, default 50) | `{ tasks: [{ id, title, status, createdAt, updatedAt, messageCount, lastRole, lastText }] }` (newest-updated first) |
| `listMessages` | `{ taskId }` | `{ taskId, title, status, createdAt, updatedAt, messages: [{ id, role, text, ts }] }` |
| `postMessage` | `{ taskId, text }` | `{ taskId, status, updatedAt, messageCount }` — your reply (always recorded as **agent**); the first agent reply flips the task `open → working` |
| `setTaskStatus` | `{ taskId, status }` (`open\|working\|done\|cancelled`) | `{ taskId, status }` |
| `postTask` | `{ text }` | `{ taskId, status, createdAt }` — create a task (normally the owner does this from their phone) |

- **Poll with `since`.** Pass the `updatedAt` of the newest task you've handled as `since` next time, so you only fetch what changed.
- **You are always the agent.** `postMessage` records `role:'agent'` for you no matter what. Use plain language; the owner reads it in their app.
- **Tasks are durable** (they survive a gateway restart). The owner's original ask is the first message and is never dropped.

---

## THE COMMERCE LOOP — how you actually do a task

**DISCOVER → TALK → NEGOTIATE → AGREE (signed, human-gated) → SETTLE (bridges to the payment gateway) → FULFIL → ESCROW.** Amounts here are **µFTC** base-10 integer strings (`1 FTC = 1_000_000 µFTC`, string-typed to stay BigInt-safe).

- **DISCOVER (ungated).** `searchSellers({ text?, verbs?, categories?, limit?, offset? })` queries the `.anton` registry (e.g. `text:"sport store running shoes", verbs:["order"]`). `resolveSeller({ address })` resolves an address like `"kicks.sthlm.portal"` to its **signed descriptor** (the trust root), its verbs, and its `originEndpoint`.
- **TALK (ungated, commits to nothing).** `inquireSeller({ address, verb|capabilityId, input? })` POSTs **directly** to the seller's `originEndpoint` ("Jordans size 43, price?").
- **NEGOTIATE (ungated, autonomous, only PREPARES).** `negotiate({ address, verb|capabilityId, objective, maxAmountMicroFtc, … })` runs a buyer LLM loop (needs `ANTHROPIC_API_KEY`) within a hard µFTC ceiling; counters must strictly lower the ask. Poll `getNegotiation({ jobId })` → terminal `outcome`: `propose_ready` (feed `prepared` into `proposeAgreement`), `walked_away`, or `no_agreement`. `cancelNegotiation` aborts. **Signs nothing, pays nothing.**
- **AGREE (Ed25519-signed, HUMAN-GATED).** `proposeAgreement` / `acceptAgreement` / `counterAgreement` each return a `proposalId` (fire-and-forget) and, on the owner's approval, produce a signed two-party agreement. Poll `getAgreementProposal({ proposalId })`; `cancelAgreementProposal` aborts. Ungated companions: `declineAgreement`, `withdrawAgreement`, `ingestAgreement` (verifies the counterparty's signature + byte order), `getAgreement`, `listAgreements`.
- **SETTLE (bridges to the payment gateway — the spend is gated there).** `getSettlementInstruction({ agreementId })` → an `instruction` (`to` = payee `fc_` address, `amountFtc`, a `kind:"agreement"` `remittance` stamping `agreementId` + `proposalHash`). **Hand `instruction` to the ANTON-FutureChain gateway's `proposePayment`** — the owner approves the real FTC there. Then `markAgreementSettled({ agreementId, txHash })` (payer) / `reconcileSettlement({ proposalHash, txHash })` (payee).
- **FULFIL (Ed25519-signed, ungated — moves no FTC).** `markShipped` (seller) → `confirmDelivery` (buyer); `ingestFulfilment` applies the counterparty's signed shipment/delivery; `getFulfilment` reads status (`awaiting | shipped | delivered`).
- **ESCROW (optional custodial "notary" — the spends are gated in the payment gateway).** `openEscrow` → `getEscrowFundInstruction` / `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (each yields an `instruction` for `proposePayment`) → `markEscrowFunded` / `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute`, `ingestDispute`, `reconcileEscrow`, `getEscrow`.

---

## Worked example — a task, end to end (two bearers, two gateways)

```python
import requests, time, json
COLLAB = "http://127.0.0.1:49260/rpc"
PAY    = "http://127.0.0.1:49250/rpc"
CT, PT = "sk_collab...", "sk_pay..."   # one bearer per gateway, each from its own /pair

def rpc(url, tok, method, params=None):
    r = requests.post(url, headers={"authorization": f"Bearer {tok}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    return {"error": r["error"]["message"]} if "error" in r else r["result"]

# 1. Pick up a task the owner gave you.
task = rpc(COLLAB, CT, "listTasks", {"status": "open"})["tasks"][0]
say  = lambda t: rpc(COLLAB, CT, "postMessage", {"taskId": task["id"], "text": t})
say("On it — searching for what you asked.")

# 2. Discover + (optionally) talk / negotiate → reach a signed agreement (human-gated).
sellers = rpc(COLLAB, CT, "searchSellers", {"text": task["title"], "verbs": ["order"], "limit": 3})
# … resolveSeller / inquireSeller / negotiate / proposeAgreement → agreement_id …

# 3. Settle: get the instruction HERE, pay it through the PAYMENT gateway (owner approves there).
instr = rpc(COLLAB, CT, "getSettlementInstruction", {"agreementId": agreement_id})["instruction"]
prop  = rpc(PAY, PT, "proposePayment", instr)            # opens the payment gateway's human gate
pid   = prop["proposalId"]
while (p := rpc(PAY, PT, "getProposal", {"proposalId": pid}))["state"] == "pending":
    time.sleep(1.5)

# 4. Report back + close the task.
if p["state"] == "sent":
    rpc(COLLAB, CT, "markAgreementSettled", {"agreementId": agreement_id, "txHash": p["txId"]})
    say(f"Bought it ✓  Paid via FutureChain. tx {p['txId']}.")
    rpc(COLLAB, CT, "setTaskStatus", {"taskId": task["id"], "status": "done"})
else:
    say(f"Couldn't complete it — payment {p['state']}.")
```

---

## VERB CHEAT-SHEET

**Task inbox:** `listTasks` · `listMessages` · `postMessage` · `setTaskStatus` · `postTask`
**Status:** `getStatus` → `{ paired, agentName, relayBase, verbs }`
**Discover:** `searchSellers` · `resolveSeller`
**Talk:** `inquireSeller`
**Negotiate:** `negotiate` · `getNegotiation` · `cancelNegotiation`
**Agree (signed; the 3 committing verbs are human-gated):** `proposeAgreement` · `acceptAgreement` · `counterAgreement` · `declineAgreement` · `withdrawAgreement` · `ingestAgreement` · `getAgreement` · `listAgreements` · `getAgreementProposal` · `cancelAgreementProposal`
**Settle (bridge → payment gateway):** `getSettlementInstruction` · `markAgreementSettled` · `reconcileSettlement`
**Fulfil:** `markShipped` · `confirmDelivery` · `ingestFulfilment` · `getFulfilment`
**Escrow:** `openEscrow` · `getEscrowFundInstruction` · `markEscrowFunded` · `getEscrowReleaseInstruction` · `markEscrowReleased` · `getEscrowRefundInstruction` · `markEscrowRefunded` · `raiseDispute` · `ingestDispute` · `reconcileEscrow` · `getEscrow`

**Error codes** (JSON-RPC `error.code`): `-32001` auth missing · `-32002` auth invalid/expired · `-32003` origin forbidden · `-32004` validation (bad params) · `-32005` not found (task / agreement / proposal / job) · `-32010` upstream (relay / seller origin) · `-32011` no approval driver — a committing AGREE verb under `--mcp-stdio` (fail-closed) · `-32012` engine not configured.

---

## Full reference: [`./AGENTS.md`](./AGENTS.md)

This file is the OpenAI-family quick start. For the complete, transport-exhaustive contract — pairing internals, the full JSON-RPC envelope and every error code, every verb's exact shape, the human-gating contract, the settlement bridge, the security properties, and all environment variables — see **`./AGENTS.md`**. Every FTC spend from a settlement or escrow leg goes through the payment gateway's `proposePayment` and its non-bypassable human approval ([`../anton-agent-pay/OPENAI.md`](../anton-agent-pay/OPENAI.md)).
