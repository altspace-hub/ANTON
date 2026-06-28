# MISTRAL.md — Onboarding for Mistral (La Plateforme / Le Chat / codestral · devstral)

**What this is.** ANTON Collaboration is a **local, loopback-only** (`127.0.0.1`) JSON-RPC 2.0 + MCP gateway that becomes the **owner's agent cortex**: it hands you the **task inbox** (the work the owner gives you from their phone) and gives you the **agent-to-agent commerce loop** — discover other ANTON businesses, talk, negotiate, reach an **Ed25519-signed agreement**, and **settle**. You connect with Mistral's tool-calling loop, poll the inbox, do the work, and report back. This gateway **spends NO FTC itself** — every real payment bridges to the separate **ANTON-FutureChain payment gateway** (`../anton-agent-pay/MISTRAL.md`) and *its* non-bypassable human approval. Port **`49260`** (`ANTON_COLLAB_PORT`). Use `mistral-large-latest` (or any tool-capable La Plateforme / Le Chat model) to drive these verbs — `codestral`/`devstral` are code models, not for tool orchestration.

> **Two standalones, two roles.** This one (**Collaboration**, port `49260`) is the *cortex*: task inbox + discovery + negotiation + signed agreements + fulfilment. The other (**Agent Pay**, port `49250`, `../anton-agent-pay/MISTRAL.md`) is the *wallet*: it moves real FTC under a human gate. You drive both with two separate bearers; this one hands payment *instructions* to that one.

---

## GOLDEN RULES (read before anything else)

1. **You are the owner's brain — poll the task inbox, do the work, report back.** The owner gives you tasks from their phone ("find running shoes under 1500 kr", "book a table Friday"). Discover them with **`listTasks`**, work them, and report progress + results with **`postMessage`** (the owner sees it live in their app) and **`setTaskStatus`** when done. The rest of this gateway is *how* you do the task.

2. **You sign nothing and spend nothing on your own.** The three **committing** AGREE verbs — `proposeAgreement`, `acceptAgreement`, `counterAgreement` — are **human-gated** (the owner approves at a terminal/browser). Discovery, talk, and negotiation **commit to nothing**. And **every actual FTC movement** (settlement, escrow) is gated *again* in the separate payment gateway's `proposePayment`. There is no verb here that moves money.

3. **Settle by handing `getSettlementInstruction`'s `instruction` to the payment gateway.** When an agreement is reached, `getSettlementInstruction({ agreementId })` returns an `instruction` object (`to`, `amountFtc`, a stamped `remittance`). You pass that straight into the **Agent Pay gateway's `proposePayment`**, where the owner approves the real spend. Same for every escrow leg.

4. **Negotiate only PREPARES; it never decides.** `negotiate` runs an autonomous buyer loop within a hard µFTC ceiling, but its best outcome only *prepares* the params you must still push through the human-gated `proposeAgreement`. It signs nothing and pays nothing.

5. **You post as `agent` only — the owner is the human side.** Your `postMessage` is always recorded as the **agent**; only the owner's phone (the ANTON instance) posts `role:'human'`. Don't fabricate the owner's words.

---

## CONNECT — attaching a Mistral model

The gateway exposes the same verbs over two transports. Pick one.

### Option A — MCP over stdio (Le Chat / any MCP host)

Run the gateway with `--mcp-stdio`; the same verbs appear as MCP tools with the same names. MCP has **no pairing and needs no bearer** (every MCP client is the built-in identity; MCP sends no `Origin`, which the gateway accepts).

```jsonc
{
  "mcpServers": {
    "anton-collaboration": {
      "command": "pnpm",
      "args": ["--filter", "@anton/collaboration", "start:standalone", "--mcp-stdio"],
      "env": {
        "ANTON_COLLAB_CONTACT_HASH": "ANTON-XXXX-YYYY",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

> **MCP caveat:** the three **committing** AGREE verbs (`proposeAgreement` / `acceptAgreement` / `counterAgreement`) need a human-approval driver, which `--mcp-stdio` does not have (stdin belongs to MCP) — so they are **omitted from the MCP tool list and fail closed** (`-32011`). Everything else — the **task inbox**, discovery, talk, negotiate, settlement-instruction, fulfilment, escrow — works over MCP. You can run the whole "pick up a task → discover → negotiate → settle via the payment gateway → report back" loop over MCP, gating the actual spend in the payment gateway. To *commit* an agreement, drive the JSON-RPC transport (terminal approval) instead.

### Option B — La Plateforme API tool calling over JSON-RPC HTTP

Pair once for a bearer (the 6-digit code prints to the gateway's **stderr** on boot, valid **60 s**), then drive Mistral's tool loop. Mistral's tool schema is OpenAI-shaped; `function.arguments` arrives as a **JSON string**, so `json.loads()` it before forwarding. The `tool` reply message **requires `name`** alongside `tool_call_id`, and `tool_call_id` must be the exact id Mistral emitted.

```python
import json, time, requests
from mistralai import Mistral

BASE = "http://127.0.0.1:49260"
TOKEN = requests.post(f"{BASE}/pair",
    json={"code": "283069", "name": "mistral-brain", "ttlMs": 2592000000}).json()["sessionToken"]
H = {"authorization": f"Bearer {TOKEN}", "content-type": "application/json"}

def rpc(method, params=None):
    r = requests.post(f"{BASE}/rpc", headers=H,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. validation (-32004) / not found (-32005)
        return {"error": r["error"]["message"]}
    return r["result"]

client = Mistral(api_key=KEY)
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
      "properties": {"agreementId": {"type": "string"}}}}}]

resp = client.chat.complete(model="mistral-large-latest", messages=msgs,
                            tools=tools, tool_choice="auto")
for tc in resp.choices[0].message.tool_calls or []:
    out = rpc(tc.function.name, json.loads(tc.function.arguments))   # arguments = JSON string
    msgs.append({"role": "tool", "name": tc.function.name,
                 "tool_call_id": tc.id, "content": json.dumps(out)})
```

The bearer (`sk_...`) is returned **once** (the server stores only its SHA-256 hash) — store it. `name` is 1–64 chars; `code` is exactly 6 digits; `ttlMs` defaults to 4 h, clamped `[60_000, 2_592_000_000]` (1 min … 30 days). Every `/rpc` call needs `Authorization: Bearer <token>`; when an `Origin` header is present it must be `null` / `localhost` / `127.0.0.1`.

> The one idiom: some compat servers ignore `tools` silently — confirm a real `tool_call` comes back before trusting the model with a task loop. On a long-running `negotiate` or a `pending` proposal, let the model call the matching `get…` poller again rather than blocking the whole turn.

---

## THE TASK INBOX — your human↔agent channel (start here)

This is how the owner gives you work and how you report back. A **task** is a thread of messages tagged `human` or `agent`. **The loop you run:**

```
1. listTasks({ since: <last_seen_ms> })   -> new/updated tasks the owner gave you
2. for each new task: do the work (discover -> talk -> agree -> settle -> fulfil)
3. postMessage({ taskId, text })          -> progress + the result ("Bought it ✓ tx 0x…")
4. setTaskStatus({ taskId, status: "done" })
```

| Verb | Params | Returns |
|---|---|---|
| `listTasks` | `{ since?, status?, limit? }` — `since` = epoch-ms cursor; `status` = `open\|working\|done\|cancelled`; `limit` 1–200 (default 50) | `{ tasks: [{ id, title, status, createdAt, updatedAt, messageCount, lastRole, lastText }] }` (newest-updated first) |
| `listMessages` | `{ taskId }` | `{ taskId, title, status, createdAt, updatedAt, messages: [{ id, role, text, ts }] }` |
| `postMessage` | `{ taskId, text }` | `{ taskId, status, updatedAt, messageCount }` — always recorded as **agent**; the first agent reply flips the task `open → working` |
| `setTaskStatus` | `{ taskId, status }` (`open\|working\|done\|cancelled`) | `{ taskId, status }` |
| `postTask` | `{ text }` | `{ taskId, status, createdAt }` — create a task (normally the owner does this from their phone) |

- **Poll with `since`.** Pass the `updatedAt` of the newest task you've handled as `since` next time, so you only fetch what changed.
- **You are always the agent.** `postMessage` records `role:'agent'` for you no matter what — the owner's phone is the only human-side poster. Use plain language; the owner reads it in their app.
- **Tasks are durable** (they survive a gateway restart). The owner's original ask is the first message and is never dropped.

---

## THE COMMERCE LOOP — how you actually do a task

**DISCOVER → TALK → NEGOTIATE → AGREE (signed, human-gated) → SETTLE (bridges to the payment gateway) → FULFIL → ESCROW.** Amounts here are **µFTC** base-10 integer strings (`1 FTC = 1_000_000 µFTC`, string-typed to be BigInt-safe).

- **DISCOVER (ungated).** `searchSellers({ text?, verbs?, categories?, limit?, offset? })` queries the `.anton` registry (e.g. `text:"sport store running shoes", verbs:["order"]`). `resolveSeller({ address })` resolves an address like `"kicks.sthlm.portal"` to its **signed descriptor** (the trust root), its verbs, and its `originEndpoint`.
- **TALK (ungated, commits to nothing).** `inquireSeller({ address, verb|capabilityId, input? })` POSTs **directly** to the seller's `originEndpoint` ("Jordans size 43, price?"). https-only unless `ANTON_COLLAB_ALLOW_INSECURE_ORIGIN`.
- **NEGOTIATE (ungated, autonomous, only PREPARES).** `negotiate({ address, verb|capabilityId, objective, maxAmountMicroFtc, … })` runs a buyer LLM loop (needs `ANTHROPIC_API_KEY`) within a hard µFTC ceiling; counters must strictly lower the ask. Poll `getNegotiation({ jobId })` → terminal `outcome`: `propose_ready` (feed `prepared` into `proposeAgreement`), `walked_away`, or `no_agreement`. `cancelNegotiation` aborts. **Signs nothing, pays nothing.**
- **AGREE (Ed25519-signed, HUMAN-GATED).** `proposeAgreement` / `acceptAgreement` / `counterAgreement` each return a `proposalId` (fire-and-forget) and, on the owner's approval, produce a signed two-party agreement. Poll `getAgreementProposal({ proposalId })`; `cancelAgreementProposal` aborts. Ungated companions: `declineAgreement`, `withdrawAgreement`, `ingestAgreement` (apply the counterparty's inbound signed message — verifies signature + byte order), `getAgreement`, `listAgreements`.
- **SETTLE (bridges to the payment gateway — the spend is gated there).** `getSettlementInstruction({ agreementId })` → an `instruction` (`to` = payee `fc_` address, `amountFtc`, a `kind:"agreement"` `remittance` stamping `agreementId` + `proposalHash`). **Hand `instruction` to the Agent Pay gateway's `proposePayment`** — the owner approves the real FTC there. Then `markAgreementSettled({ agreementId, txHash })` (payer) / `reconcileSettlement({ proposalHash, txHash })` (payee).
- **FULFIL (Ed25519-signed, ungated — moves no FTC).** `markShipped` (seller) → `confirmDelivery` (buyer); `ingestFulfilment` applies the counterparty's signed shipment/delivery; `getFulfilment` reads status (`awaiting | shipped | delivered`).
- **ESCROW (optional custodial "notary" — the spends are gated in the payment gateway).** `openEscrow` → `getEscrowFundInstruction` / `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (each yields an `instruction` for `proposePayment`) → `markEscrowFunded` / `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute`, `ingestDispute`, `reconcileEscrow`, `getEscrow`.

---

## Worked example — a task, end to end (two bearers, one per gateway)

```python
import requests, time
COLLAB = "http://127.0.0.1:49260/rpc"
PAY    = "http://127.0.0.1:49250/rpc"
CT, PT = "sk_collab...", "sk_pay..."   # bearers from each gateway's /pair

def call(url, tok, method, params=None):
    r = requests.post(url, headers={"authorization": f"Bearer {tok}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    return {"error": r["error"]["message"]} if "error" in r else r["result"]

# 1. Pick up a task the owner gave you, and say you're on it.
task = call(COLLAB, CT, "listTasks", {"status": "open"})["tasks"][0]
say  = lambda t: call(COLLAB, CT, "postMessage", {"taskId": task["id"], "text": t})
say("On it — searching for what you asked.")

# 2. Discover + (optionally) talk / negotiate, then reach a signed agreement (human-gated).
sellers = call(COLLAB, CT, "searchSellers", {"text": task["title"], "verbs": ["order"], "limit": 3})
# … resolveSeller / inquireSeller / negotiate / proposeAgreement -> agreement_id …

# 3. Settle: get the instruction HERE, pay it through the payment GATEWAY (owner approves there).
instr = call(COLLAB, CT, "getSettlementInstruction", {"agreementId": agreement_id})["instruction"]
prop  = call(PAY, PT, "proposePayment", instr)           # opens the payment gateway's human gate
pid   = prop["proposalId"]
while (p := call(PAY, PT, "getProposal", {"proposalId": pid}))["state"] == "pending":
    time.sleep(1.5)

# 4. Report back + close the task.
if p["state"] == "sent":
    call(COLLAB, CT, "markAgreementSettled", {"agreementId": agreement_id, "txHash": p["txId"]})
    say(f"Bought it ✓  Paid via FutureChain. tx {p['txId']}.")
    call(COLLAB, CT, "setTaskStatus", {"taskId": task["id"], "status": "done"})
else:
    say(f"Couldn't complete it — payment {p['state']}.")
```

Two bearers: one from *this* gateway's `/pair` (`CT`, the task + commerce verbs) and one from the payment gateway's `/pair` (`PT`, `proposePayment` / `getProposal`). The actual FTC spend is approved by the owner inside the payment gateway, never here.

---

## VERB CHEAT-SHEET

**Task inbox:** `listTasks` · `listMessages` · `postMessage` · `setTaskStatus` · `postTask`
**Status:** `getStatus` → `{ paired, agentName, relayBase, verbs }`
**Discover:** `searchSellers` · `resolveSeller`
**Talk:** `inquireSeller`
**Negotiate:** `negotiate` · `getNegotiation` · `cancelNegotiation`
**Agree (signed; the 3 committing verbs are human-gated, omitted under `--mcp-stdio`):** `proposeAgreement` · `acceptAgreement` · `counterAgreement` · `declineAgreement` · `withdrawAgreement` · `ingestAgreement` · `getAgreement` · `listAgreements` · `getAgreementProposal` · `cancelAgreementProposal`
**Settle (bridge → payment gateway's `proposePayment`):** `getSettlementInstruction` · `markAgreementSettled` · `reconcileSettlement`
**Fulfil:** `markShipped` · `confirmDelivery` · `ingestFulfilment` · `getFulfilment`
**Escrow:** `openEscrow` · `getEscrowFundInstruction` · `markEscrowFunded` · `getEscrowReleaseInstruction` · `markEscrowReleased` · `getEscrowRefundInstruction` · `markEscrowRefunded` · `raiseDispute` · `ingestDispute` · `reconcileEscrow` · `getEscrow`

Error codes you may see (JSON-RPC `error.code`): `-32001` auth missing, `-32002` auth invalid/expired, `-32003` origin forbidden, `-32004` validation (bad params), `-32005` not found (unknown task / agreement / proposal / job), `-32010` upstream (relay / seller origin), `-32011` no approval driver (a committing AGREE verb under `--mcp-stdio`, fail-closed), `-32012` engine not configured.

---

## Full reference: ./AGENTS.md

This file is the Mistral-specific quickstart. For the complete, authoritative contract — every verb, every param/shape, the pairing and JSON-RPC envelope, the full error table, the negotiation outcomes, and the security model — see **[./AGENTS.md](./AGENTS.md)**. Every FTC spend from a settlement or escrow leg goes through the **payment gateway** (`../anton-agent-pay/MISTRAL.md`) and its non-bypassable human approval.
