# DESKTOP_ATTESTATION_SPEC.md

**Status:** Draft 1 (2026-05-24). Implementation: Bahnhof sidecar
verifier shipped; Agent Pay client code in flight (this PR series).
Pairs with `ANTON_AGENT_PAY_SPEC.md §9 + §14 Phase 2a`.

**Audience:** Bahnhof / FutureChain / Agent Pay implementers + auditors.

---

## 1. Why a desktop attestation primitive exists

Mobile (Android / iOS) gets device attestation for free from the OS
vendor — Google Play Integrity, Apple App Attest. Bahnhof verifies the
vendor-signed JWS and is done.

Desktop has no equivalent OS-issued attestation API. Windows does
issue TPM-backed device-binding tokens via Azure AD / WHfB, but they're
tenant-bound — not a general-purpose check that "this binary is the
real Anton Agent Pay running on this user's machine". macOS Gatekeeper
verifies signatures at install time but exposes nothing to the running
process. Linux has nothing standard at all.

So we synthesize the equivalent from primitives that DO exist on every
desktop OS:

1.  **Code signing.** macOS Developer ID Application certs, Windows
    Authenticode certs, Linux signed Flatpak / AppImage GPG. The running
    binary CAN read its own signature and surface the signing cert's
    thumbprint to itself.
2.  **OS keychain.** Per-install Ed25519 keypair generated at first run
    and held in macOS Keychain / Windows DPAPI / Linux libsecret. The
    public key registers with Bahnhof; the private key signs attestation
    packets without ever leaving the OS keychain (where supported).
3.  **Bahnhof-issued nonce.** Per attestation, fresh server-side, single
    use, defeats replay of a captured packet.

The Bahnhof verifier (`_verify_desktop_attestation_token` in
`bahnhof/app.py`) checks: (a) the signature is valid under the
registered install pubkey, (b) the included code-signature thumbprint
is one of the allowlisted Agent Pay signing certs, (c) the nonce
matches the one Bahnhof issued, and (d) the timestamp is fresh.

**Honest limit:** desktop attestation is NOT hardware-rooted in the
same way Play Integrity is. A user who has already obtained root /
admin on the desktop can forge any signature. The defense for that
scenario is exactly the disclaimer in `ANTON_AGENT_PAY_SPEC.md §2`:
"local-machine attacker already root — out of scope, at that point
they have keystroke + screenshot access". The desktop primitive catches
the threats that mobile attestation also catches: unsigned dev builds
on prod, re-packaged modified binaries shipped to users, and
old-version binaries that should be EOL'd.

---

## 2. Token format

```
DESKTOP_V1:<urlsafe-base64(payload_json)>:<urlsafe-base64(sig_bytes)>
```

- **Prefix** `DESKTOP_V1:` — namespaces this from `DEV_NO_ATTESTATION:`
  and from raw Google Play Integrity JWS tokens.
- **`payload_json`** — UTF-8 JSON, deterministic shape (see §3).
  The token transmits the EXACT bytes the client signed; Bahnhof
  signature-verifies those bytes as received and parses JSON after.
  This avoids any "re-canonicalise then verify" drift around key
  ordering / whitespace.
- **`sig_bytes`** — 64-byte Ed25519 signature over `payload_json` bytes
  using the install's registered attestation private key.
- Both base64 segments are **urlsafe-base64 with padding stripped**
  (`+` → `-`, `/` → `_`, no trailing `=`). The verifier re-pads in
  4-byte chunks before decoding.

Max size: each segment ≤ ~2 KB; token total ≤ 8 KB (well under the
`AttestRequest.play_integrity_token` Pydantic `max_length=8192`).

---

## 3. Payload schema

```jsonc
{
  "install_id":                 "44444444-4444-4444-4444-444444444444",
  "platform":                   "darwin" | "win32" | "linux",
  "app_version":                "0.0.1",
  "code_signature_subject":     "CN=Anton Agent Pay (Developer ID)",
  "code_signature_thumbprint":  "ab12…f0",   // SHA-256, lowercase hex, 64 chars
  "nonce":                      "0123456789abcdef0123456789abcdef",
  "ts_ms":                      1748097600000  // client epoch millis
}
```

Required fields. Extra fields are accepted by the parser but ignored
by the verifier (forward-compat).

`install_id` must match the install_id resolved from the bearer token
in `/attest`'s `X-API-Key` header — see §4 floor check 3.

`platform` is the Node `process.platform` string. The verifier accepts
`{darwin, win32, linux}` only (matches the build matrix in
`electron-builder.yml`).

`code_signature_subject` is informational — surfaced in audit logs.
The load-bearing check is on `code_signature_thumbprint`.

`code_signature_thumbprint` is a SHA-256 of the binary's signing
certificate's DER encoding (per-platform method — see §5). Bahnhof
compares this (lowercase hex) against `AGENT_PAY_SIGNING_THUMBPRINTS`
(comma-separated env var). When the allowlist is empty (dev posture),
any well-formed thumbprint is accepted; production MUST set it.

`nonce` must equal the `nonce` field on the `AttestRequest` Bahnhof
received. Bahnhof issues nonces (currently the client supplies, but
Phase 2 will move to server-issued nonces — see §8 Future tightening).

`ts_ms` is the client's clock at packet build time. Bahnhof checks
that the absolute delta from server clock is within
`DESKTOP_ATTESTATION_FRESH_WINDOW_S` (default 300 s).

---

## 4. Verification floor (in order)

The verifier (`_verify_desktop_attestation_token`) runs these checks
and short-circuits on the first failure with HTTP 401 + a descriptive
`detail`:

1. **Parse.** Split `DESKTOP_V1:<b64>:<b64>`; base64-decode; JSON-parse
   payload. Reject malformed tokens with `"DESKTOP_V1 token: <reason>"`.
2. **Required fields.** `install_id`, `platform`, `app_version`,
   `code_signature_subject`, `code_signature_thumbprint`, `nonce` all
   non-empty strings; `ts_ms` integer.
3. **Token-binding.** `payload.install_id` must equal the install_id
   resolved from the `X-API-Key` header. Prevents a captured DESKTOP_V1
   token from being replayed under a different bearer.
4. **Platform / app_version / thumbprint format.** Regex-checked
   against the spec.
5. **Pubkey lookup.** `enrolled_clients.attestation_pubkey` must be set
   for this install_id. If missing → 401 with "no registered
   attestation_pubkey" hint (the install must re-/enroll).
6. **Signature.** Ed25519-verify `sig_bytes` over `payload_json_bytes`
   using the registered pubkey.
7. **Nonce match.** `payload.nonce == attest_request.nonce`. Defeats
   replay of a captured packet.
8. **Freshness.** `|now_ms − ts_ms| ≤ DESKTOP_FRESH_WINDOW_S`. Defeats
   long-tail replay even if nonce reuse somehow slipped past.
9. **Signing-cert allowlist.** When `AGENT_PAY_SIGNING_THUMBPRINTS` is
   non-empty, `payload.code_signature_thumbprint` must be in it. When
   the allowlist is empty (dev posture / pre-cert-provisioning), the
   check is skipped.

On success, the verifier returns a verdict-summary string:

```
DESKTOP|<platform>|<app_version>|<thumbprint_first_8>
```

which is stored in `attestation_sessions.verdict` for audit / forensics.

---

## 5. Computing the code-signature thumbprint (per platform)

The Agent Pay main process is responsible for computing the thumbprint
at attestation time. The OS-specific path:

### macOS

```
codesign -dvvv --extract-certificates /tmp/cs-cert <path-to-app>.app
shasum -a 256 /tmp/cs-cert.0  # the leaf cert is .0
```

The Node binding uses `child_process.spawnSync('codesign', […])`
followed by reading the extracted cert.

If the binary is unsigned (dev `npm start` build), thumbprint defaults
to the literal string `"DEV-UNSIGNED-<64-hex-random>"` (passes the
regex but won't be in any real allowlist — so dev attest only works
with the permissive `AGENT_PAY_SIGNING_THUMBPRINTS=""` posture).

### Windows

```
PowerShell:
  (Get-AuthenticodeSignature <exe>).SignerCertificate.GetCertHashString("SHA256")
```

Lowercase the hex.

If the binary is unsigned, the SignerCertificate is null — same
`"DEV-UNSIGNED-…"` fallback applies.

### Linux

Flatpak / AppImage GPG: `gpg --verify` produces a key fingerprint;
SHA-256-hash it.

For ad-hoc `electron .` dev runs without any packaging signature,
same `"DEV-UNSIGNED-…"` fallback.

**This calculation is part of the trusted boundary** — a compromised
Agent Pay binary could lie about its own thumbprint. The defense is:
that exact scenario (a fake / modified binary) is *also* what the
thumbprint allowlist catches — even if the fake binary lies about its
thumbprint, the lie would be a thumbprint NOT in the allowlist (unless
the attacker has already stolen the real signing cert, at which point
the whole chain of trust is gone). It's mutually reinforcing.

---

## 6. Enrollment changes

`POST /enroll` (Bahnhof sidecar) now accepts an additional optional field:

```jsonc
{
  "install_id":          "<uuid>",
  "app_version":         "0.0.1",
  "platform":            "desktop",                  // new value: "desktop"
  "fc_address":          "fc_…",                     // optional, as before
  "attestation_pubkey":  "<64 lowercase hex>"        // new; required for desktop
}
```

- **Required for desktop.** A `/enroll` with `platform="desktop"` but
  no `attestation_pubkey` returns HTTP 400 — the install could never
  later attest successfully, so we fail loud at enrollment time.
- **Ignored for mobile.** Stored if provided, but mobile attest path
  doesn't read it (Google verifies Play Integrity tokens directly).
- **Re-enrollment overwrites.** If the install rotates its attestation
  key (e.g. after a fresh OS keychain reset), it can re-/enroll and the
  new pubkey replaces the old one.

Schema:

```sql
ALTER TABLE enrolled_clients ADD COLUMN attestation_pubkey TEXT;
-- (Implemented via rebuild-and-rename inside ensure_schema() because
--  SQLite can't ALTER a CHECK constraint in place. See app.py.)
```

Plus the CHECK constraint is relaxed to allow `'desktop'`. Existing
deployments get migrated on the next sidecar restart.

---

## 7. Client implementation contract (Agent Pay)

The Agent Pay main process exposes a small surface that the
`chain.ts` submit path calls into:

```ts
// src/main/attestation.ts
export interface AttestationPacket {
  readonly token: string;  // "DESKTOP_V1:…:…"
  readonly nonce: string;  // the nonce embedded in the token
}

/** Build (and sign) a fresh DESKTOP_V1 token for a given server-issued
 *  nonce. Reads the install's attestation private key from the OS
 *  keychain, computes the code-signature thumbprint, assembles the
 *  payload, and Ed25519-signs. */
export function buildAttestationPacket(nonce: string): Promise<AttestationPacket>;

/** Wrap a server flow: server gives us a nonce, we attest, server gives
 *  us a session_token, we cache it until expiry. Submit flow calls
 *  this to acquire / refresh the X-Attestation-Token header value. */
export function attestForChainCall(): Promise<string>;
```

The install's attestation key lifecycle (created at first launch,
stored in keytar / OS keychain) is owned by
`src/main/wallet/install-keys.ts`. The wallet private key is a separate
keypair under a separate keychain entry — these never mix.

---

## 8. Future tightening

Things explicitly NOT in v1 but tracked for follow-up:

- **Server-issued nonces.** v1 has the client pick a nonce. v2 will
  add a `POST /attest/challenge` that returns a server-stored nonce
  with a 60-s TTL, and `_verify_desktop_attestation_token` will
  cross-check + invalidate.
- **TPM-backed install key (Windows).** Bind the install Ed25519 priv
  to a TPM-resident key handle so even disk-image theft can't extract
  it. Same for macOS Secure Enclave + Linux TPM2.
- **Binary self-hash.** Sign-include a SHA-256 of the running binary
  alongside the cert thumbprint, so EOL'ing a vulnerable version is
  a hash-level allowlist rotation rather than re-issuing a signing cert.
- **Hardware-attested launch sequence.** Windows Code Integrity Guard /
  macOS Hardened Runtime can produce a launch-time attestation that
  could be plumbed through.
- **Per-payment attestation.** Today an attestation session covers
  24 h of payment submissions. A higher-risk tier (large transfers)
  could require a fresh attestation per submission.

---

## 9. References

- `bahnhof/app.py::_verify_desktop_attestation_token` — the verifier
- `bahnhof/test_attestation.py` (17 desktop tests added) — the test
  matrix
- `apps/anton-agent-pay/src/main/attestation.ts` — the client builder
- `apps/anton-agent-pay/src/main/enrollment.ts` — the enroll caller
- `apps/anton-agent-pay/docs/CODE_SIGNING_SETUP.md` — operator runbook
  for obtaining + provisioning the signing certs
- `bahnhof/docs/PLAY_INTEGRITY_PROD_SETUP.md` — sister doc for the
  mobile path
- `ANTON_AGENT_PAY_SPEC.md §9 + §14 Phase 2a` — strategic context
