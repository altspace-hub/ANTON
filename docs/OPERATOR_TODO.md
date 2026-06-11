# Operator To-Do — ANTON / FutureChain Launch (early July 2026)

**Your personal action list.** These are the items only *you* (operator/legal) can
do — engineering is on track and not blocking. Ordered by lead time: legal first
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

- [ ] **Back up the 4 release keystores + `.env`.** They exist ONLY on the build
      machine (gitignored, never committed — verified). Lose one → you can never
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
