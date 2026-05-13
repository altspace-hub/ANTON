# CLAUDE_ANTON_BUSINESS.md
## ANTON Business — Technical Specification & Build Plan

**Document version:** 1.0
**Date:** 13 May 2026
**Owner:** Daniel Bardun, FutureChain AB
**Audience:** Claude Code (and any future contributors)
**Status:** Draft — read this end-to-end before writing code

---

## How to use this document

This is a forward-looking specification for the ANTON Business application. It is structured so that Claude Code can:

1. Understand **what is being built and why** (Sections 1–3).
2. Make **informed architectural decisions** (Sections 4–6).
3. Implement features with **clear contracts** to existing FutureChain infrastructure (Sections 7–12).
4. Follow **compliance, security, and UX** constraints that are non-negotiable (Sections 13–16).
5. Execute the **phased roadmap** from v1.0 MVP through v2.0 (Section 17).
6. Track **open decisions** that need product input from DB before being closed (Section 19).

When in doubt, refer to the parent documents:

- `GO_LIVE_PLAN_RETAIL_MERCHANT_2026.md` — strategic context and distribution plan.
- `MERCHANT_ONBOARDING_FLOW.md` — the operational onboarding sequence the app must support.
- `CLAUDE_FUTURECHAIN.md` and `CLAUDE_PROJECT_CONTEXT.md` — core blockchain context.
- `API_DOCUMENTATION.md` and `API_REFERENCE.md` — FutureChain RPC contracts.
- `iso20022_pacs008.rs` — canonical PACS.008 data structures.

---

## 1. Project overview

### 1.1 What is ANTON Business?

ANTON Business is the merchant-facing application of the FutureChain ecosystem. Where ANTON Wallet is the consumer-side application for holding and spending FTC (and where ANTON the AI assistant is the agentic application), ANTON Business is the application a small business uses to **receive FTC payments**, **reconcile them**, **issue compliant receipts**, and **settle into SEK via Safello** when desired.

It exists because:

- Cafés, restaurants, student bars, market stalls, charities, and small-format merchants need a payment-acceptance tool, not a developer SDK.
- Visa and Mastercard take 1.5–3% of every transaction; Swish takes 1–2 SEK per transaction and lacks structured remittance. FutureChain charges 0.1% with a 0.1 FTC cap and offers ISO 20022-native data.
- The closed-loop community distribution strategy (see `GO_LIVE_PLAN_RETAIL_MERCHANT_2026.md`) cannot succeed without a merchant tool that is as simple as a Swish-QR for a Swedish business owner.

### 1.2 What ANTON Business is not

It is **not**:

- A consumer wallet (that's ANTON Wallet).
- An AI assistant (that's ANTON the agent).
- A bank or money-service business in its own right (FutureChain is the network operator; the merchant is the business).
- A POS hardware system (it integrates with existing POS in v2.0, but does not replace them).
- A custodial service (the merchant holds their own keys; FutureChain never holds merchant funds).

### 1.3 Why build it as a separate app

Two reasons:

1. **Mental model.** A merchant on shift does not want to navigate an AI assistant to take payment. A consumer at a bar does not want their wallet cluttered with refund and settlement UI. Separation simplifies both products.
2. **Operational risk.** A merchant device runs all day in a bar with multiple staff. Key isolation, session policies, and refund permissions need stricter handling than a consumer device.

The two apps **share a TypeScript SDK** (`@futurechain/sdk`) that wraps wallet creation, signing, and transaction submission, so business logic and PACS.008 handling are not duplicated.

---

## 2. Strategic context

ANTON Business is the **product unlock** for the retail/merchant distribution track. The go-live plan depends on having a working merchant app by Phase B (Q3 2026 private beta).

Key constraints driven by strategy:

- **Phase B beta partners are student unions and co-working spaces** with bars, cafés, and event use cases. The simple/extended modes are designed for these scenarios first.
- **Safello is the primary fiat off-ramp.** Auto-convert is a first-class feature, not an afterthought.
- **Skatteverket compliance is mandatory.** A merchant cannot use a payment tool in Sweden without issuing compliant kvitto. If we ship without receipt generation, merchants cannot legally use us as their primary payment method.
- **Phase 1 PACS.008 remittance is 140 characters.** The reference encoding (Section 11) must fit within this.
- **Pre-mempool Heimdall screening is non-bypassable.** The app must surface Heimdall outcomes (accepted/rejected) clearly without leaking sensitive compliance detail to merchants.

---

## 3. Where we are heading (the longer arc)

This is the multi-version vision so Claude Code understands which decisions are short-term and which need to be future-proof.

### 3.1 v1.0 — Standalone merchant app (Phase B beta, Q3 2026)

Simple and Extended modes. PWA or React Native. Local-only itemisation. Safello auto-convert. Email kvitto. Single device per merchant initially.

### 3.2 v1.1 — Multi-device and merchant dashboard (Phase C, Q4 2026)

Multiple staff devices per merchant, each signing with a sub-key. Web-based merchant dashboard for reconciliation, reporting, refund management. Configurable VAT handling.

### 3.3 v2.0 — POS integration and API (Q1–Q2 2027)

Merchant API for programmatic invoice creation. Native integrations with Caspeco, Sitoo, and iZettle. Webhook events. Subscriptions and recurring billing.

### 3.4 v3.0 — Open Agent SDK and embedded payments (H2 2027)

ANTON Business primitives exposed to AI agents (ANTON-style assistants making merchant-side payments and refunds on behalf of operators). Embedded payments for SaaS using FutureChain rails. Cross-merchant loyalty/reward primitives.

The data model and API contracts in this document are designed so that v1.0 does not foreclose v3.0.

---

## 4. Architecture overview

### 4.1 High-level diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MERCHANT DEVICE (PWA / native)                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │   UI (React)     │  │  Local SQLite    │  │  Secure storage  │   │
│  │  Simple/Extended │  │  - merchants     │  │  - private key   │   │
│  │  Receipt viewer  │  │  - invoices      │  │  (secure enclave)│   │
│  │  Reports         │  │  - line items    │  │                  │   │
│  └────────┬─────────┘  │  - settlements   │  └──────────────────┘   │
│           │            └──────────────────┘                         │
│  ┌────────▼──────────────────────────────────────────────────────┐  │
│  │              @futurechain/sdk (TypeScript)                    │  │
│  │  - PACS.008 builder        - Signing (secp256k1, WebCrypto)   │  │
│  │  - QR encoder/decoder      - Submission to RPC                │  │
│  │  - Reference encoder       - Settlement reconciliation        │  │
│  └────────┬──────────────────────────────────────────────────────┘  │
└───────────┼─────────────────────────────────────────────────────────┘
            │ HTTPS (TLS 1.3)
            ▼
┌───────────────────────────────────┐  ┌──────────────────────────────┐
│      FutureChain RPC node         │  │   Merchant Backend (NEW)     │
│  POST /submit_pacs008_batch       │  │   - KYB record store         │
│  GET  /transactions/:address      │  │   - Settlement orchestration │
│  GET  /transaction/:uetr          │  │   - Email kvitto delivery    │
│  GET  /balance/:address           │  │   - Safello auto-convert     │
│                                   │  │   - Webhook delivery (v2.0)  │
└────────────┬──────────────────────┘  └──────────┬───────────────────┘
             │                                    │
             ▼                                    ▼
       ┌──────────┐                       ┌──────────────┐
       │ Heimdall │                       │   Safello    │
       │ (368 pat.)│                      │   Exchange   │
       └──────────┘                       └──────────────┘
```

### 4.2 Key architectural decisions

| # | Decision | Rationale |
|---|---|---|
| AD-01 | Standalone app, not a mode in ANTON Wallet | Different mental model; tighter operational controls; separate update cadence |
| AD-02 | PWA for v1.0; React Native for v1.1+ | Fastest time-to-beta; one codebase; can graduate to native when feature set stabilises |
| AD-03 | Client-side PACS.008 construction and signing | Aligns with existing FutureChain wallet model; merchant keys never leave device; matches `create_sign_and_submit_pacs008` flow in `main.rs` |
| AD-04 | Local SQLite for line items and merchant state | Itemised data is not on-chain (Phase 1 has 140-char remittance); local persistence with optional backend sync |
| AD-05 | Shared TypeScript SDK with ANTON Wallet | Single source of truth for PACS.008 construction, signing, RPC calls |
| AD-06 | Separate Merchant Backend service | Settlement orchestration with Safello, email delivery, and (v2.0) webhook delivery cannot live on-device |
| AD-07 | secp256k1 signing via WebCrypto / @noble/secp256k1 | Cross-platform JS implementation matching FutureChain core |
| AD-08 | EIP-191-style message signing for non-transaction operations (settlement instructions, refund authorisations) | Standard wallet pattern; reuses existing key without exposing it |
| AD-09 | Heimdall is opaque to the merchant; rejections surface as friendly errors | Tipping-off prohibition under Penningtvättslagen; merchant should never see why a customer's transaction was rejected |
| AD-10 | Receipt generation is mandatory and synchronous on confirmed transactions | Skatteverket compliance is non-negotiable; no async/best-effort behaviour |

### 4.3 Components to build

This spec produces three deliverables:

1. **`anton-business-app`** — the mobile/PWA front-end (React + TypeScript).
2. **`@futurechain/sdk`** — shared TypeScript SDK (publishable to npm or internal registry; used by ANTON Wallet too).
3. **`merchant-backend`** — server-side service for settlement, email, KYB lookups (Node.js + TypeScript, or Rust if we want monorepo alignment).

The FutureChain core (`futurechain` Rust crate) is unchanged for v1.0. Any new endpoints needed are listed in Section 8.

---

## 5. Technology stack

### 5.1 v1.0 recommendation

| Layer | Choice | Rationale |
|---|---|---|
| App framework | React 18 + TypeScript 5 | Mature, well-known, fast iteration |
| PWA shell | Vite + workbox-vite | Fast builds; offline-capable; installable |
| State management | Zustand or TanStack Query | Lightweight; works well with async RPC |
| UI library | shadcn/ui + Tailwind | Composable; merchant-friendly aesthetic |
| QR generation | `qrcode` (npm) | Battle-tested; SVG and canvas output |
| Crypto | `@noble/secp256k1`, `@noble/hashes` | Audited; no native deps; works in browser |
| Local DB | SQLite via `@sqlite.org/sqlite-wasm` (PWA) or `expo-sqlite` (RN later) | Reliable; same schema across platforms |
| HTTP client | `ky` or native `fetch` | Simple; supports retry and timeout |
| PDF generation | `pdf-lib` or `pdfmake` | Receipt PDF generation on-device |
| Email (server) | Resend or Postmark | Reliable transactional email; Swedish-friendly |
| Backend framework | Hono (Node.js or Bun runtime) | Lightweight, fast; or Axum if we want Rust |
| Backend DB | PostgreSQL via Prisma | Standard; aligns with existing FutureChain audit DB |

### 5.2 Why PWA first

- **One codebase, two stores.** PWA installs on iOS (Safari → Add to Home Screen) and Android (Chrome → Install). No App Store review for v1.0.
- **Faster iteration.** Push updates without users reinstalling.
- **Camera and notifications available.** PWAs can use the camera for refund-by-scan and push notifications for incoming payments on supported browsers.
- **Graduate path is clean.** React + TypeScript → React Native + Expo with most logic reusable; the SDK is unchanged.

Limitations to accept for v1.0:
- iOS PWA does not have rock-solid background notifications.
- Secure enclave access on iOS PWA is limited to Web Crypto API; for higher-trust merchants we'll need native in v1.1+.

### 5.3 Why not Tauri Mobile for v1.0

Tauri Mobile is Rust-based and would align beautifully with the FutureChain core. We considered it. The reason we're starting elsewhere: Tauri Mobile is still maturing as of 2026-05, and the iOS toolchain is the part most likely to bite us. We'll re-evaluate Tauri Mobile for v1.1.

---

## 6. Project structure

Proposed monorepo layout (use pnpm workspaces or Nx):

```
anton-business/
├── apps/
│   ├── anton-business-app/        # The PWA front-end
│   │   ├── src/
│   │   │   ├── routes/            # File-based routing
│   │   │   │   ├── simple.tsx
│   │   │   │   ├── extended.tsx
│   │   │   │   ├── transactions.tsx
│   │   │   │   ├── settlements.tsx
│   │   │   │   ├── reports.tsx
│   │   │   │   └── settings.tsx
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   ├── stores/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── merchant-backend/          # The settlement and orchestration service
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   │   ├── safello.ts
│       │   │   ├── email.ts
│       │   │   ├── kyb.ts
│       │   │   └── reconciliation.ts
│       │   └── db/
│       ├── prisma/
│       └── package.json
│
├── packages/
│   ├── futurechain-sdk/           # Shared TS SDK
│   │   ├── src/
│   │   │   ├── pacs008/
│   │   │   ├── wallet/
│   │   │   ├── rpc/
│   │   │   ├── reference/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── shared-types/              # Cross-cutting TS types
│   └── shared-ui/                 # Reusable UI components (used by ANTON Wallet too)
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

Coding conventions:

- TypeScript strict mode everywhere. No `any` without a `// eslint-disable-next-line` and a comment.
- Prettier + ESLint. Pre-commit hook via Husky.
- All public functions in `futurechain-sdk` have JSDoc.
- All money values handled as integer FTC micro-units (1 FTC = 1,000,000 micro-FTC) to avoid floating-point. Display layer converts.
- All currency conversions explicit: never silently assume SEK or FTC.

---

## 7. Core feature specifications (v1.0)

### 7.1 Simple mode

**User flow:**

1. Merchant opens app, lands on Simple mode (configurable default; can be set to Extended).
2. Numeric keypad displayed. Merchant taps amount in SEK (or in FTC if configured).
3. Optional: tap a "category" pill (e.g., "Bar", "Kitchen", "Merch") for end-of-day categorisation.
4. Tap "Generate QR" → QR code displayed full-screen with amount and current FTC/SEK conversion.
5. Customer scans with ANTON Wallet → confirms → pays.
6. Merchant device polls (or receives push) for confirmation.
7. On confirmation: success animation, transaction added to history, optional kvitto email prompt.
8. Tap "Next" to return to keypad.

**Inputs:**

- Amount (required, in SEK or FTC).
- Category (optional, from configurable list).
- Memo (optional, free text, ≤ 50 chars — included in receipt but not in PACS.008 reference).

**Outputs:**

- On-screen QR code containing the payment URI (see Section 9 for format).
- A pending invoice record in local DB with auto-generated `order_id`.
- On confirmation, a transaction record linked to the invoice.

**Edge cases to handle:**

- Network offline during QR generation → allow generation, queue confirmation polling for when network returns.
- Network offline during scan → customer's wallet will fail to submit; merchant sees "Awaiting confirmation" with retry.
- Customer scans an old QR (already paid) → ANTON Wallet should reject (out of scope for this app, but the QR includes a unique order_id so the network rejects double-pay).
- Amount of 0 → reject with friendly error.

### 7.2 Extended mode

**User flow:**

1. Merchant opens Extended mode. Empty cart shown.
2. Merchant taps "Add item":
   - From a saved item list (e.g., "Glass of house wine — 50 SEK"), or
   - Custom (name, unit price, quantity).
3. Cart updates with running total in SEK and FTC.
4. Merchant can adjust quantity, remove items, apply a discount (percentage or amount).
5. VAT calculated automatically based on per-item VAT rate (configured per saved item or set per transaction).
6. Tap "Charge" → QR code displayed with total.
7. Same confirmation flow as Simple mode.
8. On confirmation, the full itemised cart is stored locally and included in the email kvitto.

**Inputs:**

- Items (name, unit price, quantity, VAT rate).
- Discount (optional, percentage or fixed amount).
- Memo (optional).

**Outputs:**

- Detailed invoice record with line items, totals, VAT breakdown.
- QR code (same format as Simple, with a marker in the reference indicating extended mode).
- Optional email kvitto with itemised lines.

**Saved item list:**

- Merchant configures item list in Settings.
- Per item: name, default unit price, default VAT rate (0%, 6%, 12%, 25% — Swedish standard rates), category.
- Items are local to device for v1.0; synced via merchant-backend in v1.1.

### 7.3 Receipts (kvitto)

**Triggered by:** Successful transaction confirmation (block depth ≥ 1 for instant receipt; block depth ≥ 6 for "final" status update — but kvitto issued on first confirmation).

**Delivery options (offered to customer at point of sale, before they tap "Pay" in ANTON Wallet):**

- Email (customer enters address in their wallet at payment time, app-to-app via the payment URI).
- SMS (Phase 2).
- "No receipt" — kvitto still generated and stored locally per Skatteverket; customer can scan a follow-up QR to retrieve.

**Receipt content (Skatteverket-compliant per Bokföringslagen):**

- Header: merchant name, org. nr., address, kvitto number (sequential).
- Date and time of transaction.
- Items (Extended mode) or amount (Simple mode).
- VAT breakdown by rate.
- Total in SEK (and FTC, with applied rate).
- Payment method: "FutureChain Token (FTC)".
- Transaction reference (the UETR).
- Optional QR code linking to a verifiable on-chain record.

**Storage:**

- Local DB on merchant device (mandatory; retention 7 years).
- Optionally on merchant-backend if merchant opts into cloud backup.
- PDF generated on demand from the stored record.

### 7.4 Refunds

**User flow:**

1. Merchant opens Transactions screen.
2. Selects a transaction.
3. Taps "Refund". Two options:
   - **Full refund** — entire original amount.
   - **Partial refund** — enter amount ≤ original.
4. Confirms with PIN (set at app onboarding) or biometric.
5. App constructs a new PACS.008 with merchant as debtor and original customer as creditor.
6. Reference encoded as `R:<original_tx_uetr>` (see Section 11).
7. Heimdall screens the refund (yes, even refunds — for sanctions on the recipient).
8. On confirmation, both original and refund linked in local DB.

**Constraints:**

- Refunds can only be issued from the original merchant device or merchant-backend (in v1.1+).
- Refund cannot exceed sum of (original amount – any prior refunds).
- Refund window: 90 days (configurable per merchant) — beyond that, manual support.
- Refunds generate a credit kvitto (kreditnota) per Bokföringslagen.

### 7.5 Daily settlement and reconciliation

**Settlement modes (chosen at onboarding, changeable in Settings):**

- **Hold mode.** All FTC stays in the merchant wallet. Merchant manages conversion manually.
- **Auto-convert mode.** At a configured time (default 23:00 Stockholm), all FTC above a threshold (default 1,000) is sent to Safello and converted to SEK, then transferred to the merchant's linked bank account.
- **Hybrid mode.** Hold up to N FTC; auto-convert anything above N.

**Settlement orchestration:**

- Runs on merchant-backend, not on-device (the device may be off at 23:00).
- Backend reads merchant wallet balance via FutureChain RPC.
- Constructs a PACS.008 with merchant as debtor, Safello-provided merchant receiving address as creditor.
- Signs with merchant key (this requires the merchant to have authorised the backend with a delegation signature — see Section 13).
- Submits to FutureChain. On confirmation, calls Safello convert API to swap FTC → SEK at agreed rate.
- Safello pays out to merchant's SEK bank account on T+0 or T+1 per Safello terms.
- Backend emits a settlement record visible in the app's Settlements screen.

**Reconciliation report (end of day):**

- Triggered after settlement completes (or 24:00 if no settlement).
- PDF generated with:
  - Transaction summary (count, total FTC, total SEK).
  - VAT breakdown.
  - Refund summary.
  - Settlement summary (if applicable).
  - Comparison to merchant's expected pattern (any anomalies flagged).
- Emailed to merchant's registered address.

### 7.6 Settings

Categories:

- **Profile.** Merchant name, org. nr., address (read-only after onboarding; changes require KYB refresh).
- **Settlement.** Mode, threshold, Safello account, bank account.
- **Items (Extended mode).** Saved item list with VAT.
- **Tax.** VAT registration status, applicable VAT rates.
- **Devices.** List of paired devices (v1.1+).
- **Notifications.** Email for kvitto, email for daily report, email for compliance alerts.
- **Security.** PIN, biometric, session timeout.
- **About.** App version, network status, support contact.

---

## 8. FutureChain integration

### 8.1 Existing endpoints (use these)

From `API_DOCUMENTATION.md` and `OPERATOR_MANUAL.md`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/submit_pacs008_batch` | POST | Submit one or more PACS.008 transactions; up to 5,000 per batch |
| `/balance/:address` | GET | Get current balance for an address |
| `/transaction/:uetr` | GET | Get a specific transaction by UETR |
| `/transactions/:address` | GET | List transactions for an address (paginated) |
| `/iso_data/:tx_hash` | GET | Get full PACS.008 data (Full nodes only) |
| `/health` | GET | Node health |
| `/ready` | GET | Node readiness |

**Important constraints from the existing implementation:**

- Heimdall fail-closed: every transaction must include a Heimdall compliance signature at block height ≥ 360,000. The merchant submits the PACS.008 to a Heimdall-enabled node; the node attaches the signature.
- Fee: capped at 0.1 FTC per transaction. The SDK should default to a small fee (e.g., 0.001 FTC) and never exceed 0.1.
- Sanctioned-country list (per current Heimdall config): RU, IR, KP, SY, CU, VE, BY, MM, SO, SS. A transaction involving these is rejected pre-mempool.
- 10-second compliance timeout: if Heimdall doesn't respond, the transaction is rejected.

### 8.2 Endpoints we need to add to FutureChain core

These are new endpoints that ANTON Business needs but that don't yet exist. Add them in a separate Rust PR.

| Endpoint | Method | Purpose | Priority |
|---|---|---|---|
| `/merchant/register` | POST | Register a merchant wallet with KYB metadata hash | v1.0 must-have |
| `/merchant/:address/transactions` | GET | List transactions for a merchant with merchant-specific filters (date, category, status) | v1.0 must-have |
| `/merchant/:address/balance_history` | GET | Daily balance snapshots for reconciliation | v1.0 must-have |
| `/transaction/:uetr/status` | GET | Status with confirmation count and finality info | v1.0 must-have |
| `/transaction/:uetr/cancel` | POST | Cancel an unsubmitted invoice (no-op on chain; updates merchant-backend record) | v1.0 nice-to-have |
| `/merchant/:address/delegate` | POST | Register a delegation signature authorising merchant-backend to submit settlements on behalf of the merchant | v1.0 must-have |

### 8.3 PACS.008 construction in @futurechain/sdk

The SDK exports a builder. Pseudocode:

```typescript
const pacs008 = new Pacs008Builder()
  .debtor({
    address: merchantWalletAddress,
    name: merchantName,
    country: "SE",
    city: merchantCity,
    street: merchantStreet,
    postcode: merchantPostcode,
    orgNr: merchantOrgNr,
  })
  .creditor({
    address: customerWalletAddress,  // From the scanned response
    name: customerName,                // From customer wallet
    country: customerCountry,
    // ... other KYC fields from customer wallet
  })
  .amount(amountFtcMicroUnits, "FTC")
  .reference(encodeReference({
    merchantId,
    orderId,
    purpose: "RETAIL",
    itemCount: cart.items.length || undefined,
    vatMicroUnits: vatMicroUnits || undefined,
  }))
  .purpose("GDDS")  // ISO 20022 purpose code for "Purchase of Goods and Services"
  .build();

const signed = await wallet.sign(pacs008);
const result = await rpc.submitPacs008Batch([signed]);
```

The builder enforces:

- Required fields per ISO 20022 PACS.008.001.13 (matches the existing `iso20022_pacs008.rs` structures).
- KYC data completeness (debtor and creditor name + country mandatory).
- UETR auto-generation if not provided.
- Reference field encoding within 140 characters.

### 8.4 Signing

Use `@noble/secp256k1` (audited, dependency-free). The private key lives in IndexedDB encrypted with a PIN-derived key via WebCrypto AES-GCM. On signing:

1. Prompt for PIN (or biometric, if available and previously authenticated this session).
2. Derive AES key via PBKDF2 (100,000 iterations, SHA-256) from PIN + per-device salt.
3. Decrypt private key into memory.
4. Sign the PACS.008 hash (Keccak-256 over the canonical JSON representation, matching FutureChain core).
5. Zero the private key buffer immediately after signing.
6. Submit the signed payload to RPC.

Session policy:

- After a successful PIN entry, the merchant can sign without re-entry for a configurable session (default: 15 minutes of inactivity).
- After session timeout, PIN re-entry required.
- Refunds always require explicit PIN/biometric, regardless of session state.
- Settings changes always require PIN/biometric.

---

## 9. QR code format

The QR encodes a `futurechain:` URI compatible with ANTON Wallet:

```
futurechain:pay?to=<merchant_address>&amount=<amount_in_micro_ftc>&currency=FTC&ref=<encoded_reference>&inv=<invoice_id>&exp=<unix_timestamp>&v=1
```

Fields:

| Field | Required | Description |
|---|---|---|
| `to` | yes | Merchant wallet address (fc_... format) |
| `amount` | yes | Integer micro-FTC (1 FTC = 1,000,000) |
| `currency` | yes | Always "FTC" for v1.0 |
| `ref` | yes | URL-encoded reference string per Section 11 |
| `inv` | yes | Unique invoice ID (12-char alphanumeric) used by merchant for tracking |
| `exp` | recommended | Unix timestamp after which QR is invalid (default: 15 minutes after generation) |
| `v` | yes | URI schema version, starts at 1 |

**Behaviour:**

- ANTON Wallet scans, parses, displays merchant name (resolved via FutureChain RPC), amount in SEK and FTC, and asks for confirmation.
- Customer confirms → wallet constructs PACS.008 with itself as debtor and `to` as creditor, including the `ref` in the remittance field.
- Wallet submits to RPC. Heimdall screens. On success, both customer wallet and merchant device see the result via independent polling/notification.

**Expiry handling:**

- Past `exp`: ANTON Wallet refuses to send.
- Merchant device removes expired pending invoices from the active list after 1 hour (kept in DB for audit).

**Security note:** The QR contains no secrets. The merchant address is public. The invoice ID is non-sensitive. There is nothing to steal by photographing a merchant's QR (other than the amount, which is the merchant's posted price anyway).

---

## 10. Heimdall handling

The merchant app must surface Heimdall outcomes without:

- Leaking which specific module rejected (e.g., never say "sanctions hit" — say "Transaction not accepted").
- Tipping off about ongoing SAR/STR investigations.
- Implying anything about the customer that could enable discrimination.

**API behaviour:**

The RPC returns either:

- `{ "status": "accepted", "tx_id": "<uetr>", ... }` → merchant sees "Payment received".
- `{ "status": "rejected", "reason": "<one of allowed reasons>" }` → merchant sees a generic message.

**Allowed user-facing rejection messages:**

| RPC reason | Merchant-facing message |
|---|---|
| `embargoed_country`, `sanctioned_wallet` | "Transaction not accepted. Please ask the customer to try a different payment method." |
| `insufficient_balance` | "Customer has insufficient FTC balance." |
| `expired_invoice` | "This QR code has expired. Please generate a new one." |
| `invalid_signature` | "Transaction could not be verified. Please try again." |
| `compliance_timeout` | "Network busy. Please try again in a moment." |
| `unknown` | "Transaction not accepted. Please try a different payment method." |

If the merchant repeatedly sees rejections (3+ in a 10-minute window from the same customer wallet), the app should surface a "Contact support" prompt — without specifying compliance reasons.

---

## 11. Reference field encoding

The PACS.008 remittance field has 140 characters in Phase 1. ANTON Business uses a structured encoding.

### 11.1 Format

```
M:<merchant_id> O:<order_id> P:<purpose>[ I:<item_count>][ V:<vat>][ D:<discount>][ R:<refund_of>]
```

| Token | Required | Length | Description |
|---|---|---|---|
| `M:` | yes | 8 chars | Merchant ID assigned at onboarding (alphanumeric) |
| `O:` | yes | 12 chars | Order ID (auto-generated, alphanumeric, unique per merchant) |
| `P:` | yes | varies | Purpose code (`RETAIL`, `RESTAURANT`, `EVENT`, `SERVICE`, `REFUND`) |
| `I:` | extended only | up to 3 digits | Item count |
| `V:` | extended only | up to 10 chars | VAT in micro-FTC |
| `D:` | optional | up to 10 chars | Discount in micro-FTC |
| `R:` | refunds only | 36 chars | UETR of original transaction being refunded |

### 11.2 Examples

Simple mode purchase of 50 SEK:

```
M:KTH00001 O:A1B2C3D4E5F6 P:RETAIL
```

(33 chars; well within 140.)

Extended mode purchase, 3 items, 12.50 SEK VAT:

```
M:KTH00001 O:A1B2C3D4E5F7 P:RESTAURANT I:3 V:12500000
```

(56 chars.)

Refund of a prior transaction:

```
M:KTH00001 O:A1B2C3D4E5F8 P:REFUND R:550e8400-e29b-41d4-a716-446655440000
```

(74 chars.)

### 11.3 Implementation

`packages/futurechain-sdk/src/reference/encode.ts`:

```typescript
export interface ReferenceInput {
  merchantId: string;       // exactly 8 chars
  orderId: string;          // exactly 12 chars
  purpose: "RETAIL" | "RESTAURANT" | "EVENT" | "SERVICE" | "REFUND";
  itemCount?: number;
  vatMicroUnits?: bigint;
  discountMicroUnits?: bigint;
  refundOf?: string;        // UETR
}

export function encodeReference(input: ReferenceInput): string {
  // validation + encoding
  // throws if result > 140 chars
}

export function decodeReference(ref: string): ReferenceInput {
  // parser for reading back
}
```

Tests must cover:

- Encode/decode roundtrip.
- Length validation (always < 140).
- Required field validation.
- Invalid character rejection.

---

## 12. Safello integration

### 12.1 What we need from Safello

Pre-launch, secure the following (commercial discussion with Safello — separate from this engineering work):

- A merchant-facing receiving address per FutureChain merchant (or a single Safello address with sub-account routing via reference field).
- An API for converting received FTC to SEK at the day's rate.
- A payout API for sending SEK to the merchant's linked bank account.
- A reconciliation API for confirming completed settlements.

### 12.2 Settlement flow (server-side, on merchant-backend)

```typescript
async function settleMerchant(merchantId: string) {
  const merchant = await db.merchant.findUnique({ where: { id: merchantId } });
  if (merchant.settlementMode === "HOLD") return;

  const balance = await futurechainRpc.getBalance(merchant.walletAddress);
  const threshold = merchant.settlementThresholdFtc;

  if (balance < threshold) return;
  const toConvert = balance - merchant.holdAmountFtc;
  if (toConvert <= 0n) return;

  // 1. Build a settlement PACS.008
  const pacs008 = buildSettlementTx(merchant, toConvert);

  // 2. Sign with merchant's delegation
  //    (merchant has previously signed a delegation message
  //     authorising backend to submit settlement transactions
  //     to the specific Safello receiving address with a per-day cap)
  const signed = await signWithDelegation(merchant, pacs008);

  // 3. Submit to FutureChain
  const result = await futurechainRpc.submitPacs008(signed);
  if (result.status !== "accepted") {
    await notifyMerchantSettlementFailed(merchant, result.reason);
    return;
  }

  // 4. Wait for finality
  await waitForFinality(result.tx_id, 6);

  // 5. Call Safello convert API
  const conversion = await safello.convert({
    fromAmount: toConvert,
    fromCurrency: "FTC",
    toCurrency: "SEK",
    merchantId: merchant.safelloMerchantId,
  });

  // 6. Record settlement
  await db.settlement.create({
    data: {
      merchantId,
      txUetr: result.tx_id,
      ftcAmount: toConvert,
      sekAmount: conversion.toAmount,
      rate: conversion.rate,
      safelloPayoutId: conversion.payoutId,
      status: "PENDING_PAYOUT",
    },
  });

  // 7. Notify merchant
  await sendSettlementEmail(merchant, conversion);
}
```

### 12.3 Delegation model

The merchant must authorise the backend to perform settlement without prompting per-transaction. This is done via a signed delegation message:

```typescript
interface SettlementDelegation {
  merchantId: string;
  walletAddress: string;
  safelloReceivingAddress: string;  // Cannot be changed without new delegation
  maxPerDayMicroFtc: bigint;        // Daily cap
  validUntil: number;                // Unix timestamp; rotate every 90 days
  nonce: string;                     // Unique per delegation
}
```

The merchant signs this with their key at onboarding. The backend verifies the signature on every settlement attempt. Any change (new Safello address, higher cap) requires a new delegation signed by the merchant.

This means:
- The merchant never loses custody. They can revoke at any time.
- The backend cannot drain the merchant wallet — only send up to `maxPerDayMicroFtc` to the pre-authorised Safello address.
- If the backend is compromised, blast radius is one day's settlement to a known Safello address.

---

## 13. Security and key management

### 13.1 Key generation

At first-run after onboarding:

1. Generate a fresh secp256k1 private key using `crypto.getRandomValues()` (WebCrypto secure RNG).
2. Derive merchant wallet address using FutureChain's address derivation (matches `wallet.rs`).
3. Generate BIP-39 mnemonic (12 or 24 words) as the recovery seed.
4. Display recovery seed once; require merchant to verify by re-entering 3 random words.
5. Prompt for PIN (minimum 6 digits; the standard Swedish "BankID-like" length).
6. Derive AES-256 key from PIN using PBKDF2 (100,000 iterations, SHA-256, per-device random salt).
7. Encrypt the private key with AES-256-GCM and store in IndexedDB.
8. Salt and IV are stored alongside the ciphertext.

### 13.2 Biometric unlock

Where supported (iOS Face ID/Touch ID, Android BiometricPrompt), allow biometric to unlock the session after initial PIN entry. The underlying key encryption remains PIN-based; biometric only releases an in-memory session token.

### 13.3 Recovery

If a merchant loses their device:

1. Install ANTON Business on a new device.
2. Choose "Recover existing merchant".
3. Enter org. nr. and authenticate via BankID (proving they are an authorised signatory of the legal entity).
4. Enter the 12/24-word recovery seed.
5. Set a new PIN. Private key reconstructed from seed and re-encrypted with new PIN.
6. The new device is registered with merchant-backend; the old device is marked inactive (its session key is revoked but the underlying wallet key is the same).

### 13.4 Multi-device (v1.1+)

For v1.1, support multiple devices per merchant:

- Each device gets a sub-key derived from the master key (BIP-32 hierarchical deterministic derivation).
- Sub-keys can sign PACS.008 transactions; merchant-backend resolves which device signed via the sub-key index in the transaction reference.
- Sub-keys can be individually revoked from the merchant dashboard.
- Settlement and refund permissions can be restricted per sub-key.

### 13.5 Threats and mitigations

| Threat | Mitigation |
|---|---|
| Device theft | PIN required to sign; remote revocation from dashboard (v1.1) |
| Malware on device | PIN-encrypted key in IndexedDB; key zeroed after each signing operation; biometric session bound to in-memory token only |
| Backend compromise | Delegation cap limits drain to one day's settlement; merchant can revoke delegation at any time; no merchant private keys ever stored on backend |
| Network MITM | TLS 1.3 mandatory; certificate pinning in v1.1 |
| QR replay / double-pay | Each QR has unique invoice ID and expiry; FutureChain rejects double-spend at consensus layer |
| Refund fraud (staff issuing refunds to own wallet) | Refunds require PIN/biometric every time; v1.1 adds per-staff sub-keys with refund cap |
| Phishing (fake "FutureChain support" asking for seed) | Hard-coded in-app message: "FutureChain support will never ask for your recovery seed"; pen-test scenario |

---

## 14. Compliance and tax (Skatteverket, Bokföringslagen)

### 14.1 Receipt requirements

A kvitto must contain (per Bokföringslagen 5 kap. and Skatteverket guidance):

- Seller's name and org. nr.
- Date.
- Description of goods/services (Extended mode handles this; Simple mode includes category if set, otherwise "Goods/Services").
- Price.
- VAT amount and rate (if applicable).
- Total amount paid.

ANTON Business additionally includes:

- Kvitto number (sequential per merchant; must be gap-free).
- Time of day.
- Payment method ("FutureChain Token (FTC)").
- Transaction UETR (for audit traceability).

### 14.2 Numbering and sequencing

Sequential, gap-free kvitto numbering per merchant. If a kvitto is voided (e.g., test transaction), it cannot be deleted — instead, mark as voided. The next kvitto continues the sequence.

### 14.3 VAT handling

- Merchant declares VAT status at onboarding (registered, not registered, exempt).
- If VAT-registered, each item in Extended mode carries a VAT rate (default 25%, configurable 0/6/12/25).
- VAT amount is calculated per item and totalled on the receipt.
- For Simple mode, the merchant either:
  - Has a default VAT rate applied to the full amount, or
  - Marks the transaction as "VAT included" / "VAT excluded".

### 14.4 Bookkeeping export

- Monthly export of all transactions in SIE format (Swedish standard for accounting data exchange) for upload to merchant's accounting software (Fortnox, Visma, Bokio).
- CSV alternative for non-Swedish or non-SIE accounting systems.

### 14.5 Retention

- Kvitto, invoices, settlements, refunds: 7 years from end of fiscal year (Bokföringslagen).
- KYB data: 5 years from end of merchant relationship (Penningtvättslagen).

---

## 15. UI/UX principles

### 15.1 Audience

The primary user is a bar volunteer at a student union, a barista, a market-stall holder, or a charity volunteer. **Not** a developer or fintech employee. They have ~5 seconds at the start of a shift to learn the app.

### 15.2 Principles

- **One screen, one task.** No nested menus during a transaction.
- **Large targets.** Buttons sized for use on a phone held at counter level, with one hand.
- **No jargon.** "Transaction" → fine. "PACS.008", "UETR", "Heimdall" → never visible to a merchant.
- **Speak Swedish first.** UI strings in Swedish by default; English available. Date/time/currency in Swedish format.
- **Quiet failure.** Errors are short, friendly, and actionable. Never expose internal codes to the merchant.
- **Success is loud.** Confirmation animations should be obvious from arm's length so a queue of customers knows their friend just paid.
- **Dark mode default.** Bars are dark. Cafés have screens facing windows. Dark mode is the better default; light mode available.

### 15.3 Onboarding-in-app

After the off-app KYB completes (see `MERCHANT_ONBOARDING_FLOW.md`), the merchant returns to the app with an activation code. The app then walks through:

1. Activate (code + BankID).
2. Generate wallet (PIN + biometric + recovery seed verification).
3. Configure settlement (mode + Safello + bank account).
4. (Extended mode users) Add 3 sample items.
5. Test transaction (we send 1 FTC to the merchant; they accept; they refund it).
6. Set up daily report email.
7. Done. Take a payment.

Total time: 8–12 minutes for a first-time merchant.

---

## 16. Build, dev, test workflow

### 16.1 Local dev

```bash
# clone the monorepo
git clone git@github.com:futurechain/anton-business.git
cd anton-business
pnpm install

# spin up a local FutureChain testnet node
docker compose up futurechain-testnet -d

# spin up the merchant backend
pnpm --filter merchant-backend dev

# spin up the app
pnpm --filter anton-business-app dev

# open http://localhost:5173
```

### 16.2 Testing strategy

- **Unit tests:** Vitest. Every function in `@futurechain/sdk` has tests. Reference encoding has 100% coverage.
- **Integration tests:** Vitest with a real FutureChain testnet node. Cover PACS.008 submission, Heimdall accept/reject paths, refund flow.
- **End-to-end tests:** Playwright. Cover Simple mode happy path, Extended mode happy path, refund, settlement.
- **Manual test cases:** Documented checklist that any contributor runs before merging to main. Includes BankID flow (which Playwright cannot automate).

### 16.3 CI

- GitHub Actions (or Forgejo).
- On every PR: lint, typecheck, unit tests, integration tests, build, Lighthouse audit (target ≥ 90 for performance, ≥ 100 for accessibility).
- On merge to `main`: deploy to staging.
- Manual promotion to production.

### 16.4 Telemetry

- Self-hosted Plausible or Umami for usage analytics (privacy-first; GDPR-clean).
- Sentry for error tracking (with strict PII filtering — never send raw PACS.008 payloads or wallet addresses).
- Custom in-app feedback button for Phase B beta merchants.

---

## 17. Phased roadmap

### 17.1 v1.0 — Beta-ready (target: end of Q3 2026)

Must-have:

- [ ] Project scaffolding (monorepo, pnpm, CI).
- [ ] `@futurechain/sdk` v0.1 with PACS.008 builder, signing, RPC client, reference encoder.
- [ ] Merchant onboarding in-app (activation, wallet generation, PIN, recovery seed, settlement config).
- [ ] Simple mode (keypad, QR, polling, confirmation).
- [ ] Extended mode (cart, items, VAT, discount, QR, confirmation).
- [ ] Transaction history with filters.
- [ ] Refunds (full and partial).
- [ ] Kvitto generation (PDF, email delivery).
- [ ] Daily report generation and delivery.
- [ ] Settlement orchestration (Safello auto-convert) — backend.
- [ ] Settings screens.
- [ ] Swedish + English localisation.
- [ ] Light + dark mode.
- [ ] Offline-tolerant (queue confirmations when network returns).
- [ ] PWA install on iOS and Android.

Nice-to-have:

- [ ] In-app customer support chat (could defer to email for v1.0).
- [ ] Sample item library by industry (café, bar, market, charity).

### 17.2 v1.1 — Multi-device and dashboard (target: end of Q4 2026)

- [ ] Multi-device support (hierarchical sub-keys, per-device permissions).
- [ ] Web-based merchant dashboard (React, same monorepo).
- [ ] Per-staff transaction attribution and reporting.
- [ ] Cloud-synced item library.
- [ ] Push notifications for incoming payments (where supported).
- [ ] SMS kvitto (in addition to email).
- [ ] SIE export for Swedish accounting software.
- [ ] Certificate pinning on RPC calls.
- [ ] Improved Heimdall escalation lane for false positives.

### 17.3 v2.0 — POS and API (target: Q1–Q2 2027)

- [ ] Merchant API (REST, OpenAPI documented).
- [ ] Webhook delivery for transaction events.
- [ ] Caspeco integration.
- [ ] Sitoo integration.
- [ ] iZettle / Zettle integration.
- [ ] Subscriptions / recurring billing.
- [ ] Multi-currency display (SEK, EUR, USD).
- [ ] Native iOS and Android apps via React Native (PWA continues for low-end devices).

### 17.4 v3.0 — Agent SDK and embedded payments (target: H2 2027)

- [ ] Agent-callable merchant API (ANTON-style assistants can issue invoices, process refunds, run reports).
- [ ] Embedded payments SDK for SaaS (pre-funded customer wallets, recurring smart-contract billing).
- [ ] Cross-merchant loyalty primitives (optional, opt-in by merchants).
- [ ] First fiat off-ramps outside Sweden (Finland, Norway, Denmark).

---

## 18. Definition of done (per feature)

A feature is "done" only when:

1. Spec match: implemented per this document and updated if scope changed.
2. Tests: unit, integration, and E2E tests written and passing.
3. Lint and typecheck pass with no warnings.
4. Lighthouse: performance ≥ 90, accessibility = 100, best practices ≥ 95, SEO ≥ 90.
5. Manual test pass: documented checklist run on iOS Safari and Android Chrome.
6. Documentation: relevant section of the user manual updated; SDK functions JSDoc'd.
7. Security review: any new key handling, signing flow, or RPC contract reviewed against Section 13.
8. Compliance check: any new merchant-facing flow checked against Sections 10 and 14.
9. Localisation: all new strings in Swedish and English; date/currency formatting verified.
10. Reviewed by DB before merge to main.

---

## 19. Open decisions

Items requiring product decisions from DB before related work proceeds:

| # | Decision | Blocking |
|---|---|---|
| OD-01 | PWA-first vs React Native first | App scaffold (Section 6) |
| OD-02 | Single-app or two-app model (Wallet vs Business) | Confirmed: two apps (Section 1) |
| OD-03 | Safello API contract — spot, fixed daily, or band conversion | Settlement (Section 12) |
| OD-04 | FTC valuation methodology for receipts in SEK terms | Receipts (Section 7.3) |
| OD-05 | Maximum refund window default (90 days proposed) | Refunds (Section 7.4) |
| OD-06 | Daily settlement default time (23:00 Stockholm proposed) | Settlement (Section 7.5) |
| OD-07 | Backend stack — Node.js + Hono or Rust + Axum | Backend scaffold |
| OD-08 | Hosting — self-hosted on VPS, or managed (Fly.io, Railway) | Deployment |
| OD-09 | Default PIN length (6 proposed, like BankID) | Onboarding |
| OD-10 | Multi-currency support timing (v2.0 proposed; v1.1 if Safello supports EUR early) | Settings, display |
| OD-11 | Bank account verification method (1 SEK micro-deposit vs BankID-linked) | Onboarding |
| OD-12 | App icon, branding, name display ("ANTON Business" vs "FutureChain for Business") | Branding |
| OD-13 | Pricing model — flat 0.1% or tiered by volume | Merchant terms |
| OD-14 | Whether to ship in Phase B with manual settlement only (defer Safello auto-convert to Phase C) | Roadmap |

---

## 20. References

### 20.1 In-repo

- `GO_LIVE_PLAN_RETAIL_MERCHANT_2026.md` — strategic plan and distribution targets.
- `MERCHANT_ONBOARDING_FLOW.md` — KYB and onboarding sequence the app must support.
- `STUDENT_ORG_SPONSORSHIP_AGREEMENT_TEMPLATE.md` — for context on the recipient organisations.
- `CLAUDE_FUTURECHAIN.md` — overall FutureChain context.
- `CLAUDE_PROJECT_CONTEXT.md` — complete project context (block heights, configs, modules).
- `API_DOCUMENTATION.md` and `API_REFERENCE.md` — existing RPC endpoints.
- `OPERATOR_MANUAL.md` — for the PACS.008 submission example.
- `iso20022_pacs008.rs` — canonical PACS.008 data structures.
- `heimdall_client.rs` — compliance integration in core.
- `wallet.rs` — existing wallet system (matching address derivation).

### 20.2 External

- ISO 20022 PACS.008.001.13 schema documentation (iso20022.org).
- BIP-39 (mnemonic seed) and BIP-32 (HD wallet derivation) specs.
- @noble/secp256k1 documentation.
- Skatteverket guidance on kvitto and certifierade kassaregister.
- Bokföringslagen (1999:1078).
- Penningtvättslagen (2017:630).
- MiCA Regulation (EU) 2023/1114, Title II.

### 20.3 Architectural decision records

Maintain ADRs in `docs/adr/` for every significant choice. Initial ADRs to write:

- ADR-001: PWA vs React Native for v1.0.
- ADR-002: TypeScript SDK shared with ANTON Wallet.
- ADR-003: Delegation-based settlement model.
- ADR-004: Reference field encoding format.
- ADR-005: Receipt sequencing and storage approach.

---

## 21. First sprint — concrete tasks

When Claude Code starts, the first sprint (2 weeks) should focus on the foundation. In priority order:

1. **Scaffold monorepo.** pnpm workspaces, TypeScript, ESLint, Prettier, Husky. Empty `apps/anton-business-app`, `apps/merchant-backend`, `packages/futurechain-sdk`, `packages/shared-types`.
2. **Implement `@futurechain/sdk` core:**
   - secp256k1 wallet generation, signing, address derivation matching `wallet.rs`.
   - PACS.008 builder matching `iso20022_pacs008.rs`.
   - RPC client wrapping `/submit_pacs008_batch`, `/balance/:address`, `/transactions/:address`, `/transaction/:uetr`.
   - Reference field encoder/decoder per Section 11.
   - Tests with ≥ 95% coverage on these modules.
3. **Scaffold `anton-business-app`:**
   - Vite + React + TypeScript + Tailwind + shadcn/ui.
   - PWA manifest and service worker (workbox).
   - Routing for Simple mode, Extended mode, Transactions, Settings (placeholder content).
   - Local SQLite via sqlite-wasm with the data model from Section 7.
   - Wallet generation flow (PIN entry, seed display, seed verification).
4. **End-to-end smoke test:**
   - Start local FutureChain testnet.
   - Onboard a test merchant.
   - Generate a Simple-mode QR.
   - Use ANTON Wallet (or a CLI script) to pay it.
   - Confirm the merchant device sees confirmation.

If the above is done in two weeks, we are on track for a beta-ready v1.0 by end of Q3 2026.

---

## 22. What success looks like

By the end of Phase B (Q3 2026):

- 3–5 student unions running ANTON Business at their bars or events.
- 2–3 co-working spaces running it at their cafés.
- 2,000+ merchant transactions processed.
- 500+ unique customer wallets paying.
- < 0.1% transaction failure rate (excluding intentional Heimdall rejections).
- ≥ 4.0 / 5.0 merchant NPS.
- Zero security incidents.
- Zero unresolved Skatteverket compliance issues.

By the end of Phase C (Q4 2026):

- 15–20 active merchants.
- 50,000+ transactions.
- 1,000,000+ FTC in monthly transaction volume.
- 5+ merchants spontaneously requesting onboarding (organic demand).

By the end of v2.0 (Q2 2027):

- First three POS integrations live.
- 100+ merchants.
- Merchant API in public beta with first three developer partners building on it.

This is the bar. Build accordingly.

---

*Prepared by FutureChain AB. Confidential. Read carefully and ask questions before assuming.*
