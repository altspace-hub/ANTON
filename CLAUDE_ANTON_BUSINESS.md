# CLAUDE_ANTON_BUSINESS.md
## ANTON Business — Technical Specification & Build Plan

**Document version:** 2.0 (phone-first architecture)
**Date:** 14 May 2026
**Owner:** Daniel Bardun, FutureChain AB
**Audience:** Claude Code (and any future contributors)
**Status:** Active — supersedes v1.0

> **Why v2.0?** v1.0 assumed a three-tier architecture (phone → Rust
> merchant-backend → FutureChain RPC + Safello). On 2026-05-14 we
> simplified to a phone-first model after recognising that:
>
> 1. Merchants set up their KYC + sweep relationship with Safello
>    bilaterally. We don't orchestrate the swap.
> 2. There's no operational role for a backend we'd run — the phone
>    handles point-of-sale, FutureChain RPC handles the chain, Safello
>    handles fiat conversion.
> 3. Same deployment story as ANTON Comm: install an APK, done.
>
> The v1.0 spec, the working Rust merchant-backend (51 tests passing
> against Postgres), and the ADR-005 delegation envelope all live in
> `anton-business/_archive/` if a "hosted ANTON Business" SKU is
> ever revived.

---

## 1. Project overview

### 1.1 What ANTON Business is

A **standalone phone app** the merchant uses to accept FTC payments.
The phone:

- Generates payment QR codes containing the order, amount, and a
  structured reference (per ADR-004).
- Watches FutureChain RPC for incoming payments to the merchant's
  configured receive address.
- Renders Skatteverket-compliant kvitto on confirmation; stores them
  locally; optionally emails them via a transactional email API
  called directly from the phone.
- Holds the merchant's secp256k1 keypair in the OS keychain so refunds
  can be signed on-device.

Same architectural posture as ANTON Comm: it's an app, not a service.

### 1.2 What it is not

- **Not a custodial wallet.** The merchant's receive address is
  whatever they arranged with Safello (typically a Safello-provided
  address). FTC never lingers in our control.
- **Not a settlement orchestrator.** Safello sweeps + converts FTC →
  SEK on its own schedule per its agreement with the merchant.
- **Not a KYB authority.** Safello does merchant KYC. We don't store
  identity proofs.
- **Not a POS hardware system.** Pure mobile app. POS integrations
  via API land in v2.0.

### 1.3 Why the v2.0 phone-first model works

- **Same compliance footprint as a calculator.** We're a tool the
  merchant uses; the regulated entities (Safello, FutureChain) operate
  independently. Skatteverket compliance (kvitto generation) happens
  on-device.
- **Zero servers to run.** Distribution = APK / TestFlight / Play
  Store. Updates ship like Comm App.
- **Faster time to beta.** No backend infra to operate, scale,
  monitor, or audit.
- **Merchant owns their data.** Catalogue, kvittos, kvitto numbering
  counter — all local.

---

## 2. Architecture

```
┌─ ANTON BUSINESS PHONE ──────────────┐
│ Local state (SQLite via expo-sqlite)│
│   merchant identity (one-time)      │
│   product / item catalogue          │
│   kvitto sequence counter           │
│   receipt history (7-year retain)   │
│ Local logic                         │
│   QR generation + ADR-004 ref       │
│   PACS.008 build + sign (refunds)   │
│   kvitto PDF render                 │
│ Network                             │
│   FutureChain RPC ── public         │
│   Transactional email API (Resend / │
│     Postmark) ── for kvitto email   │
└─────────────────┬───────────────────┘
                  │
                  │ HTTPS
                  ▼
┌─ FUTURECHAIN RPC ───────────────────┐
│ GET /balance/:address               │
│ GET /transactions/:address          │
│ GET /transaction/:uetr              │
│ POST /submit_pacs008_batch          │
│ (Heimdall screens at the node)      │
└─────────────────────────────────────┘
                  ▲
                  │ Customer signs PACS.008
                  │ paying merchant addr
                  │
┌─ CUSTOMER PHONE (ANTON Comm / compatible wallet) ─┐
│ Scans QR, signs, submits                          │
└────────────────────────────────────────────────────┘


BILATERAL — happens outside ANTON Business entirely:
   MERCHANT ──── KYC + sweep agreement ──── SAFELLO
                                            FTC → SEK
                                            → merchant bank
```

### 2.1 Closed decisions (ADRs in `anton-business/docs/adr/`)

| ADR | Decision |
|---|---|
| [001](anton-business/docs/adr/ADR-001-rn-first.md) | React Native + Expo for v1.0 (not PWA) |
| 002 (superseded) | ~~Rust + Axum for merchant-backend~~ — no backend |
| [003](anton-business/docs/adr/ADR-003-subdirectory-layout.md) | Lives as subdirectory of the ANTON repo |
| [004](anton-business/docs/adr/ADR-004-reference-encoding.md) | Versioned remittance envelope (`v1:` merchant-bearing, `v2:` operational) |
| 005 (superseded) | ~~Delegation envelope~~ — no delegation flow |

---

## 3. Stack

| Layer | Choice | Notes |
|---|---|---|
| App framework | React Native + Expo 52 | Managed workflow until forced to eject |
| Routing | expo-router 4 | File-based, type-safe |
| Storage | expo-secure-store (keys) + expo-sqlite (catalogue + kvitto) | Encrypts at rest via iOS Keychain / Android Keystore |
| Crypto | @noble/curves, @noble/hashes | Pure JS, works in Hermes |
| Shared logic | `@futurechain/sdk` (TypeScript) | Wallet, PACS.008, RPC, reference encoding |
| QR | react-native-qrcode-svg | SVG output, fast |
| PDF | expo-print or pdf-lib | Kvitto rendering on-device |
| Email | Direct API call to Resend / Postmark | Or OS share-sheet as fallback |

`@futurechain/sdk` is a workspace package; the app imports it as
`workspace:*`. When ANTON Wallet ships, it consumes the same SDK.

---

## 4. Layout

```
anton-business/
├── apps/
│   └── anton-business-app/      The Expo phone app
│       ├── app/                  expo-router pages
│       │   ├── _layout.tsx
│       │   ├── index.tsx         wallet-gate landing
│       │   ├── home.tsx          post-onboarding home
│       │   └── onboarding/
│       │       ├── welcome.tsx
│       │       ├── generate.tsx  wallet keygen + secure store
│       │       ├── setup.tsx     local config form
│       │       └── done.tsx
│       └── src/
│           ├── services/
│           │   ├── wallet.ts     keygen + load + persist
│           │   ├── merchant.ts   local merchant config CRUD
│           │   └── chain.ts      FutureChain RPC client wrapper
│           └── stores/           Zustand
├── packages/
│   ├── futurechain-sdk/          Shared TS SDK (wallet, pacs008, rpc, reference)
│   └── shared-types/             Cross-cutting TS interfaces (kvitto, etc.)
├── tests/fixtures/               Parity fixtures (reference encoder)
├── docs/adr/                     Architectural decision records
└── _archive/                     Rolled-back v1.0 work
```

Workspace registered via the parent repo's `pnpm-workspace.yaml`.

---

## 5. Phone-only onboarding

1. **Welcome** — pitch + Get Started.
2. **Generate wallet** — `crypto.getRandomValues(32)` → secp256k1
   keypair → `expo-secure-store`. Surface the derived `fc_...` address
   so the merchant can save it for KYC-time identification.
3. **Local setup form** (replaces the old `/merchant/register` POST):
   - Legal name + org. nr. (printed on every kvitto per
     Bokföringslagen)
   - Address (city / street / postcode)
   - VAT registration status + default VAT rate
   - **Safello receive address** — the address the merchant's QRs
     point at. Either this is a Safello-provided address (Safello
     converts on arrival) OR the merchant's own ANTON address (the
     merchant has their own sweep mechanism).
   - Email for kvitto delivery (optional)
4. **Done** — kvitto numbering starts at 1, app ready.

No registration HTTP call. No activation token. No KYB submission to
us — the merchant did that with Safello.

The merchant can change configuration at any time via Settings. The
fields are signed implicitly by the device key when used in receipts
(the merchant's `fc_...` address proves which keypair authored the
data).

---

## 6. Simple + Extended modes

### 6.1 Simple mode

Keypad → amount in SEK or FTC → optional category pill → Generate QR.

QR contains a `futurechain:pay` URI per the format in §8 below. The
phone watches FutureChain RPC for an incoming PACS.008 with this
QR's `inv` field in the reference. On confirmation, kvitto is
rendered.

### 6.2 Extended mode

Saved items list (managed in Settings → Items): name, unit price,
VAT rate, category. Cart UX builds a line-item invoice. Same QR + RPC
poll flow as Simple mode. Kvitto includes the line items.

The catalogue is in expo-sqlite. No cloud sync in v1.0; that's a v1.1
opt-in.

---

## 7. Kvitto (Skatteverket-compliant)

Per Bokföringslagen 5 kap. and Skatteverket guidance:

- Seller's name + org. nr. (from local config)
- Date + time of transaction (phone clock at confirmation)
- Description (Extended mode line items; Simple mode category or
  "Goods/Services")
- Per-item VAT rate (0 / 6 / 12 / 25%) + total VAT
- Total in SEK and FTC (with applied rate at confirmation time)
- Payment method: "FutureChain Token (FTC)"
- Transaction UETR (from PACS.008)
- Kvitto number — **sequential, gap-free, per merchant**. Stored in
  a local counter; voided kvittos are marked, not deleted.

### 7.1 Delivery

- **Email** — customer enters address in their wallet at payment
  time, passed via the QR's `email` query param to the merchant. App
  posts to a transactional email API (Resend / Postmark) with the
  rendered PDF.
- **No receipt** — kvitto is still generated + stored locally per
  Bokföringslagen.
- **SMS** — v1.1.

### 7.2 Retention

7 years from end of fiscal year (Bokföringslagen). Storage:

- Local SQLite (mandatory).
- **Periodic export** — once a week, a signed kvitto archive (PDF +
  SIE bookkeeping file) is generated. The merchant uploads it to
  their own backup destination (Google Drive / iCloud / email). The
  app reminds + opens the share-sheet.

This is the **one operational concern** the v2.0 model doesn't solve
for the merchant — they're responsible for backing up their own kvitto
history if their phone is lost. Mitigated by the periodic export
prompt.

---

## 8. QR / payment URI format

Unchanged from v1.0. The QR encodes:

```
futurechain:pay?to=<merchant_recv_addr>&amount=<micro_ftc>&currency=FTC&ref=<encoded_v1>&inv=<invoice_id>&exp=<unix_ts>&v=1
```

- `to` — the merchant's Safello-arranged receive address (from local
  config), NOT necessarily the merchant's own keypair address.
- `ref` — the ADR-004 v1 reference: merchant id + order id + purpose +
  optional item count / VAT / discount / refund-of.
- `exp` — 15-minute QR expiry.
- `inv` — invoice id, used by the merchant phone to bind the incoming
  PACS.008 back to the open order.

See ADR-004 for the full reference grammar.

---

## 9. FutureChain integration

The phone talks directly to a public FutureChain RPC endpoint. No
proxy.

| Endpoint | Use |
|---|---|
| `GET /balance/:address` | Show merchant balance on the home screen |
| `GET /transactions/:address` | Tx history + reconciliation on first load |
| `GET /transaction/:uetr` | Watch open orders for confirmation |
| `POST /submit_pacs008_batch` | Submit refunds |

The phone polls (or uses long-poll if the node supports it) every
~2 seconds for open orders. On confirmation, the app stops polling
that order, renders the kvitto, and notifies the merchant.

### 9.1 Heimdall

Heimdall screens every PACS.008 at the node. The phone surfaces
outcomes with friendly user-facing messages — never the raw rejection
reason, per the tipping-off rules in Penningtvättslagen. The mapping
table from v1.0 §10 still applies:

| RPC reason | Merchant-facing message |
|---|---|
| `embargoed_country`, `sanctioned_wallet` | "Transaction not accepted. Please ask the customer to try a different payment method." |
| `insufficient_balance` | "Customer has insufficient FTC balance." |
| `expired_invoice` | "This QR code has expired. Please generate a new one." |
| `invalid_signature` | "Transaction could not be verified. Please try again." |
| `compliance_timeout` | "Network busy. Please try again in a moment." |
| `unknown` | "Transaction not accepted. Please try a different payment method." |

---

## 10. Safello (out of scope)

The merchant arranges their Safello relationship bilaterally:

1. Merchant signs up with Safello, completes Safello's KYC.
2. Safello provides a receive address (or arranges a sweep mechanism
   from the merchant's own address).
3. Merchant enters that address in ANTON Business → Settings →
   Settlement.
4. From there, ANTON Business just generates QRs pointing at that
   address. Safello watches the chain, converts FTC → SEK on its own
   schedule, pays out to the merchant's bank.

The app **does not** integrate with Safello's API. The merchant's
Safello dashboard is a separate product they log into for payouts +
SEK statements.

---

## 11. Security

### 11.1 Key generation

At first run:

1. `crypto.getRandomValues(32)` → secp256k1 private key.
2. Derive `fc_...` address per the wallet adapter (currently a
   placeholder pending the FutureChain Rust core being vendored —
   see §References).
3. Store private key in `expo-secure-store` (OS-keychain-backed,
   AES-256 encrypted at rest).

### 11.2 PIN-derived encryption layer (deferred)

v1.0 spec §13.1 called for `PBKDF2(PIN) → AES-GCM(privKey)` on top
of the OS keychain. v0.x ships without this — the OS keychain is the
encryption layer. Mitigates: forensically-extracted device-locked
keychain. Acceptable for the Phase B beta target (student-union bar
staff). Ladder up before retail launch.

### 11.3 Recovery

BIP-39 mnemonic (12 or 24 words) shown once at wallet generation,
verified by re-typing 3 random words. On a new device:

1. Install ANTON Business
2. Choose "Recover existing merchant"
3. Enter mnemonic
4. Local config is **re-entered** (it's not derived from the seed —
   merchant name, addresses, Safello address, items)
5. Kvitto history is re-fetched from the most recent SIE/PDF backup
   the merchant has saved + reconciled against FutureChain RPC's
   transaction history for the address

### 11.4 Threats

| Threat | Mitigation |
|---|---|
| Device theft | OS keychain + screen-lock; biometric session for refunds |
| Malware | Key never leaves keychain; signing happens in-app |
| QR replay / double-pay | `exp` + unique `inv`; FutureChain rejects double-spend |
| Phishing for the seed | Hard-coded in-app message: "FutureChain support will never ask for your recovery seed" |
| Refund fraud | Refunds require biometric every time |

---

## 12. Compliance + tax

### 12.1 Skatteverket / Bokföringslagen

All addressed in §7. The phone is a Skatteverket-compliant kassaregister
(cash register) replacement: sequential kvitto, gap-free numbering,
VAT breakdown, 7-year retention via local + periodic exported backup.

### 12.2 Penningtvättslagen

Out of scope for us. Safello is the regulated AML entity (it's a
registered cryptoasset service provider). We surface generic rejection
messages per §9.1 to avoid tipping-off.

### 12.3 Bookkeeping export

Monthly SIE export (Swedish standard) for upload to Fortnox / Visma /
Bokio. CSV alternative for non-SIE accounting systems. Generated on
device, shared via OS share-sheet.

---

## 13. UI/UX

Unchanged from v1.0 §15:

- One screen, one task during a transaction.
- Large targets for one-handed use at counter level.
- No jargon (no "PACS.008", no "UETR", no "Heimdall").
- Swedish-first; English available.
- Dark mode default; light mode option.
- Quiet failure; loud success.

---

## 14. Roadmap

| Version | Target | Scope |
|---|---|---|
| **v1.0** | Q3 2026 (Phase B beta) | Onboarding, Simple mode, Extended mode, refunds, kvitto + email, local backup export, Swedish + English |
| **v1.1** | Q4 2026 | Multi-device (multiple staff phones sharing a seed), cloud-synced item library (optional, opt-in), SMS kvitto, certificate pinning |
| **v2.0** | Q1–Q2 2027 | Merchant API for POS integrations (Caspeco, Sitoo, iZettle), webhooks, subscriptions, multi-currency display |
| **v3.0** | H2 2027 | Agent-callable merchant API (ANTON-style assistants issue invoices, run reports), embedded payments SDK, Finland / Norway / Denmark fiat off-ramps |

---

## 15. Build, dev, test

```bash
# From the ANTON repo root
pnpm install                                              # workspace deps

# Tests
pnpm --filter @futurechain/sdk test                       # reference + wallet
node anton-business/tests/fixtures/generate.mjs           # regenerate parity fixtures

# Run the app (Capacitor + Vite — Expo cut archived 2026-05-14)
pnpm dev:business                                         # Vite HMR for fast iteration
pnpm build:business:cap                                   # production bundle → dist/business/
cp -r dist/business android-business/app/src/main/assets/public
cd android-business && ./gradlew assembleDebug            # build APK
adb install -r app/build/outputs/apk/debug/app-debug.apk  # install on phone
```

App source: `src/business/` (React + Vite + Tailwind). Native shell:
`android-business/` (Capacitor 8.3). The original Expo / RN cut is
preserved at `anton-business/_archive/expo-attempt/` — see that dir's
README for the toolchain rationale.

### 15.1 APK build environment (per-machine, one-time)

`./gradlew` needs a JDK on `JAVA_HOME`. The simplest source is the JDK
that ships inside Android Studio — no separate JDK install required.

**Windows** (PowerShell, persists for the user — new terminals pick it up):

```powershell
$jdk = "C:\Program Files\Android\Android Studio\jbr"   # adjust if Studio is elsewhere
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk, 'User')
[Environment]::SetEnvironmentVariable('Path',
  [Environment]::GetEnvironmentVariable('Path','User') + ";$jdk\bin", 'User')
```

**macOS / Linux** — add to `~/.zshrc` / `~/.bashrc`:

```bash
export JAVA_HOME="$HOME/Android/Sdk/../android-studio/jbr"   # or `/usr/libexec/java_home`
export PATH="$JAVA_HOME/bin:$PATH"
```

`adb` lives in the Android SDK `platform-tools/` (Windows default:
`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`). Same `assembleDebug`
+ `adb install -r` flow applies to `android-pay/` and `android-comm/`.

---

## 16. Definition of done (per feature)

1. Spec match — implemented per this document, updated if scope changed.
2. Tests — unit (Vitest) + integration where applicable.
3. Lint + typecheck pass, no warnings.
4. Manual test pass on iOS + Android.
5. Localisation — strings in Swedish + English; date/currency format
   verified.
6. Reviewed by DB before merge to main.

---

## 17. Open decisions

| # | Decision | Blocking |
|---|---|---|
| OD-A | Default transactional email provider — Resend or Postmark | Kvitto email |
| OD-B | Whether the backup export prompt is weekly / monthly / per-N-transactions | UX |
| OD-C | Whether v1.1 multi-device uses BIP-32 sub-key derivation or shared-seed | Multi-device |
| OD-D | Whether to ship the placeholder address format (Ethereum-style keccak) or wait for the FutureChain Rust core | Wallet address derivation |

Closed since v1.0:

- ~~OD-01 PWA vs RN — closed in ADR-001 (RN)~~
- ~~OD-02 Two-app model — already closed, still applies~~
- ~~OD-03 Safello API contract — N/A, no longer integrate~~
- ~~OD-04 FTC valuation methodology — read live from FutureChain RPC at confirmation time~~
- ~~OD-05 Refund window default — 90 days, configurable in Settings~~
- ~~OD-06 Daily settlement time — N/A, Safello operates independently~~
- ~~OD-07 Backend stack — N/A, no backend~~
- ~~OD-08 Hosting — N/A~~
- ~~OD-09 PIN length — deferred until §11.2 lands~~
- ~~OD-10 Multi-currency display — v2.0~~
- ~~OD-11 Bank account verification — Safello handles~~
- ~~OD-12 Branding — "ANTON Business"~~
- ~~OD-13 Pricing — N/A, no service to charge for~~
- ~~OD-14 Manual settlement in Phase B — N/A, always was~~

---

## 18. References

### 18.1 In-repo

- `anton-business/docs/adr/` — ADRs 001, 003, 004 (002 + 005 superseded).
- `anton-business/_archive/` — rolled-back v1.0 backend + delegation code.
- `anton-business/packages/futurechain-sdk/` — shared TS SDK.
- `anton-business/tests/fixtures/reference.json` — parity fixtures for
  the v1 reference encoder.
- `CLAUDE.md` — repo-wide context.

### 18.2 External

- ISO 20022 PACS.008.001.13 schema (iso20022.org).
- BIP-39 (mnemonic).
- @noble/curves + @noble/hashes documentation.
- Skatteverket guidance on kvitto and certifierade kassaregister.
- Bokföringslagen (1999:1078).
- Penningtvättslagen (2017:630) — for context, not our problem.

### 18.3 Pending vendor

The FutureChain Rust core artifacts referenced by the v1.0 spec are
still not in this repo. The `wallet`, `pacs008`, and `rpc` modules in
`@futurechain/sdk` need the canonical Rust types vendored into
`docs/futurechain/` before they can shed their placeholder status:

- `iso20022_pacs008.rs` — canonical PACS.008.001.13 structs
- `wallet.rs` — canonical address derivation
- `heimdall_client.rs` — RPC compliance integration

Until these are available, the SDK uses an Ethereum-style placeholder
address derivation (keccak-256 of uncompressed pubkey, last 20 bytes,
"fc_" hex). The TS↔Rust parity tests in `_archive/` proved the
placeholder is consistent across language boundaries; swapping in the
real wallet.rs is a localised change.

---

*Prepared by FutureChain AB. Confidential. v2.0 supersedes v1.0.*
