# FutureChain Hub (rpc.futurechain.eu) — Enablement Brief for ISO 20022 + Payment Messages

**Audience:** the engineer/agent who owns the FutureChain light-hub node + its
Caddy front door (the `rpc.futurechain.eu` repo — NOT this ANTON repo).
**Author:** ANTON app side (Pay / Comm / Business wallets).
**Date:** 2026-06-01.
**Goal:** make the **ISO 20022 receive history** and the **PACS.008 payment
message/remittance** ("the iso and message thing") actually function on phones,
end-to-end, so a recipient sees *who paid, how much, and the attached note/order*
— not just a balance delta.

The ANTON wallet apps were just fixed app-side to call the hub over **native
HTTP** (Capacitor), which bypasses the browser CORS layer. So **reads already
work today** (balance + UTXOs are live on-device). What still does **not** work
is everything that depends on the hub **storing and serving the ISO/PACS.008
envelope**. That's all on the hub side. This brief is the punch list.

---

## 1. Observed state today (live probes, 2026-06-01)

```
GET /health           → 200  { status:"healthy", test_mode:false,
                               two_tier_storage:true, signing:"client-side",
                               cors:"enabled", version:"FutureChain PACS.008 v55" }
GET /info             → 200  { chain_height:~810528, node_type:"Standard",
                               iso_storage_enabled:FALSE,  iso_data_size_mb:0 }   ← (A)
GET /balance/{addr}   → 200  { balance, balance_ftc, utxo_count }     ✅ works
GET /get_utxos/{addr} → 200  [ {tx_id, output_index, address, amount, block_height} ]  ✅ works
GET /iso_received/{a} → 405  "HTTP method not allowed"                ← (B)

# CORS (browser path — only matters for PWA/web, native apps bypass it):
GET /balance/{addr}   (no Origin)               → 200                 ✅
GET /balance/{addr}   (Origin: https://localhost) → 403
                       "CORS request forbidden: origin not allowed"   ← (C)
```

The three gaps to close are **(A)**, **(B)**, **(C)**.

---

## 2. What to enable

### (A) Turn on ISO two-tier storage — THE blocker

`/info` reports `two_tier_storage:true` but `iso_storage_enabled:false` and
`iso_data_size_mb:0`. So the node accepts signed txs and moves UTXOs, but it is
**not persisting the PACS.008 ISO 20022 envelope** (debtor, creditor, amount,
`RmtInf` remittance, structured `RmtInf.Strd` ANTON order block). Without that,
there is no receive history and no payment message to serve.

**Action:** enable ISO storage on this node (the "ISO/archive tier" of the
two-tier store) so that for every admitted `submit_signed_transaction`, the node
**stores the full signed PACS.008 document keyed by recipient address** (and by
`tx_id`/UETR). Standard nodes currently default this off — flip it on for this
hub (config flag / `--iso-storage` / `ISO_STORAGE_ENABLED=true`, whatever the
node uses), and confirm `/info` then shows `iso_storage_enabled:true`.

> Note: `submit_signed_transaction` already carries the complete PACS.008 in
> `encrypted_data`/the signed tx body (the client builds it via
> `@futurechain/sdk/pacs008`), so the node has the message at submit time — it
> just needs to **retain** it in the ISO tier instead of dropping it after the
> UTXO update.

### (B) Serve `GET /iso_received/{address}` (currently 405)

Once (A) is on, the read endpoint must return the stored envelopes:

```
GET /iso_received/{address}
→ 200  application/json
  [ { /* full PACS.008 doc */ }, ... ]   // or { transactions: [...] } / { items: [...] }
```

The app parser accepts a plain array **or** `{transactions|items|received|data: [...]}`,
and walks these field paths per item (so emit whichever is natural, but include
these):

| Field | PACS.008 path the app reads (first match wins) |
|---|---|
| tx id | `tx_id` / `txid` / `id` / `document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].PmtId.TxId` |
| sender addr | `from_address` / `document…CdtTrfTxInf[0].DbtrAcct.Id.Othr.Id` |
| sender name | `document…CdtTrfTxInf[0].Dbtr.Nm` |
| amount (FTC) | `document…CdtTrfTxInf[0].IntrBkSttlmAmt.$value` (or `amount_raw` satoshi) |
| remittance | `document…CdtTrfTxInf[0].RmtInf.Ustrd` (unstructured) |
| **structured note/order** | `document…CdtTrfTxInf[0].RmtInf.Strd` ← **the "message thing"** |
| timestamp | `document…GrpHdr.CreDtTm` |

The **`RmtInf` block (esp. `Strd`)** is what carries the customer's order
details / note. The Business app decodes it via `decodeRemittance()` to
auto-confirm a sale; the Pay/Comm apps show it as the payment's remittance. **If
the node strips `RmtInf` before storing, the message is lost** — store the
envelope verbatim.

`405` today means the route is method-gated or disabled. Make `GET` the verb and
return the records. Return `200 []` (empty array) for an address with no
history (not 405/404), so the client cleanly shows "no transactions yet."

### (B′) `/iso_received` is now a CREDENTIALED read

The apps were updated so `GET /iso_received/{addr}` carries credentials, because
it returns payee PII (names, notes), unlike the public `/balance` + `/get_utxos`:

```
GET /iso_received/{address}
  X-API-Key:           <per-install token from POST /enroll>
  X-Attestation-Token: <session token from POST /attest>   (Pay/Comm; Business is keyless)
```

So the node MAY gate `/iso_received` behind the install token (+ attestation) and
attribute/scope the data to the caller. If you prefer it public for now, that's
fine — the apps send the headers but a public handler can ignore them. Just
don't *reject* a request merely for carrying `X-API-Key` on a GET.
(Business constructs its client without a key, so it sends none — keep the
endpoint working for the keyless case too.)

### (C) Add the Capacitor origins to the CORS allowlist

Native apps now use CapacitorHttp and **don't need CORS**, so this is **not
blocking the phones**. But it IS needed for:
- the **PWA / web** build of any ANTON surface served from a browser,
- anyone hitting the hub from a desktop ANTON web UI,
- and it's correct hygiene (the 403 string is alarming in logs).

**Action:** in Caddy's CORS config, add to the allowed-origins list:
```
https://localhost          # Android Capacitor WebView origin
capacitor://localhost      # iOS Capacitor scheme
ionic://localhost          # legacy iOS scheme (optional)
http://localhost:5183      # ANTON web/PWA dev (and the prod web origin, if any)
```
and reflect them in `Access-Control-Allow-Origin` with
`Access-Control-Allow-Headers: Content-Type, X-API-Key, X-Attestation-Token`,
`Access-Control-Allow-Methods: GET, POST, OPTIONS`, plus an `OPTIONS` preflight
204. Today the hub returns **403 "CORS request forbidden: origin not allowed"**
for `Origin: https://localhost`.

---

## 3. The full request contract the apps now use (for reference)

Public reads (no auth): `GET /balance/{addr}`, `GET /get_utxos/{addr}`,
`GET /transaction/{id}`, `GET /info`, `GET /health`.

Credentialed: `GET /iso_received/{addr}` (X-API-Key + X-Attestation-Token),
`POST /submit_signed_transaction` (X-API-Key + X-Attestation-Token),
`POST /enroll` (open, rate-limited), `POST /register_address` (X-API-Key),
`POST /attest` (X-API-Key + Play-Integrity token).

Enrollment (`POST /enroll {install_id, app_version, platform}` →
`{install_token}`) and attestation (`POST /attest {play_integrity_token, nonce}`
→ `{session_token, expires_in}`) must work over plain HTTPS — the apps call them
via native HTTP, so CORS won't block them, but confirm they're reachable and not
500-ing.

**For testing without Play Integrity:** the apps fall back to a dev attestation
token `DEV_NO_ATTESTATION:<install_id>` when the native plugin is absent. The hub
accepts it ONLY when `BAHNHOF_DEV_ATTESTATION_ALLOWED=true`. Set that on a
staging hub so we can exercise the credentialed `/iso_received` + submit path
from dev builds; leave it OFF in production.

---

## 4. Verification (run after enabling)

```bash
# (A) ISO storage on:
curl -s https://rpc.futurechain.eu/info | jq .storage_info.iso_storage_enabled   # → true

# (B) ISO read serves an array (use an address that has received a tx):
curl -s https://rpc.futurechain.eu/iso_received/fc_VQjZM7gjtQF1cUtahiPCLmns31c18yTvyY
# → 200 [ {... PACS.008 with RmtInf ...} ]   (or 200 [] if none yet)

# (C) CORS for the Capacitor origin:
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://localhost" \
     https://rpc.futurechain.eu/balance/fc_VQjZM7gjtQF1cUtahiPCLmns31c18yTvyY     # → 200, with ACAO header
```

End-to-end success looks like: a payer (ANTON Pay) sends to a recipient
(ANTON Business/Comm); the recipient polls `/iso_received/{their addr}` and sees
the new PACS.008 with the sender, amount, AND the `RmtInf` note/order — at which
point Business auto-confirms the matching receipt and Comm shows the remittance.

---

## 5. Known-good reference values

- Funded test address (Pay): `fc_VQjZM7gjtQF1cUtahiPCLmns31c18yTvyY`
  (balance currently ~3 FTC, UTXOs present — good for `/get_utxos` + `/iso_received` checks once ISO is on).
- Comm wallet: `fc_VGkekymcJ7srVZw4tbMudv5fdVfgMLtznm` (balance 0).
- Business merchant wallet: `fc_VZYefGH…QB8dL5` (balance 0; receives sales).

Anything ANTON-app-side that needs to change to match your final contract
(field names, auth model on `/iso_received`, error codes) — tell the ANTON side
and we'll adapt the parser in `src/{pay,comm,business}/services/received.ts` and
the SDK `RpcClient`.
