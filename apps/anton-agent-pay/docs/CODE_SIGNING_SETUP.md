# Code-signing setup — Anton Agent Pay

**Audience:** release engineer (today: Daniel) preparing the first
signed Agent Pay artefacts.

**Pairs with:**
- `electron-builder.yml` — the build config that consumes the env vars
  documented below.
- `docs/DESKTOP_ATTESTATION_SPEC.md` §5 — explains why the certificate
  thumbprints land in Bahnhof's `AGENT_PAY_SIGNING_THUMBPRINTS`
  allowlist.

The build pipeline is **env-driven** — `pnpm exec electron-builder
--<target>` produces a signed artefact when the right env vars are
present, an unsigned one when they're not. There is no separate
"production build mode" flag — the presence of the signing env vars
IS the signal.

---

## 1. macOS — Developer ID Application + notarisation

You need:
- An Apple Developer Program membership ($99/year).
- A "Developer ID Application" cert (NOT a Mac App Store cert).
- An app-specific password for `notarytool`.

### Obtain the cert (one-time)

1. Apple Developer portal → Certificates → "+" → "Developer ID
   Application". Generate a CSR in Keychain Access, upload, download
   the resulting .cer.
2. Open the .cer to install it into the macOS Keychain (login keyring).
3. Export it as a .p12 — Keychain Access → right-click → Export →
   `.p12` with a strong password. This is `CSC_LINK_MAC`.
4. Set up notarisation:
   - Apple ID → appleid.apple.com → Sign-In and Security → App-Specific
     Passwords → Generate one. This is `APPLE_APP_PASSWORD`.
   - Find your Team ID in Apple Developer portal → Membership.

### Env vars to set before building (macOS only)

```bash
export CSC_LINK="/path/to/developer-id-application.p12"
export CSC_KEY_PASSWORD="<.p12 passphrase>"
export APPLE_ID="<your-apple-id-email>"
export APPLE_APP_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="<10-char-team-id>"
```

### Compute the cert thumbprint for Bahnhof's allowlist

```bash
# Extract the leaf cert as DER and hash it.
codesign -d --extract-certificates /tmp/leaf "/Applications/Anton Agent Pay.app"
shasum -a 256 /tmp/leaf.0  # the leaf is .0
# Take the first column — that's the lowercase hex SHA-256 (64 chars).
```

Put that value in Bahnhof's `AGENT_PAY_SIGNING_THUMBPRINTS` env var.

### Build

```bash
pnpm build
pnpm exec electron-builder --mac
# Output: dist-electron/Anton Agent Pay-<version>-{x64,arm64}.dmg
# Both already notarised + stapled.
```

---

## 2. Windows — Authenticode

You need:
- An EV Code Signing Certificate (recommended — SmartScreen reputation
  starts immediately) or an OV cert (cheaper, takes weeks to accrue
  reputation). Issuer options: DigiCert, Sectigo, GlobalSign,
  SSL.com. Pricing ~$200–$500/year for OV, ~$300–$600/year for EV.
- For EV: a hardware token (USB HSM the cert ships on) — affects how
  CSC_LINK is set; see vendor instructions.

### Env vars to set before building (Windows only)

OV cert (.pfx on disk):

```bash
export CSC_LINK="/path/to/codesign.pfx"
export CSC_KEY_PASSWORD="<.pfx passphrase>"
```

EV cert (hardware token via `signtool` directly):

```bash
# CSC_LINK left UNSET; instead point at a custom signing tool that
# wraps signtool with the right /sha1 + /tr arguments for the token.
export SIGNTOOL_PATH="/c/Program Files (x86)/Windows Kits/10/bin/x64/signtool.exe"
export WIN_CSC_SHA1="<thumbprint of the cert on the HSM>"
# electron-builder accepts a custom signing function in config — set
# it via the package.json `build.win.sign` field. For most teams the
# vendor's CLI wrapper script makes this a one-liner.
```

### Compute the cert thumbprint for Bahnhof's allowlist

```powershell
PS> (Get-AuthenticodeSignature "C:\Path\To\Anton Agent Pay.exe").SignerCertificate.GetCertHashString("SHA256").ToLower()
```

Put that value in Bahnhof's `AGENT_PAY_SIGNING_THUMBPRINTS` env var.

### Build

```bash
pnpm build
pnpm exec electron-builder --win
# Output: dist-electron/Anton Agent Pay Setup <version>.exe
```

---

## 3. Linux — Flatpak GPG + AppImage + .deb

The Flatpak target is the primary distribution channel (Flathub-ready,
sandboxed). AppImage + .deb ship for users who don't want Flatpak.

### One-time GPG setup for Flatpak

```bash
# Generate a signing key (skip if you already have one).
gpg --full-generate-key  # pick RSA 4096, no expiration.
# Take note of the long key ID:
gpg --list-keys --keyid-format long
# Export the public key for users to import (publish on the website):
gpg --armor --export <KEY_ID> > anton-agent-pay-flatpak-signing.asc
```

### Env vars to set before building (Linux only)

```bash
export GNUPGHOME="$HOME/.gnupg"   # or wherever the signing keyring lives
export FLATPAK_GPG_KEY="<KEY_ID>"  # the key flatpak-builder uses to sign
```

### Compute the cert thumbprint for Bahnhof's allowlist

```bash
# Fingerprint of the signing key, lowercase, no spaces.
gpg --fingerprint --keyid-format long <KEY_ID> \
  | grep -oP '[0-9A-F\s]{40,}$' \
  | tr -d ' \n' \
  | tr 'A-F' 'a-f'
# That's already the GPG fingerprint (40-char hex). We use SHA-256
# of THAT for the AGENT_PAY_SIGNING_THUMBPRINTS allowlist:
echo -n "<40-char-fingerprint>" | sha256sum | awk '{print $1}'
```

This 64-char hex SHA-256 is what should be baked into
`/app/share/anton-agent-pay/.gpg-fingerprint` inside the Flatpak bundle
(see `code-signature.ts::_linux`) AND added to Bahnhof's
`AGENT_PAY_SIGNING_THUMBPRINTS`.

### Build

```bash
pnpm build
pnpm exec electron-builder --linux
# Outputs:
#   dist-electron/Anton Agent Pay-<version>.AppImage
#   dist-electron/anton-agent-pay_<version>_amd64.deb
#   dist-electron/Anton Agent Pay-<version>.flatpak
```

---

## 4. End-to-end first-release checklist

1. [ ] All three platforms' certs / GPG keys exist and are documented
       in this team's password manager.
2. [ ] CI has the env vars wired (GitHub Actions secrets or equivalent).
3. [ ] Compute the three SHA-256 thumbprints (one per platform).
4. [ ] Set Bahnhof env var (then restart sidecar to pick it up):
       ```bash
       export AGENT_PAY_SIGNING_THUMBPRINTS="<mac-thumb>,<win-thumb>,<linux-thumb>"
       sudo systemctl restart bahnhof-enroll
       ```
5. [ ] Build all three platforms (CI matrix or local sequence).
6. [ ] Install a freshly-built artefact on a target platform.
7. [ ] Enrol it against prod Bahnhof + perform a smoke transaction.
       This validates BOTH the signing pipeline AND the
       AGENT_PAY_SIGNING_THUMBPRINTS allowlist end-to-end.
8. [ ] Publish the artefacts:
       - macOS: notarised .dmg → download page + auto-update server.
       - Windows: signed .exe → download page.
       - Linux: .AppImage + .deb on the download page; .flatpak +
         signing-key .asc submitted to Flathub.

---

## 5. Rotating a signing key / cert

When a cert expires or is compromised:

1. Obtain the replacement (re-issued cert / fresh GPG key).
2. Compute the new SHA-256 thumbprint.
3. Add it to `AGENT_PAY_SIGNING_THUMBPRINTS` (don't remove the old one
   yet — old installs still attest with the old thumbprint).
4. Ship a release built with the new cert.
5. After ~30 days (users have had time to update), remove the old
   thumbprint from the allowlist. Pre-update installs will then need
   to upgrade to keep attesting — and the in-app update flow shows
   them the prompt.

The 30-day overlap is the operator's choice; tighten if there's a
known compromise (drop the old thumbprint immediately + force-upgrade
notice via the in-app banner).
