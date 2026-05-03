/**
 * JoinPage — Pair with an ANTON instance.
 * Supports BOTH:
 *   • Modern Ed25519 enrollment (anton://enroll?server=&token=) per spec §5.2
 *   • Legacy invitation-token flow (anton://join?server=&token=) for backwards
 *     compatibility with already-issued invitation QRs.
 *
 * QR is the primary path; manual entry stays as fallback.
 */

import { useState, useRef, useEffect } from 'react';
import { getIdentity, signNonce } from '../services/identity';
import { joinOrg, authChallenge, authVerify, saveSessionToken, getSessionToken, registerSimple } from '../services/api';
import { saveServer, testServer } from '../services/discovery';
import { fetchEnrollment, completeEnrollment, parsePairingLink, validateServerUrl } from '../services/enrollment';
import { addInstance, listInstances } from '../services/instances';
import { tick, success, error as hapticError } from '../services/haptics';
import { isBiometricAvailable, verifyBiometric } from '../services/biometric';
import { Btn, Pill, SectionLabel, StatusDot, Ico, Spinner } from '../components/ui';

interface Props {
  onJoined: () => void;
  onBack: () => void;
}

export default function JoinPage({ onJoined, onBack }: Props) {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [needCodePrompt, setNeedCodePrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Deep-link / query-string handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const srv = params.get('server');
    const tok = params.get('token') || params.get('join');
    if (srv) setServerUrl(decodeURIComponent(srv));
    if (tok) setToken(tok);
    if (srv && tok) setMode('manual');
  }, []);

  // QR scanner lifecycle
  useEffect(() => {
    if (!showScanner) return;
    let scanner: import('qr-scanner').default | null = null;
    (async () => {
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (videoRef.current) {
          scanner = new QrScanner(videoRef.current, (result) => {
            void tick();
            handleScanResult(result.data);
            setShowScanner(false);
            scanner?.stop();
          }, { returnDetailedScanResult: true, highlightScanRegion: true });
          await scanner.start();
        }
      } catch {
        setError('Camera not available. Use manual entry.');
        setShowScanner(false);
      }
    })();
    return () => { scanner?.stop(); scanner?.destroy(); };
  }, [showScanner]);

  function handleScanResult(raw: string) {
    const parsed = parsePairingLink(raw);
    if (parsed) {
      setServerUrl(parsed.server);
      setToken(parsed.token);
      // Auto-pair on scan
      void doPair(parsed.server, parsed.token, parsed.kind);
      return;
    }
    // Bare token? Treat as legacy invitation token
    const cleaned = raw.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleaned.length >= 8 && cleaned.length <= 64) {
      setToken(cleaned);
    }
  }

  async function doPair(rawServer: string, rawToken: string, kind?: 'enroll' | 'join') {
    setLoading(true); setError(null); setStatus(null);
    try {
      const server = rawServer.trim().replace(/\/$/, '');
      validateServerUrl(server);

      // Persist server choice for non-LAN (Play Store / standalone) paths
      if (server && server !== window.location.origin) {
        setStatus('Connecting to server…');
        const test = await testServer(server);
        if (!test.ok) {
          setError(`Cannot reach server at ${server}.`);
          await hapticError();
          return;
        }
        localStorage.setItem('anton-companion-server', server);
        saveServer(server, test.name || 'ANTON');
      }

      // Auto-detect: try enrollment first; fall back to legacy join on 404
      const inferredKind = kind ?? await detectKind(server, rawToken);
      if (inferredKind === 'enroll') {
        await doEnrollment(server, rawToken);
      } else {
        await doLegacyJoin(server, rawToken);
      }
      await success();
      setStatus('Connected ✓');
      setTimeout(onJoined, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus(null);
      await hapticError();
    } finally {
      setLoading(false);
    }
  }

  async function doEnrollment(server: string, t: string): Promise<void> {
    setStatus('Pairing securely…');
    const pkg = await fetchEnrollment(server, t);
    // Phase H fix C2 — out-of-band confirmation code when admin pre-bound
    // the enrollment to a specific user. The admin reads the 6-digit code
    // aloud; the user enters it before the device cert is issued.
    if (pkg.requires_confirmation_code && !confirmationCode.trim()) {
      setNeedCodePrompt(true);
      setStatus('Enter the 6-digit code your admin gave you.');
      return;
    }
    setStatus(`Pairing with ${pkg.instance_display_name ?? 'instance'}…`);
    const result = await completeEnrollment(server, pkg, {
      preferred_language: navigator.language?.slice(0, 2) || 'en',
      device_name: displayName || undefined,
      confirmation_code: confirmationCode.trim() || undefined,
    });
    // Persist as a paired instance
    await addInstance({
      display_name: pkg.instance_display_name ?? 'ANTON',
      contact_hash: pkg.instance_contact_hash,
      server_base: server,
      endpoints: pkg.endpoints,
      device_id: result.device_id,
      pubkey_pinned: pkg.instance_pubkey,
      cert_fp_pinned: pkg.instance_cert_fp,
      org: result.org,
      session_token: result.session_token,
      device_certificate: result.device_certificate,
    });
    saveSessionToken(result.session_token);
    // Phase H fix UX-CRIT-1 — post-pair biometric setup. Spec §8.1 mandates.
    // Prompt the user to confirm with biometric so the device-cert gate is
    // wired from the very first session.
    if (await isBiometricAvailable()) {
      setStatus('Confirm with biometric to lock these credentials…');
      const r = await verifyBiometric({
        reason: 'Pair this device — confirm with biometric',
        title: 'Lock credentials',
        subtitle: 'Face ID / fingerprint will be required for sensitive approvals',
      });
      if (r === 'cancelled') {
        // Soft-fail: keep the pair but warn
        setStatus('Paired without biometric — high-severity approvals will fail until set up.');
      }
    }
  }

  async function doLegacyJoin(server: string, t: string): Promise<void> {
    let identity = getIdentity();
    // Register if no identity OR identity exists but contactHash hasn't been
    // server-issued yet. The latter is the Capacitor pre-pair state:
    // WelcomePage saves name + language + locally-generated keypair without
    // calling the server (no API origin known until we pick a server here).
    if (!identity || !identity.contactHash) {
      // Prefer the name + language captured in WelcomePage; fall back to the
      // JoinPage state for first-time PWA users who skipped Welcome.
      const nameForRegister = identity?.displayName?.trim() || displayName.trim();
      if (!nameForRegister) {
        throw new Error('Display name is required for legacy invitations.');
      }
      const langForRegister = identity?.preferredLanguage || navigator.language?.slice(0, 2) || 'en';
      setStatus('Registering…');
      const reg = await registerSimple(nameForRegister, langForRegister);
      saveSessionToken(reg.sessionToken);
      // Mirror public identity, preserving any existing keypair material.
      const { saveIdentityPublic } = await import('../services/identity');
      saveIdentityPublic({
        publicKeyHex: identity?.publicKeyHex || '',
        contactHash: reg.contactHash,
        displayName: nameForRegister,
        preferredLanguage: langForRegister,
      });
      identity = getIdentity()!;
    }
    setStatus('Joining organisation…');
    const cleaned = t.trim().toUpperCase();
    const org = await joinOrg(identity.contactHash, cleaned);
    if (!getSessionToken() && identity.privateKeyHex) {
      setStatus('Authenticating…');
      const { nonce } = await authChallenge(identity.contactHash);
      const signature = await signNonce(nonce, identity.privateKeyHex);
      const auth = await authVerify(identity.contactHash, nonce, signature);
      saveSessionToken(auth.sessionToken);
    }
    // Add a lightweight instance record so multi-instance UI sees the legacy pair
    if (!listInstances().some(i => i.org?.id === org.orgId && i.server_base === server)) {
      await addInstance({
        display_name: org.orgName,
        contact_hash: identity.contactHash,
        server_base: server,
        endpoints: { lan: server.startsWith('http://') ? server : undefined, wan: server.startsWith('https://') ? server : undefined },
        device_id: '',                  // legacy clients have no device record
        pubkey_pinned: '',              // no pinning material on legacy path
        cert_fp_pinned: null,
        org: { id: org.orgId, name: org.orgName, role: 'member' },
        session_token: getSessionToken() ?? '',
        device_certificate: '',
      });
    }
  }

  /** Try /enrollment/:token first (modern); on 404 assume legacy. */
  async function detectKind(server: string, t: string): Promise<'enroll' | 'join'> {
    try {
      const u = `${server.replace(/\/$/, '')}/api/app/enrollment/${encodeURIComponent(t)}`;
      const res = await fetch(u, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return 'enroll';
    } catch { /* fall through */ }
    return 'join';
  }

  return (
    <div
      className="safe-top safe-bottom flex min-h-dvh flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border-soft)', minHeight: 44 }}
      >
        <button onClick={onBack} className="flex items-center gap-1.5">
          <Ico name="chevronLeft" color="var(--color-text-muted)" size={20} />
          <span className="text-sm font-semibold text-[var(--color-text)]">Connect</span>
        </button>
        <Pill tone="neutral" mono>STEP 2 / 4</Pill>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
        <div
          className="text-[var(--color-text)]"
          style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.15 }}
        >
          Pair with your ANTON
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
          Scan the QR your admin showed you. We'll mint a fresh Ed25519 key on this device and
          confirm with a 6-digit code if needed.
        </p>

        {/* Mode toggle */}
        <div
          className="mt-5 flex overflow-hidden rounded-[var(--radius-r2)]"
          style={{ border: '1px solid var(--color-border)' }}
        >
          <button
            onClick={() => setMode('scan')}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              background: mode === 'scan' ? 'var(--color-accent)' : 'var(--color-surface)',
              color:      mode === 'scan' ? 'var(--color-accent-fg)' : 'var(--color-text-body)',
            }}
          >
            Scan QR
          </button>
          <button
            onClick={() => setMode('manual')}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              background: mode === 'manual' ? 'var(--color-accent)' : 'var(--color-surface)',
              color:      mode === 'manual' ? 'var(--color-accent-fg)' : 'var(--color-text-body)',
            }}
          >
            Enter manually
          </button>
        </div>

        {/* QR scan path */}
        {mode === 'scan' && (
          <div
            className="mt-4 overflow-hidden rounded-[var(--radius-r3)]"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            {showScanner ? (
              <>
                <video ref={videoRef} className="aspect-square w-full object-cover" />
                <button
                  onClick={() => setShowScanner(false)}
                  className="w-full py-3.5 text-sm text-[var(--color-text-muted)]"
                  style={{ borderTop: '1px solid var(--color-border)' }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowScanner(true)}
                className="flex w-full flex-col items-center gap-3 py-10"
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-r2)]"
                  style={{ background: 'var(--color-accent-soft)' }}
                >
                  <Ico name="qr" color="var(--color-accent)" size={36} />
                </div>
                <span className="text-sm font-semibold text-[var(--color-text)]">Tap to scan QR</span>
                <span className="px-6 text-center text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                  The QR contains the server URL + a one-time token (≤60s TTL)
                </span>
              </button>
            )}
          </div>
        )}

        {/* Manual entry path */}
        {mode === 'manual' && (
          <div className="mt-4 space-y-3.5">
            <div>
              <SectionLabel htmlFor="join-server" className="mb-1.5">Server</SectionLabel>
              <input
                id="join-server"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://anton.example.com"
                className="w-full rounded-[var(--radius-r2)] px-4 py-3.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              />
            </div>
            <div>
              <SectionLabel htmlFor="join-token" className="mb-1.5">Pairing token</SectionLabel>
              <input
                id="join-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="abcd…"
                className="w-full rounded-[var(--radius-r2)] px-4 py-4 text-center font-mono text-base focus:outline-none"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-accent)',
                  letterSpacing: '0.1em',
                }}
              />
            </div>
            <div>
              <SectionLabel htmlFor="join-device" className="mb-1.5">Device name (optional)</SectionLabel>
              <input
                id="join-device"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My iPhone"
                className="w-full rounded-[var(--radius-r2)] px-4 py-3.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              />
            </div>
            {needCodePrompt && (
              <div
                className="rounded-[var(--radius-r2)] p-3.5"
                style={{ background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent-dim)' }}
              >
                <SectionLabel className="mb-2" style={{ color: 'var(--color-accent)' }}>
                  Confirmation code
                </SectionLabel>
                <div className="flex justify-between gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-[var(--radius-r1)] py-2.5 text-center font-mono font-bold"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                        fontSize: 22,
                        letterSpacing: '0.1em',
                      }}
                    >
                      {confirmationCode[i] || ''}
                    </div>
                  ))}
                </div>
                <input
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Tap and type the code"
                  inputMode="numeric"
                  maxLength={6}
                  className="mt-2 w-full rounded-[var(--radius-r2)] px-4 py-2.5 text-center text-sm focus:outline-none"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-accent-dim)', color: 'var(--color-text-body)' }}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                  Admin reads this aloud. Required so the QR can't be hijacked between scan and pair.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Status / error */}
        {status && (
          <div
            className="mt-3.5 flex items-center gap-2 rounded-[var(--radius-r2)] px-3.5 py-2.5 text-xs"
            style={{
              background: 'var(--color-accent-soft)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent-dim)',
            }}
          >
            <Spinner size="xs" />
            {status}
          </div>
        )}
        {error && (
          <div
            className="mt-3.5 rounded-[var(--radius-r2)] px-3.5 py-2.5 text-xs"
            style={{
              background: 'var(--color-red-dim)',
              color: 'var(--color-red)',
              border: '1px solid var(--color-red-dim)',
            }}
          >
            {error}
          </div>
        )}

        {/* Status row — Internet / LAN / TTL */}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <StatusDot tone={loading ? 'gold' : 'green'} pulse size={8} />
          <span>{loading ? 'Pairing…' : 'Awaiting scan'}</span>
          <span className="flex-1" />
          <span className="font-mono text-[var(--color-text-faint)]">TTL 60s</span>
        </div>

        <Btn
          variant="primary"
          block
          className="mt-4"
          disabled={loading || !token.trim() || !serverUrl.trim()}
          onClick={() => void doPair(serverUrl, token)}
          icon={loading
            ? <Spinner size="sm" tone="on-accent" />
            : <Ico name="shieldCheck" color="currentColor" size={15} />}
        >
          {loading ? 'Connecting…' : 'Pair'}
        </Btn>

        {/* "How pairing works" — collapsed-explanation card */}
        <div
          className="mt-5 rounded-[var(--radius-r2)] p-3.5"
          style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-soft)' }}
        >
          <SectionLabel className="mb-2">How pairing works</SectionLabel>
          <ol
            className="list-inside list-decimal space-y-1.5 text-[11px] leading-relaxed text-[var(--color-text-body)]"
          >
            <li>The instance issues a one-time token (≤60s TTL) embedded in the QR.</li>
            <li>Your phone generates a fresh Ed25519 keypair — the private key never leaves the device.</li>
            <li>The phone signs <span className="font-mono">token.nonce.publicKey</span>; the instance verifies + issues a device certificate.</li>
            <li>All future calls are mutually authenticated with that certificate. No passwords, ever.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
