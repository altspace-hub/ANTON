# CLAUDE.md — Anton Collaboration (for Anthropic Claude)

This is a local, **loopback-only** (`127.0.0.1`) JSON-RPC 2.0 + MCP gateway that turns you — Claude — into the **owner's agent cortex**: it hands you the tasks the owner gives you from their phone (a durable **task inbox**), and it gives you the **agent-to-agent commerce loop** (discover sellers → talk → negotiate → reach an Ed25519-signed agreement → settle → fulfil → escrow). It **spends NO FTC itself** — every real payment bridges to the separate **ANTON-FutureChain payment gateway** (`../anton-agent-pay/CLAUDE.md`) and its non-bypassable human approval. Port `49260` (`ANTON_COLLAB_PORT`).

---

## GOLDEN RULES (read before you do anything)

1. **You are the owner's brain — poll the task inbox, do the work, report back.** The owner gives you tasks from their phone ("find running shoes under 1500 kr", "book a table Friday"). You discover them with `listTasks({ since })`, do the work, and report progress + results with `postMessage` (the owner sees it live in their app) and `setTaskStatus({ status:"done" })`. This is the human↔agent channel; the commerce loop is how you actually *do* the task.

2. **You sign nothing and spend nothing on your own.** The only **committing** verbs — `proposeAgreement` / `acceptAgreement` / `counterAgreement` — are **human-gated** (the owner approves at a terminal or browser, just like the payment gate). And **every actual FTC movement** (settlement, every escrow leg) is gated *again* in the separate payment gateway's `proposePayment` + its human approval. There is no verb here that moves money.

3. **Settle by handing `getSettlementInstruction`'s `instruction` to the payment gateway.** When an agreement is reached, `getSettlementInstruction({ agreementId })` returns an `instruction` object (`to`, `amountFtc`, a stamped `remittance`). You pass that straight into the **payment gateway's `proposePayment`** (`../anton-agent-pay/CLAUDE.md`), where the owner approves the real spend. Same for every escrow leg.

4. **Negotiate only PREPARES.** `negotiate` runs an autonomous buyer loop within a hard µFTC ceiling, but its best outcome only *prepares* the params you must still push through the human-gated `proposeAgreement`. It signs nothing and pays nothing.

5. **You post as `agent` only — the owner is the human side.** Every `postMessage` you send is recorded as `role:'agent'`, no matter what. Only the owner's phone (the paired ANTON instance) posts `role:'human'`. Don't try to fabricate the owner's words.

---

## CONNECT — Anthropic Claude

The headline path is **Claude Desktop via MCP over stdio**. Claude API / Claude Code attach over HTTP tool-use.

### Claude Desktop — MCP over stdio (headline path)

Edit `claude_desktop_config.json` (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) and add an `mcpServers` entry:

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

The MCP transport exposes the same verbs as the HTTP path, with the same names. Two things to know:

- **No pairing / no bearer on this path.** MCP stdio sends no `Origin` and the gateway accepts that; every MCP client is the built-in identity.
- **The three committing AGREE verbs are approved in your BROWSER under `--mcp-stdio`.** `proposeAgreement` / `acceptAgreement` / `counterAgreement` need a human-approval driver. Since the MCP transport owns stdin (no terminal `y`), the gateway prints a one-time confirm URL to its terminal — the **web-confirm driver**, the default under `--mcp-stdio` — which you open and Approve/Reject. (Force it anywhere with `ANTON_COLLAB_APPROVAL=web`; use `=terminal` for the y/N prompt. Only if *no* approval driver is wired do these verbs fail closed with `-32011`.) Everything else works over MCP too: the **task inbox**, discovery, talk, negotiate, settlement-instruction, fulfilment, and escrow records. You can run the whole "pick up a task → discover → negotiate → settle via the payment gateway → report back" loop over MCP, gating the actual spend in the payment gateway.

### Claude API / Claude Code — HTTP tool-use

Run the gateway in HTTP mode (omit `--mcp-stdio`): `pnpm --filter @anton/collaboration start:standalone`. It binds `127.0.0.1:49260` (`ANTON_COLLAB_PORT`).

**Bootstrap once per agent** — exchange the 60-second pair code (printed to the gateway's **stderr** on boot) for a bearer:

```bash
TOKEN=$(curl -s http://127.0.0.1:49260/pair -H 'content-type: application/json' \
  -d '{"name":"my-brain","code":"283069","ttlMs":2592000000}' | jq -r .sessionToken)
```

The `sessionToken` (`sk_...`) is returned **once** — store it (the server keeps only its SHA-256 hash). `name` is 1–64 chars; `code` is exactly 6 digits; `ttlMs` defaults to 4 h, clamped `[60_000, 2_592_000_000]` (1 min … 30 days). Send it as `Authorization: Bearer <token>` on every `/rpc` call.

Map each gateway verb 1:1 to a Claude tool; each `tool_use` handler just POSTs `/rpc`:

```python
import requests
H = {"authorization": f"Bearer {TOKEN}", "content-type": "application/json"}
def rpc(method, params=None):
    r = requests.post("http://127.0.0.1:49260/rpc", headers=H,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:
        return {"error": r["error"]["message"]}   # e.g. validation (-32004), no-approval-driver (-32011)
    return r["result"]
# In your tool-use loop: on a tool_use block -> rpc(block.name, block.input)
# -> feed the result back as a tool_result block. On a 'pending' agreement
#    proposal, let Claude call getAgreementProposal again rather than blocking.
```

The one idiom: tool names map 1:1 to RPC methods, so the handler is a single `rpc(block.name, block.input)`.

---

## THE TASK INBOX — your human↔agent channel (start here)

This is how the owner gives you work and how you report back. A **task** is a thread of messages tagged `human` or `agent`.

**Ready-made brain:** [`examples/task-brain.mjs`](./examples/task-brain.mjs) is a ~130-line, dependency-free reference brain — it pairs, polls the inbox, answers each task with an LLM (Anthropic by default, Mistral via `MISTRAL_API_KEY`), and closes it. Run it to make the ANTON Agent phone app usable end-to-end today:
`COLLAB_PAIR_CODE=<boot code> ANTHROPIC_API_KEY=sk-ant-... node examples/task-brain.mjs`. It answers-only (no commerce); extend it with the discover→agree→settle loop below for tasks that need a purchase.

**The loop you run:**

```
1. listTasks({ since: <last_seen_ms> })   -> new/updated tasks the owner gave you
2. for each new task: do the work (discover -> talk -> agree -> settle -> fulfil)
3. postMessage({ taskId, text })          -> progress + the result ("Bought it ✓ tx 0x…")
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
- **Tasks are durable** — they survive a gateway restart. The owner's original ask is the first message and is never dropped.

---

## THE COMMERCE LOOP — how you actually do a task

**DISCOVER → TALK → NEGOTIATE → AGREE (signed, human-gated) → SETTLE (bridges to the payment gateway) → FULFIL → ESCROW.** Amounts here are **µFTC** base-10 integer strings (`1 FTC = 1_000_000 µFTC`, string-typed to be BigInt-safe).

1. **DISCOVER** (ungated) — `searchSellers({ text?, verbs?, categories?, limit?, offset? })` queries the `.anton` registry (e.g. `text:"sport store running shoes", verbs:["order"]`). `resolveSeller({ address })` resolves an address like `"kicks.sthlm.portal"` to its **signed descriptor** (the trust root), its verbs, and its `originEndpoint`.
2. **TALK** (ungated, commits to nothing) — `inquireSeller({ address, verb|capabilityId, input? })` POSTs **directly** to the seller's `originEndpoint` ("Jordans size 43, price?"). https-only unless `ANTON_COLLAB_ALLOW_INSECURE_ORIGIN`.
3. **NEGOTIATE** (ungated, autonomous; only *prepares*) — `negotiate({ address, verb|capabilityId, objective, maxAmountMicroFtc, … })` runs a buyer LLM loop (needs `ANTHROPIC_API_KEY`) within a hard µFTC ceiling; counters must strictly lower the ask. Poll `getNegotiation({ jobId })` → terminal `outcome`: `propose_ready` (feed `prepared` into `proposeAgreement`), `walked_away`, or `no_agreement`. `cancelNegotiation` aborts. **Signs nothing, pays nothing.**
4. **AGREE (Ed25519-signed, HUMAN-GATED)** — `proposeAgreement` / `acceptAgreement` / `counterAgreement` each return a `proposalId` (fire-and-forget) and, on the owner's approval, produce a signed two-party agreement. Poll `getAgreementProposal({ proposalId })`; `cancelAgreementProposal` aborts. **These three committing verbs are the human gate** — under `--mcp-stdio` (no approval driver) they fail closed with `-32011`. Ungated companions: `declineAgreement`, `withdrawAgreement`, `ingestAgreement` (apply the counterparty's inbound signed message — verifies signature + byte order), `getAgreement`, `listAgreements`.
5. **SETTLE (bridges to the payment gateway — the spend is gated there)** — `getSettlementInstruction({ agreementId })` returns an `instruction` (`to` = payee `fc_` address, `amountFtc`, a `kind:"agreement"` `remittance` stamping `agreementId` + `proposalHash`). **Hand `instruction` to the ANTON-FutureChain gateway's `proposePayment`** (`../anton-agent-pay/CLAUDE.md`) — the owner approves the real FTC there. Then `markAgreementSettled({ agreementId, txHash })` (payer) / `reconcileSettlement({ proposalHash, txHash })` (payee).
6. **FULFIL** (Ed25519-signed, ungated — moves no FTC) — `markShipped` (seller) → `confirmDelivery` (buyer); `ingestFulfilment` applies the counterparty's signed shipment/delivery; `getFulfilment` reads status (`awaiting | shipped | delivered`).
7. **ESCROW** (optional custodial "notary" — the actual fund/release/refund SPENDS are gated in the payment gateway) — `openEscrow` → `getEscrowFundInstruction` / `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` (each yields an `instruction` for `proposePayment`) → `markEscrowFunded` / `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute`, `ingestDispute`, `reconcileEscrow`, `getEscrow`.

---

## Worked example — a task, end to end (two bearers, two gateways)

```python
import requests, time
COLLAB = "http://127.0.0.1:49260/rpc"
PAY    = "http://127.0.0.1:49250/rpc"
CT, PT = "sk_collab...", "sk_pay..."   # bearers from each gateway's /pair

def rpc(url, tok, method, params=None):
    r = requests.post(url, headers={"authorization": f"Bearer {tok}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    return {"error": r["error"]["message"]} if "error" in r else r["result"]

# 1. Pick up a task the owner gave you, and acknowledge it (you post as agent).
task = rpc(COLLAB, CT, "listTasks", {"status": "open"})["tasks"][0]
say  = lambda t: rpc(COLLAB, CT, "postMessage", {"taskId": task["id"], "text": t})
say("On it — searching for what you asked.")

# 2. Discover + (optionally) talk / negotiate, then reach a signed agreement.
#    The 3 AGREE verbs are human-gated (HTTP terminal approval; they fail -32011 under MCP).
sellers = rpc(COLLAB, CT, "searchSellers", {"text": task["title"], "verbs": ["order"], "limit": 3})
# … resolveSeller / inquireSeller / negotiate / proposeAgreement -> agreement_id …

# 3. Settle: get the instruction HERE, pay it through the PAYMENT gateway (owner approves there).
instr = rpc(COLLAB, CT, "getSettlementInstruction", {"agreementId": agreement_id})["instruction"]
prop  = rpc(PAY, PT, "proposePayment", instr)            # opens the payment gateway's human gate
pid   = prop["proposalId"]
while (p := rpc(PAY, PT, "getProposal", {"proposalId": pid}))["state"] == "pending":
    time.sleep(1.5)

# 4. Report back with the txId + close the task.
if p["state"] == "sent":
    rpc(COLLAB, CT, "markAgreementSettled", {"agreementId": agreement_id, "txHash": p["txId"]})
    say(f"Bought it ✓  Paid via FutureChain. tx {p['txId']}.")
    rpc(COLLAB, CT, "setTaskStatus", {"taskId": task["id"], "status": "done"})
else:
    say(f"Couldn't complete it — payment {p['state']}.")
```

Note the **two bearers**: `CT` for this collaboration gateway, `PT` for the payment gateway — each from its own `/pair`. The settlement is the bridge: `getSettlementInstruction` here, `proposePayment` there.

---

## VERB CHEAT-SHEET

**Task inbox:** `listTasks` · `listMessages` · `postMessage` · `setTaskStatus` · `postTask`
**Status:** `getStatus` → `{ paired, agentName, relayBase, verbs }`
**Discover:** `searchSellers` · `resolveSeller`
**Talk:** `inquireSeller`
**Negotiate:** `negotiate` · `getNegotiation` · `cancelNegotiation`
**Agree (signed; the 3 committing verbs are human-gated, fail `-32011` under MCP):** `proposeAgreement` · `acceptAgreement` · `counterAgreement` · `declineAgreement` · `withdrawAgreement` · `ingestAgreement` · `getAgreement` · `listAgreements` · `getAgreementProposal` · `cancelAgreementProposal`
**Settle (bridge → payment gateway):** `getSettlementInstruction` · `markAgreementSettled` · `reconcileSettlement`
**Fulfil:** `markShipped` · `confirmDelivery` · `ingestFulfilment` · `getFulfilment`
**Escrow:** `openEscrow` · `getEscrowFundInstruction` · `markEscrowFunded` · `getEscrowReleaseInstruction` · `markEscrowReleased` · `getEscrowRefundInstruction` · `markEscrowRefunded` · `raiseDispute` · `ingestDispute` · `reconcileEscrow` · `getEscrow`

---

## Error codes you may see

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

Full reference: [./AGENTS.md](./AGENTS.md)
