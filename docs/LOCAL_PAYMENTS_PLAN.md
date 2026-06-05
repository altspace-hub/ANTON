# ANTON Local — Payments Plan (bring Pay + Business capabilities to the desktop)

**Status:** scoping done (2026-06-04, 4-agent investigation). Not yet started.
Goal: surface the polished wallet (Pay) + merchant (Business) payment capabilities
inside ANTON Local's existing FutureChain/Payments pillar.

## The key finding: the foundation already exists

ANTON Local is **not** starting from zero. It already has a real, server-side wallet:

- **UI:** `src/pages/futurechain/*` — 8 pages (Dashboard, Wallets, Transactions,
  Marketplace, Budget, KYC, Settings, Gateway).
- **Routes:** `server/routes/fc-{wallets,transactions,marketplace,budget,settings,gateway}.ts`.
- **Services:** `server/services/fc-wallet-service.ts` (BIP-39 → Ed25519, privkey + mnemonic
  **encrypted at rest** in `fc_wallets` under `INSTANCE_KEY_ENCRYPTION_KEY`, per-wallet PBKDF2,
  audit-logged decrypt) + `fc-transaction-service.ts` (UTXO fetch → `Pacs008Builder` →
  `buildSignedPacs008Transaction` server-side → submit → 5-min confirmation poller).

**But:** it defaults to **stub mode** (demo address `fc_STUB_…` + fake balance) and the React UI
does **zero crypto** — and it's missing essentially all the polish the phone apps gained.

## The architectural win: server-side signing is the RIGHT local-first model

The hard problem on mobile — secure key storage — is **already solved for desktop**: keys live
**encrypted in the local Postgres**, on the user's **own machine**, and signing happens
**server-side** (the browser never sees a private key). That's cleaner than the Capacitor
keystore + native-signer dance. And **~95% of the valuable logic is in the shared
`@futurechain/sdk`** (in `anton-business/packages/futurechain-sdk/`) or pure functions —
portable as-is:

| Shared-already / easy-port (just surface + wire) | Needs a desktop adaptation |
|---|---|
| Wallet gen, address derivation, PACS.008 build, **signing** | Secure key store → **use the existing server at-rest encryption** (done) |
| Tax engine (K4, FIFO/LIFO cost-basis), payment-type classification | Biometric/native-signer → server-side signing + session token / passphrase |
| Fraud engine (advisory scorer), Travel-Rule, address-poisoning guard | Background poll (WorkManager) → server timer / user refresh |
| QR encode/decode (futurechain:pay, fountain-coded UR) | Local notifications → desktop/Electron notifications |
| Z-report signing + verify, receipt tamper-chain, ISO envelope, terminal certs | IndexedDB storage → Postgres |

## What's actually missing (the real work)

1. **Browser ↔ server glue** — a REST layer the desktop UI calls: create/import wallet
   (mnemonic shown once), **unlock → short-lived signing-session token**, submit payment
   (server decrypts + signs + submits), balance/UTXOs, mnemonic backup. None of this exists yet
   (`mission-payments.ts` is mission-specific).
2. **Out of stub mode** — node config UX + a one-time **server enrollment** with the hub
   (bearer token in the DB) so `/submit_signed_transaction` works.
3. **Polished consumer send flow** — bring Pay's fee/total/(SEK), Travel-Rule gate,
   address-poisoning guard, fraud advisory, payment types/identity, status lifecycle into the
   desktop Transactions page.
4. **Receive / Tax / Scheduled** — rich receive QR; K4 + ledger export (pure SDK); scheduled
   reminders (desktop notification).
5. **Merchant surface (new)** — ANTON Local has *no* merchant side: payment-request QRs,
   receipts + reconciliation (inbound matcher), signed Z-reports, watch-only company wallet,
   terminal certs. Logic is largely shared/pure; the surface is new.

## Proposed phases

- **Phase 0 — Foundation (prereq for everything).** REST wallet/payment API on the server with
  **server-side signing + session tokens** (browser never holds a key); server auto-enrolls with
  the hub on startup; flip real-mode on when a node is configured + reachable; mnemonic-backup +
  unlock UX. Reuses `fc-wallet-service` / `fc-transaction-service` as-is.
- **Phase 1 — Consumer send (Pay parity).** Surface the shared send-flow logic in the desktop UI:
  amount → fee/total → Travel-Rule + look-alike + fraud gates → confirm → sign (server) → status.
- **Phase 2 — Receive + Tax + Scheduled.** Receive QR (creditor party), K4/ledger export,
  scheduled payments with desktop reminders.
- **Phase 3 — Merchant surface (Business parity).** A merchant section: payment requests,
  receipt reconciliation, signed Z-reports, watch-only wallet, terminal certs (relay registry).
- **Phase 4 — Hardening.** Electron `safeStorage` wrap of the master key; FALCON-512 (post
  hard-fork); desktop attestation for the hub gate; audit-actor identity for browser sign requests.

## Locked decisions (2026-06-04)
1. **Near-term scope: CONSUMER WALLET (Pay parity) first** — Phase 0 foundation, then Phase 1 send/receive.
   Merchant surface (Phase 3) comes later.
2. **Signing model: SERVER-SIDE signing + short-lived session tokens.** Keys stay encrypted in the
   local Postgres; the browser never holds a private key. (Electron `safeStorage` outer-wrap is a
   Phase-4 hardening add, not now.)
3. Real-mode default vs opt-in: TBD during Phase 0 (lean toward: auto-real when a node is reachable,
   else keep the Settings node config as the switch).

## Reuse map (don't rebuild)
`@futurechain/sdk` (wallet/rpc/pacs008/tax) · `server/services/fc-wallet-service.ts` ·
`server/services/fc-transaction-service.ts` · `server/util/at-rest-encryption.ts` ·
`server/services/credential-vault.ts` · the pure logic in `src/pay/services/*`
(payment, fraud-engine, travel-rule, address-book, payment-type, qr-transfer, schedules) and
`src/business/services/*` (z-reports, receipts, iso-envelope, terminal-cert, audit-chain) —
lift the pure cores, re-back their storage with Postgres, and call the SDK for crypto.
`apps/anton-agent-pay/` is the closest desktop precedent (Electron main-process signing).
