# ANTON Companion App — Install on Android & first pair

End-to-end steps to build the APK, sideload it onto an Android phone, make
your local ANTON instance reachable, and pair the two. Tested on Sony
Xperia (works the same on any standard Android 8+ device).

---

## 1. Build the Android APK

From the repo root:

```bash
# Builds the web app, syncs into Capacitor's Android project,
# and assembles a signed release APK
pnpm run build:android
```

Output: `android/app/build/outputs/apk/release/app-release.apk`
(signed with the existing `android/anton-release.keystore`).

**Faster alternative (debug build, no signing config required):**

```bash
pnpm exec cap sync android
cd android && ./gradlew.bat assembleDebug
# APK at: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 2. Get the APK onto the phone

### Path A — USB + adb (5 minutes, recommended)

1. **On the phone:** Settings → About phone → tap **Build number** 7 times.
2. Back to Settings → **Developer options → USB debugging ON**.
3. Plug the phone into the desktop via USB; tap **Allow** when prompted.
4. From the desktop:

   ```bash
   adb install android/app/build/outputs/apk/release/app-release.apk
   ```

   If `adb` isn't installed: `winget install Google.PlatformTools` (Windows)
   or grab Android Studio.

### Path B — copy + tap-to-install

1. Copy the APK to the phone (Google Drive, email, USB MTP transfer, etc.).
2. **On the phone:** Settings → Apps → Special access → **Install unknown
   apps** → grant to your file manager (or to Chrome if you'll download the
   APK directly).
3. Tap the APK in the file manager → **Install**.

---

## 3. Make ANTON reachable from the phone

Your desktop ANTON runs on `localhost:3001` — the phone can't reach
`localhost`. Pick the option that matches your setup.

### Option A — same WiFi (easiest)

1. Find the desktop's LAN IP: `ipconfig` → look for `IPv4 Address`
   (e.g. `192.168.1.50`).
2. Edit `.env`:

   ```
   APP_GATEWAY_MDNS=true
   APP_GATEWAY_LAN_BROWSE=true
   ```

3. Allow Windows Firewall to let port 3001 through (Windows prompts the
   first time the server binds — click **Allow**).
4. Restart the ANTON server (`pnpm run dev` or `pnpm run start`).
5. The phone must be on the **same WiFi** as the desktop.

### Option B — ngrok tunnel (works from anywhere)

```bash
ngrok http 3001
# Note the https URL, e.g. https://abc123.ngrok-free.app
```

Edit `.env`:

```
APP_GATEWAY_PUBLIC_URL=https://abc123.ngrok-free.app
```

Restart the server. QR codes will now embed the ngrok URL.

### Option C — real public domain

```
APP_GATEWAY_PUBLIC_URL=https://anton.yourdomain.com
```

You handle the reverse proxy + TLS termination.

---

## 4. Pair the phone

### On the desktop (browser)

1. Open ANTON (`http://localhost:5173` in dev, or `http://localhost:3001`
   if running the production build).
2. Find **Connect a device** (Settings → Devices, or the admin area).
3. Generate an enrollment QR code — it has a **60-second TTL**, so leave
   the page open while you scan.

### On the phone (Companion app)

1. Open the app → Welcome → enter your name + language → **Get started**.
2. Lands on Join → tap **Scan QR** → camera opens → point at the desktop.
3. If your admin pre-bound this enrollment to your user, the phone shows
   a 6-digit confirmation prompt → desktop displays the matching code →
   type it in.
4. Phone shows **Connected ✓** → routes to **Personalize** (pick one of
   the 8 accent colours) → **Continue**.
5. You land on the org workspace home.

---

## 5. Verify it works

| Tab | What to expect |
|---|---|
| Home | Time-of-day greeting; pending approvals as the priority card |
| Approvals | Live count badge if checkpoints are pending |
| Capture | Camera or share-target |
| More | Mail / Markets / Radar / Pathfinder / Calendar / Work modules |
| You (Settings) | Switch Pro ↔ Standard mode; pick from 8 accents |

---

## Sanity check before you start

Confirm migration 132 has run (it powers the Mail tab):

```bash
psql -d anton -c "\dt app_mail_providers"
```

If "Did not find any relation":

```bash
psql -d anton -f server/db/migrations-pg/132_app_mail.sql
```

If `psql` isn't on your PATH (common on Windows), use the bundled Node
script (created by Claude during install help):

```bash
node scripts/run-migration.cjs server/db/migrations-pg/132_app_mail.sql
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| QR scans but "Cannot reach server" | Phone on different WiFi, or firewall blocking | Confirm same WiFi; allow port 3001 in Windows Firewall; or switch to ngrok |
| "Token expired" after scan | 60-second TTL elapsed | Refresh the desktop's QR and try again |
| App opens but stays on Welcome | Identity already exists from a prior install | Tap **Get started** anyway — it skips registration if the keypair is intact |
| Cannot install APK on Sony | "Unknown sources" blocked | Settings → Apps → Special access → Install unknown apps → grant to your file manager / Chrome |
| Camera permission denied | Permission needs to be granted on first launch | Settings → Apps → ANTON Companion → Permissions → Camera ON |
| Mail tab shows "Inbox is empty" | No connected providers + no synthesised ANTON-native rows yet | Run an assistant chat or generate a checkpoint on desktop, then re-open Mail |
| Switch to Standard mode hides everything | Standard hides Approvals/Markets/Pathfinder/Radar by design | Tap **You → App mode → Pro** to switch back |

---

## Honest gaps (deferred work — flagged so you know what's unfinished)

- **Mail provider sync** (M365 / Gmail / IMAP): connections store + appear
  in the source-filter strip, but the actual sync workers return a
  friendly TODO until OAuth client registration / `imapflow` install
  lands. ANTON-native messages flow normally.
- **School curriculum**: lesson plans table not yet created; the streak is
  real (sessions/day), the "today's lesson" card shows an empty state.
- **Wallet endpoint**: StdWalletScreen and WalletScreen show empty state
  until a wallet provider lands.
- **TTS playback**: wired for Markets + Radar briefings only.
- **Standard-mode voice speech-recognition**: manual text fallback works;
  full Capacitor speech wiring (already in Pro `VoiceMode.tsx`) needs
  porting.
