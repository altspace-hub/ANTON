/**
 * code-signature.ts — platform-specific code-signature thumbprint
 * computation for desktop attestation.
 *
 * Spec: DESKTOP_ATTESTATION_SPEC.md §5
 *
 * Returns `{ subject, thumbprintHex }` for the running binary:
 *   - subject: human-readable signer (CN string) — surfaced in audit
 *     logs but not load-bearing.
 *   - thumbprintHex: SHA-256 of the signing certificate's DER bytes,
 *     lowercase hex, 64 chars. The load-bearing field — Bahnhof's
 *     AGENT_PAY_SIGNING_THUMBPRINTS env var must contain this exact
 *     value for production attestation to succeed.
 *
 * Unsigned builds (dev `npm start`, ad-hoc `electron .`) return a
 * `DEV-UNSIGNED-<randomhex>` thumbprint that's well-formed (64 hex
 * chars when "DEV-UNSIGNED-" is replaced with leading 'd's) but will
 * never appear in any prod allowlist. Bahnhof's permissive
 * AGENT_PAY_SIGNING_THUMBPRINTS="" posture (dev/initial) accepts any
 * thumbprint, so this is OK for dev; prod must set the allowlist.
 *
 * NOTE: Daniel's note from session — "I'll handle macOS / Windows
 * signing certs once the Apple + Sectigo accounts are settled". So
 * for v1 we ship the framework + the Linux Flatpak/AppImage path, and
 * macOS/Windows return DEV-UNSIGNED until the real signing happens.
 */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface CodeSignature {
  subject: string;
  thumbprintHex: string;
}

let _cached: CodeSignature | null = null;

/** Compute (and cache) the code signature for this process's executing
 *  binary. Cached for the process lifetime — the binary doesn't change
 *  under us, and the OS-side calls (codesign / Get-AuthenticodeSignature /
 *  gpg --verify) are not cheap. */
export function getCodeSignature(): CodeSignature {
  if (_cached) return _cached;
  const sig = _compute();
  _cached = sig;
  return sig;
}

/** Test helper — drop the cache. */
export function _resetCodeSignatureCache(): void {
  _cached = null;
}

function _compute(): CodeSignature {
  // Best-effort per platform; on any failure (binary unsigned, OS tool
  // not present, parse error), fall back to a DEV-UNSIGNED thumbprint.
  // The DEV thumbprint is randomised per-run so it can never coincide
  // with a real allowlisted thumbprint by accident.
  const platform = process.platform;
  try {
    if (platform === 'darwin') return _macOS();
    if (platform === 'win32')  return _windows();
    if (platform === 'linux')  return _linux();
  } catch {
    // Fall through to DEV.
  }
  return _devUnsigned(platform);
}

function _macOS(): CodeSignature {
  // process.execPath points at the Electron binary (or `electron` in
  // dev); the bundle is its grandparent .app. codesign accepts either.
  const target = process.execPath;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-cs-'));
  const certPath = path.join(tmpDir, 'leaf');
  try {
    execFileSync('codesign', [
      '-d', '--extract-certificates', certPath, target,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    // codesign writes the leaf cert to <certPath>.0 (DER).
    const der = fs.readFileSync(`${certPath}.0`);
    const thumb = createHash('sha256').update(der).digest('hex');
    // Best-effort subject — codesign -dvv prints "Authority=…" lines on
    // stderr. We re-invoke to capture them (the -d --extract flow
    // discards stderr).
    let subject = 'CN=unknown';
    try {
      const out = execFileSync('codesign', ['-dvv', target], {
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString() + execFileSync('codesign', ['-dvv', target], {
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString();
      const m = /Authority=([^\n]+)/.exec(out);
      if (m) subject = `CN=${m[1].trim()}`;
    } catch { /* keep "CN=unknown" */ }
    return { subject, thumbprintHex: thumb.toLowerCase() };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  }
}

function _windows(): CodeSignature {
  // Use PowerShell's Get-AuthenticodeSignature. We need both the
  // SHA-256 thumbprint and the signer's Subject for audit; one-shot
  // command emits "<subject>\n<thumb>" so we can split it.
  const exe = process.execPath;
  // Escape any single quotes in the path (rare, but defensive).
  const escaped = exe.replace(/'/g, "''");
  const out = execFileSync('powershell', [
    '-NoProfile', '-Command',
    `$s = Get-AuthenticodeSignature -FilePath '${escaped}'; `
    + 'if ($s.Status -ne "Valid") { throw "unsigned or invalid: $($s.Status)" }; '
    + 'Write-Output $s.SignerCertificate.Subject; '
    + 'Write-Output $s.SignerCertificate.GetCertHashString("SHA256")',
  ], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  const lines = out.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error('windows codesign output malformed');
  const subject = lines[0];
  const thumb = lines[lines.length - 1].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(thumb)) {
    throw new Error(`windows thumbprint not SHA-256-shaped: ${thumb}`);
  }
  return { subject, thumbprintHex: thumb };
}

function _linux(): CodeSignature {
  // Linux has no single canonical signing flow. Options we accept,
  // in order:
  //   1. AppImage signature: appimagetool stores a GPG signature in
  //      the AppImage zerolength section. We read /proc/self/exe to
  //      find the binary, then exec `appimage --appimage-signature`.
  //   2. Flatpak: the running install has a sentinel file
  //      /app/share/anton-agent-pay/.gpg-fingerprint with the SHA-256
  //      hash, produced by our flatpak-builder manifest.
  //   3. Otherwise: DEV-UNSIGNED.
  //
  // For MVP we only implement option 2 (the Flatpak path) since that's
  // the primary Linux distribution channel we plan. AppImage path is
  // a TODO for Phase 2.
  const fp = '/app/share/anton-agent-pay/.gpg-fingerprint';
  if (fs.existsSync(fp)) {
    const raw = fs.readFileSync(fp, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      return {
        subject: 'CN=Anton Agent Pay (Flatpak GPG)',
        thumbprintHex: raw.toLowerCase(),
      };
    }
  }
  throw new Error('linux: no signed-binary indicator found');
}

function _devUnsigned(platform: string): CodeSignature {
  // The thumbprint is "d" + 63 chars of random hex — well-formed
  // (matches /^[0-9a-f]{64}$/) but cannot collide with a real SHA-256
  // by accident. Bahnhof's prod allowlist will not contain it, so the
  // install can only attest against a dev Bahnhof
  // (AGENT_PAY_SIGNING_THUMBPRINTS="" posture).
  const rand = randomBytes(32).toString('hex');
  // Replace the leading 'd' so the string is recognisably "dev" without
  // changing the regex shape.
  const thumb = ('d' + rand).slice(0, 64);
  return {
    subject: `CN=Anton Agent Pay (DEV UNSIGNED ${platform})`,
    thumbprintHex: thumb,
  };
}
