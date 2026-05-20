# HANDOFF — ANTON × FutureChain on a fresh Windows machine

**Audience:** the next Claude (or human) picking up ANTON × FutureChain
work after the May 20 2026 hardening pass, on a different machine. The
project state at handoff time is documented inline so you can be
productive without re-reading the May 20 conversation.

**Last updated:** 2026-05-20 (evening), after commits
`930bbd52 → 2a737141`.

**Companion docs (read these for depth on a specific topic):**
- `docs/FUTURECHAIN_INTEGRATION_PLAN.md` — the master integration plan
  (phases 0.1 through 5).
- `docs/PAY_APP_PHONE_TEST_PLAN.md` — the seven-step phone-test script
  for verifying the Pay app vertical slice on real Android / iOS.
- `docs/A2A_ROADMAP.md` — the agent-to-agent payment story (this is
  the "USP" the chain is being built around — FutureChain is the
  settlement rail for ANTON-to-ANTON commerce).
- `/home/daniel/FutureChain/ey_audit_package/13_ANTON_APPS_AND_PUBLIC_RPC.md`
  (on the *original* Linux machine, copy across if you need the
  exhaustive control list) — the EY audit chapter that formalises
  every app-side and Bahnhof-side control with framework citations.

---

## 1. What is ANTON, and how does it relate to FutureChain?

**ANTON** is a Capacitor 8 + Vite + React monorepo that ships three
mobile apps and a Node.js / Postgres server. The repository lives at
`https://github.com/altspace-hub/ANTON`. On disk during development:
`/home/daniel/openexpert/ANTON` (Linux dev box). On the Windows
machine, clone fresh — there is no Linux-specific build output that
needs to move.

**FutureChain** is the underlying compliance-first ISO 20022 PoW
blockchain. Repo: `https://github.com/danielbardun/FutureChain` (on
the Linux machine at `/home/daniel/FutureChain`). The chain is a
Rust workspace; the relevant binary is
`target/release/futurechain` (Linux) or
`target/x86_64-pc-windows-gnu/release/futurechain.exe` (cross-built
Windows binary, captured in commit `c5210df`).

**The interface between them is the @futurechain/sdk TypeScript
package** at `anton-business/packages/futurechain-sdk/`. The SDK is
the byte-exact mirror of the Rust signer + RPC schema. Every ANTON
app talks to the chain through this one package, never via ad-hoc
HTTP or hard-coded byte layouts.

```
┌─────────────────────────────────────────────────────────────┐
│  ANTON apps (Capacitor 8 + React 19)                        │
│  ┌────────┐  ┌──────────┐  ┌────────┐  ┌─────────────────┐  │
│  │ pay    │  │ business │  │ comm   │  │ companion       │  │
│  │ (QR    │  │ (QR      │  │ (chat  │  │ (phone remote)  │  │
│  │ scan + │  │ generate │  │ + tax  │  │ — Phase 4       │  │
│  │ pay)   │  │ + sell)  │  │ ledger │  │ NOT YET STARTED │  │
│  │        │  │          │  │ etc.)  │  │                 │  │
│  └────┬───┘  └────┬─────┘  └───┬────┘  └────────┬────────┘  │
│       │           │            │                │           │
│       ▼           ▼            ▼                ▼           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  @futurechain/sdk                                   │    │
│  │  - wallet/    Ed25519 keygen, HD derivation,        │    │
│  │               BIP-39 mnemonic, fc_… address         │    │
│  │  - pacs008/   ISO 20022 PACS.008.001.13 build +     │    │
│  │               signing (byte-exact mirror of Rust)   │    │
│  │  - rpc/       HTTP client — auth-key only on the    │    │
│  │               POST /submit_signed_transaction path  │    │
│  │  - reference/ ADR-004 v1 reference encoder          │    │
│  └─────────────────────┬───────────────────────────────┘    │
│                        │                                    │
│  ┌─────────────────────▼───────────────────────────────┐    │
│  │  ANTON-business server (anton-business/server/)     │    │
│  │  - fc-wallet-service.ts (agent + human wallets,     │    │
│  │    AES-256-GCM at rest, per-wallet PBKDF2 key)      │    │
│  │  - fc-transaction-service.ts (server-initiated      │    │
│  │    submissions for mission-budget settlement)       │    │
│  │  - audit_log (every privkey decrypt is logged)      │    │
│  │  Postgres via migrations-pg/, SQLite parallel       │    │
│  └─────────────────────┬───────────────────────────────┘    │
└────────────────────────┼────────────────────────────────────┘
                         │  HTTPS, X-API-Key bearer
                         │  (auth ONLY on POST /submit_signed_transaction)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  Bahnhof public RPC hub — https://rpc.futurechain.eu         │
│  Linux VM 79.136.1.113, Caddy 2.11 + Let's Encrypt           │
│  - Reverse-proxies 7 allowed paths to localhost:8545         │
│  - Everything else → 404                                     │
│  - Access log redacts X-Api-Key / Authorization / Cookie     │
│  - HSTS + CSP + X-Frame-Options + X-Content-Type-Options     │
│  - UFW: 22/80/443/30303 only                                 │
│  - fail2ban: caddy-401 jail (30 fails/5min → 2h ban)         │
└──────────────────────────────┬───────────────────────────────┘
                               │  HTTP localhost
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  FutureChain light-hub node                                  │
│  /home/ubuntu/futurechain/futurechain node                   │
│      --rpc-port 8545 --port 30303                            │
│      --node-type light-hub --light-hub-window-days 7         │
│  - No mining, no Heimdall                                    │
│  - 7-day in-memory block window                              │
│  - Gossips to Node 1 + Node 2 over the 30303 P2P port        │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. The payment flow, end-to-end

This is the path that has the most moving parts. Trace it once;
everything else clicks into place.

### 2.1 Merchant generates a QR (Business app)

`src/business/pages/SimpleScreen.tsx` (or `ExtendedScreen.tsx`) calls
`src/business/services/qr.ts::buildPayUri(merchant, amount, ref)`.
The URI shape is:

```
futurechain:pay?to=fc_VLak…&amount=<microFTC>&ref=<ADR-004-v1-string>
              &cn=<creditor-name>&cc=<creditor-country>
              &cct=<city>&cst=<street>&cpc=<postcode>
```

- `to` = the merchant's `fc_…` Base58 address.
- `amount` = micro-FTC (1 FTC = 1_000_000 µFTC = 100_000_000 satoshi).
- `ref` = the ADR-004 v1 reference, encoded via
  `@futurechain/sdk/reference.encodeV1({merchantId, version, purpose, orderId})`.
  Purpose codes: `RETAIL`, `RESTAURANT`, `EVENT`, `SERVICE`, `REFUND`.
- `cn / cc / cct / cst / cpc` = the optional ISO 20022 creditor party
  fields, surfaced into the PACS.008 `Cdtr.Nm / CtryOfRes` and
  `CdtrAcct.PstlAdr.*`.

The merchant address is derived from a real Ed25519 keypair as of
2026-05-20 (commit `2a737141`). Pre-`2a737141`, the merchant wallet
was a secp256k1 stub — the `fc_…` address it produced was a "ghost"
address with no recoverable keypair. **If you find a pre-Phase-C2
merchant wallet in production data, treat its address as unspendable
and re-create the wallet on first login.**

### 2.2 Customer scans the QR (Pay app)

`src/pay/pages/ScanScreen.tsx` uses `@capacitor/barcode-scanner` to
scan and pass the URI to `src/pay/services/payment.ts::decodePayUri`.
The decode is pure logic:

1. Validate the `futurechain:pay?` envelope.
2. Parse query params with the `URL` constructor.
3. Validate the `to=` address has the `fc_` Base58 shape.
4. Validate `amount=` as a positive bigint of µFTC.
5. Decode the `ref` via `reference.decode` — this gives back the
   merchant id, version, purpose, and order id.

Result: a `DecodedPayment` object. The UI displays it on
`ReviewScreen.tsx` — strictly read-only. **The same fields that
display are the fields that sign — no edit between review and sign.**

### 2.3 Customer taps Pay → biometric → sign → submit

`ReviewScreen.tsx` calls `executePayment(decoded, risk)` in
`payment.ts:225`. The sequence (post-Phase-B1 — May 20 2026):

1. Load `payerIdentity` (display name, IBAN, etc., from local profile)
   and the Ed25519 `Wallet` from secure storage.
2. **Biometric gate** (`requireBiometric({reason: 'Send X FTC to fc_…'})`).
   On a real device this surfaces Face ID / Touch ID / fingerprint /
   device-credential fallback. On web / vitest / Node CLI it returns
   `{ok:true, skipped:true}` so the e2e smoke (`pay-app-e2e-smoke.mts`)
   keeps working without a phone.
3. On cancel/unavailable → persist a `failed` `PaymentRecord` with
   `error: 'biometric cancelled'` and return. No tx is built.
4. Fetch the wallet's UTXOs via the cached `RpcClient` →
   `https://rpc.futurechain.eu/get_utxos/<addr>` (read endpoint, no
   bearer token sent — Phase A2 May 20 change).
5. Build the PACS.008 message via `pacs008.buildPacs008` with the
   debtor / creditor parties, amount, and remittance text.
6. Build + sign the `Transaction` via
   `pacs008.buildSignedPacs008Transaction({wallet, utxos, recipient,
   amountSatoshi, feeSatoshi: 100, pacs008, uetr})`. The signer is
   byte-exact against `transaction.rs:593-632`.
7. POST to `/submit_signed_transaction` via
   `rpc.submitSignedTransaction(tx)`. The SDK attaches `X-API-Key`
   ONLY on this path (post-Phase-A2). Bahnhof's Caddy verifies the
   key against `RPC_BEARER_TOKEN`; the FC light-hub verifies it again
   against `LIGHT_HUB_API_KEYS` (defense in depth).
8. Persist a `PaymentRecord` with status `queued|accepted|failed` and
   spawn a background poller (`pollConfirmation`).
9. Poller watches `/get_utxos/<recipient>` for a UTXO carrying our
   `tx_id`. When it appears, the tx has been MINED — update the
   record to `confirmed` with `confirmedAt`. (Polling `/transaction`
   is unreliable because the FC node's `get_transaction` searches the
   mempool first; the recipient's spendable UTXO set, by contrast,
   only reflects mined output.)
10. `PaymentDoneScreen.tsx` on mount re-arms the poller if the record
    is non-terminal — covers the case where the OS killed the original
    fire-and-forget poller during a background period (commit
    `96988caa`).

### 2.4 Merchant verifies receipt

For now this is local-display only. The Business app's
`SimpleScreen` / `ExtendedScreen` lifts the receipt off the wallet
state. Tying the merchant view to the on-chain confirmation (the
opposite side of the same UTXO poll) is on the C3 "comm + business
send/receive" path documented as a follow-up in commit `2a737141`.

---

## 3. ISO 20022 fields used

The PACS.008.001.13 message shape produced by
`@futurechain/sdk/pacs008.buildPacs008` (see
`anton-business/packages/futurechain-sdk/src/pacs008/index.ts:273-320`):

```json
{
  "document": {
    "FIToFICstmrCdtTrf": {
      "GrpHdr": {
        "MsgId": "MSGID-<16-hex>",
        "CreDtTm": "2026-05-20T17:51:43Z",
        "NbOfTxs": "1",
        "SttlmInf": { "SttlmMtd": "CLRG" }
      },
      "CdtTrfTxInf": [{
        "PmtId": {
          "InstrId": "INSTR-<16-hex>",
          "EndToEndId": "E2E-<16-hex>",
          "TxId": "TXID-<16-hex>",
          "UETR": "<uuid-v4>"
        },
        "IntrBkSttlmAmt": { "@Ccy": "FTC", "$value": 0.1 },
        "ChrgBr": "SLEV",
        "Dbtr": { "Nm": "<payer-name>", "CtryOfRes": "SE" },
        "DbtrAcct": { "Id": { "Othr": { "Id": "fc_…" } } },
        "DbtrAgt": { "FinInstnId": { "BICFI": "TESTSE33XXX", "Nm": "Test Bank SE" } },
        "CdtrAgt": { "FinInstnId": { "BICFI": "TESTSE33XXX", "Nm": "Test Bank SE" } },
        "Cdtr": { "Nm": "<creditor-name>", "CtryOfRes": "SE" },
        "CdtrAcct": { "Id": { "Othr": { "Id": "fc_…" } } },
        "Purp": { "Cd": "SUPP" },
        "RmtInf": { "Ustrd": ["<remittance-string>"] }
      }]
    }
  },
  "futurechain_metadata": {
    "compliance_checked": false, "kyc_verified": false,
    "aml_checked": false, "sanctions_checked": false,
    "risk_score": 0.1, "processing_timestamp": "<iso8601>",
    "blockchain_tx_id": null, "node_type": "archive",
    "network_id": "mainnet"
  }
}
```

**Key things to know:**
- **UETR** is the SWIFT GPI End-to-End Reference — a uuid-v4
  generated at build time. The chain uses it to dedup the tx in the
  mempool window.
- **Currency** is literal `"FTC"`; amounts are decimals (not
  satoshis) in the message body. The signing path converts to satoshi
  internally for UTXO arithmetic.
- **`Purp.Cd`** is the ISO 20022 external purpose code, mapped from
  the ADR-004 v1 purpose via
  `PURPOSE_TO_ISO` in `src/comm/services/pacs008-draft.ts:30`.
- **`futurechain_metadata`** is FutureChain-specific. The
  `compliance_*` flags are populated by Heimdall on the chain side
  (when present); they are NOT signed by the client.
- **`RmtInf.Ustrd`** carries the ADR-004 reference. There is NO
  `Max140Text` length check on Ustrd in this implementation —
  Daniel's standing preference (memory entry
  `feedback_iso_text_limits`) is that we allow long remittance
  strings; do NOT add the 140-char limit unless asked.

---

## 4. Secrets — where they live, and what NOT to commit

| Secret | Location | Notes |
|---|---|---|
| **Bahnhof bearer** (`RPC_BEARER_TOKEN` / `LIGHT_HUB_API_KEYS`) | `/etc/caddy/auth.env` + `/etc/systemd/system/futurechain-node.service.d/api-keys.conf` on `79.136.1.113`; client copy is `DEFAULT_API_KEY` in `src/pay/services/fc-rpc.ts` | **Current value (rotated 2026-05-20):** `4fc4de103453fa356ead6bdf72f217dcf1720d427de1e4245d5709119433a941`. Prior token was leaked into 184+ access-log lines before the redaction landed — see `git log -- anton-business/packages/futurechain-sdk/src/rpc/index.ts`. Rotate again before public release. |
| **Bahnhof SSH key** (`bahnhof_futurechain`) | `~/.ssh/bahnhof_futurechain` on the original Linux machine | Copy across to the Windows machine if you need SSH. User `ubuntu` on `79.136.1.113`. |
| **DB003 mining wallet** (`fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs`) | Wallet file in `/home/daniel/FutureChain/futurechain/wallets/` | Password is in the FutureChain memory entry `reference_secrets.md`. Used as the funding source for `pay-app-e2e-smoke.mts`. |
| **`INSTANCE_KEY_ENCRYPTION_KEY`** (server side) | Env var on ANTON-business server | 32 bytes of hex. When unset, server falls back to plaintext + a one-time stderr warning (dev only). Production deployment MUST set this. |
| **`COMPLIANCE_SIGNING_SALT`** (FutureChain miner side) | Env var on Node 2 in the dev topology | Memory entry `project_pay_slice_complete_may20_2026.md` documents this. Value: `COMPLIANCE_SIGNING_KEY`. Without it Node 2's miner refuses gossiped txs. |
| **App-enrollment AES key** | Generated per install, derived from instance ID | Used by `app-enrollment-service.ts` for the companion-app pairing flow. |
| **Capacitor SecureStorage entries** | OS keystore — never disk-readable | Mnemonic, privkey, address, "backed up" flag. See `src/pay/services/secure-store.ts` + `wallet.ts`. |

**What NOT to commit, ever:**
- The bearer token in any plaintext form OTHER than
  `src/pay/services/fc-rpc.ts::DEFAULT_API_KEY` (which is intentional
  for the closed-test phase — see TODO at that line).
- Wallet passwords.
- Mnemonic phrases.
- The contents of `auth.env` or `api-keys.conf`.
- `.env` files containing `INSTANCE_KEY_ENCRYPTION_KEY` or any DB
  password.

`.gitignore` already excludes `**/.env*`, `wallets/`, and the
`futurechain/blockchain_data*/` chain-state directories. Verify on
the Windows clone before staging anything.

---

## 5. State of each ANTON app (as of 2026-05-20)

### Pay app — **production-ready vertical slice**
- Real Ed25519 wallets + Bahnhof submission verified end-to-end live
  (block `805,059` on 2026-05-20).
- Biometric gate wired on `getMnemonicWithBiometric` +
  `restoreFromMnemonic` + `executePayment`.
- Secure-store is fail-closed on native platforms.
- `PaymentDoneScreen` re-arms the confirmation poller on mount.
- Tests: **61/61 pass**.
- Phone-test plan: `docs/PAY_APP_PHONE_TEST_PLAN.md` (commit
  `4e3e3c0a`).

### Business app — **wallet migrated, no UI changes today**
- Wallet swapped from secp256k1 stub to real Ed25519 (commit
  `2a737141`). `publicKeyCompressed` renamed to `publicKey` on the
  Wallet interface — internal-only, no UI callers touched it.
- Biometric + fail-closed `secure-store` ported in.
- Mnemonic + restore-from-mnemonic primitives now exist; backup UI
  (BackupShow / BackupVerify / Settings re-display) is NOT yet built
  for Business — it's the same screens the Pay app already has and
  can be lifted with minimal change.
- The merchant doesn't sign transactions today (only generates QR
  codes), so the absence of an `executePayment` is fine.
- Tests: **54/54 pass**.

### Comm app — **wallet migrated, send is still local-only**
- Same wallet swap as Business (commit `2a737141`).
- The Comm app's `WalletSendScreen` records local-only `send` txs.
  When the Comm wallet wires up to Bahnhof, the signing path will
  mirror `src/pay/services/payment.ts::executePayment`. The Pay app
  is the reference implementation.
- The stale comment in `src/comm/services/pacs008-draft.ts` was
  updated (the SDK's `Pacs008Builder` is implemented, not stubbed —
  the inventory was wrong).
- Tests: **117/117 pass**.

### ANTON-local server (anton-business/server/) — **code ready, light-hub bundle pending**
- `fc-wallet-service.ts`: real Ed25519 mode works when
  `fc_connection_config.stub_mode = FALSE` and a node URL is set.
- Phase B3 (May 20): per-row envelope encryption
  (PBKDF2(master, sha256("anton:envelope:v2:" + wallet_id),
  100_000, sha256, 32) → per-wallet AES-256-GCM key). `key_version`
  column on `fc_wallets` discriminates v1 (legacy direct-master) vs
  v2 (envelope). See migration 211 / 090.
- Phase B4 (May 20): `wallet_audit_log` table — every privkey
  decrypt + signing logs ok / denied / error. See migration 212 / 091.
- Pending: bundling the FC light-hub binary into the portable
  ANTON-local runtime. The Linux→Windows cross-compile worked
  (commit `c5210df` on FutureChain, `82993133` on ANTON), but the
  scripts (`scripts/portable/run-anton.ps1`) need to be updated to
  spawn the `futurechain.exe` as a sibling supervised process. See
  memory entry `project_anton_phase2_thrust_a_may20_2026.md` for the
  detailed unblocker steps.

### Companion app — **NOT STARTED**
- Phase 4 in the FUTURECHAIN_INTEGRATION_PLAN. No wallet code, no
  payment instruction endpoint. The plan calls for biometric-gated
  payment instructions delivered to ANTON-local over the mesh relay,
  with ANTON-local performing the actual signing + submission.

---

## 6. Known gaps and follow-ups

| Gap | Severity | Suggested next step | Reference |
|---|---|---|---|
| Per-build / per-install bearer tokens | HIGH (before public release) | xcaddy + caddy-ratelimit, then move to onboarding-handshake token provisioning | EY ch 13 §10.2 |
| FC light-hub doesn't enforce its own endpoint allowlist | MEDIUM | Add light-hub-mode endpoint refusal at the FC application layer | EY ch 13 §5.4 |
| Comm app on-chain send path | MEDIUM | Mirror pay/payment.ts::executePayment for Comm | this doc §5 |
| Business app backup UI (Backup{Show,Verify} + Settings re-display) | MEDIUM | Lift the Pay-app screens with minimal change | this doc §5 |
| Companion app entirely | MEDIUM | Phase 4 of FUTURECHAIN_INTEGRATION_PLAN | docs/FUTURECHAIN_INTEGRATION_PLAN.md |
| Lazy migration of v1 → v2 envelope rows | LOW | Operator-callable `migrateWalletToV2(walletId)` | EY ch 13 §10.7 |
| ANTON-local light-hub bundle | MEDIUM | Update scripts/portable/run-anton.ps1 to spawn futurechain.exe | memory `project_anton_phase2_thrust_a_may20_2026.md` |
| iOS jailbreak / Android root detection | LOW | Add only when ANTON moves to B2B profile (false-positive cost is high on consumer) | EY ch 13 §10.6 |
| Settings-driven RPC endpoint | LOW | Pay app currently hard-codes `https://rpc.futurechain.eu` in `fc-rpc.ts` | future Settings screen |
| `iso_received` receive history | LOW | Pay-app History screen could poll `/iso_received/<addr>` to show inbound | FUTURECHAIN_INTEGRATION_PLAN.md §3 |

---

## 7. Bringing up the dev environment on Windows

Assuming a fresh Windows 11 machine with PowerShell as the default
shell, no prior ANTON / FutureChain checkout:

### 7.1 Install toolchain
- Node.js 22+ LTS (the repo uses pnpm via Corepack).
- Git for Windows.
- Visual Studio Code (or Cursor) with the TS server.
- Android Studio (for the Pay app on Android).
- Xcode is macOS-only; if you need iOS testing, that needs a Mac.
- Capacitor CLI is bundled via `npx`.

### 7.2 Clone + bootstrap
```pwsh
git clone https://github.com/altspace-hub/ANTON anton
cd anton
corepack enable
pnpm install
```

Verify:
```pwsh
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec vitest run -c vitest.config.pay.ts     # expect 61/61 pass
pnpm exec vitest run -c vitest.config.business.ts # expect 54/54 pass
pnpm exec vitest run -c vitest.config.comm.ts    # expect 117/117 pass
```

### 7.3 SSH to Bahnhof
Copy `~/.ssh/bahnhof_futurechain` from the Linux machine to the
Windows `%USERPROFILE%\.ssh\` directory. Then:
```pwsh
ssh -i $env:USERPROFILE\.ssh\bahnhof_futurechain ubuntu@79.136.1.113
```

(If WSL2 is available, use that — the existing Linux scripts work
unchanged from inside WSL2.)

### 7.4 Build the Pay app for Android
```pwsh
pnpm run build:pay
pnpm exec cap sync android
pnpm exec cap open android
```
Then in Android Studio, run on a connected device. App id is
`com.futurechain.anton.pay`. The full phone-test script is in
`docs/PAY_APP_PHONE_TEST_PLAN.md`.

### 7.5 Bundled FC light-hub (if you need it for ANTON-local)
The Linux→Windows cross-compile produced
`runtimes-source/futurechain/futurechain.exe` (commit `82993133`).
On Windows, that binary should run natively. The launch script is
`scripts/portable/Start FutureChain.bat` — it prompts for mode
(light-hub / standard / mine) and `--connect` seed (default Bahnhof).
See memory entry `project_anton_phase2_thrust_a_may20_2026.md` for
the design rationale.

---

## 8. The "what do I do first" checklist

1. **Read this document end-to-end.** ~15 min.
2. **Read `docs/FUTURECHAIN_INTEGRATION_PLAN.md`** for the phase-by-
   phase plan that the May 20 commits delivered.
3. **Read commits `930bbd52`, `cfa73171`, `2a737141`** (in that
   order) — those are the May 20 hardening pass.
4. **Probe Bahnhof from your machine:**
   ```pwsh
   curl https://rpc.futurechain.eu/info
   curl https://rpc.futurechain.eu/health
   ```
   Should return JSON in both cases. If not, SSH in and check
   `systemctl status caddy futurechain-node`.
5. **Run the Pay-app E2E smoke** (needs a funded DB003 wallet on a
   reachable Node 1 + a running Node 2 miner):
   ```pwsh
   $env:FC_FUND_NODE_URL = "http://<linux-box-ip>:8545"
   $env:FC_FUND_WALLET = "fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs"
   $env:FC_FUND_PASSWORD = "<from memory_secrets>"
   $env:FC_RPC_API_KEY = "4fc4de103453fa356ead6bdf72f217dcf1720d427de1e4245d5709119433a941"
   pnpm exec tsx anton-business/packages/futurechain-sdk/scripts/pay-app-e2e-smoke.mts
   ```
   On success you'll see "MINED in block <height>" within ~30-60 s.
6. **Pick your next task** from §6 above. The MEDIUM-severity items
   (Comm send path, Business backup UI, ANTON-local light-hub
   bundle) are the natural follow-ons.

---

## 9. Useful one-liners

```bash
# What did we ship on May 20?
git log --oneline 4e3e3c0a..HEAD

# Verify the SDK no longer sends X-API-Key on read endpoints
pnpm exec vitest run -c vitest.config.ts \
  anton-business/packages/futurechain-sdk/src/rpc/rpc.test.ts \
  -t "does NOT send X-API-Key"

# Show the current Bahnhof config (SSH required)
ssh -i ~/.ssh/bahnhof_futurechain ubuntu@79.136.1.113 \
  'sudo cat /etc/caddy/Caddyfile'

# Verify the token isn't in the Caddy log (should print 0)
ssh -i ~/.ssh/bahnhof_futurechain ubuntu@79.136.1.113 \
  'sudo grep -c "4fc4de10" /var/log/caddy/access.log'

# Confirm UFW + fail2ban running
ssh -i ~/.ssh/bahnhof_futurechain ubuntu@79.136.1.113 \
  'sudo ufw status && sudo fail2ban-client status caddy-401'

# Verify the FC node is in light-hub mode
ssh -i ~/.ssh/bahnhof_futurechain ubuntu@79.136.1.113 \
  'ps -ef | grep "[f]uturechain node"'

# Show the per-wallet envelope tests in action
pnpm exec vitest run -c vitest.config.ts tests/util/at-rest-encryption.test.ts
```

---

## 10. Where to ask for help

- **Daniel** runs FutureChain AB; he is the source of truth for any
  judgement call (compliance scope, threat-model assumptions,
  spending priorities). When in doubt, ask before doing.
- **The EY audit chapter** (`13_ANTON_APPS_AND_PUBLIC_RPC.md` on the
  Linux machine) is the formal record of every control the May 20
  hardening landed. If you change a control's implementation, update
  the chapter — the EY revalidation will compare them.
- **The FUTURECHAIN_INTEGRATION_PLAN.md** is the living roadmap.
  Cross out completed phases; add new ones; keep it the single source
  of "what's next" for the Anton×FutureChain integration.

Good luck. Everything that matters is in here, the commits, or the
referenced docs. If something contradicts, trust the code.
