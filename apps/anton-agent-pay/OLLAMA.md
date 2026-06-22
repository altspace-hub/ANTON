# Ollama — driving the ANTON-FutureChain gateway with a fully-local model

This is the onboarding for connecting a **local Ollama model with tool support** (`llama3.1`, `qwen2.5`, `mistral-nemo`, …) to the **ANTON-FutureChain Standalone** — a local, **loopback-only** JSON-RPC + MCP gateway that lets an AI agent move **real FTC** under a **non-bypassable human approval**. The whole loop stays on one box: Ollama serves the model on `localhost:11434`, the gateway binds `127.0.0.1:49250`, and the wallet keys never leave the machine. The model calls each tool through Ollama's `/api/chat` `tools` field; your tool handler POSTs the matching verb to the gateway's `POST /rpc`. **The only thing that ever leaves the box is the signed FTC transaction, broadcast to the FutureChain RPC node — and only after a human has typed `y` or clicked Approve.**

---

## GOLDEN RULES — read before you wire anything

1. **You can only PROPOSE. A HUMAN approves every payment.** There is no verb that sends FTC. `proposePayment` opens an approval prompt — the operator either types `y` in the gateway terminal, or opens a one-time `http://127.0.0.1:<port>/confirm/<secret>` URL printed to **stderr** and clicks **Approve / Reject**. There is **no auto-send**, no allow-list, no "remember this agent."
2. **The wallet pays as `"ANTON <addr6>"` with a human as the Ultimate Debtor (UBO).** The on-wire debtor name is derived from the wallet address — you cannot override who pays. The human owner is disclosed as `UltmtDbtr`, resolved **server-side from env only**: `AGENT_PAY_UBO_NAME` (legal name) and `AGENT_PAY_UBO_COUNTRY` (ISO 3166 alpha-2). **If `AGENT_PAY_UBO_NAME` is not configured, ASK THE OPERATOR for their full legal name (and country) and have them set `AGENT_PAY_UBO_NAME` / `AGENT_PAY_UBO_COUNTRY`** — in this deployment the operator is the user themself. (Caveat: with no country set, the SDK stamps **`SE`** by default — a non-Swedish owner *must* set `AGENT_PAY_UBO_COUNTRY`.)
3. **`proposePayment` is fire-and-forget — POLL `getProposal`.** It returns a `proposalId` immediately while the human-approval prompt opens. The payment is **not** sent yet. Poll `getProposal` until `state` leaves `pending` (`sent` with `txId` / `rejected` with `rejectReason` / `expired` / `cancelled`). Never assume a propose call meant the money moved.
4. **Money is real and irreversible.** FTC on-chain payments cannot be clawed back. **Confirm the amount and the recipient address** with the operator before you propose. `amountFtc` is decimal FTC (not satoshi); `to` must start with `fc_`.

> The caps are code, not prompt. Optional `AGENT_PAY_MAX_PER_PAYMENT_FTC` and `AGENT_PAY_MAX_DAILY_FTC` ceilings are enforced **before** the approval prompt even opens; a breach is the **single synchronous rejection** — a JSON-RPC `error` with code `-32004` you get back instantly. You cannot talk your way past it.

---

## CONNECT — attaching a local Ollama model

Ollama exposes tool-capable models via `/api/chat` with a `tools` field that takes OpenAI-shaped function declarations. Only **tool-trained** models populate tool calls (`llama3.1`, `qwen2.5`, `mistral-nemo`); base/uninstruct models will not. The non-obvious Ollama idiom: **`tool_calls[].function.arguments` is already a Python dict** — no `json.loads()`.

```bash
# 1) start the local model server
ollama serve                 # serves http://localhost:11434
ollama pull qwen2.5          # or llama3.1 / mistral-nemo — a tool-capable model

# 2) start the gateway (first run imports a wallet from a BIP-39 mnemonic; never overwrites)
AGENT_PAY_MNEMONIC="word1 word2 ... word12" \
AGENT_PAY_UBO_NAME="Daniel Bardun" \
AGENT_PAY_UBO_COUNTRY="SE" \
AGENT_PAY_MAX_PER_PAYMENT_FTC=5 \
AGENT_PAY_MAX_DAILY_FTC=25 \
pnpm --filter @anton/agent-pay start:standalone
# prints the 60s pair code + the JSON-RPC URL to stderr
```

Bootstrap the bearer once (the pair code prints on gateway boot, valid 60s), then drive the model:

```python
import time, requests, ollama

BASE  = "http://127.0.0.1:49250"
TOKEN = requests.post(f"{BASE}/pair",
    json={"code": "483920", "name": "ollama-agent"}).json()["sessionToken"]

def rpc(method, params=None):
    """Body of every tool handler: POST one JSON-RPC verb to the gateway."""
    r = requests.post(f"{BASE}/rpc",
        headers={"authorization": f"Bearer {TOKEN}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. a spend-cap breach (-32004)
        return {"error": r["error"]["message"]}
    return r["result"]

tools = [{
  "type": "function",
  "function": {
    "name": "proposePayment",
    "description": "Propose an FTC payment. A human approves it; you must poll getProposal.",
    "parameters": {"type": "object", "required": ["to", "amountFtc"],
      "properties": {
        "to":        {"type": "string", "description": "payee fc_ address"},
        "amountFtc": {"type": "number", "description": "decimal FTC, > 0"},
        "agentNote": {"type": "string", "description": "≤280 chars, display-only in the modal"},
        "reference": {"type": "string", "description": "free-text → PACS.008 Ustrd"}}}}},
  {"type": "function", "function": {"name": "getProposal",
    "parameters": {"type": "object", "required": ["proposalId"],
      "properties": {"proposalId": {"type": "string"}}}}}]

msgs = [{"role": "user", "content": "Pay fc_VEH4mJb5...Qs 2.5 FTC for invoice #4021."}]
resp = ollama.chat(model="qwen2.5", messages=msgs, tools=tools)
for tc in resp.message.tool_calls or []:
    out = rpc(tc.function.name, tc.function.arguments)   # arguments is ALREADY a dict
    msgs.append({"role": "tool", "content": __import__("json").dumps(out)})
```

> **MCP-over-stdio alternative.** The same six tools are also exposed over MCP if you run the gateway with `--mcp-stdio`. There is no Ollama-native MCP client today, so for local Ollama the **JSON-RPC path above is the supported route**. (Under `--mcp-stdio` the gateway has no pairing and defaults to **browser** approval, because the MCP transport owns stdin.)

---

## VERB CHEAT-SHEET (the six tools)

| Verb | Params | Returns |
|---|---|---|
| `getStatus` | `{}` | `{ paired, walletAddress, balanceFtc, lastSeenBlock }` |
| `getBalance` | `{}` | `{ balanceFtc }` |
| `listTransactions` | `{ limit? }` (1–200, default 25) | `[{ txId, amount, direction, counterparty, ts, confirmed }]` |
| `proposePayment` | `{ to, amountFtc, agentNote?, reference?, remittance?, ttlMs? }` | `{ proposalId, expiresAt }` — fire-and-forget |
| `getProposal` | `{ proposalId }` | `{ state, txId?, rejectReason? }` — poll until `state ≠ pending` |
| `cancelProposal` | `{ proposalId }` | `{ state: "cancelled" }` — only while still pending |

`proposePayment` params: `to` (REQUIRED, must start with `fc_`), `amountFtc` (REQUIRED, number > 0, decimal FTC), `agentNote` (optional, ≤280 chars, display-only in the modal — **not** sent on-wire), `reference` (optional free-text → PACS.008 unstructured `Ustrd`), `remittance` (optional structured object — see below), `ttlMs` (optional modal lifetime, default `60000`, clamped `[10000, 300000]`).

`getProposal` states: `pending → approved → sent` (happy path) or `pending → rejected | expired | cancelled` (terminal). `txId` is present **only** when `state === "sent"`; `rejectReason` is present on `rejected` / `expired`.

---

## "Send FTC" — the worked propose → poll → txId loop

```python
# 1) propose — returns immediately; the human-approval prompt opens in the gateway
pid = rpc("proposePayment", {
    "to": "fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs",
    "amountFtc": 2.5,
    "agentNote": "invoice #4021",
})
# → {"proposalId": "p_...", "expiresAt": 1234567890123}
#   (or {"error": "amount 9 FTC exceeds the per-payment cap of 5 FTC"} — synchronous cap breach)

# 2) poll getProposal until it leaves "pending" (operator types y / clicks Approve)
while True:
    p = rpc("getProposal", {"proposalId": pid["proposalId"]})
    if p["state"] != "pending":
        break
    time.sleep(1)

# 3) read the outcome
if p["state"] == "sent":
    print("on-chain:", p["txId"])
else:
    print(p["state"], p.get("rejectReason"))   # rejected / expired / cancelled
```

There is no way to shortcut step 2. If the proposal expires before the operator decides, re-propose.

---

## Contracts & structured remittance (PACS.008)

For an invoice, order, or lightweight agreement, attach a **structured `remittance`** object instead of (or alongside) a free-text `reference`. It maps 1:1 onto a `v=1 AntonRemittance` and is placed in the PACS.008 `RmtInf` (structured) field. **A structured `remittance` wins over `reference`** — `reference` is only used (as unstructured `Ustrd`) when no `remittance` is set.

The agent terminology you'll see — invoice / quote / agreement / receipt / info / donation / freetext — all flows through **four** wire-level remittance kinds. The schema's `kind` enum is `"order" | "invoice" | "agreement" | "message"`, **inferred when omitted**: `items` present → `invoice`; `decision` or `terms` present → `agreement`; otherwise → `message`. So quote, receipt, info, donation, and freetext all map onto `order` / `invoice` / `agreement` / `message` via the fields you populate (`ref`, `items`, `message`).

`remittance` fields (all optional; unknown fields rejected):

| Field | Type / cap | Notes |
|---|---|---|
| `kind` | `"order"\|"invoice"\|"agreement"\|"message"` | Inferred when omitted (see above). |
| `ref` | string ≤ 140 | Your document / reference number. |
| `items` | array ≤ 50 | Each: `name` (≤200, **required**), `qty` (number, **required**), `unitPriceSek?`, `lineTotalSek?`, `vatRate?`, `sku?` (≤64). |
| `amountSek` | number | The agent's *stated* SEK total — shown in the modal, **not** the FTC the human authorises. |
| `vatSek` | number | Stated VAT. |
| `message` | string ≤ 2000 | Free-text (the `message` kind). |
| `decision` | string ≤ 2000 | What the parties agreed (lightweight contract). |
| `terms` | string ≤ 4000 | Clauses / terms. |
| `meta` | `Record<string,string>` | ≤ 24 keys; key ≤ 64 chars, value ≤ 500 chars. |

```python
pid = rpc("proposePayment", {
    "to": "fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs",
    "amountFtc": 2.5,
    "remittance": {
        "kind": "invoice",
        "ref": "INV-4021",
        "items": [{"name": "Consulting, June", "qty": 1, "lineTotalSek": 2500}],
        "amountSek": 2500,
    },
})
```

> File attachments are deliberately **not** exposed to agents. `agentNote` is never put on-wire.

---

## Talking in collaboration

Moving money is one half; **finding a counterparty and reaching a signed agreement first** is the other. That lives in a **separate standalone** — **ANTON Collaboration** — its own process, own port (default `49260`, `ANTON_COLLAB_PORT`), own pairing. It never spends FTC itself: every actual FTC spend is gated back through **this** gateway's `proposePayment`. The commerce loop is:

**discover** (`searchSellers` → `resolveSeller`) → **talk** (`inquireSeller`, ungated) → **negotiate** (`negotiate` → `getNegotiation`, an *ungated* autonomous buyer LLM loop that only **prepares** params — it signs nothing, spends nothing) → **agree** (`proposeAgreement` / `acceptAgreement` / `counterAgreement` — Ed25519-signed, **human-gated**) → **settle** (`getSettlementInstruction` builds an instruction you hand to **this gateway's `proposePayment`**; then `markAgreementSettled` / `reconcileSettlement` record the txHash) → **fulfil** (`markShipped` → `confirmDelivery`) → optional **escrow** (custodial notary: `openEscrow` → fund → `release` / `refund`, with `raiseDispute`).

Two human gates, one principle: Collaboration gates the **signing** of an agreement; this gateway gates the **spend**. A local Ollama model can run discover/talk/negotiate fully locally; only `negotiate` needs an `ANTHROPIC_API_KEY` for the buyer brain. See that standalone's own docs for its full verb set.

---

## Full reference: [`./AGENTS.md`](./AGENTS.md)

This file is the Ollama quick-start. For the complete agent-facing contract — every error code, the exact proposal state machine, pairing/bearer mechanics, the UBO resolution rules, the full env-var table, and the non-bypassable approval internals — read **[`./AGENTS.md`](./AGENTS.md)**.
