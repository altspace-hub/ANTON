# ANTON — Session Handover (2026-06-10)

A handover for resuming on a fresh machine / new session. Everything below is
ground-truthed against the repo as of commit `050683da` on `main`.

---

## 0. 🔑 CRITICAL — BACK THESE UP BEFORE WIPING THE MACHINE

The 4 Android **release keystores** exist **ONLY on this machine** — they are
gitignored and were never committed. **If you lose them you can NEVER update the
published apps** (Google Play rejects an APK signed with a different key). This is
the single highest-risk item.

Back up (copy to an encrypted USB / password manager / secure cloud) **both** the
`.keystore` file **and** its `keystore.properties` (the properties file holds the
store password + key alias + key password needed to use the keystore):

| App | Keystore file (absolute) | Alias | Credentials file |
|---|---|---|---|
| **Companion** | `C:\ANTON_PostgreSQLv2\android\anton-release.keystore` | `anton` | `C:\ANTON_PostgreSQLv2\android\keystore.properties` |
| **Comm** | `C:\ANTON_PostgreSQLv2\anton-comm-release.keystore` | `anton-comm` | `C:\ANTON_PostgreSQLv2\android-comm\keystore.properties` |
| **Pay** | `C:\ANTON_PostgreSQLv2\anton-pay-release.keystore` | `anton-pay` | `C:\ANTON_PostgreSQLv2\android-pay\keystore.properties` |
| **Business** | `C:\ANTON_PostgreSQLv2\anton-business-release.keystore` | `anton-business` | `C:\ANTON_PostgreSQLv2\android-business\keystore.properties` |

Quick copy-all (PowerShell), adjust the destination:
```powershell
$dest = "D:\ANTON-keystore-backup"   # an ENCRYPTED drive
New-Item -ItemType Directory -Force $dest
Copy-Item C:\ANTON_PostgreSQLv2\android\anton-release.keystore        "$dest\companion-anton-release.keystore"
Copy-Item C:\ANTON_PostgreSQLv2\android\keystore.properties           "$dest\companion-keystore.properties"
Copy-Item C:\ANTON_PostgreSQLv2\anton-comm-release.keystore           $dest
Copy-Item C:\ANTON_PostgreSQLv2\android-comm\keystore.properties      "$dest\comm-keystore.properties"
Copy-Item C:\ANTON_PostgreSQLv2\anton-pay-release.keystore            $dest
Copy-Item C:\ANTON_PostgreSQLv2\android-pay\keystore.properties       "$dest\pay-keystore.properties"
Copy-Item C:\ANTON_PostgreSQLv2\anton-business-release.keystore       $dest
Copy-Item C:\ANTON_PostgreSQLv2\android-business\keystore.properties  "$dest\business-keystore.properties"
```

**Also worth backing up** (not strictly app-signing but go-live identity):
- The **instance Ed25519 private key** lives encrypted in Postgres (`instance_identity.privkey_encrypted`) under `INSTANCE_KEY_ENCRYPTION_KEY` from `.env` — so back up your **`.env`** file (it holds API keys + DB creds + the instance-key-encryption key).
- The phones' **wallet recovery phrases** are in each phone's Keystore (BIP-39). They are NOT on this PC. If a phone is lost, those wallets are gone unless the user wrote the phrase down.

---

## 1. What this session accomplished

Two features, both fully shipped + pushed to `main`:

### A. Remittance templates (structured PACS.008 RmtInf) — task #117
A "blueprint" for the payment text/contract field: 7 templates (free-text,
information, invoice, quote, agreement/contract, receipt, donation). Sender picks
one; the structure rides in the existing `AntonRemittance` (`meta.tpl`), no SDK
change. Pay + Comm send & receive; Business displays. Commits `892bd2ad`,
`08e6b0c5`. See `memory/project_remittance_templates.md`.

### B. Two-party Contract/Agreement v1 — tasks #118–123 (COMPLETE)
A real signed agreement: **propose → Accept / Counter / Decline / Withdraw →
bound record**, both sides. Designed from a multi-agent investigation workflow.
- **Comm** = the full signed round-trip (private, E2E, two Ed25519 signatures).
- **Pay/Business** = "settlement" tier — the agreement rides **on-chain in the
  PACS.008 RmtInf** (public, retrievable via `/iso_received`), bound by an echoed
  `agreementId`. Never labelled "signed".
- **Two trust tiers are kept visually/textually distinct** so the product never
  overclaims a signed contract on the on-chain legs.
- **Device-verified on two phones** over the live relay: the propose→accept
  round-trip AND the propose→counter→accept negotiation both pass.
- ~70 unit tests (every red-team attack: verdict-flip, replay, forgery,
  stale-head, nonce reuse, counter tamper, cap, head-selection).
- Commits `4a329980` (Phase 0) → `050683da` (counter device test).
- Full detail: `memory/project_agreements_v1.md` (READ THIS FIRST to resume).

**Working tree note:** `git status` shows only leftover churn unrelated to this
work — `android/app/capacitor.build.gradle` + `android/capacitor.settings.gradle`
(a stale `@capacitor/filesystem` cap-sync entry from an earlier task) and an
untracked scratch file `tests/device/tmp-drive.cjs`. Safe to ignore or `git
checkout`/delete.

---

## 2. ANTON — what it is

**ANTON by openEXPERT** (`openexpert` v0.7.5) — a local-first AI expert workspace
(React 18 + TS + Vite 6 + Express + PostgreSQL 16, Anthropic Claude default).
Runs on localhost; documents stay on the machine. Organised into **pillars**
(Work, School, Life, Markets, Community, Portals, Missions, Payments/FutureChain,
etc.). The authoritative project guide is **`CLAUDE.md`** at the repo root — read
it first; it documents the stack, architecture, pillars, and conventions.

### The 4 companion Android apps (separate Vite builds + Capacitor wrappers)
| App | Source | Android project | Package | Purpose |
|---|---|---|---|---|
| **Companion** | `src/app/` | `android/` | `com.futurechain.anton.companion` | ANTON-Local companion (pairing, approvals, voice) |
| **Comm** | `src/comm/` | `android-comm/` | `com.futurechain.anton.communication` | E2E messenger + wallet + Pulse social |
| **Pay** | `src/pay/` | `android-pay/` | `com.futurechain.anton.pay` | Customer payments (scan + pay) |
| **Business** | `src/business/` | `android-business/` | `com.futurechain.anton.business` | Merchant POS (kvitto, Z-reports) |

All four are **per-app copies** (services duplicated, not shared) — a deliberate
pattern. Each has its own IndexedDB (`anton-comm`, `anton-pay`, `anton-business`).

**FutureChain** = the self-custody blockchain the wallets use; transactions are
ISO 20022 PACS.008; the SDK is `@futurechain/sdk`; the light RPC hub is
`rpc.futurechain.eu` (Bahnhof). Multi-endpoint/swappable RPC shipped (task #116).

---

## 3. Where all the information is

- **`CLAUDE.md`** (repo root) — the master project guide (read first).
- **`AGENTS.md`** — universal AI-assistant context.
- **`docs/`** — developer docs. Key files: `GO_LIVE_CHECKLIST.md`,
  `LEGAL_ACTION_BRIEF.md`, `A2A_ROADMAP.md`, `ARCHITECTURE.md`,
  `MULTI_PROVIDER_PARITY.md`, `PUSH_NOTIFICATIONS_PLAN.md`, `LOCAL_PAYMENTS_PLAN.md`,
  and many more.
- **Spec docs** at repo root: `ANTON_Portals_Spec.md`, etc.
- **Persistent memory (cross-session):**
  `C:\Users\danie\.claude\projects\C--ANTON-PostgreSQLv2\memory\`
  - `MEMORY.md` is the index (one line per memory) — loaded each session.
  - Each `project_*.md` / `feedback_*.md` / `reference_*.md` is one fact.
  - Most relevant now: `project_agreements_v1.md`, `project_remittance_templates.md`,
    `project_golive_readiness.md`, `reference_drive_companion_app_via_adb.md`,
    `reference_capacitor_plugin_registration.md`.
- **Git remote:** `https://github.com/altspace-hub/ANTON.git`, branch `main`.
  Everything from this session is pushed.

---

## 4. Running ANTON Local (the desktop app)

Prereqs: Node 22+, pnpm 10, PostgreSQL 16, (optional) Ollama. Full setup in
`CLAUDE.md` → Quick Start. Common commands:
```bash
pnpm install
pnpm run dev            # Vite :5173 + Express :3001
pnpm run db:init        # initialise Postgres schema
pnpm run db:migrate:pg  # run pending migrations
pnpm run typecheck      # tsc -p tsconfig.app.json (app) — server runs via tsx (lenient)
pnpm run build && pnpm run start   # production
```
`.env` (gitignored) holds `ANTHROPIC_API_KEY`, `DATABASE_URL`, optional provider
keys, `INSTANCE_KEY_ENCRYPTION_KEY`, etc. — see `.env.example`. **Back up `.env`.**

> ⚠️ Operator preference: **never kill node processes** — the user manages their
> own server. PostgreSQL only (no SQLite). Commit/push only when asked.

---

## 5. Building the Android apps

`tsc -p tsconfig.app.json` covers `src/` (NOT the server). Per-app build chain:

**Comm / Pay / Business** (manual asset copy — `cap sync` ignores their configs):
```powershell
pnpm build:comm:cap          # or build:pay:cap / build:business:cap
robocopy "dist\comm" "android-comm\app\src\main\assets\public" /MIR /NFL /NDL /NJH /NJS /NP
Set-Location android-comm; .\gradlew.bat assembleDebug   # or assembleRelease / bundleRelease
```
**Companion** uses `cap sync`:
```bash
pnpm build:app:cap && npx cap sync android
(cd android && ./gradlew.bat assembleDebug)
```

Per-app test suites (jsdom + fake-indexeddb): `pnpm test:comm` / `test:pay` /
`test:business`. (Comm 577, Pay 217, Business 127 tests as of this session.)

---

## 6. The two test phones + how to drive them

| Phone serial | Role | Identity |
|---|---|---|
| **QV7202N48K** | A — the funded/main phone (this machine's debug key) | "Daniel" `ANTON-2S6G-…` |
| **QV7101L31T** | B — second phone (also paired) | "Emma" `ANTON-55MM-…` |

Both are confirmed Comm contacts of each other (a live relay link). `install -r`
preserves their data because both carry **this machine's debug signing key** — so
re-installing a debug build keeps the wallet/identity/contacts.

**Connect / verify:**
```bash
adb devices                 # both should show "device"
adb -s QV7202N48K install -r android-comm/app/build/outputs/apk/debug/app-debug.apk
```

**⚠️ Device-test gotcha (cost me real time this session):** after `install -r`,
the running WebView keeps the OLD JS bundle — `monkey` only foregrounds it. You
MUST **force-stop then relaunch** to load the new code:
```bash
adb -s QV7202N48K shell am force-stop com.futurechain.anton.communication
adb -s QV7202N48K shell monkey -p com.futurechain.anton.communication -c android.intent.category.LAUNCHER 1
```

**Driving the apps programmatically** (adb + Chrome DevTools Protocol) — the
harness is in `tests/device/`:
- `lib/` — `devices.cjs` (`forwardApp('comm', idx)` → ports comm:9500…),
  `cdp.cjs` (`CdpSession`), `dom-driver.cjs` (`install(s)` → `__td` helpers:
  `setVal`, `clickText`, `byExactText`, `readStore('anton-comm','agreements')`,
  `clearStore`, `bodyText`, `sleep`).
- 2-phone agreement tests (run with the app foregrounded on BOTH phones):
  ```bash
  ANTON_DEVICE_E2E=1 node tests/device/agreement-two-phone.cjs          # propose→accept
  ANTON_DEVICE_E2E=1 node tests/device/agreement-counter-two-phone.cjs  # propose→counter→accept
  ```
- See `memory/reference_drive_companion_app_via_adb.md` for the full recipe
  (adb reverse, MSYS_NO_PATHCONV, React-aware textarea setter).

**Using the agreement feature by hand (Comm):** open a confirmed contact's chat →
the **+** (attach) → **Agreement** tile → fill decision/terms/amount → Send
proposal. The other phone sees a card with **Accept / Decline / Counter**;
Withdraw appears on your own un-answered proposal. The Chat list shows a
"📜 N agreements need your response" banner → opens the Agreements tray.

---

## 7. Where the project stands (go-live)

Early-July launch prep (FutureChain mainnet + ANTON Local on GitHub + the 4
Android apps, scoped self-custody/local-first). In-repo critical path was cleared
on 2026-06-09 (R8/EdDSA fixes, keystores, enrollment port, risk disclosure — all
4 apps signed-release-buildable). The remaining go-live work is
**operator + legal**, not code:
1. **Back up the 4 keystores + `.env`** (Section 0) — do this first.
2. Engage counsel on the MiCA classification (see `docs/LEGAL_ACTION_BRIEF.md`).
3. Stand up the FutureChain mainnet node + decide the RPC operator(s).
See `docs/GO_LIVE_CHECKLIST.md` and `memory/project_golive_readiness.md`.

---

## 8. To resume in the new session

1. Read `CLAUDE.md`, then `memory/MEMORY.md` (auto-loaded).
2. For the agreement feature specifically: `memory/project_agreements_v1.md`.
3. `git pull` (everything is on `main`), `pnpm install`.
4. Connect the phones (`adb devices`); force-stop+relaunch after any install.
5. Deferred agreement enhancements (genuine follow-ups, not gaps): cross-app
   agreements (Comm↔Pay), the `accept_unconfirmed` give-up transition, key
   rotation, group agreements, full localization, a Pay/Business settlement
   device test.
