/**
 * JoinPage — Connect to an ANTON server.
 * Supports: QR scan (primary), deep link, manual server URL + token entry.
 * QR/deep link format: anton://join?server=<url>&token=<code>
 */

import { useState, useRef, useEffect } from 'react';
import { getIdentity, signNonce } from '../services/identity';
import { joinOrg, authChallenge, authVerify, saveSessionToken, getSessionToken } from '../services/api';
import { saveServer, testServer } from '../services/discovery';

interface Props {
  onJoined: () => void;
  onBack: () => void;
}

export default function JoinPage({ onJoined, onBack }: Props) {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check for deep link params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinToken = params.get('join') || params.get('token');
    const server = params.get('server');
    if (joinToken) setToken(joinToken);
    if (server) setServerUrl(decodeURIComponent(server));
    if (joinToken && server) setMode('manual'); // Auto-switch to show what was detected
  }, []);

  // QR scanner
  useEffect(() => {
    if (!showScanner) return;
    let scanner: import('qr-scanner').default | null = null;

    (async () => {
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (videoRef.current) {
          scanner = new QrScanner(videoRef.current, (result) => {
            parseQrData(result.data);
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

  function parseQrData(data: string) {
    try {
      const url = new URL(data);
      const server = url.searchParams.get('server');
      const tok = url.searchParams.get('token') || url.searchParams.get('join');

      // SEC: Validate server URL — must be https:// or http://localhost or http://LAN IP
      if (server) {
        const decoded = decodeURIComponent(server);
        const isSecure = decoded.startsWith('https://');
        const isLocalDev = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?/.test(decoded);
        if (isSecure || isLocalDev) {
          setServerUrl(decoded);
        } else {
          setError('Invalid server URL — must use HTTPS');
          return;
        }
      }

      if (tok) setToken(tok.replace(/[^A-Z0-9]/gi, ''));
      if (server && tok) handleJoin(decodeURIComponent(server), tok);
    } catch {
      setToken(data.replace(/[^A-Z0-9]/gi, ''));
    }
  }

  async function handleJoin(overrideServer?: string, overrideToken?: string) {
    const identity = getIdentity();
    const effectiveToken = (overrideToken || token).trim().toUpperCase();
    const effectiveServer = (overrideServer || serverUrl).trim().replace(/\/$/, '');

    if (!identity || !effectiveToken) return;
    setLoading(true);
    setError(null);

    try {
      // If a server URL is provided (Play Store app), set it as the API base
      if (effectiveServer && effectiveServer !== window.location.origin) {
        setStatus('Connecting to server...');
        const test = await testServer(effectiveServer);
        if (!test.ok) {
          setError(`Cannot reach server at ${effectiveServer}. Check the URL and make sure you're on the same network.`);
          setLoading(false);
          return;
        }
        // Store the server URL for API calls
        localStorage.setItem('anton-companion-server', effectiveServer);
        saveServer(effectiveServer, test.name || 'ANTON');
      }

      // Join the organisation
      setStatus('Joining organisation...');
      const org = await joinOrg(identity.contactHash, effectiveToken);

      // Authenticate if needed
      const existingToken = getSessionToken();
      if (!existingToken && identity.privateKeyHex) {
        setStatus('Authenticating...');
        const { nonce } = await authChallenge(identity.contactHash);
        const signature = await signNonce(nonce, identity.privateKeyHex);
        const auth = await authVerify(identity.contactHash, nonce, signature);
        saveSessionToken(auth.sessionToken);
      }

      setStatus(`Connected to ${org.orgName}`);
      setTimeout(onJoined, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top safe-bottom">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-card text-adv-gray transition hover:text-adv-off-white active:scale-95">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="text-lg font-bold text-adv-off-white">Connect to ANTON</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5 space-y-5">
          <p className="text-sm text-adv-gray leading-relaxed">
            Your organisation's admin will give you a QR code or invitation link. Scan it to connect instantly.
          </p>

          {/* Mode tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setMode('scan')}
              className={`flex-1 py-2.5 text-xs font-medium transition ${mode === 'scan' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray'}`}
            >
              Scan QR Code
            </button>
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 py-2.5 text-xs font-medium transition ${mode === 'manual' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray'}`}
            >
              Enter Manually
            </button>
          </div>

          {/* Scan mode */}
          {mode === 'scan' && (
            <>
              {showScanner ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-black">
                  <video ref={videoRef} className="w-full aspect-square object-cover" />
                  <button onClick={() => setShowScanner(false)} className="w-full border-t border-border py-3.5 text-sm text-adv-gray hover:text-adv-off-white transition">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowScanner(true)}
                  className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-adv-card/30 py-12 transition hover:border-adv-teal/30 active:scale-[0.98]"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal/10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-adv-teal">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="21"/><line x1="14" y1="21" x2="21" y2="21"/>
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-adv-off-white">Tap to scan QR code</span>
                  <span className="text-xs text-adv-gray">The QR code connects you automatically</span>
                </button>
              )}
            </>
          )}

          {/* Manual mode */}
          {mode === 'manual' && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Server Address</label>
                <input
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://your-organisation.example.com"
                  className="w-full rounded-lg border border-border bg-adv-card px-4 py-3.5 text-sm text-adv-off-white placeholder-adv-gray/40 transition-colors focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal/30"
                />
                <p className="mt-1.5 text-[10px] text-adv-gray/60">Leave empty if you're on the same network as the server</p>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-adv-gray">Invitation Code</label>
                <input
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  placeholder="ABCD1234EFGH5678"
                  maxLength={16}
                  className="w-full rounded-lg border border-border bg-adv-card px-4 py-4 text-center text-lg font-mono font-bold tracking-[0.2em] text-adv-teal placeholder-adv-gray/30 transition-colors focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal/30"
                />
              </div>
            </div>
          )}

          {/* Status / Error */}
          {status && (
            <div className="flex items-center gap-2 rounded-lg bg-adv-teal/10 px-4 py-2.5 text-xs text-adv-teal">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
              {status}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-adv-red/30 bg-adv-red/5 px-4 py-2.5 text-xs text-adv-red">{error}</div>
          )}

          {/* Join button */}
          <button
            onClick={() => handleJoin()}
            disabled={loading || !token.trim()}
            className="w-full rounded-lg bg-adv-teal py-3.5 text-sm font-semibold text-adv-dark transition-all hover:bg-adv-teal-dark active:scale-[0.98] disabled:opacity-40"
          >
            {loading ? 'Connecting...' : 'Join Organisation'}
          </button>

          {/* Help text */}
          <div className="rounded-xl border border-border bg-adv-card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-adv-off-white">How to connect</h3>
            <ol className="text-[11px] text-adv-gray leading-relaxed space-y-1.5 list-decimal list-inside">
              <li>Ask your organisation's admin for an invitation QR code or link</li>
              <li>Scan the QR code — it will connect you automatically</li>
              <li>Or enter the server address and invitation code manually</li>
              <li>Once connected, you'll see the organisation in your list</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
