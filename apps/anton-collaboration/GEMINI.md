# GEMINI.md — ANTON Collaboration Standalone for Google Gemini

This is the onboarding guide for driving the **ANTON Collaboration Standalone** gateway from **Google Gemini** via function calling. This gateway is your agent's **cortex**: a local, **loopback-only** (`127.0.0.1`) JSON-RPC 2.0 + MCP server that hands you the **task inbox** the owner fills from their phone, plus the full **agent-to-agent commerce loop** — discover other ANTON businesses, talk, negotiate, reach an **Ed25519-signed agreement**, and **settle**. It **spends no FTC itself**: every real payment bridges to the separate **ANTON-FutureChain payment gateway** (`../anton-agent-pay/GEMINI.md`) and *its* non-bypassable human approval. You (Gemini) declare each verb as a function; when the model calls one, your handler `POST`s it to `/rpc`. Port `49260` (`ANTON_COLLAB_PORT`).

---

## GOLDEN RULES (read before you wire anything up)

1. **You are the owner's brain — poll the task inbox, do the work, report back.** The owner gives you tasks from their phone ("find running shoes under 1500 kr", "book a table Friday"). Discover them with **`listTasks`**, do the work, and report progress + results with **`postMessage`** (the owner sees it live in their app) and **`setTaskStatus`** when done. This is the human↔agent channel; everything else is how you actually *do* the task.
2. **You sign nothing and spend nothing on your own.** The only **committing** verbs — `proposeAgreement` / `acceptAgreement` / `counterAgreement` — are **human-gated** (the owner approves at a terminal or browser, like the payment gate). And **every actual FTC movement** bridges to the payment gateway's `proposePayment` + its human approval. There is no verb here that moves money.
3. **Settle by handing `getSettlementInstruction`'s `instruction` to the payment gateway.** When an agreement is reached, `getSettlementInstruction({ agreementId })` returns an `instruction` object (`to`, `amountFtc`, a stamped `remittance`). Pass it straight into the **payment gateway's `proposePayment`** (`../anton-agent-pay/GEMINI.md`), where the owner approves the real spend. Same for every escrow leg.
4. **`negotiate` only PREPARES — it never decides.** It runs an autonomous buyer loop within a hard µFTC ceiling, but its best outcome only *prepares* params you must still push through the human-gated `proposeAgreement`. It signs nothing and pays nothing.
5. **You post as `agent` only — the owner is the human side.** `postMessage` always records `role:'agent'` for you; only the owner's phone (the ANTON instance) posts `role:'human'`. Don't try to fabricate the owner's words.

---

## CONNECT (Google Gemini → the gateway)

Gemini attaches over **JSON-RPC HTTP**. You declare each verb as a `FunctionDeclaration`; when the model emits a `function_call`, your handler forwards it to `POST http://127.0.0.1:49260/rpc` with a bearer token, then returns the result as a `function_response` Part.

**Step 1 — mint a bearer (once per agent).** On boot the gateway prints a 6-digit pair code to its **stderr**, valid 60 s. Exchange it for a session token (this is *not* a JSON-RPC call):

```bash
TOKEN=$(curl -s http://127.0.0.1:49260/pair -H 'content-type: application/json' \
  -d '{"code":"283069","name":"gemini-brain","ttlMs":2592000000}' | jq -r .sessionToken)
```

The `sessionToken` (`sk_…`) is returned **once** — store it. Send it as `Authorization: Bearer <token>` on every `/rpc` call. `name` is 1–64 chars; `code` is exactly 6 digits; `ttlMs` defaults to 4 h, clamped `[60_000, 2_592_000_000]` (1 min … 30 days). When an `Origin` header is present it must be allowlisted (`null`, `localhost`, or `127.0.0.1`).

**Step 2 — the shared `rpc()` helper** (the body of every Gemini function handler):

```python
import requests
def rpc(method, params=None):
    r = requests.post("http://127.0.0.1:49260/rpc",
        headers={"authorization": f"Bearer {TOKEN}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. validation (code -32004), not-found (-32005)
        return {"error": r["error"]["message"]}
    return r["result"]
```

**Step 3 — declare the verbs and run the tool loop.** Gemini schema types are **UPPERCASE** (`STRING` / `NUMBER` / `INTEGER` / `OBJECT`); `function_call.args` arrives **already as a dict** (no `json.loads`); you continue the turn by returning a `function_response` Part.

```python
from google import genai
from google.genai import types

list_tasks = types.FunctionDeclaration(
    name="listTasks",
    description="List tasks the owner gave you (newest-updated first). Poll with 'since'.",
    parameters={"type": "OBJECT", "properties": {
        "since":  {"type": "INTEGER"},   # epoch-ms cursor
        "status": {"type": "STRING"},    # open|working|done|cancelled
        "limit":  {"type": "INTEGER"}}}) # 1–200, default 50
post_message = types.FunctionDeclaration(
    name="postMessage",
    description="Reply on a task (recorded as 'agent'); first reply flips open→working.",
    parameters={"type": "OBJECT", "required": ["taskId", "text"],
        "properties": {"taskId": {"type": "STRING"}, "text": {"type": "STRING"}}})

cfg = types.GenerateContentConfig(tools=[types.Tool(
    function_declarations=[list_tasks, post_message])])  # add the other verbs likewise
resp = client.models.generate_content(model="gemini-2.0-flash", contents=prompt, config=cfg)

for part in resp.candidates[0].content.parts:
    fc = part.function_call
    if fc:                                              # fc.args is already a dict
        out = rpc(fc.name, dict(fc.args))
        # reply with types.Part.from_function_response(name=fc.name, response={"result": out})
```

> **MCP alternative.** The gateway also speaks MCP over stdio (`pnpm --filter @anton/collaboration start:standalone --mcp-stdio`) with the same verb names and **no pairing** (every MCP client is the built-in identity; MCP sends no `Origin`, which the gateway accepts). Use this if your Gemini runtime is an MCP host. **MCP caveat:** the three **committing** AGREE verbs (`proposeAgreement` / `acceptAgreement` / `counterAgreement`) need a human-approval driver that `--mcp-stdio` lacks (stdin belongs to MCP) — so they are **omitted and fail closed** (`-32011`). Everything else — the **task inbox**, discovery, talk, negotiate, settlement-instruction, fulfilment, escrow — works over MCP. To *commit* an agreement, drive the JSON-RPC path (terminal approval) instead.

---

## THE TASK INBOX — your human↔agent channel (start here)

This is how the owner gives you work and how you report back. A **task** is a thread of messages tagged `human` or `agent`. The loop you run:

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
| `postMessage` | `{ taskId, text }` | `{ taskId, status, updatedAt, messageCount }` — your reply (always **agent**); the first agent reply flips the task `open → working` |
| `setTaskStatus` | `{ taskId, status }` (`open\|working\|done\|cancelled`) | `{ taskId, status }` |
| `postTask` | `{ text }` | `{ taskId, status, createdAt }` — create a task (normally the owner does this from their phone) |

- **Poll with `since`.** Pass the `updatedAt` of the newest task you've handled as `since` next time, so you only fetch what changed.
- **You are always the agent.** `postMessage` records `role:'agent'` for you no matter what — the owner's phone is the only human-side poster. Use plain language; the owner reads it in their app.
- **Tasks are durable** (they survive a gateway restart). The owner's original ask is the first message and is never dropped.

---

## THE COMMERCE LOOP — how you actually do a task

**DISCOVER → TALK → NEGOTIATE → AGREE (signed, human-gated) → SETTLE (bridges to the payment gateway) → FULFIL → ESCROW.** Amounts here are **µFTC** base-10 integer strings (`1 FTC = 1_000_000 µFTC`, string-typed to be BigInt-safe).

- **DISCOVER** (ungated): `searchSellers({ text?, verbs?, categories?, limit?, offset? })` queries the `.anton` registry (e.g. `text:"sport store running shoes", verbs:["order"]`) → `resolveSeller({ address })` resolves an address like `"kicks.sthlm.portal"` to its **signed descriptor** (the trust root), verbs, and `originEndpoint`.
- **TALK** (ungated, commits to nothing): `inquireSeller({ address, verb|capabilityId, input? })` POSTs **directly** to the seller's `originEndpoint` ("Jordans size 43, price?"). https-only unless `ANTON_COLLAB_ALLOW_INSECURE_ORIGIN`.
- **NEGOTIATE** (ungated, autonomous, only **PREPARES**): `negotiate({ address, verb|capabilityId, objective, maxAmountMicroFtc, … })` runs a buyer LLM loop (needs `ANTHROPIC_API_KEY`) within a hard µFTC ceiling; counters must strictly lower the ask. Poll `getNegotiation({ jobId })` → terminal `outcome`: `propose_ready` (feed `prepared` into `proposeAgreement`), `walked_away`, or `no_agreement`. `cancelNegotiation` aborts. **Signs nothing, pays nothing.**
- **AGREE** (Ed25519-signed, **HUMAN-GATED**): `proposeAgreement` / `acceptAgreement` / `counterAgreement` each return a `proposalId` (fire-and-forget) and, on the owner's approval, produce a signed two-party agreement. Poll `getAgreementProposal({ proposalId })`; `cancelAgreementProposal` aborts. Ungated companions: `declineAgreement`, `withdrawAgreement`, `ingestAgreement` (apply the counterparty's inbound signed message — verifies signature + byte order), `getAgreement`, `listAgreements`.
- **SETTLE** (bridges to the payment gateway — the spend is gated there): `getSettlementInstruction({ agreementId })` → an `instruction` (`to` = payee `fc_` address, `amountFtc`, a `kind:"agreement"` `remittance` stamping `agreementId` + `proposalHash`). **Hand `instruction` to the payment gateway's `proposePayment`** — the owner approves the real FTC there. Then `markAgreementSettled({ agreementId, txHash })` (payer) / `reconcileSettlement({ proposalHash, txHash })` (payee).
- **FULFIL** (Ed25519-signed, ungated — moves no FTC): `markShipped` (seller) → `confirmDelivery` (buyer); `ingestFulfilment` applies the counterparty's signed shipment/delivery; `getFulfilment` reads status (`awaiting | shipped | delivered`).
- **ESCROW** (optional custodial "notary" — the spends are gated in the payment gateway): `openEscrow` → `getEscrowFundInstruction` / `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (each yields an `instruction` for `proposePayment`) → `markEscrowFunded` / `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute`, `ingestDispute`, `reconcileEscrow`, `getEscrow`.

---

## Worked example — a task, end to end (propose → poll → report back)

Two gateways, **two bearers** — one from each `/pair`. Collaboration drives the task + agreement; the payment gateway gates the real spend.

```python
import requests, time
COLLAB = "http://127.0.0.1:49260/rpc"     # this gateway (cortex)
PAY    = "http://127.0.0.1:49250/rpc"     # the payment gateway (wallet)
CT, PT = "sk_collab...", "sk_pay..."      # bearers from each gateway's /pair

def call(url, tok, method, params=None):
    r = requests.post(url, headers={"authorization": f"Bearer {tok}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    return {"error": r["error"]["message"]} if "error" in r else r["result"]

# 1) Pick up a task the owner gave you, and acknowledge it.
task = call(COLLAB, CT, "listTasks", {"status": "open"})["tasks"][0]
say  = lambda t: call(COLLAB, CT, "postMessage", {"taskId": task["id"], "text": t})
say("On it — searching for what you asked.")

# 2) Discover → (talk / negotiate) → reach a signed agreement (human-gated → agreementId).
sellers = call(COLLAB, CT, "searchSellers", {"text": task["title"], "verbs": ["order"], "limit": 3})
# … resolveSeller / inquireSeller / negotiate / proposeAgreement → agreement_id …

# 3) Settle: get the instruction HERE, pay it through the payment gateway (owner approves THERE).
instr = call(COLLAB, CT, "getSettlementInstruction", {"agreementId": agreement_id})["instruction"]
prop  = call(PAY, PT, "proposePayment", instr)           # opens the payment gateway's human gate
pid   = prop["proposalId"]
while (p := call(PAY, PT, "getProposal", {"proposalId": pid}))["state"] == "pending":
    time.sleep(1.5)                                      # fire-and-forget — poll until it leaves pending

# 4) Report back + close the task.
if p["state"] == "sent":
    call(COLLAB, CT, "markAgreementSettled", {"agreementId": agreement_id, "txHash": p["txId"]})
    say(f"Bought it ✓  Paid via FutureChain. tx {p['txId']}.")
    call(COLLAB, CT, "setTaskStatus", {"taskId": task["id"], "status": "done"})
else:
    say(f"Couldn't complete it — payment {p['state']}.")
```

---

## VERB CHEAT-SHEET (the verbs, grouped)

**Task inbox:** `listTasks` · `listMessages` · `postMessage` · `setTaskStatus` · `postTask`
**Status:** `getStatus` → `{ paired, agentName, relayBase, verbs }`
**Discover:** `searchSellers` · `resolveSeller`
**Talk:** `inquireSeller`
**Negotiate:** `negotiate` · `getNegotiation` · `cancelNegotiation`
**Agree** (signed; the 3 committing verbs are human-gated): `proposeAgreement` · `acceptAgreement` · `counterAgreement` · `declineAgreement` · `withdrawAgreement` · `ingestAgreement` · `getAgreement` · `listAgreements` · `getAgreementProposal` · `cancelAgreementProposal`
**Settle** (bridge → payment gateway): `getSettlementInstruction` · `markAgreementSettled` · `reconcileSettlement`
**Fulfil:** `markShipped` · `confirmDelivery` · `ingestFulfilment` · `getFulfilment`
**Escrow:** `openEscrow` · `getEscrowFundInstruction` · `markEscrowFunded` · `getEscrowReleaseInstruction` · `markEscrowReleased` · `getEscrowRefundInstruction` · `markEscrowRefunded` · `raiseDispute` · `ingestDispute` · `reconcileEscrow` · `getEscrow`

**Error codes** (JSON-RPC `error.code`): `-32001` auth missing · `-32002` auth invalid/expired · `-32003` origin forbidden · `-32004` validation (bad params) · `-32005` not found (unknown task / agreement / proposal / job) · `-32010` upstream (relay / seller origin) · `-32011` no approval driver (a committing AGREE verb under `--mcp-stdio`, fail-closed) · `-32012` engine not configured.

**Key env:** `ANTON_COLLAB_PORT` (`49260`) · `ANTON_COLLAB_RELAY_BASE` (`.anton` registry) · `ANTON_COLLAB_CONTACT_HASH` (your buyer contact hash) · `ANTON_COLLAB_STORE_DIR` (signing identity + agreements + the task inbox) · `ANTHROPIC_API_KEY` (enables `negotiate`).

---

**Full reference: [`./AGENTS.md`](./AGENTS.md)** — the complete, authoritative agent-facing contract (every verb, every param, error codes, the task inbox, the commerce loop, env vars, and the human-approval design). Every FTC spend bridges to the payment gateway — see [`../anton-agent-pay/GEMINI.md`](../anton-agent-pay/GEMINI.md).
