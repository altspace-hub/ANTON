# Ollama — driving the ANTON Collaboration gateway with a fully-local model

This is the onboarding for connecting a **local Ollama model with tool support** (`llama3.1`, `qwen2.5`, `mistral-nemo`, …) to the **ANTON Collaboration Standalone** — a local, **loopback-only** JSON-RPC + MCP gateway that is your agent's **cortex**: it hands you the **task inbox** the owner fills from their phone, and it gives you the **agent-to-agent commerce loop** (discover other ANTON businesses → talk → negotiate → reach an Ed25519-signed agreement → settle). It **spends no FTC itself** — every real payment bridges to the separate **ANTON-FutureChain payment gateway** ([`../anton-agent-pay/OLLAMA.md`](../anton-agent-pay/OLLAMA.md)) and its non-bypassable human approval. The whole loop stays on one box: Ollama serves the model on `localhost:11434`, this gateway binds `127.0.0.1:49260` (`ANTON_COLLAB_PORT`), the signing identity never leaves the machine, and the agent loop runs in **your own harness**. The model calls each tool through Ollama's `/api/chat` `tools` field; your tool handler POSTs the matching verb to this gateway's `POST /rpc`.

---

## GOLDEN RULES — read before you wire anything

1. **You are the owner's brain — poll the task inbox, do the work, report back.** The owner gives you tasks from their phone ("find running shoes under 1500 kr", "book a table Friday"). You discover them with **`listTasks`**, work them, and report progress + results with **`postMessage`** (the owner sees it live in their app) and **`setTaskStatus`** when done. You always post as the **agent** — the owner is the only human-side poster; you cannot fabricate their words.
2. **You sign nothing and spend nothing on your own.** The only **committing** verbs — `proposeAgreement` / `acceptAgreement` / `counterAgreement` — are **human-gated** (the owner approves at a terminal/browser). Discovery, talk, and negotiation **commit to nothing**. And **every actual FTC movement** (settlement, escrow) is gated *again* in the separate payment gateway's `proposePayment`. **There is no verb here that moves money.**
3. **Settle by handing `getSettlementInstruction`'s `instruction` to the payment gateway.** When an agreement is reached, `getSettlementInstruction({ agreementId })` returns an `instruction` object (`to`, `amountFtc`, a stamped `remittance`). You pass that **straight into the ANTON-FutureChain gateway's `proposePayment`**, where the owner approves the real spend. Same for every escrow leg's instruction.
4. **`negotiate` only PREPARES — it never decides.** It runs an autonomous buyer LLM loop within a hard µFTC ceiling, but its best outcome only *prepares* the params you must still push through the human-gated `proposeAgreement`. It signs nothing and pays nothing.
5. **You post as `agent` only.** `postMessage` records `role:'agent'` for you no matter what. The owner's phone (the ANTON instance) is the only `role:'human'` poster.

---

## CONNECT — attaching a local Ollama model

Ollama exposes tool-capable models via `/api/chat` with a `tools` field that takes OpenAI-shaped function declarations. Only **tool-trained** models populate tool calls (`llama3.1`, `qwen2.5`, `mistral-nemo`); base/uninstruct models will not. The non-obvious Ollama idiom: **`tool_calls[].function.arguments` is already a Python dict** — no `json.loads()`.

```bash
# 1) start the local model server
ollama serve                 # serves http://localhost:11434
ollama pull qwen2.5          # or llama3.1 / mistral-nemo — a tool-capable model

# 2) start the collaboration gateway (prints a 60s pair code + URL to stderr)
ANTON_COLLAB_CONTACT_HASH="ANTON-XXXX-YYYY" \
ANTHROPIC_API_KEY="sk-ant-..." \
pnpm --filter @anton/collaboration start:standalone
# bind: 127.0.0.1:49260 (ANTON_COLLAB_PORT). ANTHROPIC_API_KEY only enables `negotiate`.
```

Bootstrap the bearer once (the 6-digit pair code prints on gateway boot, valid 60s), then drive the model. The `rpc()` handler is the body of every tool call:

```python
import time, requests, ollama

BASE  = "http://127.0.0.1:49260"
TOKEN = requests.post(f"{BASE}/pair",
    json={"code": "283069", "name": "ollama-brain", "ttlMs": 2592000000}).json()["sessionToken"]

def rpc(method, params=None):
    """Body of every tool handler: POST one JSON-RPC verb to the collaboration gateway."""
    r = requests.post(f"{BASE}/rpc",
        headers={"authorization": f"Bearer {TOKEN}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. validation (-32004), no-approval-driver (-32011)
        return {"error": r["error"]["message"]}
    return r["result"]

tools = [
  {"type": "function", "function": {
    "name": "listTasks",
    "description": "List tasks the owner gave you. Pass `since` (epoch-ms) to fetch only what changed.",
    "parameters": {"type": "object", "properties": {
      "since":  {"type": "integer", "description": "epoch-ms cursor"},
      "status": {"type": "string", "enum": ["open", "working", "done", "cancelled"]},
      "limit":  {"type": "integer", "description": "1–200, default 50"}}}}},
  {"type": "function", "function": {
    "name": "postMessage",
    "description": "Reply on a task (recorded as agent; the owner reads it live).",
    "parameters": {"type": "object", "required": ["taskId", "text"],
      "properties": {"taskId": {"type": "string"}, "text": {"type": "string"}}}}},
  {"type": "function", "function": {
    "name": "setTaskStatus",
    "parameters": {"type": "object", "required": ["taskId", "status"],
      "properties": {"taskId": {"type": "string"},
        "status": {"type": "string", "enum": ["open", "working", "done", "cancelled"]}}}}},
  {"type": "function", "function": {
    "name": "searchSellers",
    "parameters": {"type": "object", "properties": {
      "text":  {"type": "string"},
      "verbs": {"type": "array", "items": {"type": "string"}},
      "limit": {"type": "integer"}}}}},
  {"type": "function", "function": {
    "name": "getSettlementInstruction",
    "description": "Build the payment instruction for an agreement — hand it to the payment gateway.",
    "parameters": {"type": "object", "required": ["agreementId"],
      "properties": {"agreementId": {"type": "string"}}}}}]

msgs = [{"role": "user", "content": "Check my tasks and start working the open one."}]
resp = ollama.chat(model="qwen2.5", messages=msgs, tools=tools)
for tc in resp.message.tool_calls or []:
    out = rpc(tc.function.name, tc.function.arguments)   # arguments is ALREADY a dict
    msgs.append({"role": "tool", "content": __import__("json").dumps(out)})
```

> **MCP-over-stdio alternative.** The same verbs are exposed over MCP if you run the gateway with `--mcp-stdio`. There is no Ollama-native MCP client today, so for local Ollama the **JSON-RPC path above is the supported route**. **MCP caveat:** the three **committing** AGREE verbs (`proposeAgreement` / `acceptAgreement` / `counterAgreement`) need a human-approval driver, which `--mcp-stdio` does not have (stdin belongs to MCP) — so they are **omitted and fail closed** (`-32011`). Everything else — the **task inbox**, discovery, talk, negotiate, settlement-instruction, fulfilment, escrow — works over MCP. To *commit* an agreement, drive the JSON-RPC transport (terminal approval) instead.

---

## THE TASK INBOX — your human↔agent channel (start here)

This is how the owner gives you work and how you report back. A **task** is a thread of messages tagged `human` or `agent`. **The loop you run:**

```
1. listTasks({ since: <last_seen_ms> })   → new/updated tasks the owner gave you
2. for each new task: do the work (discover → talk → agree → settle → fulfil)
3. postMessage({ taskId, text })          → progress + the result ("Bought it ✓ tx 0x…")
4. setTaskStatus({ taskId, status: "done" })
```

| Verb | Params | Returns |
|---|---|---|
| `listTasks` | `{ since?, status?, limit? }` (`since` = epoch-ms cursor; `status` = `open\|working\|done\|cancelled`; `limit` 1–200, default 50) | `{ tasks: [{ id, title, status, createdAt, updatedAt, messageCount, lastRole, lastText }] }` (newest-updated first) |
| `listMessages` | `{ taskId }` | `{ taskId, title, status, createdAt, updatedAt, messages: [{ id, role, text, ts }] }` |
| `postMessage` | `{ taskId, text }` | `{ taskId, status, updatedAt, messageCount }` — always recorded as **agent**; the first agent reply flips the task `open → working` |
| `setTaskStatus` | `{ taskId, status }` (`open\|working\|done\|cancelled`) | `{ taskId, status }` |
| `postTask` | `{ text }` | `{ taskId, status, createdAt }` — create a task (normally the owner does this from their phone) |

- **Poll with `since`.** Pass the `updatedAt` of the newest task you've handled as the next `since`, so you only fetch what changed.
- **You are always the agent.** `postMessage` records `role:'agent'` no matter what — the owner's phone is the only human-side poster. Use plain language; the owner reads it in their app.
- **Tasks are durable** (they survive a gateway restart); the owner's original ask is the first message and is never dropped.

---

## THE COMMERCE LOOP — how you actually do a task

**DISCOVER → TALK → NEGOTIATE → AGREE (signed, human-gated) → SETTLE (bridges to the payment gateway) → FULFIL → ESCROW.** Amounts are **µFTC** base-10 integer strings (`1 FTC = 1_000_000 µFTC`, string-typed to be BigInt-safe).

- **DISCOVER (ungated).** `searchSellers({ text?, verbs?, categories?, limit?, offset? })` queries the `.anton` registry (e.g. `text:"sport store running shoes", verbs:["order"]`). `resolveSeller({ address })` resolves an address like `"kicks.sthlm.portal"` to its **signed descriptor** (the trust root), its verbs, and its `originEndpoint`.
- **TALK (ungated, commits to nothing).** `inquireSeller({ address, verb|capabilityId, input? })` POSTs **directly** to the seller's `originEndpoint` ("Jordans size 43, price?").
- **NEGOTIATE (ungated, autonomous, only PREPARES).** `negotiate({ address, verb|capabilityId, objective, maxAmountMicroFtc, … })` runs a buyer LLM loop (needs `ANTHROPIC_API_KEY`) within a hard µFTC ceiling; counters must strictly lower the ask. Poll `getNegotiation({ jobId })` → terminal `outcome`: `propose_ready` (feed `prepared` into `proposeAgreement`), `walked_away`, or `no_agreement`. `cancelNegotiation` aborts. **Signs nothing, pays nothing.**
- **AGREE (Ed25519-signed, HUMAN-GATED).** `proposeAgreement` / `acceptAgreement` / `counterAgreement` each return a `proposalId` (fire-and-forget); on the owner's approval they produce a signed two-party agreement. Poll `getAgreementProposal({ proposalId })`; `cancelAgreementProposal` aborts. Ungated companions: `declineAgreement`, `withdrawAgreement`, `ingestAgreement` (apply the counterparty's inbound signed message — verifies signature + byte order), `getAgreement`, `listAgreements`.
- **SETTLE (bridges to the payment gateway — the spend is gated there).** `getSettlementInstruction({ agreementId })` → an `instruction` (`to` = payee `fc_` address, `amountFtc`, a `kind:"agreement"` `remittance` stamping `agreementId` + `proposalHash`). **Hand `instruction` to the ANTON-FutureChain gateway's `proposePayment`** — the owner approves the real FTC there. Then `markAgreementSettled({ agreementId, txHash })` (payer) / `reconcileSettlement({ proposalHash, txHash })` (payee).
- **FULFIL (Ed25519-signed, ungated — moves no FTC).** `markShipped` (seller) → `confirmDelivery` (buyer); `ingestFulfilment` applies the counterparty's signed shipment/delivery; `getFulfilment` reads status (`awaiting | shipped | delivered`).
- **ESCROW (optional custodial "notary" — the spends are gated in the payment gateway).** `openEscrow` → `getEscrowFundInstruction` / `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (each yields an `instruction` for `proposePayment`) → `markEscrowFunded` / `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute`, `ingestDispute`, `reconcileEscrow`, `getEscrow`.

---

## Worked example — a task, end to end (two gateways, two bearers)

A local Ollama model runs the harness; one bearer per gateway. Collaboration gates the **signing** of the agreement; the payment gateway gates the **spend**.

```python
import time, requests

COLLAB, PAY = "http://127.0.0.1:49260", "http://127.0.0.1:49250"
CT = requests.post(f"{COLLAB}/pair", json={"code": "283069", "name": "ollama-brain"}).json()["sessionToken"]
PT = requests.post(f"{PAY}/pair",    json={"code": "483920", "name": "ollama-wallet"}).json()["sessionToken"]

def call(base, tok, method, params=None):
    r = requests.post(f"{base}/rpc",
        headers={"authorization": f"Bearer {tok}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    return {"error": r["error"]["message"]} if "error" in r else r["result"]

# 1) Pick up a task the owner gave you, and acknowledge it.
task = call(COLLAB, CT, "listTasks", {"status": "open"})["tasks"][0]
say  = lambda t: call(COLLAB, CT, "postMessage", {"taskId": task["id"], "text": t})
say("On it — searching for what you asked.")

# 2) Discover (+ optionally talk / negotiate), then reach a signed agreement (human-gated).
call(COLLAB, CT, "searchSellers", {"text": task["title"], "verbs": ["order"], "limit": 3})
# … resolveSeller / inquireSeller / negotiate / proposeAgreement → agreement_id …

# 3) Settle: get the instruction HERE, pay it through the PAYMENT gateway (owner approves THERE).
instr = call(COLLAB, CT, "getSettlementInstruction", {"agreementId": agreement_id})["instruction"]
pid   = call(PAY, PT, "proposePayment", instr)["proposalId"]      # opens the payment gateway's human gate
while (p := call(PAY, PT, "getProposal", {"proposalId": pid}))["state"] == "pending":
    time.sleep(1.5)

# 4) Report back + close the task.
if p["state"] == "sent":
    call(COLLAB, CT, "markAgreementSettled", {"agreementId": agreement_id, "txHash": p["txId"]})
    say(f"Bought it ✓  Paid via FutureChain. tx {p['txId']}.")
    call(COLLAB, CT, "setTaskStatus", {"taskId": task["id"], "status": "done"})
else:
    say(f"Couldn't complete it — payment {p['state']}.")
```

There is no shortcut around the payment gateway's human gate: `proposePayment` is fire-and-forget; you must poll `getProposal` until `state` leaves `pending` (`sent` with `txId` / `rejected` / `expired` / `cancelled`). See [`../anton-agent-pay/OLLAMA.md`](../anton-agent-pay/OLLAMA.md) for the wallet side.

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

Error codes you may see (JSON-RPC `error.code`): `-32001` auth missing, `-32002` auth invalid/expired, `-32003` origin forbidden, `-32004` validation (bad params), `-32005` not found (unknown task/agreement/proposal/job), `-32010` upstream (relay / seller origin failure), `-32011` no approval driver (a committing AGREE verb under `--mcp-stdio`, fail-closed), `-32012` engine not configured (discovery relay or task store absent).

---

## Full reference: [`./AGENTS.md`](./AGENTS.md)

This file is the Ollama quick-start. For the complete agent-facing contract — every verb shape, every error code, pairing/bearer mechanics, the full env-var table (`ANTON_COLLAB_PORT`, `ANTON_COLLAB_RELAY_BASE`, `ANTON_COLLAB_CONTACT_HASH`, `ANTON_COLLAB_STORE_DIR`, …), and the security properties — read **[`./AGENTS.md`](./AGENTS.md)**. For the payment side every settlement/escrow leg bridges to, read **[`../anton-agent-pay/OLLAMA.md`](../anton-agent-pay/OLLAMA.md)**.
