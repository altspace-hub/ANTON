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
    if (!identity) {
      // Self-register before joining
      if (!displayName.trim()) {
        throw new Error('Display name is required for legacy invitations.');
      }
      setStatus('Registering…');
      const reg = await registerSimple(displayName.trim(), navigator.language?.slice(0, 2) || 'en');
      saveSessionToken(reg.sessionToken);
      // Mirror public identity
      const { saveIdentityPublic } = await import('../services/identity');
      saveIdentityPublic({
        publicKeyHex: '',
        contactHash: reg.contactHash,
        displayName: displayName.trim(),
        preferredLanguage: navigator.language?.slice(0, 2) || 'en',
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
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      <div className="border-b border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-card text-adv-gray transition hover:text-adv-off-white active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="text-lg font-bold text-adv-off-white">Pair with ANTON</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
          <p className="text-sm text-adv-gray leading-relaxed">
            <span className="text-adv-off-white">Pair in under 30 seconds.</span> Open <span className="text-adv-off-white">Connect a device</span> on the desktop ANTON and scan the QR. The pairing is end-to-end — your phone generates a fresh keypair that only this device holds.
          </p>

          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setMode('scan')} className={`flex-1 py-2.5 text-xs font-medium transition ${mode === 'scan' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray'}`}>Scan QR</button>
            <button onClick={() => setMode('manual')} className={`flex-1 py-2.5 text-xs font-medium transition ${mode === 'manual' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray'}`}>Enter manually</button>
          </div>

          {mode === 'scan' && (
            <>
              {showScanner ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-adv-dark">
                  <video ref={videoRef} className="w-full aspect-square object-cover" />
                  <button onClick={() => setShowScanner(false)} className="w-full border-t border-border py-3.5 text-sm text-adv-gray hover:text-adv-off-white transition">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setShowScanner(true)} className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-adv-card/30 py-12 transition hover:border-adv-teal/30 active:scale-[0.98]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal/10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-adv-teal">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="14" y1="21" x2="21" y2="21"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-adv-off-white">Tap to scan QR</span>
                  <span className="text-xs text-adv-gray">The QR contains the server URL + a one-time token</span>
                </button>
              )}
            </>
          )}

          {mode === 'manual' && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Server</label>
                <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://anton.example.com" className="w-full rounded-lg border border-border bg-adv-card px-4 py-3.5 text-sm text-adv-off-white placeholder-adv-gray/40 focus:border-adv-teal focus:outline-none" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Pairing token</label>
                <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="abcd…" className="w-full rounded-lg border border-border bg-adv-card px-4 py-4 text-center font-mono text-base text-adv-teal focus:border-adv-teal focus:outline-none" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Device name (optional)</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="My iPhone" className="w-full rounded-lg border border-border bg-adv-card px-4 py-3.5 text-sm text-adv-off-white placeholder-adv-gray/40 focus:border-adv-teal focus:outline-none" />
              </div>
              {needCodePrompt && (
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-teal">6-digit confirmation code</label>
                  <input
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full rounded-lg border border-adv-teal/40 bg-adv-card px-4 py-4 text-center font-mono text-xl tracking-[0.4em] text-adv-teal focus:border-adv-teal focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-adv-gray">Your admin reads this aloud. Required so the QR can't be hijacked between scan and pair.</p>
                </div>
              )}
            </div>
          )}

          {status && (
            <div className="flex items-center gap-2 rounded-lg bg-adv-teal/10 px-4 py-2.5 text-xs text-adv-teal">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
              {status}
            </div>
          )}
          {error && <div className="rounded-lg border border-adv-red/30 bg-adv-red/5 px-4 py-2.5 text-xs text-adv-red">{error}</div>}

          <button
            onClick={() => doPair(serverUrl, token)}
            disabled={loading || !token.trim() || !serverUrl.trim()}
            className="w-full rounded-lg bg-adv-teal py-3.5 text-sm font-semibold text-adv-dark transition-all hover:bg-adv-teal-dark active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? 'Connecting…' : 'Pair'}
          </button>

          <div className="rounded-xl border border-border bg-adv-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-adv-off-white">How pairing works</h3>
            <ol className="text-[11px] text-adv-gray leading-relaxed space-y-1.5 list-decimal list-inside">
              <li>The instance issues a one-time token (≤60 seconds) embedded in the QR.</li>
              <li>Your phone generates a fresh Ed25519 keypair — the private key never leaves the device.</li>
              <li>The phone signs <span className="font-mono">token.nonce.publicKey</span>; the instance verifies + issues a device certificate.</li>
              <li>All future calls are mutually authenticated with that certificate. No passwords, ever.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
