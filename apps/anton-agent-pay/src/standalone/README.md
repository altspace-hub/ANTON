# ANTON-FutureChain Standalone

A headless payment gateway that lets **external AI agents** — Claude Desktop, OpenCLAW,
LangGraph, or any cURL / Python script — propose and send **FutureChain (FTC)** payments,
**without** the Agent Pay desktop (Electron) app.

It reuses the proven Agent Pay core verbatim — the JSON-RPC server, the MCP server, the
proposal state machine, pairing/bearer auth, and the real on-chain submit
(`@futurechain/sdk`) — and adds only the things a headless deployment needs:

- **A human approval boundary** — every payment must be approved by the operator, in one of
  two modes:
  - **Terminal** (`CliModalDriver`, default for the JSON-RPC transport) — the payment prints
    a summary in *your* terminal and waits for you to type `y`.
  - **Browser** (`WebConfirmModalDriver`, default under `--mcp-stdio`) — the payment prints a
    one-time confirm **URL** to your terminal; you open it and click **Approve / Reject**
    (typing the wallet passphrase if the wallet is protected). Needed because in `--mcp-stdio`
    mode the MCP transport owns stdin, so terminal keystrokes aren't available.
  Either way: no auto-approve, no allow-list, no "remember this agent". This is the safety boundary.
- **Hard spend caps** — optional per-payment and rolling-24h ceilings, enforced in code
  **before** the approval prompt is even shown.

> **Trust model.** The agent can *ask*. Only the human (typed `y` or a browser click) can
> *approve*. The caps are a second, code-level backstop that the model cannot talk its way past.

---

## Quick start

```bash
# from the repo root
pnpm --filter @anton/agent-pay install

# first run: import a wallet from a BIP-39 mnemonic (never overwrites an existing one)
AGENT_PAY_MNEMONIC="word1 word2 ... word12" \
AGENT_PAY_MAX_PER_PAYMENT_FTC=5 \
AGENT_PAY_MAX_DAILY_FTC=25 \
pnpm --filter @anton/agent-pay start:standalone
```

On boot it prints (to **stderr**, so stdout stays clean for MCP):

```
════════════════════════════════════════════════════════════════
 ANTON-FutureChain Standalone — agent payment gateway
════════════════════════════════════════════════════════════════
 JSON-RPC:   http://127.0.0.1:49250/rpc        (127.0.0.1 only)
 Pair:       POST http://127.0.0.1:49250/pair
 Pair code:  483920    (valid 60s)
 Wallet:     ready
 Caps:       per-payment 5 FTC · 24h 25 FTC
 Approval:   every payment needs a typed "y" in THIS terminal — no bypass
════════════════════════════════════════════════════════════════
```

When an agent later proposes a payment, **this** terminal shows:

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠  PAYMENT APPROVAL REQUIRED — an AI agent wants to send FTC │
└─────────────────────────────────────────────────────────────┘
   Agent:        claude-desktop  (paired 2m ago)
   To:           fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs
   Amount:       2.5 FTC   (fee ~0.001 FTC)
   Balance after: 22.5 FTC
   Agent note:   "invoice #4021"  (agent-supplied, not verified)
   ─────────────────────────────────────────────────────────────
   Approve this payment?  type  y  + Enter   (anything else rejects)
   >
```

Type `y` → it submits on-chain. Anything else (or no answer before the proposal's TTL) → rejected.

---

## Configuration (env)

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_PAY_PORT` | `49250` | HTTP port (bound to `127.0.0.1` only) |
| `AGENT_PAY_WALLET_DIR` | `~/.anton-fc-standalone` | Where the encrypted wallet file lives |
| `AGENT_PAY_MNEMONIC` | — | BIP-39 mnemonic to import **on first run only** (never overwrites) |
| `AGENT_PAY_MAX_PER_PAYMENT_FTC` | ∞ | Reject any single payment above this |
| `AGENT_PAY_MAX_DAILY_FTC` | ∞ | Reject when (sent **or in-flight** in the last 24h) + this payment would exceed it — counts pending/approved value so a burst can't be approved past the ceiling |
| `AGENT_PAY_APPROVAL` | `terminal`, or `web` under `--mcp-stdio` | Force the approval mode: `terminal` (type `y`) or `web` (browser click) |
| `AGENT_PAY_WEB_CONFIRM_AUTOOPEN` | `false` | In `web` mode, best-effort auto-open the browser to the confirm URL |
| `AGENT_PAY_NODE_URL` | public RPC | FutureChain RPC endpoint |
| `AGENT_PAY_API_KEY` | — | Bearer for auth-required submit endpoints (e.g. a hosted relay) |

---

## Pairing (one-time per agent)

Every JSON-RPC call needs a session bearer minted from the 60-second pair code:

```bash
# exchange the pair code for a session bearer
curl -s http://127.0.0.1:49250/pair \
  -H 'content-type: application/json' \
  -d '{"code":"483920","name":"my-script"}'
# → {"agentId":"a_...","sessionToken":"sk_....","expiresAt": 1234567890}
```

Use `sessionToken` as `Authorization: Bearer sk_...` on every subsequent call. Bearers
expire after 4h by default (`ttlMs` on the pair call can extend up to 30 days).

---

## Transport A — JSON-RPC 2.0 over HTTP

Point any agent / script at `POST /rpc`. Methods mirror the MCP tools:
`getStatus`, `getBalance`, `listTransactions`, `proposePayment`, `getProposal`, `cancelProposal`.

> **proposePayment is fire-and-forget.** It returns a `proposalId` **immediately** while the
> approval prompt opens in the gateway terminal. You then **poll `getProposal`** until its
> `state` leaves `pending` → `sent` (with `txId`), `rejected` (with `rejectReason`), or
> `expired`. A spend-cap breach is the one synchronous rejection: `proposePayment` returns a
> JSON-RPC `error` right away, before any prompt is shown.

### cURL

```bash
TOKEN=sk_xxxxxxxx

# read-only: balance
curl -s http://127.0.0.1:49250/rpc -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":{}}'

# propose a payment → returns a proposalId immediately; approve in the gateway terminal
curl -s http://127.0.0.1:49250/rpc -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"proposePayment",
       "params":{"to":"fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs",
                 "amountFtc":2.5,"agentNote":"invoice #4021"}}'
# → {"jsonrpc":"2.0","id":2,"result":{"proposalId":"p_...","expiresAt": 1234567890}}
#   (or {"error":{"code":-32004,"message":"...per-payment cap..."}} if a cap was hit)

# then poll for the outcome (after you type y in the gateway terminal)
curl -s http://127.0.0.1:49250/rpc -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"getProposal","params":{"proposalId":"p_..."}}'
# → {"jsonrpc":"2.0","id":3,"result":{"state":"sent","txId":"0x..."}}
#   (or {"state":"rejected","rejectReason":"..."} / {"state":"expired"})
```

### Python

```python
import time, requests

BASE = "http://127.0.0.1:49250"

# 1. pair
token = requests.post(f"{BASE}/pair",
    json={"code": "483920", "name": "py-agent"}).json()["sessionToken"]
H = {"authorization": f"Bearer {token}"}

def rpc(method, params=None):
    r = requests.post(f"{BASE}/rpc", headers=H,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})
    r.raise_for_status()
    body = r.json()
    if "error" in body:               # e.g. a spend-cap rejection
        raise RuntimeError(body["error"]["message"])
    return body["result"]

print(rpc("getBalance"))

# propose → returns immediately; the human approves in the gateway terminal
pid = rpc("proposePayment", {
    "to": "fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs",
    "amountFtc": 2.5,
    "agentNote": "invoice #4021",
})["proposalId"]

# poll until the proposal leaves "pending"
while True:
    p = rpc("getProposal", {"proposalId": pid})
    if p["state"] != "pending":
        break
    time.sleep(1)
print(p["state"], p.get("txId") or p.get("rejectReason"))
```

---

## Transport B — MCP over stdio (Claude Desktop)

Run with `--mcp-stdio` to expose the same tools over the Model Context Protocol:

```jsonc
// claude_desktop_config.json  →  "mcpServers"
{
  "anton-futurechain": {
    "command": "pnpm",
    "args": ["--filter", "@anton/agent-pay", "start:standalone", "--mcp-stdio"],
    "env": {
      "AGENT_PAY_WALLET_DIR": "/Users/you/.anton-fc-standalone",
      "AGENT_PAY_MAX_PER_PAYMENT_FTC": "5",
      "AGENT_PAY_MAX_DAILY_FTC": "25"
    }
  }
}
```

Claude Desktop then sees the FutureChain payment tools and can call `proposePayment`.

### Approving in the browser (stdio mode)

In `--mcp-stdio` mode the MCP transport owns **stdin**, so terminal `y`-approval isn't
possible — the gateway automatically uses the **browser** approval driver. When Claude
proposes a payment, the gateway prints a one-time confirm URL to its **stderr** (visible in
Claude Desktop's MCP server logs / the launching terminal):

```
  ⚠  PAYMENT APPROVAL REQUIRED — an AI agent wants to send FTC
     Agent:  claude-desktop  (paired just now)
     To:     fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs
     Amount: 2.5 FTC  (fee ~0.001 FTC)
     → Approve or reject in your browser:
       http://127.0.0.1:49250/confirm/UkhT3...e9
```

Open that URL, review the payment, and click **Approve** (or **Reject**). Set
`AGENT_PAY_WEB_CONFIRM_AUTOOPEN=true` to have the gateway open your browser automatically.

How it stays safe — two independent secrets + a hardened browser wall:
- The **confirmSecret** in the URL path is a single-use 256-bit capability, printed only to
  the operator's stderr (never stdout — which MCP owns — never any log) and never returned by
  any `/rpc` method. The agent can't learn or guess it.
- A second **pageNonce** is embedded in the served page and must be echoed back on the POST,
  so even a same-origin/rebinding failure can't drive a blind approval.
- The decision POST also requires a loopback **Host**, an allowlisted **Origin**, and
  `Sec-Fetch-Site: same-origin`; it accepts **no bearer**; the page is served under a locked
  `Content-Security-Policy` with `X-Frame-Options: DENY` (no clickjacking). Single-use,
  TTL-bound, fail-closed (anything malformed → reject).

---

## Security properties (what holds, by construction)

- **127.0.0.1 only.** The HTTP server never binds a public interface.
- **Bearer per agent.** No call without a token minted from a fresh, 60s pair code.
- **Human-in-the-loop, non-bypassable.** Every send funnels through the *same*
  `ModalDriver.promptForDecision` the Electron app uses; the standalone wires the terminal
  *or* browser driver — there is no code path that sends without one.
- **Caps are code, not prompt.** `maxPerPaymentFtc` / `maxDailyFtc` are checked in
  `ProposalStore.propose()` **before** the modal; the agent cannot argue around them. The 24h
  cap counts **sent + in-flight** (pending/approved) value, so a burst of concurrent proposals
  can't be approved past the ceiling; value is released when a proposal is rejected/expired/cancelled.
- **No ghost payments.** A payment is submitted on-chain **only** if `approve()` lands on
  `approved`; if the agent cancelled or the TTL expired between the modal opening and the
  operator's click, the submit is skipped (both transports share one `runModalFlow`).
- **No secrets on stdout / in logs.** The wallet passphrase (terminal: read on its own line;
  browser: posted over loopback only) is never echoed; the confirm URL, banner, and prompts
  go to stderr only. The agent's `getProposal` never exposes the confirm secret.

See `docs/ANTON_AGENT_PAY_SPEC.md` for the full Agent Pay design this builds on.
