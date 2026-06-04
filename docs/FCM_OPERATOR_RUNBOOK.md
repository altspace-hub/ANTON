# FCM Operator Runbook — kill-proof Comm message push (Phase 3)

This is the exact, ordered procedure to turn on **Firebase Cloud Messaging (FCM)**
so the **ANTON Comm** app wakes and shows a notification when a message arrives
while it's backgrounded or killed. Everything is already built and **gated** — the
relay and app run fine without any of this; following these steps flips it live.

**Privacy invariant (don't break it):** the push the relay sends is **content-free**
— a generic "New message" title plus an opaque wake flag. It never contains the
sender, the recipient address, or any message text. The woken app reconnects to
the relay over the E2E channel and decrypts locally. Keep it that way.

**What talks to what:** the Comm app ↔ the **relay** (`@anton/mesh-relay`, deployed
at `relay.futurechain.eu`). FCM is wired entirely in the relay + the app — **not** in
the local `server/`. The relay needs (a) a Firebase **service-account** key to call
FCM, and (b) its **registry Postgres** enabled to store device tokens.

---

## 1. Firebase project (Console)

1. Go to <https://console.firebase.google.com/> → **Add project** (or reuse one).
2. **Project Settings → General → Your apps → Add app → Android.**
   - **Package name:** `com.futurechain.anton.communication` (exact — from
     `android-comm/app/build.gradle`).
   - Nickname: "ANTON Comm". SHA-1: optional for FCM.
   - **Download `google-services.json`.**
3. **Project Settings → Cloud Messaging:** ensure the **Firebase Cloud Messaging API
   (V1)** is **Enabled** (Console may link you to the Google Cloud API page to enable it).
4. **Project Settings → Service accounts → Generate new private key** → download the
   `service-account-*.json`. **This is a secret** — store it only on the relay host
   (e.g. `/etc/anton-relay/fcm-service-account.json`, mode `600`). Never commit it.

> Doing iOS later? Add a second app with the iOS bundle id + an APNs key. The relay's
> dispatcher already skips non-`fcm` tokens, so APNs is an additive transport.

## 2. Comm app build (this repo)

1. Place the downloaded **`google-services.json` at `android-comm/app/google-services.json`**.
   (`android-comm/app/build.gradle` already has the conditional google-services block —
   it activates only when this file is present; without it the app still builds.)
2. Rebuild + install the Comm app:
   ```
   pnpm build:comm:cap
   rm -rf android-comm/app/src/main/assets/public && mkdir -p android-comm/app/src/main/assets/public
   cp -r dist/comm/* android-comm/app/src/main/assets/public/
   (cd android-comm && ./gradlew.bat assembleDebug)
   adb install -r android-comm/app/build/outputs/apk/debug/app-debug.apk
   ```
   `@capacitor/push-notifications` is already registered in
   `android-comm/app/src/main/assets/capacitor.plugins.json`, and the manifest already
   sets `default_notification_icon` → the ANTON chevron. No native code change needed.

## 3. Relay (deployment host)

1. **Enable the registry Postgres** (token store lives here). Set
   `RELAY_REGISTRY_DATABASE_URL=postgres://…` in the relay env (the same DB the portal
   registry uses is fine; the table is namespaced). Without it, token registration
   returns 503 and push stays off.
2. **Run the migration** (adds `comm_push_tokens`). The relay's migrate runner applies
   `relay/migrations/*.sql` in order — run the relay's migrate step (see
   `relay/RUNBOOK.md`); `003_comm_push_tokens.sql` is idempotent.
3. **Point the relay at FCM.** Set in the relay env:
   ```
   FCM_SERVICE_ACCOUNT_JSON=/etc/anton-relay/fcm-service-account.json   # path OR inline JSON
   # FCM_PROJECT_ID=your-project-id    # optional; defaults to project_id from the key
   ```
4. **Rebuild + redeploy the relay** (`relay/`): `pnpm build` → ship `dist/` → restart
   the service (systemd / docker-compose). On boot the relay logs one of:
   - `comm-push: FCM not configured — wake pushes are a no-op` (key missing/unreadable), or
   - (silent on success — it now dispatches).

## 4. Verify

1. **Relay health:** `GET https://relay.futurechain.eu/healthz` → `registry_enabled: true`.
2. **Registration:** open the Comm app on a device with `google-services.json`, grant the
   notification permission. The app signs + POSTs its token to
   `POST /comm/push/register`. Confirm a row:
   `SELECT routing_id_hex, platform, enabled FROM comm_push_tokens;`
3. **End-to-end:** Phone B sends Phone A a message **while Phone A's Comm app is fully
   closed**. Within seconds Phone A shows a **"New message"** notification (the relay's
   content-free wake). Opening it reconnects + decrypts, and the real message + Phone 1's
   rich per-message banner appear.
4. **Token hygiene:** the relay auto-disables a token FCM reports as `404 UNREGISTERED`.

## 5. Graceful degradation (already true)

- No `google-services.json` → app builds + runs; `PushNotifications.register()` yields no
  token; registration is skipped. Foreground/just-backgrounded message notifications
  (Phase 1) + the WorkManager payment poll (Phase 2) still work.
- No `FCM_SERVICE_ACCOUNT_JSON` → relay logs the no-op once and never dispatches.
- No `RELAY_REGISTRY_DATABASE_URL` → registration 503s; nothing else is affected.

## 6. Security notes

- **Registration is signed.** The app sends `{ pubkey, platform, token, sig }` where
  `sig` is its Ed25519 signature over `anton-comm-push/v1|fcm|<token>`. The relay verifies
  it and derives `routing_id = sha256(pubkey)[0..16]`, so a caller can only register tokens
  for an identity whose private key they hold — no token-hijacking. (See
  `relay/src/comm-push.ts` + the unit tests in `relay/tests/comm-push.test.ts`.)
- **The relay never learns who-messaged-whom from content** — only opaque routing_ids,
  which it already sees for routing. Don't add sender/recipient/text to the FCM payload.

## 7. Not yet wired (future)

- **iOS / APNs** — add an iOS Firebase app + APNs key; the relay dispatcher needs an APNs
  transport alongside FCM (the `platform='apns'` rows are stored but skipped today).
- **Pay / Business background-payment push** — those use the on-device WorkManager poll
  (Phase 2), not server push, so they need no Firebase. (Their manifests already carry the
  FCM icon meta-data in case that changes.)
