# Pay-App Wallet Passphrase — Spec (Opt-In Second Factor)

**Status**: Draft for review (2026-05-23)
**Owner**: pay-app
**Depends on**: existing `secure-store.ts` AES-GCM envelope, `FcSecureSigner` native plugin, `biometric.ts`

---

## 1. Why

Today the pay app has **one** factor on every sensitive op: the device biometric
(which itself falls back to the OS PIN/pattern/password). For users on a shared
device, or who simply want a "knowledge-factor seatbelt" on top of their
fingerprint, that's not enough. This spec adds an **optional** wallet
passphrase as a true second factor — knowledge in addition to biometric.

Non-goal: replace biometric. Biometric stays mandatory.
Non-goal: become a backup mechanism. The 24-word mnemonic is still the only
true backup; the passphrase is per-install only.

---

## 2. Threat model — what does the passphrase actually defend?

| Scenario | Biometric only (today) | Biometric + passphrase |
|---|---|---|
| Phone stolen, locked | Safe (Keystore stops everyone) | Safe |
| Phone stolen, unlocked, no enrolled fingerprint by attacker | Safe | Safe |
| Phone stolen, unlocked, **attacker holds it to victim's face** (coerced unlock) | **Compromised** | **Defended** (attacker still needs the passphrase) |
| Forensic disk image of `/data/data` | Safe (Keystore key anchored in TEE) | Safe (extra layer, but Keystore is already enough) |
| Compromised companion app on same device | Limited (biometric still required for each sign) | Same + extra factor |
| Shoulder-surfed passphrase + coerced unlock | n/a | **Compromised** — both factors lost |

The headline win is **defence against coerced unlock**. That's the realistic
threat for a fiat-on-ramp wallet on a phone that's already on the user's
person and accessible.

---

## 3. Design

### 3.1 Key derivation

```
salt          = random 16 bytes, generated at passphrase-setup time,
                stored ALONGSIDE the wrapped ciphertext (not secret).
passphraseKey = PBKDF2-HMAC-SHA256(
                    password    = user passphrase (NFC-normalised),
                    salt        = salt,
                    iterations  = 600_000,         // OWASP 2023
                    keyLen      = 32 bytes,
                )
```

PBKDF2 chosen over Argon2id only because the OS/WebCrypto path has it natively
on every Capacitor target; Argon2id would need a native plugin. 600k iterations
costs ~250 ms on a mid-range Android — within UX tolerance, well above the
2023 floor.

### 3.2 Envelope (double wrap)

```
plaintext           = mnemonic (24 words) || priv hex
inner ciphertext    = AES-256-GCM(plaintext,    key = passphraseKey,    iv = iv_inner)
outer ciphertext    = AES-256-GCM(inner_ciphertext, key = keystoreKey,  iv = iv_outer)
on-disk record      = { iv_outer, iv_inner, salt, outer_ciphertext, version: 2 }
```

Order rationale:
- **Outer = Keystore-bound** → defeats off-device disk imaging even if the user's
  passphrase is known to the attacker.
- **Inner = passphrase-bound** → defeats on-device attackers who can read the
  Keystore output (e.g. a compromised process inside the app sandbox).

Without a passphrase (default today), the envelope stays as today:
single Keystore-bound AES-GCM wrap, `version: 1`.

### 3.2.1 Envelope v3 — FALCON-512 keypair material (2026-05-24)

Envelope `version: 3` extends v2 with FALCON-512 keypair material so
the future user-side post-quantum hard fork is a no-UX-change event.
FALCON-512 is the same scheme our chain's HSM-backed compliance signers
already use (Phase 4, see `ey_audit_package/14_*.md`). User-side
adoption is a separate future hard fork; this envelope upgrade just
pre-stashes the material so that when the fork lands, every wallet
already has a registered FALCON pub bound to its Ed25519 identity.

Schema:

```
v3 envelope (per-wallet, JSON in secure-store under
             `fc.wallet.<id>.passphrase_envelope`):

  v               = 3
  salt            = base64(16 bytes)   // PBKDF2 salt, same KDF as v2
  iv_priv         = base64(12 bytes)
  priv_ct         = base64(AES-256-GCM(priv_hex, passphraseKey, iv_priv))
  iv_mnem?        = base64(12 bytes)   // optional, present iff mnemonic exists
  mnem_ct?        = base64(AES-256-GCM(mnemonic, passphraseKey, iv_mnem))
  iv_falcon       = base64(12 bytes)
  falcon_priv_ct  = base64(AES-256-GCM(falcon_priv_hex, passphraseKey, iv_falcon))
  falcon_pub      = base64(897 bytes)  // raw FALCON-512 pub — public, plaintext
```

KDF is unchanged (PBKDF2-HMAC-SHA256, 600,000 iterations, same salt
across all four ciphertext slots — derives one AES-256 key, reused
with fresh IVs per slot). The FALCON pub is stored plaintext because
it IS public — the verifier reads it to check signatures, and there's
no privacy cost.

**Wallet without a passphrase** stores FALCON in two extra plaintext
secure-store rows alongside the existing `priv` + `mnemonic` rows:

```
fc.wallet.<id>.falcon_priv  hex(FALCON-512 secret key)
fc.wallet.<id>.falcon_pub   hex(FALCON-512 public key)
```

Enable-passphrase scoops up all four (priv + mnemonic + falcon_priv +
falcon_pub) into a v3 envelope and drops the plaintext rows.

**FALCON keygen is non-deterministic.** Unlike Ed25519 (which can be
derived from a BIP-39 seed), FALCON keypair generation has no
seed-based reproducibility in the standard. The library author
(Paul Miller's `@noble/post-quantum/falcon.js`) confirms this in source:
*"we cannot use any key derivation schemes here: same seed will return
different keys."* Implication: a wallet restored from a 24-word
mnemonic on a **different device** will get a different FALCON
keypair than the original. The post-hard-fork rotation UX (one-time,
gated behind the activation height) is tracked separately as
[task #289 / PAY_FALCON_ROTATION_SPEC.md to-write].

### 3.2.2 Lazy v2 → v3 migration

Existing wallets on v2 are migrated transparently on the next
unlock-with-passphrase. The flow:

1. `unlockPriv` / `unlockMnemonic` / `changeWalletPassphrase` /
   `removeWalletPassphrase` reads the envelope and sees `v: 2`.
2. The supplied passphrase + the existing salt re-derive the same
   AES-256 key the v2 envelope was encrypted under. Decrypting `priv`
   validates the passphrase (same `BadPassphraseError` semantics).
3. A fresh FALCON-512 keypair is generated.
4. The FALCON priv is encrypted with the **same** key + a fresh IV.
5. A v3 envelope is written with: the original salt + priv_ct + mnem_ct
   preserved, plus the new `iv_falcon` + `falcon_priv_ct` + `falcon_pub`.
6. The original unlock call returns its requested data unchanged.

Migration is idempotent — once an envelope is v3, future unlocks see
v3 directly and never re-migrate (tested explicitly:
"v2 → v3 migration is idempotent — repeated unlocks are no-ops").

### 3.3 On-device storage

- The on-disk record lives in `@aparajita/capacitor-secure-storage`, exactly
  where the wallet record lives today.
- Salt + IVs are NOT secret. The Keystore-bound key + the user passphrase
  are.
- The native `FcSecureSigner` plugin (which holds the priv inside Keystore
  after first-use migration) is **not** affected — when a passphrase is on,
  the migrated priv stays Keystore-bound but `unwrap()` is gated through an
  in-JS passphrase check before the Keystore call is even attempted. (See §3.5.)

### 3.4 UI flows

**A. Enable passphrase** (Settings → Security → Add wallet passphrase)
1. Biometric prompt (gate the change itself).
2. "Enter a wallet passphrase" — masked, with a strength meter (zxcvbn ≥ 3
   required; suggest ≥ 12 chars).
3. "Confirm passphrase" — must match.
4. "We can't recover this. Keep your 24-word backup safe." — checkbox ack.
5. Re-encrypt the on-disk record with the new double envelope.
6. Audit log: `wallet_passphrase_enabled` (timestamp + walletAddr; no
   passphrase material).

**B. Sign a transaction** (when passphrase is on)
1. Biometric prompt (`Send 0.10 FTC to fc_VL…`).
2. "Wallet passphrase" dialog — masked input, 5-attempt cap, exponential
   back-off (1 s → 2 s → 4 s → 8 s → 16 s) after each failure.
3. Both factors valid → proceed with the existing signing path.
4. Cancel at either step → abort, no signature, surface "signing cancelled".

**C. Show recovery phrase** — same two factors as **B**.

**D. Change passphrase** (Settings → Security → Change wallet passphrase)
1. Biometric prompt.
2. "Current passphrase".
3. "New passphrase" + "Confirm".
4. Re-encrypt the inner layer with the new `passphraseKey`. Outer Keystore
   wrap is unchanged.
5. Audit log: `wallet_passphrase_changed`.

**E. Remove passphrase** (Settings → Security → Remove wallet passphrase)
1. Biometric prompt.
2. "Current passphrase".
3. Warning: "Your wallet will be protected by biometric only after this."
4. Re-encrypt the on-disk record as a single-wrap (`version: 1`).
5. Audit log: `wallet_passphrase_removed`.

**F. Forgot passphrase**
- The app **cannot recover** a forgotten passphrase. Settings →
  Recovery → "Lost your passphrase? Restore from your 24-word backup"
  takes the user through the existing wipe-and-restore flow.
- On restore, the new install starts passphrase-less.

### 3.5 Code touchpoints

- `services/secure-store.ts`
  - `setItemDoubleWrapped(key, plaintext, passphrase) → void`
  - `getItemDoubleWrapped(key, passphrase) → plaintext`
  - `hasPassphrase(walletAddr) → bool`
  - `changePassphrase(walletAddr, oldP, newP) → void`
  - `removePassphrase(walletAddr, currentP) → void`
  - PBKDF2 via `crypto.subtle.deriveBits({ name: 'PBKDF2', ... })` —
    available in WebView + node-test env.
- `services/secure-signer.ts`
  - `unwrap()` path gains a passphrase parameter when `hasPassphrase()` is
    true; calls `secure-store.getItemDoubleWrapped` instead of the
    single-wrap call.
- `services/payment.ts::executePayment`
  - After `requireBiometric`, when `hasPassphrase(wallet.address)` is true,
    open the passphrase dialog. Pass the resolved string into
    `secure-signer.unwrap` / the native plugin signing path.
- `pages/SettingsScreen.tsx`
  - New "Wallet passphrase" section with the four flows (A/D/E/F).
- `components/WalletPassphraseDialog.tsx`
  - Modal with masked input, attempt counter, back-off timer.
- `services/audit-log.ts`
  - Three new event types as above. (No passphrase material in the log.)

### 3.6 Tests

- `secure-store.test.ts`:
  - Round-trip with passphrase.
  - Wrong passphrase → throw `BadPassphraseError`.
  - Salt is fresh per wallet.
- `secure-signer.test.ts`:
  - Sign with passphrase OK.
  - Sign without passphrase when one is set → throws.
- `payment.test.ts`:
  - executePayment respects the passphrase prompt + cancellation.
- `WalletPassphraseSettings.test.tsx`:
  - Enable / change / remove flows render and dispatch correctly.
- 5-attempt cap → simulated back-off.
- Restore-from-mnemonic on a new install starts passphrase-less.

### 3.7 Server side

**Zero change.** The chain doesn't see the passphrase. Bahnhof doesn't see
the passphrase. The passphrase is purely a per-install device-side wrapper
on the same priv that already signs every tx.

### 3.8 Migration

- Default for existing users: **off**. No on-disk format change for users
  who don't enable it (`version: 1` envelope continues to work).
- Setup is opt-in via Settings. First-use prompt **not** added in this spec
  — that's a separate "should we nudge users" decision.

---

## 4. Recovery semantics

| Scenario | What works |
|---|---|
| User remembers passphrase | All flows work. |
| User forgets passphrase | Passphrase lost; mnemonic still works → wipe + restore → fresh install starts passphrase-less. |
| User loses phone but has mnemonic | Restore on new phone → fresh install starts passphrase-less; user can set a new passphrase. |
| User loses phone AND mnemonic | Wallet lost. (Same as today — this passphrase doesn't help here.) |

Important: **the passphrase is a per-install wrapper, not a property of the
wallet**. Two devices restored from the same mnemonic can have different
passphrases (or none), and rotating the passphrase on one does not affect
the other.

---

## 5. Acceptance criteria

- [ ] Existing wallets keep working with no passphrase prompt.
- [ ] Settings → Security → Add wallet passphrase succeeds end-to-end and
      survives app restart.
- [ ] Sign + send tx with passphrase on → biometric prompt, passphrase
      prompt, signed tx submitted, mined.
- [ ] Show recovery phrase with passphrase on → both factors required.
- [ ] Change / remove passphrase works.
- [ ] Wrong passphrase → readable error; 5 failures triggers back-off.
- [ ] Restore from mnemonic on a fresh install → no passphrase prompt
      (proves it's per-install).
- [ ] No passphrase material in logs, audit entries, or Capacitor bridge
      traces (verify with `loggingBehavior: 'production'` and a packet
      capture / logcat).
- [x] **(v3, 2026-05-24)** Wallet create + restore generate a FALCON-512
      keypair and stash it in secure-store (plaintext rows or v3 envelope
      depending on passphrase state). Verified by `wallet-passphrase.test.ts`
      cases "enable creates a v3 envelope with FALCON fields" + "getFalconPub
      works without a passphrase on a plaintext-only wallet".
- [x] **(v3, 2026-05-24)** v2 envelopes lazily migrate to v3 on first
      unlock without losing the existing passphrase or any wallet
      material. Verified by `wallet-passphrase.test.ts` case
      "v2 envelopes lazily migrate to v3 on first unlock".
- [x] **(v3, 2026-05-24)** change-passphrase and remove-passphrase preserve
      FALCON across operations. Verified by `wallet-passphrase.test.ts`
      cases "change passphrase preserves the FALCON keypair" + "remove
      passphrase restores the FALCON plaintext rows".

---

## 6. Out of scope (for now)

- Argon2id KDF (deferred until native plugin exists).
- Biometric-stored passphrase ("Touch ID unlock for passphrase" UX). Would
  reduce the passphrase to a one-time setup secret; defeats the coerced-unlock
  defence.
- Server-side passphrase recovery via SSS or social recovery. Architectural
  shift; separate spec.
- ~~FALCON priv covered by the same envelope: when the PQ hard fork lands,
  add the FALCON priv into the same plaintext blob, version: 3. No KDF or
  UI change required.~~ **SHIPPED 2026-05-24** — see §3.2.1 + §3.2.2.

---

## 7. Open questions

1. **Min entropy**: zxcvbn ≥ 3 (~10⁸ guess space) or ≥ 4 (~10¹⁰)? Suggest 3
   for UX; offers nudge to 4 above ~0.1 FTC tx amounts.
2. **First-use prompt**: a soft nudge ("Add a passphrase?") on first
   non-trivial outbound tx? Or strictly opt-in in Settings? Suggest the latter
   — feels less paternal.
3. **Lock-out after N failures**: 5 attempts then back-off (this spec) vs
   hard wipe after 10? Hard wipe is a foot-gun; back-off is safer.

Decision deadline for the questions above: before code lands.
