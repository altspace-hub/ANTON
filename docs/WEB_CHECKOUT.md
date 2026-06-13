# Web e-commerce checkout — "Pay with FutureChain"

> Plan item #11 (`docs/INVESTIGATION_AND_PLAN_2026-06-13.md`, Area 7) — **MVP** (Phase 0 + 1 + 2). Phase 3 (hosted multi-tenant + relay fan-out + CMS plugins) is **deferred** — see the bottom of this doc.

A "Pay with FutureChain" button for any web checkout. A thin merchant **gateway** (server) + a thin **JS widget** (browser) over the FutureChain payment rails that already ship in ANTON Pay / Business. It is a Swish-/BTCPay-style flow with one structural difference: **settlement is customer-self-custodial**, and the customer gets the **kvitto in-app *before* paying** (the order envelope rides inside the QR).

---

## Design principle (non-negotiable)

- The customer's **ANTON Pay app is the only key-holder.** The merchant site + this gateway **never sign and never custody.**
- The amount is **sealed server-side** at request creation. The widget holds only a public `requestId` — it never sees the amount, the receiving address, the gateway API key, or any private key.
- "Instant" is **honest states**, never "Paid – final" on a mempool sighting:

  ```
  pending → seen (in mempool / matched)  → confirmed (mined)
          → expired (exp passed, unsettled)
  ```

  `seen` is surfaced **distinctly** from `confirmed`. `confirmed` is the *same* finality the Pay app's `pollConfirmation` waits for.

---

## Integration (merchant)

### 1. Create the request — **on your server** (never the browser)

```http
POST /api/checkout/v1/requests
Authorization: Bearer <your gateway API key>     ← ANTON Settings → FutureChain → Gateway
Content-Type: application/json

{
  "receivingAddress": "fc_…",          // your WATCH-ONLY merchant address (no key)
  "merchantId": "DEMO0001",             // 8-char ADR-004 merchant id (A–Z 0–9)
  "fiatAmount": 110.00,                 // amount in your fiat currency …
  "fiatCurrency": "SEK",
  "fiatRate": 0.1,                      // … FTC per 1 fiat unit, CAPTURED at creation (FX seal)
  "purpose": "RETAIL",                  // ADR-004 v1 purpose (RETAIL/RESTAURANT/EVENT/SERVICE)
  "orderEnvelope": {                    // optional — the kvitto the customer sees BEFORE paying
    "v": 1, "kind": "order", "ref": "ORDER-123",
    "items": [{ "name": "Cappuccino", "qty": 2, "unitPriceSek": 39, "lineTotalSek": 78, "vatRate": 12 }],
    "amountSek": 110.00, "vatSek": 11.79
  },
  "webhookUrl": "https://you.example/anton-hook"   // optional (BTCPay-style HMAC, see below)
}
```

You may pass `amountMicroFtc` (a decimal string of micro-FTC) instead of `fiatAmount` + `fiatRate` for an FTC-native price.

**Response** (the apiKey + the generated webhook secret are **never** returned):

```json
{ "id": "wpr_…", "qrUri": "futurechain:pay?…", "needsAnimated": false, "exp": 1767269700, "status": "pending" }
```

### 2. Drop the widget — **in the browser**, mount by `id`

```html
<script src="https://your-anton/checkout/anton-checkout.js"></script>
<div id="pay"></div>
<script>
  AntonCheckout.mount({
    requestId: "wpr_…",          // from step 1
    el: "#pay",
    baseUrl: "https://your-anton", // optional; defaults to the script's origin
    onSeen:    (s) => {/* mempool sighting — show "payment seen" */},
    onSettled: (s) => {/* confirmed (mined) — fulfil the order */},
    onExpired: (s) => {/* code expired */}
  });
</script>
```

The widget renders the QR (static, or an animated fountain stream for big order-envelope QRs), long-polls `/status`, and fires the callbacks. It never sees the amount or any key.

A working end-to-end demo lives at **`/checkout/demo.html`** (a fake cart that creates a request and mounts the widget).

---

## The sequence

```
checkout page  ──(server, Bearer apiKey)──▶  POST /v1/requests   ─┐
                                                                  │ amount SEALED, FX captured,
                                                                  │ ADR-004 ref + futurechain:pay
                                                                  │ QR built (incl. order envelope),
                                                                  │ row persisted, poller armed
   widget  ◀──{ id, qrUri, needsAnimated, exp }──────────────────┘
   widget renders QR ──▶ customer scans with ANTON Pay
   customer reviews kvitto IN-APP (from the order envelope) ──▶ signs PACS.008 (self-custodial)
   gateway poller reads /iso_received/<merchant_addr> ──▶ MATCH (amount-exact + ref + addr)
        first sighting   →  pending → seen      →  webhook payment.seen      (ANTON-SIG)
        mined            →  seen    → confirmed  →  webhook payment.confirmed (ANTON-SIG)
```

The widget's `/status` GET also drives one poll on each hit, and a background sweeper advances any requests no one is currently watching (every 15s; disable with `WEB_CHECKOUT_SWEEP_DISABLED=true`).

---

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/checkout/v1/requests` | Bearer gateway apiKey | Create a sealed request, build the QR, arm the poller. Returns `{ id, qrUri, needsAnimated, exp, status }`. |
| `GET` | `/api/checkout/v1/requests/:id/status` | public (by id) | Lifecycle state `pending\|seen\|confirmed\|expired\|failed` + `txId`. Drives one poll. The widget long-polls this. |
| `GET` | `/api/checkout/v1/requests/:id/qr.svg` | public (by id) | Server-rendered static QR (keeps the widget dependency-free). |
| `GET` | `/api/checkout/v1/requests/:id/frames` | public (by id) | Pre-rendered animated UR frame SVGs for big (order-envelope) QRs. |

---

## Security model (as built)

- **No key on the merchant.** The merchant supplies a **watch-only receiving address** + a server-side **gateway API key** (validated via the existing `fc-gateway-service.validateApiKey`) + an optional **webhook secret** (generated server-side, never returned). Read-side hub access uses a read-only `X-API-Key` (`WEB_CHECKOUT_HUB_API_KEY`).
- **Amount sealed at creation.** The widget receives only the `id`; the amount lives in the persisted row and in the QR the customer scans.
- **Replay / expiry.** Every request carries `exp` (enforced both client-side in the widget and server-side at the gateway — a stale `pending`/`seen` request lazily flips to `expired` and a late matching tx can **not** resurrect it). The `orderId` is **single-use per merchant** (a duplicate create is hard-refused).
- **Tampered amount cannot confirm.** Detection is **amount-exact** match (plus ADR-004 ref substring + receiving address); a different-amount payment never matches the sealed request. A **multi-match is refused** (two inbound txs sharing amount + ref → manual reconciliation, never an auto-confirm guess).
- **Webhook authenticity (BTCPay `BTCPAY-SIG` pattern).** Each `payment.seen` / `payment.confirmed` POST carries an **`ANTON-SIG: sha256=<hmac>`** header — a timing-safe HMAC-SHA256 over the raw body, keyed by the merchant's per-request webhook secret. Verify it on your side with the same secret before trusting the event. Each event delivers **once**; every attempt is audited in `web_checkout_webhook_deliveries`.

### Honest finality note

`seen` means the payment is in the network (mempool) — **show "payment seen", not "paid".** Only `confirmed` (mined) is final, and it is the same finality the customer's Pay app waits for. FutureChain block-confirmation latency governs the `seen → confirmed` gap; surface it honestly, never collapse the two.

---

## Data model (migration `235_web_checkout.sql`)

- **`web_payment_requests`** — `id`, `merchant_ref`, `amount_micro_ftc` (sealed), `currency`, `fiat_amount`/`fiat_currency`/`fiat_rate` (FX captured at creation), `receiving_address`, `order_envelope` (the kvitto), `ref` (ADR-004 v1), `merchant_id`, `order_id` (unique per merchant — the replay guard), `purpose`, `qr_uri`, `needs_animated`, `status`, `seen_at`, `confirmed_at`, `tx_id`, `webhook_url`/`webhook_secret`/`*_sent`, `metadata`, `created_at`, `expires_at`. Mirrors the Business `Receipt` shape where sensible.
- **`web_checkout_webhook_deliveries`** — one row per dispatch attempt (event, target, the `ANTON-SIG` we sent, HTTP status, ok, error). No secrets stored.

---

## Rails reused vs. newly written

| Rail | Source | Web checkout |
|---|---|---|
| ADR-004 v1 reference | `@futurechain/sdk` `reference.encodeV1` | **reused as-is** (SDK-level, server-callable) |
| AntonRemittance order envelope | `@futurechain/sdk/pacs008` `encodeRemittance` / type | **reused as-is** |
| `futurechain:pay?…` URI builder | `src/business/services/qr.ts` `buildQr` | **ported** into `checkout-service.ts buildPayUri` (pure, but behind the app boundary — copied, not imported; wire format byte-identical) |
| Active-poll detection (amount-exact + ref-substring + addr + multi-match guard) | `src/business/services/received.ts` + `receipts.ts confirmReceiptByMatch` | **ported** into `checkout-service.ts matchInbound` / per-request poller |
| Animated UR encoder (`fc-pay-uri`) | `src/business/services/qr-transfer/encoder.ts` | **ported** into `checkout-qr-encoder.ts` (wire-identical) |
| API-key model | `server/services/fc-gateway-service.ts` `validateApiKey` | **reused** for create auth |
| HMAC webhook (`ANTON-SIG`) | crypto stdlib + BTCPay `BTCPAY-SIG` pattern | **new** (`signWebhook` / `verifyWebhook`, timing-safe) |
| JS widget | — | **new** (`public/checkout/anton-checkout.js`) |

---

## Reference models

- **BTCPay Server** (closest match): self-custodial, invoice → QR → on-chain detection; `BTCPAY-SIG` HMAC webhook; `New → Processing → Settled` = our `pending → seen → confirmed`; API keys server-side only, node watches the chain.
- **Swish Handel**: token → QR → mandatory `callbackUrl` on final state; `payeePaymentReference` = our ADR-004 ref.

**ANTON's edge:** settlement is *customer*-self-custodial, and the customer gets the **kvitto in-app *before* paying** (the `order=` envelope in the QR) — neither Swish nor BTCPay has this.

---

## DEFERRED — Phase 3 (documented follow-up)

These are intentionally **not** in the MVP:

1. **Hosted multi-tenant gateway.** Today `merchant_ref` defaults to the single-tenant `'default'` gateway config. Phase 3 adds a real per-merchant table (merchant id, per-merchant API keys + webhook secrets, per-merchant receiving-address allowlists) so one ANTON instance can host many merchants.
2. **Relay `/v1/checkout/notify` fan-out.** Push settlement notifications through the ANTON relay so a merchant back-office (or a second device) gets the event without polling.
3. **CMS plugins** — **WooCommerce** + **Shopify** "Pay with FutureChain" payment-method extensions that call this gateway and drop the widget at checkout.
4. **SSE** for `/status` (the MVP long-polls; the route already drives a poll per GET — SSE is a latency optimisation).
5. **Hash-chained kvitto persistence** on the gateway side (port of Business `persistReceipt`'s `prevHash` chain) for an audit-defensible merchant-side receipt ledger.

The data model + service are already shaped for these (e.g. `merchant_ref` is a column, not a hardcode), so Phase 3 is additive.
