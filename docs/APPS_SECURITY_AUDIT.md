# ANTON Apps — Consolidated Security Audit

**Scope:** The four ANTON mobile/companion apps — **Comm**, **Pay**, **Business**, and the **Companion** app — plus the **relay** and **hub** they depend on for transport, discovery, and (Pay/Business) on-chain settlement.

**Date:** 2026-06-10

**Status:** Reviewable security baseline. Every claim below was re-derived from source during this pass; file:line citations are given so a reviewer can spot-check. Accepted limitations are stated plainly and never marketed away.

> **How to read this doc.** "Verified" = the behaviour was read out of the cited code in this audit. "Accepted limitation" = a known weakness we have decided to ship with, plus its mitigation. "Launch action" = something an operator or owner must do before / at go-live (see the table in §10).

---

## 1. Key custody (money apps)

The three money apps (Comm, Pay, Business) share a **byte-identical** native signer. The 32-byte Ed25519 private key never appears as a `Uint8Array` in the WebView's JS heap on a real device.

- **Native Keystore signer — `FcSecureSignerPlugin.java`** (`android-pay/.../plugins/FcSecureSignerPlugin.java`, mirrored verbatim in `android-comm/...` and `android-business/...`):
  - Per-wallet AES-256-GCM key generated **inside** the Android Keystore, alias `fc.signer.<walletId>`, hardware-backed where the device supports it (`getOrCreateAesKey`, lines 89-106: `KEY_ALGORITHM_AES`, `BLOCK_MODE_GCM`, 256-bit, `setRandomizedEncryptionRequired(true)`, generated in `ANDROID_KEYSTORE`).
  - The wrapped private key (ciphertext + 12-byte IV, hex) lives in a per-alias `SharedPreferences` file in `MODE_PRIVATE` — only this app's UID can read it (lines 128-133).
  - `sign()` (lines 144-196): decrypts the priv inside the JVM, signs with `i2p.crypto.eddsa` (`EdDSAEngine`), returns **only the 64-byte signature** to JS. The priv `byte[]` is zeroed in a `finally` block (`Arrays.fill(priv, (byte) 0)`, line 194) — same pattern in `wrap` (line 140) and `unwrap` (line 260).
  - **Verified.** The only paths that surface plaintext priv to JS are `unwrap` (explicit backup-export) and the dev/web fallback.

- **Wrap-before-delete migration (Wave 7) — `src/pay/services/wallets.ts` `getActiveSigner()`** (lines ~637-661):
  - On first use under the native signer, the code (a) reads the legacy priv hex, (b) stamps `publicKeyHex` on the meta, (c) **wraps** the priv into the plugin (`await wrapPriv(id, hex)`, line 654), and only **then** (d) deletes the legacy priv hex from secure-store — **and only if the mnemonic is present** (`if (mnemonic) await removeSecure(privKey(id))`, lines 659-660).
  - **Order verified.** Wrap precedes delete; delete is conditional on a recoverable mnemonic. If the mnemonic is missing, the priv hex is deliberately retained so a wallet can't be orphaned. This is the correct fail-safe ordering — a crash between wrap and delete leaves the wallet fully recoverable.

- **Passphrase v3 path:** passphrase-protected wallets bypass the native signer entirely and unlock the priv from a passphrase envelope in JS (`getActiveSigner`, lines 620-635). This is a deliberate trade — the "priv never enters the JS heap" property is exchanged for a true second factor. Documented in-code as "the explicit deal in the spec." Falcon-512 post-quantum prep is scaffolded but not the active signing path.

- **Watch-only (Business):** the Business central company wallet is address-only — no keys, no password on the POS device (per `project_business_watch_only_wallet`). Per-terminal Z-report signing uses a separate signing key. This narrows the money-at-rest surface on the highest-traffic device class.

**Custody summary:** custody is byte-identical across the three money apps. On a real device, signing is HW-anchored and the priv never crosses to JS except on the explicit backup-export path.

---

## 2. Secure storage tiers

`secure-store.ts` (one near-identical copy per app; cited from `src/pay/services/secure-store.ts`) is tier-aware with a **fail-closed** contract:

| Tier | Backing store | When |
|---|---|---|
| `native` | Capacitor SecureStorage → Android Keystore / iOS Keychain | Real device (the only acceptable tier when `Capacitor.isNativePlatform()`) |
| `web` | IndexedDB, each value wrapped with a **non-extractable** AES-GCM `CryptoKey` | Browser dev preview only |
| `memory` | In-process `Map` | Unit tests (vitest) only |

- **Fail-closed is real (verified).** `detect()` (lines 34-54): if the native plugin is missing/throws **and** we're on a native platform, it **throws `SecureStoreUnavailableError`** rather than silently downgrading. "Refusing to fall back here is what makes the threat model honest" (code comment, line 49).
- **Correction to a common mis-statement:** the **web** tier is **not** plaintext IndexedDB. Values are AES-256-GCM wrapped with a `generateKey(..., extractable=false, ...)` key persisted in IndexedDB (`getOrCreateWrapKey`, lines 73-98; `wrap`/`unwrap`, lines 118-139). The honest characterisation: a forensic image of a **browser-dev** profile can still recover secrets because the wrap key lives in the same IndexedDB and is non-extractable only against script, not against a raw DB dump. That is why the web tier is **dev-only** and a real device is forced to `native`.

**Accepted limitation:** the web has no portable, device-bound key-crypto primitive equivalent to a hardware Keystore. Mitigations: web tier is dev-only and never reached on a phone (fail-closed); on-device, the app relies on `allowBackup=false`, File-Based Encryption (FBE), and the device lock screen.

---

## 3. Payment authorization

- **Biometric-first gate.** Signing is gated one layer above the Keystore key, in `services/biometric.ts`. The Keystore key intentionally does **not** set `setUserAuthenticationRequired(true)` — see the rationale in `FcSecureSignerPlugin.java` header (lines 18-22): a second Keystore prompt "doesn't add real assurance and breaks the existing UX of 'one biometric, then sign.'"
- **PBKDF2 PIN fallback — `src/pay/services/payment-pin.ts`** (used when no usable biometric is enrolled):
  - **PBKDF2-HMAC-SHA256, 210,000 iterations** (`KDF_ITERATIONS = 210_000`, line 27 — "OWASP 2023 PBKDF2-SHA256 floor"), 16-byte random salt per PIN (`SALT_BYTES = 16`), 256-bit output.
  - The PIN is **never stored**; only `{salt, hash, iters}` is persisted, and that envelope rides through secure-store (Keystore-wrapped again on device). **Verified** (`setPaymentPin`, lines 90-101).
  - Verification is **constant-time** (`timingSafeEqual`, lines 69-74; called from `verifyPaymentPin`, line 122).
  - **5-attempt cap** with exponential back-off enforced in the UI host (`src/pay/components/PinPromptModal.tsx`: `const MAX_ATTEMPTS = 5`, line 33; `exhausted = attemptFailures >= MAX_ATTEMPTS`, line 67). **Verified.**
  - Honestly scoped in-code (lines 19-22): a 4–8 digit PIN is a user-presence / casual-access gate, **not** a defence against an attacker who already holds the unlocked phone and can read Keystore.
- **Device attestation (Play Integrity) — `src/pay/services/device-attestation.ts`.**
  > **⚠️ Attestation is a NO-OP in production today.** `android-pay/.../res/values/strings.xml` ships `google_cloud_project_number = 0` (line 15). The native plugin's `isAvailable()` returns `getCloudProjectNumber() > 0L` → **false** (`FcDeviceAttestationPlugin.java:90`), so `requestPlayIntegrityToken()` returns `null` (`device-attestation.ts:124-128`) and the client sends a **dev token** `DEV_NO_ATTESTATION:<install_id>` (lines 218-220). The hub (Bahnhof) rejects dev tokens unless `BAHNHOF_DEV_ATTESTATION_ALLOWED` is set. **Do NOT rely on attestation for launch** until a real project number is set **and** the Phase-2 native plugin ships + is server-enforced. See `docs/PAY_DEVICE_ATTESTATION_SPEC.md` (now flagged) and §10 below.

---

## 4. E2E messaging (Comm)

`src/comm/services/crypto.ts` (a browser port of `server/services/community-e2e.ts`):

- **X25519 + HKDF-SHA256 + AES-256-GCM** with AAD. Each message gets a fresh 32-byte random salt; the AES key is `HKDF(staticSharedSecret, salt, 'anton-p2p-message-v1', 32)` (lines 96-98, 107-110). The fresh salt provides per-message **key separation**.
- **No forward secrecy — stated, not marketed.** The DH secret is **static** (derived from long-term identity keys on both sides). The in-code header (lines 11-18) is explicit: "this is NOT forward secrecy… do not promise forward secrecy to users or in marketing copy until an ephemeral-key handshake is implemented." **Verified** — `deriveSharedSecret` uses the long-term X25519 keys (lines 87-92), no ephemeral DH. Treat this layer as **confidential-in-transit + key-separated**.
- **AAD binds routing.** AAD = `<fromHash>:<toHash>` (`buildAad`, lines 200-202; bound into the GCM tag, lines 112-119), so the relay cannot swap routing metadata without breaking decryption.
- **Replay guard runs before crypto** — `openFromPeer` calls `recordOrReject(fromHash, salt, iv)` and throws `ReplayError` **before** doing the DH/decrypt, so a flooded peer can't burn our CPU (lines 186-189).
- **`pubkeyBindsTo` / `senderPub`.** For an unconfirmed contact, the sender's Ed25519 pubkey rides in cleartext on the envelope (`senderPub`, lines 46-52) so a recipient who hasn't added the sender can still decrypt a `contact_request`; it's verified against `routing_id` + hash before use. This leaks nothing new to the relay (which already knows `routing_id = sha256(pub)[0:16]`).
- **Agreements v1** Ed25519-signed two-party contracts with a `canonicalFlat` golden lock and turn-based counter (per `project_agreements_v1`; covered by `src/comm/__tests__/agreements.test.ts`).

---

## 5. WebView / Capacitor hardening

- **Cleartext blocked (verified).** `android-pay/.../res/xml/network_security_config.xml`: `base-config cleartextTrafficPermitted="false"` (line 19). Cleartext is permitted **only** for `localhost`, `127.0.0.1`, `10.0.2.2` (dev `adb reverse` + emulator host) (lines 26-30) and in `debug-overrides` (release builds ignore that block, lines 35-40). Earlier dead RFC1918 `<domain>` entries (which Android does not CIDR-match) were correctly removed.
- **`allowBackup=false` (verified)** in `android-pay/.../AndroidManifest.xml:5`, plus `fullBackupContent`/`dataExtractionRules` exclusion rules (lines 6-7).
- **No deep-link / scheme on the money apps (verified).** The Pay manifest has **only** a `MAIN`/`LAUNCHER` intent-filter (lines 23-26). The `custom_url_scheme` string exists for Capacitor internals but is **not** wired into any `intent-filter`, so there is no `futurechain:` URL handler — `futurechain:pay` payloads are parsed only from **in-app** QR/NFC scans, never from an external intent.
- **`FileProvider` not exported (verified).** `android:exported="false"` (`AndroidManifest.xml:33`), `grantUriPermissions="true"` scoped to declared `file_paths`.
- **Companion `anton://` pairing link.** The Companion app intentionally parses an `anton://enroll?...` / `anton://join?...` enrollment URL (`src/app/services/pairing-url.ts:9-11`). This is the documented pairing ritual surface (Ed25519 enrollment, 60s TTL, OOB confirmation code) and is distinct from the money apps, which have no registered scheme.

---

## 6. Transport / relay / hub

- **Signed envelopes + replay nonce.** The relay verifies HELLO proof signatures with a replay-protection cache (`relay/src/server.ts`: `proofReplayCache`, `recordProofKey` lines 891-899, 60s TTL); per-session ENVELOPE rate-limit (`envelopeRateLimiter`, lines 795-808). Identity legs prove control with fresh proofs (`INVALID_PROOF` on failure, lines 569-570).
- **SSRF guard (verified) — `server/lib/ssrf-guard.ts`.** Blocks loopback/private/link-local/ULA/CGNAT and cloud metadata (`169.254.169.254`). The **IPv4-mapped-IPv6 bypass is closed**: `normalizeIp` unwraps **both** dotted (`::ffff:127.0.0.1`) **and hex** (`::ffff:7f00:1`) forms to dotted IPv4 before the rules apply (lines 32-43), so `::ffff:a9fe:a9fe` (=169.254.169.254) cannot slip past. Async DNS-resolution check on hostnames (`assertSafeEgressUrl`, lines 102-112). A LAN variant (`assertSafeLanEgressUrl`) allows private LAN for portal peering but still blocks loopback + metadata.
- **CORS exact-match allowlist (hub) (verified) — `server/index.ts`.** Origins are allowed only if same-origin, a localhost/RFC1918 pattern, a Capacitor origin (`capacitor://localhost`), or an **exact** member of `allowedOrigins` (`origin === allowed`, lines 254-265). *(Note: the relay's public **discovery/registry** routes deliberately use `access-control-allow-origin: *` — `relay/src/registry/routes.ts:48` — because they serve credential-less public discovery; tightening to per-origin is a tracked Phase-E item.)*
- **Install-token + register_address proof-of-control.** The install bearer token authorizes hub calls but is **not bound to the device keypair** — a stolen bearer can be replayed (this is exactly what device attestation was meant to mitigate; see §3). Address registration requires an **Ed25519 signature** (proof-of-control) before storage (`relay/src/registry/handlers/terminals.ts:9` — "verifies only the Ed25519 SIGNATURE before storing").
- **Relay threat tests.** `relay/tests/threats/` carries one file per threat in `THREAT_MODEL.md` (T02 tampering, T06 cross-tenant, T14 squatting, T16 misrouting, T17, T18 IPv6-bypass + harness). **T17 (rotation-advisory replay) is a documented `it.skip`** — the threat is application-layer (rides inside the encrypted ENVELOPE inner; the relay must never see it), with a written rationale in the test file (`T17-rotation-replay.test.ts:1-39`). Net assertion count ≈ 20/21 passing with the one documented T17 skip.
- **SEND_COMM rate ceiling (verified).** Group fan-out is bounded at **30 SEND_COMM frames per sender per minute** (`relay/src/comm-registry.ts:52` `sendsPerMinutePerSender: 30`, enforced lines 282-290). This is a latency/throughput ceiling for large group fan-out — worth knowing for UX expectations on big groups.
- **Prod flat-file drift.** The live relay's registry/state is a flat-file store that can drift from the repo's expectations; a re-sync is a launch action (§10).

---

## 7. Dependency posture

- **CI audit is non-blocking.** `.github/workflows/security.yml` runs `pnpm audit --audit-level=moderate` with `continue-on-error: true` (lines 37-38); `.github/workflows/ci.yml` runs `pnpm audit --audit-level=high || true` (line 112). Either way the gate cannot fail the build.
- **No SAST / no secret-scanning.** There is no CodeQL, Semgrep, gitleaks, or trufflehog step in any workflow.
- **Root `pnpm audit` (run 2026-06-10): 5 critical, 44 high, 63 moderate, 8 low (120 total).** Spot-checked the critical/high set — they are **dev / build tooling**, not app-runtime crypto or transport:
  - Critical: `protobufjs`, `vitest` (UI server arbitrary file read), `shell-quote`.
  - High: `xlsx`/SheetJS, `rollup`, `vite`, `electron` (multiple), `node-tar`, `serialize-javascript`, `path-to-regexp`, `picomatch`, `lodash.template`, `xmldom`, `babel`, `protobufjs`, `prom-client`, `express-rate-limit` (IPv4-mapped-IPv6 bypass).
- **App-runtime crypto/transport libs are clean of crit/high.** `@noble/*`, `web-push`, and the app crypto path show **no critical or high** advisories. (Honest caveat: `ws` carries a **moderate** advisory, patched in `>=8.20.1`, via `socket.io>engine.io>ws` and a direct dep — it is **not** critical/high, but it is not literally zero-advisory.) The `express-rate-limit` IPv4-mapped-IPv6 high is mooted on our paths because the app's own SSRF guard (§6) and the relay's own `ipBucket`/`isBlockedIp` independently unwrap IPv4-mapped IPv6.
- **No secrets in git.** No provider keys, tokens, or keystores are committed in the source trees audited (signing keystores are operator-held; see §10).

---

## 8. E2E / device verification

The money flows and Comm E2E paths have been repeatedly verified on real 2-phone setups over the live relay (per session memory): cross-phone payments on all three money apps, Comm contact-request/approve over the live relay, agreements v1 round-trip + counter negotiation, per-wallet scoping, and on-chain settlement legs (PACS.008). These are behavioural confirmations, not a substitute for the code-level controls above.

---

## 9. Known gaps / launch actions

| Item | Severity | Owner | Status |
|---|---|---|---|
| Business `addContact` look-alike/poison guard not run on add path | Medium | code (Business) | **In progress** (being fixed this session by the Business agent) |
| Play Integrity `google_cloud_project_number = 0` → attestation is a prod NO-OP | High (launch) | ops + code (Phase-2 native plugin) | **Open** — set real number, ship native plugin, server-enforce, unset `BAHNHOF_DEV_ATTESTATION_ALLOWED` |
| Android `loggingBehavior` / debug logging config | Low–Medium | code | **In progress** (being fixed this session) |
| CI `pnpm audit` is non-blocking; no SAST/secret-scan | Medium | ops/CI | **Open** — make audit gate blocking at a chosen floor; add `gitleaks` + CodeQL |
| Relay prod flat-file drift | Medium | ops | **Open** — re-sync live relay state to repo expectations |
| Rotate the 4 dev keys (per-app dev signing/identity) | Medium | ops | **Open** — rotate before/at launch |
| `INSTANCE_KEY_ENCRYPTION_KEY` / `ENCRYPTION_KEY` on the launch instance | High | ops | **Open** — without `INSTANCE_KEY_ENCRYPTION_KEY` the instance Ed25519 privkey is stored **plaintext** and the service logs a one-time warning (`server/services/app-enrollment-service.ts:150-164`) |
| Install bearer not bound to device keypair | Medium | code/ops | Mitigated only by rate limit until attestation is live (§3, §6) |
| 4 release keystores backed up off-machine | High | ops | **Operator-held** — losing them blocks store updates forever |

---

## 10. Confirmed-still-valid

The following controls were re-derived from source in this pass and confirmed working as described:

- Native Keystore signer: priv never in JS heap on device; zeroed in `finally`. (`FcSecureSignerPlugin.java`)
- Wrap-before-delete ordering, delete gated on mnemonic. (`wallets.ts:637-661`)
- Secure-store fail-closed on native platforms. (`secure-store.ts:34-54`)
- PBKDF2 PIN: 210k iters, random salt, constant-time compare, 5-attempt cap. (`payment-pin.ts`, `PinPromptModal.tsx`)
- Comm E2E: X25519 + HKDF + AES-256-GCM + AAD + pre-crypto replay guard; static-DH = no FS, honestly documented. (`crypto.ts`)
- Cleartext blocked, `allowBackup=false`, no money-app URL scheme, `FileProvider` not exported. (`network_security_config.xml`, `AndroidManifest.xml`)
- SSRF guard closes the IPv4-mapped-IPv6 (dotted + hex) bypass. (`ssrf-guard.ts:32-43`)
- Hub CORS exact-match allowlist. (`server/index.ts:254-265`)
- Relay signed-envelope replay cache + SEND_COMM 30/min ceiling + documented T17 skip. (`server.ts`, `comm-registry.ts:52`, `T17-rotation-replay.test.ts`)
- App-runtime crypto/transport deps free of critical/high CVEs (`@noble/*`, `web-push` clean; `ws` moderate only).

---

*This document is a point-in-time baseline (2026-06-10). The server-only `docs/OWASP_COMPLIANCE.md` and `docs/DEPLOYMENT_SECURITY.md` predate the mobile apps and cover the desktop/hub server, not the app clients; this doc is the app-client + transport coverage.*
