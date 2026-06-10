# PAY_DEVICE_ATTESTATION_SPEC.md

> **⚠️ OPERATIONAL CAVEAT (2026-06-10) — ATTESTATION PROVIDES ZERO PROTECTION IN PRODUCTION TODAY.**
> The shipped APK has `google_cloud_project_number = 0` (`android-pay/app/src/main/res/values/strings.xml`). With the project number unset, `FcDeviceAttestationPlugin.isAvailable()` returns false (it requires `getCloudProjectNumber() > 0`), so the client never obtains a real Play Integrity token and falls back to the dev token `DEV_NO_ATTESTATION:<install_id>`. Production Bahnhof rejects that dev token **only if** `BAHNHOF_DEV_ATTESTATION_ALLOWED` is left unset. **Until the real project number is set in `strings.xml` + Bahnhof's `GOOGLE_CLOUD_PROJECT_NUMBER`, AND the Phase 2 native plugin ships and is server-enforced, the entire attestation path is a no-op.** Do **not** rely on device attestation for launch. The submit path is currently protected only by the install bearer + rate limit + the wallet's Keystore-bound Ed25519 priv (the priv is the real backstop — see `docs/APPS_SECURITY_AUDIT.md` §3). Tracked in `docs/APPS_SECURITY_AUDIT.md` §9 and the Phase 2 acceptance criteria in §6 below.

**Status:** Phase 1 (server + JS scaffolding) shipped 2026-05-24. Phase 2 (Android native plugin implementation + real phone testing) pending Windows machine + phone session.

**Closes:** the LOW–MEDIUM audit edge from the May 20 hardening pass — a hardened ANTON Pay client can today reach Bahnhof's public RPC over a TLS channel using only an install bearer token; an attacker who exfiltrates the bearer can replay it from an emulator, a rooted device, or a re-signed APK. Device attestation binds each accepted submission to a Google-signed assertion that the request came from an unmodified ANTON Pay APK running on a device that meets Play Integrity's `MEETS_DEVICE_INTEGRITY` verdict.

**Scope of this spec:** Android via Play Integrity API. iOS via App Attest is mentioned for parity but is out of scope until the iOS port lands (separate task).

---

## 1. Why

Today the only thing standing between an attacker who stole a Pay user's install bearer token and a successful `/submit_signed_transaction` is the wallet's Ed25519 priv. The priv lives in Keystore on a real device, so on-device exfiltration is hard — but the bearer token, the wallet address, and a sufficiently determined attacker can replay against the Bahnhof public RPC from anywhere. The current rate limit (10/min/IP) caps damage but doesn't stop the attack class.

Device attestation moves the trust anchor from "the client claims to be the legitimate app" to "Google's Play Integrity service vouches that this request was made by the unmodified ANTON Pay APK on a device that hasn't been tampered with". An attacker on an emulator, a rooted device, or a re-signed APK cannot obtain a valid Play Integrity token for our package + signing certificate, so they cannot complete a submission even with a stolen bearer.

---

## 2. Threat model

| Threat                                                   | Pre-attestation defence | Post-attestation defence |
|----------------------------------------------------------|------------------------|--------------------------|
| Stolen install bearer replayed from another device       | Rate limit only         | **Blocked** — Play Integrity token is device-bound and short-lived |
| Re-signed / repackaged APK                               | App-signing check at install (Play Store side) | **Blocked at server** — Google's token includes the SHA-256 of the signing cert |
| Emulator / rooted device                                 | None                    | **Blocked at server** — Google's token verdict surfaces emulator + root |
| Stolen bearer + valid attestation token (insider attack) | Rate limit              | Still possible — attestation defends against device origin, not against an authorised user who reveals their session deliberately. Wallet-passphrase ([[PAY_WALLET_PASSPHRASE_SPEC]]) defends here |
| Replay of an old Play Integrity token                    | N/A                     | **Blocked** — Google tokens have ≤ 5 min validity and embed a server-supplied nonce; the server cache is keyed on a request-bound nonce |

---

## 3. Design

### 3.1 Header envelope

Every `/submit_signed_transaction` (and other high-risk endpoints) carries:

```
X-API-Key:            <install bearer>          // existing enrollment token, unchanged
X-Attestation-Token:  <server-issued session>   // NEW — 24h validity
```

The `X-Attestation-Token` is **NOT** the raw Google Play Integrity token. It is a server-issued opaque session token returned by `POST /attest`. The flow is:

1. Pay-app obtains a Google Play Integrity verdict token via the native plugin.
2. Pay-app `POST /attest` to Bahnhof with the Google token + install bearer.
3. Bahnhof verifies the Google token via Google's Play Integrity server-side API.
4. Bahnhof issues a **session token** bound to the install bearer + the verified verdict, valid for 24h.
5. Pay-app caches the session token in secure-store and includes it on every subsequent submission.
6. On submission, Bahnhof's `/verify` (which Caddy already calls via `forward_auth`) additionally validates the session token: present, unexpired, bound to the same install bearer.

The session-token model avoids:
- Re-verifying with Google on every submission (Google's API has quotas).
- Sending the raw Google token to FutureChain (it's PII; contains device hash).
- Per-request latency of a Google round-trip.

### 3.2 Server-side flow

```
┌─────────┐   1. POST /attest         ┌─────────────┐
│  Pay    │ ────────────────────────> │  Bahnhof    │
│  App    │   { play_integrity_token  │  sidecar    │
│         │     , nonce               │  (FastAPI)  │
│         │     }                     │             │
│         │                            │  2. Verify  │ ─────> Google Play
│         │                            │     w/ Goog │        Integrity API
│         │                            │             │ <─────  verdict JSON
│         │                            │             │
│         │   3. session_token (24h)   │  3. Issue   │
│         │ <──────────────────────── │     session  │
│         │                            │     token    │
│         │                            │  (signed +   │
│         │                            │   stored)    │
└─────────┘                           └─────────────┘

       ─────────────────────────────────────────────────────
       Later, on every /submit_signed_transaction:

┌─────────┐                            ┌──────────┐         ┌──────────┐
│  Pay    │  X-API-Key: <install>      │  Caddy   │ fwd_a → │ Bahnhof  │
│  App    │  X-Attestation-Token: <s>  │          │         │ /verify  │
│         │ ────────────────────────> │          │ <── 200 │  checks: │
│         │                            │          │  /401   │   - api  │
│         │                            │          │         │   - att  │
│         │                            │          │         │     bind │
│         │                            │          │         │     fresh│
│         │                            │ reverse_ │         └──────────┘
│         │                            │  proxy  │
│         │                            │ ──────> │ ──── 200 ──> FC node
└─────────┘                            └──────────┘
```

### 3.3 Token validation logic (server side)

`POST /attest`:
1. Resolve install_id from `X-API-Key`. Reject if not enrolled or revoked.
2. Decode the Play Integrity JWS. Validate signature against Google's published JWKS for our `cloud_project_number`.
3. Check `nonce` field matches what the client sent (the client supplies a fresh CSPRNG nonce to prevent replay of a captured Google token).
4. Check `request_details.request_package_name == 'com.futurechain.anton.pay'`.
5. Check `request_details.timestamp_millis` is within the last 5 minutes.
6. Check `app_integrity.app_recognition_verdict == 'PLAY_RECOGNIZED'` (rejects re-signed APKs).
7. Check `device_integrity.device_recognition_verdict` contains `MEETS_DEVICE_INTEGRITY` (rejects emulators + rooted) OR (allowlisted strict mode) `MEETS_STRONG_INTEGRITY`.
8. Generate a CSPRNG `session_token` (256-bit, base64).
9. Persist a row to `attestation_sessions` (install_id, session_token_hash, issued_at, expires_at, verdict_summary).
10. Return `{ "session_token": "...", "expires_in": 86400 }`.

`/verify` extension (called from Caddy `forward_auth`):
- Existing X-API-Key validation, unchanged.
- New: if request path matches the high-risk allowlist (`/submit_signed_transaction`, future PII endpoints), require `X-Attestation-Token` header, look up by hash, check `install_id` matches the API-key's install_id, check `expires_at > now()`. Reject 401 otherwise.

### 3.4 Client-side caching

Pay-app keeps the session token in `@aparajita/capacitor-secure-storage` at `fc.attestation.session_token` with a sibling row `fc.attestation.expires_at`. On every signing flow:

1. Check `expires_at - now() > 5 min` → use cached token.
2. Otherwise, run the attest flow: obtain Play Integrity verdict → POST /attest → cache new session.
3. If attest fails, retry once with fresh Google token. If still fails, surface a UX error: "Device security check failed — this app may have been modified, or this device may not be supported. Contact support if you believe this is in error."

### 3.5 Dev-mode escape

Locally-developed ANTON Pay running in a browser (no native plugin available) cannot obtain a Play Integrity token. The dev-mode escape is:

- The native plugin's `requestPlayIntegrityToken()` returns `null` in non-native environments.
- The pay-app TS layer translates `null` into a special dev-token: `"DEV_NO_ATTESTATION:" + install_id`.
- Bahnhof's `/attest` accepts a `DEV_NO_ATTESTATION:` prefix **only when** the env var `BAHNHOF_DEV_ATTESTATION_ALLOWED=true` is set on the server.
- Production Bahnhof always has this env var unset, so dev tokens are rejected 401 in prod.
- The dev session token issued in dev mode is logged at WARN level with the install_id, so any accidental dev-mode activation in a non-dev environment is loud.

### 3.6 Triggers for attestation

The pay-app calls the attest flow at:
1. **App launch** (cold start) — checks cached token; refreshes if expired.
2. **First wallet unlock per session** — refreshes if cached token is < 1 h to expiry (proactive).
3. **On any 401 with `WWW-Authenticate: attestation-required`** from `/submit_signed_transaction` — server hint that the cached token expired between request and arrival.

---

## 4. Code touchpoints

### 4.1 Bahnhof sidecar (Phase 1 — DONE)
- `bahnhof/app.py`:
  - New table `attestation_sessions` in schema setup
  - New `POST /attest` handler
  - Extended `/verify` to check `X-Attestation-Token` on high-risk paths
  - `verify_play_integrity_token()` helper (real Google API in prod; dev-mode shortcut)
  - `cleanup_expired_attestations()` housekeeping (called every 6 h)

### 4.2 Caddy (Phase 1 — DONE)
- `bahnhof/Caddyfile`: `/submit_signed_transaction` matcher's `forward_auth` body is extended to pass `X-Attestation-Token` headers through to `/verify`.

### 4.3 Pay-app TS wrapper (Phase 1 — DONE)
- `src/pay/services/device-attestation.ts` (new): mirrors `secure-signer.ts` pattern; registers the `FcDeviceAttestation` Capacitor plugin; provides `getAttestationToken()` (handles caching + refresh + dev-mode escape).
- `src/pay/services/fc-rpc.ts`: every RPC config has an `attestationToken` field threaded through `getRpc()`.

### 4.4 Pay-app integration (Phase 1 — DONE)
- `src/pay/services/payment.ts::executePayment()`: ensures fresh attestation token before submit.

### 4.5 Android native plugin (Phase 2 — PENDING phone testing)
- `android-pay/app/src/main/java/com/futurechain/anton/pay/plugins/FcDeviceAttestationPlugin.java` (new): scaffolded; **real Play Integrity SDK integration to be completed on Windows machine with a real phone**.
- `MainActivity.java`: register `FcDeviceAttestationPlugin.class`.
- `app/build.gradle`: add `com.google.android.play:integrity` dependency.
- Google Play Console: set the cloud_project_number on the app entry.

### 4.6 iOS native plugin (deferred — no iOS port yet)
- Mirrored under `ios-pay/.../FcDeviceAttestationPlugin.swift` (future).

---

## 5. Tests

### 5.1 Bahnhof sidecar tests (Phase 1)
- `bahnhof/tests/test_attestation.py` (new): synthesises a dev-mode token, POST /attest, asserts session token issued, asserts /verify accepts the session token on a high-risk path, asserts /verify rejects when token is expired / bound to a different install / absent.

### 5.2 Pay-app tests (Phase 1)
- `src/pay/services/__tests__/device-attestation.test.ts` (new): mocks the Capacitor plugin to return a fixed verdict; asserts `getAttestationToken()` caches correctly, refreshes when expiry < 5 min, gracefully handles plugin unavailable (dev-mode escape).

### 5.3 Phone smoke test (Phase 2)
- Build APK on Windows machine, install on test phone, attempt a real `/submit_signed_transaction` against Bahnhof, expect 200. Attempt the same on a Genymotion / Android emulator, expect 401 with `WWW-Authenticate: attestation-required`. Document outputs in `docs/phase2-attestation-e2e-log.md`.

---

## 6. Acceptance criteria

- [x] **Phase 1 — server side.** `/attest` issues session tokens; `/verify` enforces them on high-risk paths; tests pass.
- [x] **Phase 1 — pay-app JS.** `getAttestationToken()` is wired into the submission flow; tests pass; dev-mode escape works in browser preview.
- [ ] **Phase 2 — Android plugin.** Native plugin compiled into an APK; phone smoke test passes for real device + fails for emulator.
- [ ] **Phase 2 — Google Play Console.** Cloud project number registered, app's signing certificate fingerprints uploaded.
- [ ] **Phase 2 — production env.** Set `GOOGLE_PLAY_INTEGRITY_API_KEY` + `GOOGLE_CLOUD_PROJECT_NUMBER` on Bahnhof; unset `BAHNHOF_DEV_ATTESTATION_ALLOWED`; rolling restart.
- [ ] **Phase 2 — audit close.** Update `ey_audit_package/13_ANTON_APPS_AND_PUBLIC_RPC.md` with the new control + addendum.

---

## 7. Out of scope (for this spec)

- iOS App Attest (will be a parallel implementation when the iOS port lands).
- Risk-based step-up: requiring `MEETS_STRONG_INTEGRITY` only for large-value payments. Today we just require `MEETS_DEVICE_INTEGRITY` for all submissions. Step-up can be added later by reading the verdict_summary in the session row.
- Web-app submissions (no equivalent attestation primitive exists for web; would require a separate trust model — likely a server-side per-account allowance with manual approval for large amounts).

---

## 8. Open questions

1. **Verdict floor**: `MEETS_DEVICE_INTEGRITY` (default) vs `MEETS_STRONG_INTEGRITY` (hardware-backed). The strong tier rejects some lower-end Android devices that don't have hardware-backed key attestation. Recommendation: start with `MEETS_DEVICE_INTEGRITY`; revisit once we have telemetry on user devices.
2. **Cloud project**: Use the existing FutureChain AB Google Cloud project, or a dedicated one for ANTON Pay? Recommendation: dedicated, for blast-radius reasons.
3. **Anti-fraud signal export**: Should the verdict_summary (device integrity tier, app integrity tier, account_details verdict) be surfaced to Heimdall's existing risk-engine? Recommendation: yes, in a follow-up — feed `verdict_summary` to a new HD-AKYC-* control row.
