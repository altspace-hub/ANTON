# Operator To-Do — ANTON / FutureChain Launch (early July 2026)

**Your personal action list.** These are the items only *you* (operator/legal) can
do. Engineering is not blocking with one exception, and it is a real one: **ANTON Pay
cannot be built for Play until you create the Google Cloud project** — see the
Play-submission section below. Ordered by lead time: legal first
(longest pole), then the one-time secret/backup items, then the launch-day infra.
Full context in `docs/GO_LIVE_CHECKLIST.md` (2026-06-11 section).

---

## 🔴 Start now — longest lead

- [ ] **[LEGAL] Engage counsel.** Get the MiCA/CASP classification answer in writing
      (the single biggest launch risk — does running the `rpc.futurechain.eu` light
      hub make FutureChain a CASP?). Brief ready at `docs/LEGAL_ACTION_BRIEF.md`.
- [ ] **[LEGAL] Approve the disclosure copy + publish ToS/Privacy.** The in-app
      self-custody risk-disclosure text is still placeholder; the ToS/Privacy pages
      are bannered drafts. When counsel signs off, tell me — it's a copy swap + a
      `DISCLOSURE_VERSION` bump (forces users to re-accept). ~hours of eng once you
      have the text.
- [ ] **[LEGAL] DPO + Bahnhof Article-28 DPA** (needed before the hosted relay; long
      lead — start in parallel).

## 🔑 Do first among the quick ones — irreplaceable

- [~] **Back up the release keystores + `.env`.** PARTIALLY DONE (2026-07-17). Four of
      the five signing keys now have an off-machine copy; **ANTON Agent's key was created
      2026-07-29, after that backup, and exists on this machine only.** `.env` is still
      local-only. Lose one → you can never
      update that app on Play. Copy `anton-{pay,comm,business}-release.keystore` +
      `android/anton-release.keystore` + their `keystore.properties` + `.env` to an
      encrypted offline drive. Recipe: `docs/SESSION_HANDOVER_2026-06-10.md §0`.
- [ ] **Set `INSTANCE_KEY_ENCRYPTION_KEY` in `.env`** (still absent). Without it the
      instance Ed25519 private key sits plaintext in Postgres. Generate 32-byte hex:
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- [ ] **Set a real `ENCRYPTION_KEY`** (64-hex) on the launch instance if not already
      the production value, and **rotate the dev API keys** (Anthropic/Mistral/FMP/
      EODHD) that were quoted into a prior audit output.

## 🌐 DNS + relay (a day, do soon)

- [ ] **`terms.futurechain.eu`** — add the DNS record (CNAME → `relay.futurechain.eu`
      or A → the box IP), add the Caddy site block. Steps: `docs/LEGAL_PAGES_DEPLOY.md`.
- [ ] **Re-sync + redeploy the relay.** The Bahnhof box is a flat-file copy drifted
      since ~2026-06-01 — it's missing the Comm FCM wake-push commit + migration 003
      + the legal pages. Sync the whole current `relay/src` + `migrations/` and
      redeploy (same doc). Recommend converting it to a git checkout so `git pull`
      works going forward.

## ⛓ Mainnet + Play (launch window)

- [ ] **FutureChain mainnet node** behind `rpc.futurechain.eu` producing blocks;
      verify the `stub_mode → false` cutover end-to-end; do a **small live on-chain
      payment** on Pay, Business, and Comm.
- [ ] **Real `google_cloud_project_number`** for Pay Play Integrity (currently `0` →
      attestation is a no-op in prod) — set it in `android-pay/.../res/values/strings.xml`
      and the matching `GOOGLE_CLOUD_PROJECT_NUMBER` on Bahnhof; confirm
      `BAHNHOF_DEV_ATTESTATION_ALLOWED` is **unset** in prod.
- [ ] **Play Console:** accounts + 4 app listings + Data-Safety forms + content
      ratings + screenshots + the published privacy-policy URL. Enroll each app in
      **Google Play App Signing** at first upload.
- [ ] **(if push at launch)** Firebase project for `com.futurechain.anton.companion`
      (+ Comm), drop `google-services.json` per app, set `FCM_SERVICE_ACCOUNT_JSON`
      on the gateway. (The dispatch code is now complete — being finished this
      session — so this becomes pure config.) Runbook: `docs/FCM_OPERATOR_RUNBOOK.md`.

---

## 📦 Play submission — what actually blocks it (checked 2026-09-06)

The whole release chain was run from HEAD for all five apps today, which had not been
done since 2026-06-11. Result: **four of the five produce a signed AAB; Pay does not.**

| App | Signed AAB today | Signer | Blocking |
|---|---|---|---|
| Comm | ✅ 17.12 MB | `127f6e69b88a2fda` | — |
| Companion | ✅ 16.07 MB | `6e7de640853ce78f` | was broken until today (fixed) |
| Agent | ✅ 14.65 MB | `8afb85d46aa5e0ad` | was broken until today (fixed); in/out of launch is your call |
| Business | ✅ 4.85 MB | `ca01cc63ef4dbf82` | — |
| **Pay** | ❌ **fails at configure time** | — | **`google_cloud_project_number` is still `0`** |

**Pay's failure is the build refusing to lie.** The gate is deliberate: with the
placeholder project number, Play Integrity attestation is a no-op, the JS layer falls
back to dev tokens, and Bahnhof rejects those in production — so Send would be dead in
a shipped build while looking completely normal. Create the Google Cloud project, put
the real number in `android-pay/app/src/main/res/values/strings.xml` and the matching
`GOOGLE_CLOUD_PROJECT_NUMBER` on Bahnhof, and confirm `BAHNHOF_DEV_ATTESTATION_ALLOWED`
is unset in production. **Until that number exists, Pay cannot be built for Play at all.**

### Hard blockers that are yours alone

- [ ] **Store art — nothing exists yet.** Per app: icon 512×512 32-bit PNG, feature
      graphic 1024×500, and 2–8 phone screenshots. `android-*/play/screenshots/` holds
      only a README. This is the long pole; everything else here is hours, this is days.
      **Screenshots need padding, not cropping** — the Xperia captures are 1096×2560
      (2.34:1) and Play rejects anything taller than 2:1. Pad to 1280×2560.
      Before capturing Business, set the merchant currency to SEK (the test profile is a
      Swedish AB showing USD) and ring a few sales dated today so Statistics is not empty.
- [ ] **Publish the three legal pages and fill their `[OPERATOR]` blocks.**
      `docs/legal/anton-privacy.html`, `anton-terms.html`, `anton-delete-data.html`.
      All three need public URLs before submission; the privacy and deletion URLs are
      fields in the Play Console form, not optional. The deletion page must be reachable
      **without installing the app and without signing in**.
- [ ] **Play Console, per app:** create the record, Data Safety form
      (`docs/PLAY_DATA_SAFETY_DECLARATIONS.md`), Financial Features declaration
      (`docs/PLAY_FINANCIAL_FEATURES.md`), content rating questionnaire (not started),
      and App access demo credentials for Companion (and Agent, if it launches).
- [ ] **Enrol every app in Play App Signing at first upload.** This also shrinks the
      keystore-loss risk below: with Play App Signing the local key becomes an *upload*
      key, which Google can reset. The app signing key cannot.
- [ ] **Back up `android-agent/anton-agent-release.keystore`.** The 2026-07-17 import
      covered four of the five keys; Agent's was created 2026-07-29, after it, and exists
      on this machine only. I did not add it to the repo — putting key material anywhere
      is your decision, not mine. It is the one item on this page whose loss is permanent.
- [ ] **Decide whether ANTON Agent is in the launch.** It is documented as descoped, and
      as of today it builds and signs cleanly. If it stays out, nothing to do; if it comes
      in, it needs its own Data Safety section, listing copy and store art.

### Not blocking submission, but known

- `versionCode` is `1` in all five. Correct for a first upload; it must be bumped by +1
  for every subsequent upload, including internal-track builds. Never reuse one.
- The **E2E Cross-Browser** workflow is still red on `main` (green on branches) — the job
  starts the server with no `DATABASE_URL`. It is a CI-config issue and touches none of
  the phone apps, but it is the one red signal on the default branch.
- Push dispatch is still stubbed and no `google-services.json` exists for any app. Push
  scope at launch remains a decision rather than a task.

## ✅ Verification before go/no-go

- [ ] **Clean-machine portable-bundle test** — unzip `ANTON-portable-0.7.5.zip` on a
      Windows machine with no dev tools, double-click `Start ANTON (portable).bat`,
      confirm it runs.
- [ ] **Bump each app's `versionCode`** (+1) right before its Play upload (never
      reuse a code).

---

## Product decisions still open (your call, not blocking)

- **Pay brand colour** — it's sunrise orange `#C97220` in code today; the design
  brief assumed blue (blue is Business). Confirm orange stays, or schedule a pivot.
- **Dark-mode scope for July** — tokens exist in all apps but dark is unverified on
  some stakes screens. In or out for launch?
- **Companion push at launch** — in or out (the code path is now complete either way).

*(Engineering-owned items — the red E2E CI workflow, the FCM dispatch code, the
`ws` bump, CI security gates — are being handled this session; not on your list.)*
