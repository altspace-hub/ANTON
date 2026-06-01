# Handoff: `/submit_signed_transaction` rejects every payment with `200 {"error":"API key required"}`

**To:** the agent/engineer who owns the **FutureChain light-hub node + Caddy** at `rpc.futurechain.eu` (your own repo — NOT the ANTON wallet repo).
**From:** the ANTON wallet side (Pay / Comm / Business). **Date:** 2026-06-01.
**TL;DR:** After your recent hub update, **Caddy validates the per-install token but no longer hands the node the bearer the node itself still requires**, so the node soft-rejects every signed-tx submit. The wallet apps are correct and need no change. This is a one-line-ish Caddy (or node) fix. Evidence + fix + verify below.

---

## 1. Symptom

Every signed-tx broadcast from a fully-enrolled, attested phone fails. The client gets **HTTP 200** (so your Caddy edge-auth PASSED) but the body is:

```json
{ "error": "API key required", "status": "rejected" }
```

The wallet shows "Payment failed — API key required". No FTC moves. (Verified with the funded test wallet `fc_VQjZM7gjtQF1cUtahiPCLmns31c18yTvyY`, ~3 FTC.)

## 2. Evidence (all reproduced on-device, native HTTP, against `https://rpc.futurechain.eu`)

| Request | Result | Means |
|---|---|---|
| `POST /enroll` (valid UUID) | `200` + `install_token` | enrollment fine |
| `POST /attest` (`X-API-Key` + `DEV_NO_ATTESTATION:<id>`) | `200` + `session_token` | dev attestation IS allowed; fine |
| `POST /submit_signed_transaction` — **no** `X-API-Key` | `401 {"detail":"missing X-API-Key"}` | **Caddy** rejects |
| `POST /submit…` — `X-API-Key` + **no/garbage** `X-Attestation-Token` | `401 {"detail":"attestation required"}` | **Caddy** rejects |
| `POST /submit…` — `X-API-Key` + valid attestation + **garbage body** | `400 "Request body deserialize error: missing field` `id`"` | reached the **NODE**; node parsed the body |
| `POST /submit…` — `X-API-Key` + valid attestation + **real signed tx** | **`200 {"error":"API key required","status":"rejected"}`** | node deserialized OK, then **its own handler rejected** |

The wallet provably sends both headers — SDK request logging on-device showed `hasXApiKey=true hasAtt=true` on the exact failing submit, and the response captured was the 200 body above.

## 3. Root cause (in YOUR repo)

There are two auth layers on the high-risk path:

```
phone → Caddy (forward_auth: per-install X-API-Key + X-Attestation-Token) → futurechain node (its own api-key check: LIGHT_HUB_API_KEYS / legacy DEFAULT_API_KEY)
```

- Caddy is happy (200), so the **per-install** token + attestation are validated at the edge.
- The request reaches the node; the node **deserializes the tx** (the garbage-body 400 proves the body parser runs), then **its own handler checks for the node's internal bearer** (`LIGHT_HUB_API_KEYS`, e.g. `4fc4de10…`) and rejects with `"API key required"` because it isn't getting it.

**Conclusion:** Caddy is no longer injecting the node's internal API key on the upstream hop for `/submit_signed_transaction`. Almost certainly a side effect of the recent hub update (check `git log`/diff on the `Caddyfile` and the node's auth middleware around when "the rpc server was updated").

> Why reads work but submit doesn't: `/iso_received` etc. are served such that the node doesn't enforce its own bearer on them; only `/submit_signed_transaction` does. So the breakage only shows on the write path.

## 4. Where to look

- **Caddyfile** — the `reverse_proxy` block for `/submit_signed_transaction` (and any `forward_auth` + `header_up`). Did a recent change drop the `header_up X-API-Key …` (or equivalent) that injected the node's key on the upstream request? Note the per-install token arrives as `X-API-Key`; if the node reads the SAME header name, Caddy must REPLACE it with the node's key on the upstream hop (or use a different header the node reads).
- **Node submit handler** — the middleware that returns `{"error":"API key required","status":"rejected"}` (grep your node source for that exact string). Confirm which env/header it reads (`LIGHT_HUB_API_KEYS` / `DEFAULT_API_KEY` / `X-API-Key`).
- **systemd unit / env** — `/etc/systemd/system/futurechain-node.service.d/api-keys.conf` (per the ANTON handoff notes) holds the rotated `LIGHT_HUB_API_KEYS` value (`4fc4de10…`); confirm it's still set and matches what Caddy injects.

## 5. Fix (pick one)

1. **Recommended — re-inject the node key in Caddy.** In the `/submit_signed_transaction` route, after `forward_auth` passes, set the upstream header to the node's bearer, e.g.
   ```
   reverse_proxy localhost:<node-port> {
       header_up X-API-Key {env.LIGHT_HUB_API_KEY}   # or whatever header/env the node reads
   }
   ```
   Keeps the per-install model at the edge + the node's defense-in-depth intact.
2. **Teach the node the per-install tokens** — share the enrollment token store with the node so it accepts the same `X-API-Key`, and drop the legacy-bearer requirement.
3. **Disable the node's internal api-key check on the Caddy-only public path** (only if you trust Caddy as the sole gate).

## 6. Reproduce it yourself (no phone needed)

```bash
HUB=https://rpc.futurechain.eu
UUID=$(uuidgen | tr 'A-Z' 'a-z')
TOK=$(curl -s -X POST $HUB/enroll -H 'content-type: application/json' \
  -d "{\"install_id\":\"$UUID\",\"app_version\":\"0.7.5\",\"platform\":\"android\"}" | jq -r .install_token)
SESS=$(curl -s -X POST $HUB/attest -H 'content-type: application/json' -H "X-API-Key: $TOK" \
  -d "{\"play_integrity_token\":\"DEV_NO_ATTESTATION:$UUID\",\"nonce\":\"YWJjZGVmMTIzNDU2\"}" | jq -r .session_token)

# garbage body → 400 "missing field id"  == the NODE's body parser runs (past Caddy)
curl -s -X POST $HUB/submit_signed_transaction -H 'content-type: application/json' \
  -H "X-API-Key: $TOK" -H "X-Attestation-Token: $SESS" -d '{"garbage":true}'

# a REAL/structurally-valid signed tx (deserializes) → today returns
#   {"error":"API key required","status":"rejected"}   <-- the bug
# (use any tx your node will deserialize; the point is it gets PAST parsing to the key check)
```

You can confirm the cause faster by just inspecting the Caddy `/submit` route + the node's api-key middleware (§4) — the curl table already localizes it to "node wants a key Caddy isn't sending."

## 7. Verify the fix

Re-run §6 with a real signed tx (or just have an ANTON Pay phone retry a payment): the submit should return **`200` with `status` ∈ {`queued`,`accepted`}** and a `tx_id` — NOT `{"error":"API key required"}`. The reads (`/iso_received`) already work. **No ANTON app change is needed** once this lands.

---

*Context doc on the ANTON side (full ISO 20022 / receive-history enablement, known-good values): `docs/RPC_SERVER_ENABLEMENT.md` (§6 mirrors this brief).*
