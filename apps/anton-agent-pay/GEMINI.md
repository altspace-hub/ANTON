# GEMINI.md — ANTON-FutureChain Standalone for Google Gemini

This is the onboarding guide for driving the **ANTON-FutureChain Standalone** gateway from **Google Gemini** via function calling. The gateway is a local, **loopback-only** (`127.0.0.1`) JSON-RPC 2.0 + MCP server that lets an AI agent move **real FutureChain (FTC)** under a **non-bypassable human approval**: you (Gemini) declare each gateway verb as a function, and every time the model calls one your handler just `POST`s it to `/rpc`. You can never send money — you can only *propose*; a human approves every payment at a terminal prompt or a browser confirm URL. Treat FTC as real, irreversible money.

---

## GOLDEN RULES (read before you wire anything up)

1. **You can only PROPOSE — a HUMAN approves every payment.** There is no verb that sends FTC and no auto-send path. `proposePayment` opens a human approval prompt: the operator types `y` + Enter at the gateway terminal, **or** clicks Approve at a one-time browser confirm URL (printed to the gateway's **stderr**). If the human does nothing, nothing moves.
2. **Before sending, the wallet pays as `ANTON <addr6>` with a human UltimateDebtor (UBO).** `addr6` is derived from the wallet address — you cannot override who pays. The human owner is disclosed as the PACS.008 `UltmtDbtr`, resolved **server-side from env only** (never an agent parameter). If `AGENT_PAY_UBO_NAME` is not configured, **ask the operator for their full legal name (and country)** and have them set `AGENT_PAY_UBO_NAME` and `AGENT_PAY_UBO_COUNTRY` (ISO-3166 alpha-2, e.g. `SE`) before paying. In this deployment the operator is the user themself. Caveat: the SDK defaults country to `SE` for any party with no country — a non-Swedish owner **must** set `AGENT_PAY_UBO_COUNTRY`.
3. **`proposePayment` is fire-and-forget — POLL `getProposal` until it leaves `pending`.** The call returns a `proposalId` immediately while the human prompt is still open. Do **not** assume success: poll `getProposal({proposalId})` until `state` is `sent` (success, `txId` populated), `rejected` (`rejectReason`), `expired`, or `cancelled`.
4. **Money is real and irreversible — confirm amount + recipient.** Echo the exact `amountFtc` and the full `to` address (`fc_…`) back to the operator before you propose. There is no clawback.

---

## CONNECT (Google Gemini → the gateway)

Gemini attaches to the gateway over **JSON-RPC HTTP**. You declare each verb as a `FunctionDeclaration`; when the model emits a `function_call`, your handler forwards it to `POST http://127.0.0.1:49250/rpc` with a bearer token, then returns the result as a `function_response` Part.

**Step 1 — mint a bearer (once per agent).** The gateway prints a 6-digit pairing code to its **stderr** on boot, valid 60 s. Exchange it for a session token:

```bash
TOKEN=$(curl -s http://127.0.0.1:49250/pair -H 'content-type: application/json' \
  -d '{"code":"483920","name":"gemini-agent"}' | jq -r .sessionToken)
```

The `sessionToken` (`sk_…`) is returned **once** — store it. Send it as `Authorization: Bearer <token>` on every `/rpc` call.

**Step 2 — the shared `rpc()` helper** (the body of every Gemini function handler):

```python
import requests
def rpc(method, params=None):
    r = requests.post("http://127.0.0.1:49250/rpc",
        headers={"authorization": f"Bearer {TOKEN}", "content-type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).json()
    if "error" in r:                       # e.g. spend-cap breach (code -32004)
        return {"error": r["error"]["message"]}
    return r["result"]
```

**Step 3 — declare the verbs and run the tool loop.** Gemini schema types are **UPPERCASE** (`STRING` / `NUMBER` / `INTEGER` / `OBJECT`); `function_call.args` arrives **already as a dict** (no `json.loads`); you continue the turn by returning a `function_response` Part.

```python
from google import genai
from google.genai import types

propose = types.FunctionDeclaration(
    name="proposePayment",
    description="Propose an FTC payment. A human approves; fire-and-forget — poll getProposal.",
    parameters={"type": "OBJECT", "required": ["to", "amountFtc"],
        "properties": {
            "to": {"type": "STRING"},          # payee fc_ address
            "amountFtc": {"type": "NUMBER"},   # decimal FTC, > 0
            "agentNote": {"type": "STRING"},   # display-only in the modal, ≤ 280 chars
            "reference": {"type": "STRING"}}}) # free-text → PACS.008 Ustrd
get_proposal = types.FunctionDeclaration(
    name="getProposal", description="Poll a proposal's state until it leaves 'pending'.",
    parameters={"type": "OBJECT", "required": ["proposalId"],
        "properties": {"proposalId": {"type": "STRING"}}})

cfg = types.GenerateContentConfig(tools=[types.Tool(
    function_declarations=[propose, get_proposal])])  # add the other four verbs likewise
resp = client.models.generate_content(model="gemini-2.0-flash", contents=prompt, config=cfg)

for part in resp.candidates[0].content.parts:
    fc = part.function_call
    if fc:                                              # fc.args is already a dict
        out = rpc(fc.name, dict(fc.args))
        # reply with types.Part.from_function_response(name=fc.name, response={"result": out})
```

> **MCP alternative.** The gateway also speaks MCP over stdio (`pnpm --filter @anton/agent-pay start:standalone --mcp-stdio`) with the same six tools and no pairing. Under `--mcp-stdio` the MCP transport owns stdin, so approval defaults to the **browser** confirm URL (printed to stderr; set `AGENT_PAY_WEB_CONFIRM_AUTOOPEN=true` to auto-open). Use this path if your Gemini runtime is an MCP host; otherwise use the HTTP path above.

---

## VERB CHEAT-SHEET (the six tools)

| Verb | Params | Returns (shape) |
|---|---|---|
| `getStatus` | `{}` | `{ paired, walletAddress, balanceFtc, lastSeenBlock }` |
| `getBalance` | `{}` | `{ balanceFtc }` |
| `listTransactions` | `{ limit? }` (int 1–200, default 25) | `[{ txId, amount, direction:"in"\|"out", counterparty, ts, confirmed }]` |
| `proposePayment` | `{ to, amountFtc, agentNote?, reference?, remittance?, ttlMs? }` | `{ proposalId, expiresAt }` — **fire-and-forget** |
| `getProposal` | `{ proposalId }` | `{ state, txId?, rejectReason? }` |
| `cancelProposal` | `{ proposalId }` | `{ state:"cancelled" }` (only if still `pending`) |

`proposePayment` params: `to` (REQUIRED, must start with `fc_`), `amountFtc` (REQUIRED, number > 0, **decimal FTC not satoshi**), `agentNote` (optional ≤ 280 chars, **display-only in the modal, never on-wire**), `reference` (optional free-text, rides on-wire as PACS.008 `Ustrd` — unless a `remittance` is set), `remittance` (optional structured object, see below), `ttlMs` (optional modal lifetime, default 60000, clamped `[10000, 300000]`).

`getProposal` states: `pending → approved → sent` (happy path) or `pending → rejected | expired | cancelled` (terminal). `txId` is present only when `state === "sent"`; `rejectReason` on `rejected` / `expired`.

**The one synchronous rejection.** A spend-cap breach (or any param/remittance validation failure) returns a JSON-RPC `error` **immediately**, before any modal opens — code `-32004`, e.g. `"amount 9 FTC exceeds the per-payment cap of 5 FTC"` or `"this payment (9 FTC) would exceed the 24h cap of 25 FTC …"`. Caps are code, not prompt: you cannot talk past them. Other useful codes: `-32005` not-found (unknown proposal), `-32002` invalid/expired bearer.

---

## "Send FTC" — worked example (propose → poll → txId)

```python
# 1) PROPOSE — returns immediately; the human prompt opens at the gateway.
res = rpc("proposePayment", {
    "to": "fc_VQjZM7abc...", "amountFtc": 2.5,
    "agentNote": "invoice #4021", "reference": "PO-7781"})
# -> {"proposalId": "p_...", "expiresAt": 1234567890123}
# (or, on a cap breach: {"error": "amount ... exceeds the per-payment cap ..."} — stop here.)

pid = res["proposalId"]

# 2) POLL — do NOT assume sent. Loop until state leaves "pending".
import time
while True:
    st = rpc("getProposal", {"proposalId": pid})
    if st["state"] != "pending":
        break
    time.sleep(1.5)

# 3) OUTCOME
if st["state"] == "sent":
    print("Broadcast:", st["txId"])          # success — on-chain tx id
elif st["state"] == "rejected":
    print("Rejected:", st.get("rejectReason"))
else:
    print("Ended:", st["state"])             # expired or cancelled
```

To abort a still-pending proposal (e.g. the human walked away), call `rpc("cancelProposal", {"proposalId": pid})` → `{ "state": "cancelled" }`.

---

## Contracts & structured remittance (PACS.008)

Instead of a flat `reference`, you can attach a **structured `remittance`** object that maps 1:1 onto a `v=1 AntonRemittance` and lands in the PACS.008 `RmtInf` field. **A structured `remittance` wins over `reference`** — when a remittance is set, `reference` is ignored on-wire.

At this gateway layer the remittance `kind` is one of four enum values — `order | invoice | agreement | message`:

- The agent-facing **remittance kinds** invoice / quote / agreement / receipt / info / donation / freetext all flow through these four enum values: `invoice` (itemised, via `items`); `agreement` (lightweight contract via `decision`/`terms`); and **quote, receipt, info, donation and freetext all map onto `message`** (free-text Note, with `ref` / `items` as appropriate). There are no separate quote/receipt/info/donation/freetext enum values at this layer.
- **`kind` is inferred when omitted:** `items` present → `invoice`; `decision` or `terms` present → `agreement`; otherwise → `message`.

Remittance fields (all optional, `additionalProperties` rejected):

| Field | Type / cap | Notes |
|---|---|---|
| `kind` | `"order" \| "invoice" \| "agreement" \| "message"` | Inferred if omitted (see above). |
| `ref` | string ≤ 140 | Your reference / document number. |
| `items` | array ≤ 50 | Each: `name` (≤ 200, **required**), `qty` (**required**), `unitPriceSek?`, `lineTotalSek?`, `vatRate?`, `sku?` (≤ 64). |
| `amountSek` | number | Agent's *stated* SEK total — shown as "Stated total" in the modal; **not** the FTC the human authorises. |
| `vatSek` | number | Stated VAT. |
| `message` | string ≤ 2000 | Free-text (the `message` kind). |
| `decision` | string ≤ 2000 | What the parties agreed (lightweight contract). |
| `terms` | string ≤ 4000 | Clauses / terms. |
| `meta` | `Record<string,string>` | ≤ 24 keys; key ≤ 64 chars, value ≤ 500 chars. |

The on-wire labels are `Order / Invoice / Agreement / Note`. File attachments are deliberately **not** exposed to agents. The modal shows a human summary (label + `#ref`, up to 12 item lines, the stated total, and `Agreed: / Terms: / Message:` lines). The amount the human authorises is always `amountFtc` — `amountSek` is informational only.

Example:

```python
rpc("proposePayment", {
    "to": "fc_VQjZM7abc...", "amountFtc": 2.5,
    "remittance": {
        "kind": "invoice", "ref": "INV-4021",
        "items": [{"name": "Consulting, March", "qty": 3, "unitPriceSek": 1500}],
        "amountSek": 4500, "vatSek": 1125}})
```

---

## Talking in collaboration (agent-to-agent commerce)

For the full discover → negotiate → agree → settle → fulfil loop there is a **separate standalone** — **ANTON Collaboration** — its **own process, own port (default `49260`, `ANTON_COLLAB_PORT`), own pairing** (`POST /pair`, 6-digit code to stderr, bearer on every `/rpc`). It never spends FTC itself; every actual spend is gated back in this Agent Pay gateway via `proposePayment`.

The commerce loop and its verbs:

- **DISCOVER** (ungated): `searchSellers` (free-text + required commerce verb + category) → `resolveSeller` (signed descriptor = trust root; `originEndpoint` is where talk goes).
- **TALK** (ungated, commits to nothing): `inquireSeller` — POSTs directly to the seller's `originEndpoint` ("ask the store: size 43, price?").
- **NEGOTIATE** (ungated; only **prepares** a proposal, signs/spends nothing — needs `ANTHROPIC_API_KEY`): `negotiate` runs an autonomous buyer loop within a hard `maxAmountMicroFtc` ceiling → `getNegotiation` (poll; on `propose_ready` feed `prepared` into `proposeAgreement`) → `cancelNegotiation`.
- **AGREE** (Ed25519-signed, **human-gated**; return a `proposalId`, poll `getAgreementProposal`): `proposeAgreement` / `acceptAgreement` / `counterAgreement`. `ingestAgreement` applies the counterparty's inbound signed messages (ungated). Amounts here are **µFTC** base-10 integer strings (1 FTC = 1,000,000 µFTC).
- **SETTLE** (bridges to this gateway): `getSettlementInstruction` returns a read-only `instruction` (payee `to`, `amountFtc`, and a PACS.008 remittance stamping `meta:{ agreementId, proposalHash }`) — **hand `instruction` to Agent Pay's `proposePayment`**, which opens *this* gateway's human gate. Then `markAgreementSettled` (payer records txHash) / `reconcileSettlement` (payee matches an inbound payment by `proposalHash`).
- **FULFIL** (Ed25519-signed, ungated, moves no FTC): `markShipped` → `confirmDelivery` (with `ingestFulfilment` / `getFulfilment`).
- **ESCROW** (optional custodial "notary" — the spends are gated in Agent Pay): `openEscrow` → `getEscrowFundInstruction` → `markEscrowFunded` → `getEscrowReleaseInstruction` / `getEscrowRefundInstruction` → `markEscrowReleased` / `markEscrowRefunded`, with `raiseDispute`.

The human gate is the same invariant: only `proposeAgreement` / `acceptAgreement` / `counterAgreement` commit (human-gated), and every real FTC spend — settlement, escrow fund/release/refund — is gated separately by **Agent Pay's** `proposePayment`. Under `--mcp-stdio` the three committing AGREE verbs are omitted (no approval driver → fail-closed `-32011`).

---

**Full reference: [`./AGENTS.md`](./AGENTS.md)** — the complete, authoritative agent-facing contract (every verb, every param, error codes, the full state machine, env vars, and the non-bypassable approval design).
