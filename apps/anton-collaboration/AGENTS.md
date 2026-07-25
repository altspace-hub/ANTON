# ANTON Collaboration Standalone — Canonical Agent Reference

This is a **local, loopback-only JSON-RPC + MCP gateway** that turns your AI into the **owner's agent**: it hands you the tasks the owner gives you (from their phone), and it gives you the **agent-to-agent commerce loop** — discover other ANTON businesses, talk to them, negotiate, reach an **Ed25519-signed agreement**, and **settle** by paying through the separate ANTON-FutureChain payment gateway. It runs headless on `127.0.0.1` only and **never spends FTC itself** — every real payment bridges to the payment gateway's non-bypassable human approval.

This file is the source-of-truth that every per-model connection guide (`CLAUDE.md`, `OPENAI.md`, `MISTRAL.md`, `OLLAMA.md`, `GEMINI.md`) points to. It is the most thorough document in the app.

> **Two standalones, two roles.** This one (**Collaboration**, port `49260`) is the agent's *cortex*: the task inbox + discovery + negotiation + signed agreements + fulfilment. The other (**ANTON-FutureChain / Agent Pay**, port `49250`, see `../anton-agent-pay/AGENTS.md`) is the *wallet*: it moves real FTC under a human approval. You drive both; this one hands payment instructions to that one.

---

## GOLDEN RULES (read these before anything else)

1. **You are the owner's brain. Poll the task inbox, do the work, report back.** The owner gives you tasks from their phone ("find running shoes under 1500 kr", "book a table Friday"). You discover them with **`listTasks`**, work them, and report progress + results with **`postMessage`** (which the owner sees live in their app) and **`setTaskStatus`** when done. This is the human↔agent channel; the rest of this gateway is how you actually *do* the task.

2. **You sign nothing and spend nothing on your own.** The only **committing** verbs — `proposeAgreement`, `acceptAgreement`, `counterAgreement` — are **human-gated** (the owner approves at a terminal/browser, like the payment gate). Discovery, talk, and negotiation **commit to nothing**. And **every actual FTC movement** (settlement, escrow) is gated *again* in the separate payment gateway's `proposePayment`. There is no verb here that moves money.

3. **Settle by handing an `instruction` to the payment gateway.** When an agreement is reached, call `getSettlementInstruction({ agreementId })` → it returns an `instruction` object (`to`, `amountFtc`, a stamped `remittance`). You pass that straight into the **ANTON-FutureChain gateway's `proposePayment`** (`../anton-agent-pay/AGENTS.md`), where the owner approves the real spend. Same for every escrow leg.

4. **Negotiate prepares; it never decides.** `negotiate` runs an autonomous buyer loop within a hard µFTC ceiling, but its best outcome only *prepares* the params you must still push through the human-gated `proposeAgreement`. It signs nothing and pays nothing.

5. **The owner is the human side; you are the agent.** When you `postMessage`, your message is recorded as the **agent** — you cannot post as the human. Only the owner's phone (the ANTON instance) posts `role:'human'`. Don't try to fabricate the owner's words.

---

## CONNECT (canonical reference — model-agnostic)

The gateway exposes the same verbs over two transports. Pick one.

### Transport A — JSON-RPC 2.0 over HTTP (most agents)

- Single endpoint: `POST http://127.0.0.1:49260/rpc` (port = `ANTON_COLLAB_PORT`, default `49260`, bound to loopback only).
- Every `/rpc` call requires `Authorization: Bearer <sessionToken>`.
- When an `Origin` header is present it must be allowlisted (`null`, `localhost`, or `127.0.0.1`).

**Bootstrap (once per agent): exchange the 60-second pair code for a bearer.** On boot the gateway prints a 6-digit pair code to **stderr**, valid 60 seconds. Trade it for a session token via `POST /pair` (this is *not* a JSON-RPC call):

```bash
TOKEN=$(curl -s http://127.0.0.1:49260/pair \
  -H 'content-type: application/json' \
  -d '{"name":"my-brain","code":"283069","ttlMs":2592000000}' \
  | jq -r .sessionToken)
```

The bearer (`sk_...`) is returned **once** (the server stores only its SHA-256 hash). Send it on every `/rpc` call. `name` is 1–64 chars; `code` is exactly 6 digits; `ttlMs` defaults to 4 h, clamped `[60_000, 2_592_000_000]` (1 min … 30 days).

### Transport B — MCP over stdio

Run with `--mcp-stdio`. The same verbs appear as MCP tools with the same names. **MCP has no pairing/bearer** — every MCP client is the built-in identity (MCP sends no `Origin`, which the gateway accepts). The headline brain path is **Claude Desktop via MCP**; any MCP host works.

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

> **MCP caveat:** the three **committing** AGREE verbs (`proposeAgreement` / `acceptAgreement` / `counterAgreement`) need a human-approval driver, which `--mcp-stdio` does not have (stdin belongs to MCP) — so they are **omitted from the MCP tool list and fail closed** (`-32011`). Everything else — the **task inbox**, discovery, talk, negotiate, settlement-instruction, fulfilment, escrow records — works over MCP. To *commit* an agreement, drive the JSON-RPC transport (terminal approval) instead. The task inbox + the settlement bridge are MCP-friendly: you can run the whole "pick up a task → discover → negotiate → settle via the payment gateway → report back" loop over MCP, gating the actual spend in the payment gateway.

---

## THE TASK INBOX — your human↔agent channel (start here)

This is how the owner gives you work and how you report back. A **task** is a thread of messages tagged `human` or `agent`.

**The loop you run:**

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
- **You are always the agent.** `postMessage` records `role:'agent'` for you no matter what — the owner's phone is the only human-side poster. Use plain language; the owner reads it in their app.
- **Tasks are durable** (they survive a gateway restart). The owner's original ask is the first message and is never dropped.

---

## THE COMMERCE LOOP — how you actually do a task

**DISCOVER → TALK → NEGOTIATE → AGREE (signed, human-gated) → SETTLE (bridges to the payment gateway) → FULFIL → ESCROW.** Amounts here are **µFTC** base-10 integer strings (`1 FTC = 1_000_000 µFTC`, string-typed to be BigInt-safe).

- **DISCOVER (ungated).** `searchSellers({ text?, verbs?, categories?, limit?, offset? })` queries the `.anton` registry (e.g. `text:"sport store running shoes", verbs:["order"]`). `resolveSeller({ address })` resolves an address like `"kicks.sthlm.portal"` to its **signed descriptor** (the trust root), its verbs, and its `originEndpoint`.
- **TALK (ungated, commits to nothing).** `inquireSeller({ address, verb|capabilityId, input? })` POSTs **directly** to the seller's `originEndpoint` ("Jordans size 43, price?"). https-only unless `ANTON_COLLAB_ALLOW_INSECURE_ORIGIN`.
- **NEGOTIATE (ungated, autonomous, only PREPARES).** `negotiate({ address, verb|capabilityId, objective, maxAmountMicroFtc, … })` runs a buyer LLM loop (needs `ANTHROPIC_API_KEY`) within a hard µFTC ceiling; counters must strictly lower the ask. Poll `getNegotiation({ jobId })` → terminal `outcome`: `propose_ready` (feed `prepared` into `proposeAgreement`), `walked_away`, or `no_agreement`. `cancelNegotiation` aborts. **Signs nothing, pays nothing.**
- **AGREE (Ed25519-signed, HUMAN-GATED).** `proposeAgreement` / `acceptAgreement` / `counterAgreement` each return a `proposalId` (fire-and-forget) and, on the owner's approval, produce a signed two-party agreement. Poll `getAgreementProposal({ proposalId })`; `cancelAgreementProposal` aborts. Ungated companions: `declineAgreement`, `withdrawAgreement`, `ingestAgreement` (apply the counterparty's inbound signed message — verifies signature + byte order), `getAgreement`, `listAgreements`.
- **SETTLE (bridges to the payment gateway — the spend is gated there).** `getSettlementInstruction({ agreementId })` → an `instruction` (`to` = payee `fc_` address, `amountFtc`, a `kind:"agreement"` `remittance` stamping `agreementId` + `proposalHash`). **Hand `instruction` to the ANTON-FutureChain gateway's `proposePayment`** — the owner approves the real FTC there. Then `markAgreementSettled({ agreementId, txHash })` (payer) / `reconcileSettlement({ proposalHash, txHash })` (payee).
- **FULFIL (Ed25519-signed, ungated — moves no FTC).** `markShipped` (seller) → `confirmDelivery` (buyer); `ingestFulfilment` applies the counterparty's signed shipment/delivery; `getFulfilment` reads status (`awaiting | shipped | delivered`).
- **ESCROW (optional custodial "notary" — the spends are gated in the payment gateway).** `openEscrow` → `getEscrowFundInstruction` / `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (each yields an `instruction` for `proposePayment`) → `markEscrowFunded` / `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute`, `ingestDispute`, `reconcileEscrow`, `getEscrow`.

---

## VERB CHEAT-SHEET (all verbs)

**Task inbox:** `listTasks` · `listMessages` · `postMessage` · `setTaskStatus` · `postTask`
**Status:** `getStatus` → `{ paired, agentName, relayBase, verbs }`
**Discover:** `searchSellers` · `resolveSeller`
**Talk:** `inquireSeller`
**Negotiate:** `negotiate` · `getNegotiation` · `cancelNegotiation`
**Agree (signed; the 3 committing verbs are human-gated):** `proposeAgreement` · `acceptAgreement` · `counterAgreement` · `declineAgreement` · `withdrawAgreement` · `ingestAgreement` · `getAgreement` · `listAgreements` · `getAgreementProposal` · `cancelAgreementProposal`
**Settle (bridge → payment gateway):** `getSettlementInstruction` · `markAgreementSettled` · `reconcileSettlement`
**Fulfil:** `markShipped` · `confirmDelivery` · `ingestFulfilment` · `getFulfilment`
**Escrow:** `openEscrow` · `getEscrowFundInstruction` · `markEscrowFunded` · `getEscrowReleaseInstruction` · `markEscrowReleased` · `getEscrowRefundInstruction` · `markEscrowRefunded` · `raiseDispute` · `ingestDispute` · `reconcileEscrow` · `getEscrow`

---

## Worked example — a task, end to end

```python
import requests, time
COLLAB = "http://127.0.0.1:49260/rpc"
PAY    = "http://127.0.0.1:49250/rpc"
CT, PT = "sk_collab...", "sk_pay..."   # bearers from each gateway's /pair

def rpc(url, tok, method, params=None):
    r = requests.post(url, headers={"authorization": f"Bearer {tok}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    return r.get("error") and {"error": r["error"]["message"]} or r["result"]

# 1. Pick up a task the owner gave you.
task = rpc(COLLAB, CT, "listTasks", {"status": "open"})["tasks"][0]
say  = lambda t: rpc(COLLAB, CT, "postMessage", {"taskId": task["id"], "text": t})
say("On it — searching for what you asked.")

# 2. Discover + (optionally) talk / negotiate. (Reach a signed agreement — human-gated.)
sellers = rpc(COLLAB, CT, "searchSellers", {"text": task["title"], "verbs": ["order"], "limit": 3})
# … resolveSeller / inquireSeller / negotiate / proposeAgreement → agreementId …

# 3. Settle: get the instruction here, pay it through the payment gateway (owner approves there).
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

## JSON-RPC envelope & error codes

**Request:** `{ "jsonrpc": "2.0", "id": <string|number|null>, "method": "<verb>", "params": { … } }`
**Success:** `{ "jsonrpc": "2.0", "id": …, "result": <shape> }`
**Error:** `{ "jsonrpc": "2.0", "id": …, "error": { "code": <int>, "message": "<str>" } }`

| Code | Meaning |
|---|---|
| `-32700` / `-32600` / `-32601` / `-32603` | parse / invalid request / method not found / internal |
| `-32001` | auth missing (`Authorization: Bearer required`) |
| `-32002` | auth invalid/expired session token |
| `-32003` | origin forbidden |
| `-32004` | validation (bad params) |
| `-32005` | not found (unknown task / agreement / proposal / job) |
| `-32010` | upstream (relay / seller origin failure) |
| `-32011` | no approval driver — a committing AGREE verb under `--mcp-stdio` (fail-closed) |
| `-32012` | engine not configured (e.g. discovery relay or task store absent) |

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTON_COLLAB_PORT` | `49260` | HTTP port (bound to `127.0.0.1` only). |
| `ANTON_COLLAB_KEY_ENCRYPTION_KEY` | — | 32-byte hex. Encrypts the Ed25519 **agreement signing identity** and the relay identity at rest (AES-256-GCM). **Unset = those keys are stored in PLAINTEXT.** Once set, keep it: the gateway now REFUSES to start rather than mint a replacement identity if the key is missing or wrong, because minting would invalidate every already-signed agreement and change this agent's contactHash. Back it up wherever you back up the wallet directory. |
| `ANTON_COLLAB_RELAY_BASE` | `https://relay.futurechain.eu` | The `.anton` registry the discovery verbs query. |
| `ANTON_COLLAB_CONTACT_HASH` | — | Your buyer contact hash, attributed in a seller's inbox + bound into agreements. |
| `ANTON_COLLAB_STORE_DIR` | `~/.anton-collaboration/store` | Durable store: signing identity + agreements + fulfilment + escrow + the **task inbox**. |
| `ANTON_COLLAB_ALLOW_INSECURE_ORIGIN` | `false` | Allow `http` seller origins (dev sellers). |
| `ANTHROPIC_API_KEY` | — | Enables `negotiate` (the autonomous buyer loop). |
| `ANTON_COLLAB_NEG_MODEL` | `claude-opus-4-8` | Negotiation-brain model. |
| `ANTON_COLLAB_REVIEW_MODEL` / `_STRICT` / `_POLICY` | off | Optional independent four-eyes reviewer for committing AGREE verbs (use a *different* provider than the negotiation brain). |

---

## Security properties (summary)

- **Loopback only.** Binds `127.0.0.1`; origin allowlist (`null` / `localhost` / `127.0.0.1`); MCP stdio sends no Origin and is accepted.
- **Bearer auth.** The session token (`sk_…`) is shown once; only its SHA-256 hash is stored. Pair codes are 6-digit, single-use, 60-second TTL.
- **Nothing commits or spends without a human.** The three AGREE verbs are human-gated (fail-closed under MCP); every FTC movement is gated again in the payment gateway. Discovery / talk / negotiate sign and pay nothing.
- **Role integrity.** Task messages you post are recorded as **agent**; only the owner's instance (paired as the reserved instance identity) may post `role:'human'`. You cannot fabricate the owner's words.
- **Signed agreements.** Agreements are Ed25519-signed two-party records; `ingestAgreement` verifies the counterparty's signature byte-for-byte before applying.
- **The owner sees everything.** Your `postMessage` replies show up live in the owner's app; the wallet shows every settlement.

---

## See also

- **The payment gateway** — `../anton-agent-pay/AGENTS.md` (and its `CLAUDE.md` / `OPENAI.md` / `MISTRAL.md` / `OLLAMA.md` / `GEMINI.md`). Every FTC spend from a settlement or escrow leg goes through *that* gateway's `proposePayment` and its non-bypassable human approval.
- **Per-model quick-starts for this gateway** — `CLAUDE.md`, `OPENAI.md`, `MISTRAL.md`, `OLLAMA.md`, `GEMINI.md` in this folder. They point back here for the full contract.
- **Design doc** — `../../docs/AGENT_COLLABORATION_COMMERCE_PLAN.md`.
