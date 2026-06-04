# Push & Background Notifications — Master Plan

**Status:** in progress (started 2026-06-04). Tracks message + payment notifications across the
three FutureChain phone apps (Comm / Pay / Business).

## Goal

Users should be alerted when **a message arrives** or **a payment is received**, including while
the app is backgrounded or killed. Today (pre-this-work):

| Event | Before |
|---|---|
| Incoming **payment** | Local notification fires — but **foreground-only** (driven by a poll on app-resume / Receive screen). |
| New **message** (Comm) | **Nothing at all** — the relay `onMessage` callback only bumped React state. Silent even with the app open. |
| App **killed/backgrounded** | Nothing — relay WebSocket dies, polling stops. |

The local-notification engine itself is fully built and proven (`@capacitor/local-notifications`,
channels, permissions, tap handlers for scheduled-payments + event-reminders). What's missing is
(a) messages were never wired to it, and (b) there's no background/push layer.

## Locked decisions (2026-06-04)

- **Messages → FCM push** via the relay. FCM is the only reliable way to wake a killed Android
  app, and the relay already handles message addressing. **Built now but gated on Firebase creds**
  (graceful no-op + operator runbook until keys land).
- **Payments → on-device WorkManager background poll.** No server chain-watcher, so **no wallet
  address is ever registered with a server** — preserves the local-first/private posture. ~15-min
  latency (Android periodic-work floor). Needs **no Firebase** → buildable + device-verifiable now.
- **Android first.** iOS (APNs) is deferred — the iOS projects aren't even generated on this machine.

## Ground truth (from the design pass, file:line)

- **The relay is in this repo:** `relay/src/server.ts`, `relay/src/comm-registry.ts`. Offline
  messages are queued to an **in-memory** mailbox at `relay/src/comm-registry.ts:204-221` — that
  queue point is the **FCM dispatch trigger**. (In-memory v0.1 → messages lost on relay restart.)
- **`@capacitor/push-notifications` (^8.0.1)** is in `package.json` and **already registered in
  `android-comm`** (`capacitor.plugins.json:43`) but **missing in android-pay / android-business**.
  Its built-in `MessagingService` (a `FirebaseMessagingService`) auto-merges into the manifest, so
  **no custom Kotlin messaging service is needed**.
- **`google-services.json` is conditional** in every `android-*/app/build.gradle` (try/catch around
  the google-services plugin) → apps **build + run without it** (logs "Push Notifications won't
  work"). `com.google.gms:google-services:4.4.4` classpath already declared.
- **applicationIds:** comm = `com.futurechain.anton.communication`, pay = `com.futurechain.anton.pay`,
  business = `com.futurechain.anton.business`. Each needs a **separate** Firebase app + its own
  `google-services.json`.
- **`@capacitor/background-runner` does NOT exist for Capacitor 8** → the payment background poll is
  a **pure-Kotlin WorkManager worker** (OkHttp fetch + cursor in SharedPreferences + native
  `NotificationManager`), not a JS-in-background runner.
- The server already has `server/services/app-push-service.ts` (FCM/APNs/web-push) + `app_push_tokens`
  — but it's **bound to the desktop Companion app** (`app_devices` FK). Comm needs its **own**
  token registry keyed by **routing_id** (16-byte hash of the Ed25519 pubkey), because the Comm app
  is anonymous/standalone (no instance pairing). FCM dispatch is still a stub there
  (`sendViaFcm()` throws "FCM dispatch not implemented").

## Phases (each independently commit-able; verify on-device before moving on)

### Phase 1 — Alive/foreground message notifications  ·  NO creds, NO native  ·  **DONE**
Wire the already-built local-notification engine to inbound messages. Highest-value gap (silent
messages), 100% verifiable today.
- NEW `src/comm/services/active-chat.ts` — tracks the on-screen conversation + foreground state so
  a message for the **currently open** thread doesn't also raise a banner.
- NEW `src/comm/services/message-preview.ts` — pure, one-line notification preview per `ContentKind`
  (📷 Photo / 🎤 Voice message / 📎 <file> / 📊 <poll> / 📍 Location / 📅 <event> / text). Returns
  `null` for low-signal meta kinds (rsvp / cancel / timer-change).
- EDIT `notifications.ts` — add `notifyIncomingMessage()` (channel `fc-comm-messages`, dedup id from
  messageId, `extra.commThread = fromHash` for tap routing).
- EDIT `chat.ts` — fire it from the `applyInboundMessage` tail (the single chokepoint for live +
  offline-replay inbound), gated by `isViewingConversation()`.
- EDIT `App.tsx` — sync `setActiveConversation()`; extend the existing `localNotificationActionPerformed`
  listener to route `extra.commThread` taps → open that chat.
- Tests: `message-preview.test.ts`, `active-chat.test.ts`.
- Verify A↔B on the two phones (B sends → A backgrounded → banner; tap → opens thread).

### Phase 2 — WorkManager background payment poll  ·  NO creds, native  ·  **PAY + COMM DONE; Business TODO**
Pure-Java WorkManager worker (Pay + Comm shipped + device-verified on QV7202N48K; Business next).
**Comm:** `android-comm/.../bgpoll/{PaymentPoller,CommBackgroundWorker,BackgroundPollingPlugin}.java`
+ MainActivity reg + work-runtime + `src/comm/services/background-setup.ts` + comm/App.tsx (channel
`fc-comm-incoming`; `bgSyncSeen` uses `listTxs().txHash`). Device-verified: runNow fetched the Comm
wallet's real UTXOs, seeded silently (notified=0), dedup correct (fg txHashes ARE chain tx_ids so the
worker never re-notifies — cleaner than Pay where receives were UETR-keyed).
**Pay implementation:** `android-pay/.../bgpoll/{PaymentPoller,PayBackgroundWorker,BackgroundPollingPlugin}.java`
+ `MainActivity` registration + `androidx.work:work-runtime:2.9.1` + `src/pay/services/background-setup.ts`
+ `pay/App.tsx` wiring. Verified: `runNow()` fetched the funded wallet's public UTXOs and posted
"+0.05 FTC received" / "+0.01 FTC received" on the `fc-pay-incoming` channel. Needed
`pm grant … POST_NOTIFICATIONS` (the native `notify()` throws SecurityException without it).
- NEW `PayBackgroundWorker.kt` (extends `Worker`): read RPC for the wallet address, compare against a
  `last_seen_tx` cursor in `SharedPreferences`, post a native notification on a new incoming tx.
  Wrap everything in try/catch → `Result.success()` (never crash-loop).
- NEW `BootCompleteReceiver.kt` + `RECEIVE_BOOT_COMPLETED` — re-arm the periodic work after reboot.
- NEW minimal `BackgroundPollingPlugin.kt` (`@PluginMethod ensureBackgroundPollingEnabled`) +
  `MainActivity` enqueue of `enqueueUniquePeriodicWork("fc-payment-bg-poll", 15min, flex 1h)`.
- NEW `src/<app>/services/background-setup.ts` — `ensureBackgroundPollingEnabled()` (no-op on web /
  non-native), called from `App.tsx` after `ensureNotificationPermission()`.
- **RESOLVED (curl'd the live hub 2026-06-04):** `/get_utxos/<addr>` → **200, PUBLIC** (no token).
  `/iso_received/<addr>` → **401 "missing X-API-Key"** (needs the install token — the headless worker
  CANNOT get it). So the worker uses **`/get_utxos/<addr>`** only: it needs just the public wallet
  address + the RPC URL (`https://rpc.futurechain.eu`), NO secret. Aggregate UTXO amounts by tx_id;
  notify on a new tx_id. (`/info` shows `iso_storage_enabled:false` on this hub anyway.)
- **First run seeds silently** (record all current UTXO tx_ids as "seen", no notify storm); later runs
  notify only on genuinely-new tx_ids. **Own-change false-positive:** UTXOs include change from the
  user's own sends; the worker can't read the app's IndexedDB to exclude them, so the foreground pushes
  its known tx_ids (sends + receives) into the worker's `seen` set via a `syncSeen` plugin method.
- **Notification dedup fg↔bg:** the Kotlin worker uses the SAME `idFor(txId)` hash + the SAME channel
  (`fc-pay-incoming`) as the JS path, so Android replaces rather than duplicates if both fire.
- **Dedup fg/bg:** a shared `last_seen_tx` cursor (worker writes after notifying; foreground
  `idle-poller`/`received.ts` updates it after its batch) so the two paths never double-notify.
- Verify: `adb shell cmd jobscheduler run -f com.futurechain.anton.pay <id>` + fund a tx → notification.

### Phase 3 — FCM message push  ·  built + gated, awaiting operator Firebase  ·  **DONE (code)**
Wake a killed Comm app on a new message. **The FCM path lives entirely in the RELAY**
(`@anton/mesh-relay`, separate deployment with its own pg + HTTP), NOT `server/` — the design
pass's `server/` assumption was wrong. Verified empirically (curl) + relay 212 tests pass.
- **Relay:** `relay/migrations/003_comm_push_tokens.sql` (token store, keyed by routing_id_hex) +
  `relay/src/comm-push.ts` (signed register/unregister HTTP + FCM HTTP-v1 dispatch via Node crypto —
  NO firebase-admin dep) + `comm-registry.ts` (offline `routeSend` now returns a `{kind:'push'}`
  action) + `server.ts` (executeActions dispatches it; `/comm/push/*` route; gated instantiation).
- **Client:** `src/comm/services/push-register.ts` — `registerCommPush()` (PushNotifications.register
  → sign `anton-comm-push/v1|fcm|<token>` with the identity key → POST to the relay) +
  `initCommPushReceive()` (wake → the auto-reconnecting relay drains the mailbox → Phase 1 banner).
  Wired in comm/App.tsx. `@capacitor/push-notifications` already registered in android-comm.
- **Security:** registration is Ed25519-signed; relay derives routing_id from the pubkey so tokens
  can't be hijacked (4 unit tests in `relay/tests/comm-push.test.ts`). Payload is content-free.
- **Gated:** no FCM_SERVICE_ACCOUNT_JSON → relay no-ops; no google-services.json → app yields no
  token. Both build + run regardless (confirmed via relay boot logs + app build).
- **Operator steps:** `docs/FCM_OPERATOR_RUNBOOK.md`.
- **Relay** (`relay/`): NEW `comm-push-interface.ts` (`CommPushCallbacks.onCommMessageQueued`);
  EDIT `comm-registry.ts` `routeSend()` to emit a `{ kind: 'queue_push' }` action when it queues to
  an offline recipient; EDIT `server.ts` to invoke the callback. Keep the relay decoupled from FCM.
- **Server** (`server/`): NEW migration `comm_push_tokens` (keyed by `routing_id_hex`, NO `app_devices`
  FK); NEW `comm-push-service.ts` (`registerCommPushToken` + `dispatchCommPush` via `firebase-admin`,
  **data-only payload — NO message content/sender**, gated: no service account → one-time-warn no-op);
  NEW `comm-gateway.ts` `POST /api/comm/push/register` (+ DELETE); wire it into `index.ts`.
- **Client** (`src/comm/`): EDIT `relay-client.ts` to `PushNotifications.register()` after HELLO_COMM
  and POST the FCM token to `/api/comm/push/register`; on `pushNotificationReceived`, wake → reconnect/
  pull queued ciphertext → decrypt locally → fire the Phase-1 rich local notification (Signal-style).
  Server also sends a generic `notification` block ("New message") so a **killed** app still shows
  something (Capacitor caches data-only messages until the app opens — known limitation).
- **Native:** add `@capacitor/push-notifications` to android-pay/business `capacitor.plugins.json`;
  add `default_notification_channel_id` meta-data + string resource to all three manifests.
- Verifiable now: unit tests (token-register shape, dispatch payload builder, `queue_push` action),
  tsc, relay typecheck, "build compiles without google-services.json". **NOT** verifiable without
  creds: real delivery to a killed app.

### Phase 4 — Operator runbook + wiring docs  ·  **DONE**
- `docs/FCM_OPERATOR_RUNBOOK.md` — ordered Firebase setup (project → Comm Android app by
  applicationId → google-services.json → service-account key → relay env → enable FCM v1 API),
  verification, graceful-degradation + security notes. Note: Comm push is RELAY-side (one Android
  app), not the design's 3-app/server model.
- `relay/docker-compose.yml` — `FCM_SERVICE_ACCOUNT_JSON` + `FCM_PROJECT_ID` env documented.
- `.env.example` — clarifies the Comm FCM path is on the relay (the server FCM stub is the separate
  companion gateway).

## Graceful-degradation contract (must hold at every phase)
- No `google-services.json` → apps build + run; FCM registration no-ops with a logged warning.
- No `FCM_SERVICE_ACCOUNT_JSON` → server dispatch no-ops with a **one-time** warning (mirrors
  `app-push-service.ts` today). Never crash the relay on a dispatch error.

## E2E / privacy invariants
- FCM message payload is **data-only + a generic "New message"** — never sender, recipient, or
  content. The push is only a **wake signal**; the client pulls + decrypts locally.
- Payments never register an address server-side (WorkManager keeps chain-watching on-device).
