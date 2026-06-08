/**
 * CommunityScreen — companion-app Community tile (CONNECT + CHAT view).
 *
 * Three jobs:
 *   1. Show YOUR QR so peers can scan you in
 *   2. Scan a peer's QR to add them as a contact (camera via qr-scanner)
 *   3. Tap a contact → open CommunityChatScreen and message them
 *
 * Heavy E2E key generation lives in the desktop Pro UI; this surface is
 * for everyday connect-and-chat once the identity is activated.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Btn, Ico, PageHeader, Pill, Spinner, ErrorPill, SectionLabel,
} from '../components/ui';
import {
  getOrgCommunity, getOrgCommunityQr, scanCommunityContact, respondToConnection,
  type CommunityIdentity, type CommunityConnection, type CommunityQr,
} from '../services/api';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { registerBackHandler } from '../services/back-stack';
import { tick, success as hapticSuccess, error as hapticError } from '../services/haptics';

interface Props {
  orgId: string;
  onBack: () => void;
  onOpenChat: (contactHash: string, displayName: string) => void;
}

export default function CommunityScreen({ orgId, onBack, onOpenChat }: Props): JSX.Element {
  const [identity, setIdentity] = useState<CommunityIdentity | null>(null);
  const [connections, setConnections] = useState<CommunityConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getOrgCommunity(orgId)
      .then(d => {
        if (cancelled) return;
        setIdentity(d.identity ?? null);
        setConnections(Array.isArray(d.connections) ? d.connections : []);
      })
      .catch(() => { if (!cancelled) setError('Couldn\'t reach Community.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, reloadTick]);

  const pending  = connections.filter(c => c.status === 'pending');
  const accepted = connections.filter(c => c.status === 'accepted' || (c.status as string) === 'active');

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)', minHeight: 0 }}>
      <PageHeader title="Community" subtitle="Connect with other ANTONs" onBack={onBack} />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-4">
          {error && (
            <ErrorPill message={error} onRetry={() => setReloadTick(t => t + 1)} />
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : !identity?.contact_hash ? (
            <div
              className="rounded-[var(--radius-r2)] p-4 text-center"
              style={{ background: 'var(--color-surface)', border: '1px dashed var(--color-border)' }}
            >
              <p className="text-[0.875rem] font-semibold" style={{ color: 'var(--color-text)' }}>
                Community not activated
              </p>
              <p
                className="mx-auto mt-1 max-w-[280px] text-[0.75rem] leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Activate your ANTON-network identity from the Pro UI on your
                desktop ANTON to start connecting.
              </p>
            </div>
          ) : (
            <>
              {/* ── Connect actions ─────────────────────────────────── */}
              <section>
                <SectionLabel className="mb-2 px-1">Connect</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  <Btn
                    variant="primary"
                    size="lg"
                    onClick={() => setShowQr(true)}
                    icon={<Ico name="qr" size={16} color="currentColor" />}
                  >
                    Show my QR
                  </Btn>
                  <Btn
                    variant="secondary"
                    size="lg"
                    onClick={() => setShowScanner(true)}
                    icon={<Ico name="camera" size={16} color="currentColor" />}
                  >
                    Scan QR
                  </Btn>
                </div>
                <p
                  className="mt-2 px-1 text-[0.71875rem]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Tap "Show my QR" so a friend can add you. Tap "Scan QR" to
                  add their ANTON.
                </p>
              </section>

              {/* ── Pending requests ─────────────────────────────────── */}
              {pending.length > 0 && (
                <section>
                  <SectionLabel className="mb-2 px-1">
                    {pending.length} pending request{pending.length === 1 ? '' : 's'}
                  </SectionLabel>
                  <div className="space-y-2">
                    {pending.map(c => (
                      <PendingRow
                        key={c.id}
                        c={c}
                        orgId={orgId}
                        onResolved={() => setReloadTick(t => t + 1)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Connections ──────────────────────────────────────── */}
              <section>
                <SectionLabel className="mb-2 px-1">
                  {accepted.length} contact{accepted.length === 1 ? '' : 's'}
                </SectionLabel>
                {accepted.length === 0 ? (
                  <div
                    className="rounded-[var(--radius-r2)] p-4 text-center"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <span className="mb-2 inline-flex" style={{ color: 'var(--color-text-faint)' }}>
                      <Ico name="user" size={24} />
                    </span>
                    <p className="text-[0.875rem] font-semibold" style={{ color: 'var(--color-text)' }}>
                      No contacts yet
                    </p>
                    <p
                      className="mx-auto mt-1 max-w-[280px] text-[0.75rem] leading-relaxed"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Use the buttons above to add your first contact, then tap
                      them here to start a chat.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accepted.map(c => (
                      <ContactRow
                        key={c.id}
                        c={c}
                        onTap={() => onOpenChat(c.contact_hash, c.display_name || c.contact_hash)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {showQr && identity && (
        <ShowQrSheet orgId={orgId} onClose={() => setShowQr(false)} />
      )}
      {showScanner && (
        <ScannerSheet
          orgId={orgId}
          onClose={() => setShowScanner(false)}
          onScanned={() => { setShowScanner(false); setReloadTick(t => t + 1); }}
        />
      )}
    </div>
  );
}

// ── Contact rows ─────────────────────────────────────────────────────────────

function ContactRow({ c, onTap }: { c: CommunityConnection; onTap: () => void }): JSX.Element {
  const initials = (c.display_name || '?')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';
  return (
    <button
      onClick={onTap}
      className="flex w-full items-center gap-3 rounded-[var(--radius-r2)] p-3 text-left transition active:scale-[0.99]"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span
        className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)] font-semibold"
        style={{
          width: 40, height: 40,
          background: 'var(--color-accent-soft)',
          color: 'var(--color-accent)',
          fontSize: '0.875rem',
        }}
        aria-hidden="true"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[0.875rem] font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {c.display_name || 'Unnamed contact'}
        </div>
        <div
          className="truncate font-mono text-[0.65625rem]"
          style={{ color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}
        >
          {c.contact_hash}
        </div>
      </div>
      <Ico name="chevronRight" color="var(--color-text-faint)" size={18} />
    </button>
  );
}

function PendingRow({ c, orgId, onResolved }: {
  c: CommunityConnection; orgId: string; onResolved: () => void;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const initials = (c.display_name || '?')
    .split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';

  async function respond(decision: 'accept' | 'decline') {
    setBusy(true);
    try {
      await respondToConnection(orgId, c.id, decision);
      void hapticSuccess();
      onResolved();
    } catch {
      void hapticError();
    }
    setBusy(false);
  }

  return (
    <div
      className="rounded-[var(--radius-r2)] p-3"
      style={{
        background: 'var(--color-gold-dim)',
        border: '1px solid color-mix(in srgb, var(--color-gold) 25%, transparent)',
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)] font-semibold"
          style={{
            width: 40, height: 40,
            background: 'var(--color-surface)',
            color: 'var(--color-gold)',
            fontSize: '0.875rem',
          }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[0.875rem] font-semibold" style={{ color: 'var(--color-text)' }}>
            {c.display_name || 'Unnamed contact'}
          </div>
          <div
            className="truncate font-mono text-[0.65625rem]"
            style={{ color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}
          >
            {c.contact_hash}
          </div>
        </div>
        <Pill tone="gold">pending</Pill>
      </div>
      <div className="mt-2.5 flex gap-2">
        <Btn
          variant="primary"
          size="sm"
          onClick={() => void respond('accept')}
          disabled={busy}
        >
          Accept
        </Btn>
        <Btn
          variant="ghost"
          size="sm"
          onClick={() => void respond('decline')}
          disabled={busy}
        >
          Decline
        </Btn>
      </div>
    </div>
  );
}

// ── QR display sheet (fullscreen-ish modal) ─────────────────────────────────

function ShowQrSheet({ orgId, onClose }: { orgId: string; onClose: () => void }): JSX.Element {
  const [data, setData] = useState<CommunityQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    let cancelled = false;
    getOrgCommunityQr(orgId)
      .then(d => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [orgId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    const unregister = registerBackHandler(onClose);
    return () => { window.removeEventListener('keydown', onKey); unregister(); };
  }, [onClose]);

  async function copy() {
    if (!data?.contactHash) return;
    try {
      await navigator.clipboard.writeText(data.contactHash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Your QR"
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      <div
        className="safe-top flex items-center gap-3 px-3 py-2"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-soft)' }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center"
          style={{ color: 'var(--color-text)' }}
        >
          <Ico name="x" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[0.9375rem] font-bold" style={{ color: 'var(--color-text)' }}>
            Your QR code
          </h1>
          <p className="text-[0.6875rem]" style={{ color: 'var(--color-text-muted)' }}>
            Show this to a friend to add you
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-4">
        {error ? (
          <ErrorPill message={error} />
        ) : !data ? (
          <Spinner size="lg" />
        ) : (
          <>
            <img
              src={data.qrDataUrl}
              alt="Contact QR code"
              className="mb-4 rounded-[var(--radius-r2)]"
              style={{
                width: 280, height: 280,
                background: '#F5F3EF',
                border: '1px solid var(--color-border)',
              }}
            />
            <div className="text-[0.875rem] font-semibold" style={{ color: 'var(--color-text)' }}>
              {data.displayName || 'Your ANTON'}
            </div>
            <div
              className="mt-2 break-all px-4 text-center font-mono text-[0.75rem]"
              style={{ color: 'var(--color-text-muted)', letterSpacing: '0.3px' }}
            >
              {data.contactHash}
            </div>
            <div className="mt-4">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => void copy()}
                icon={<Ico name={copied ? 'check' : 'key'} size={14} color="currentColor" />}
              >
                {copied ? 'Copied' : 'Copy contact hash'}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── QR scanner sheet ────────────────────────────────────────────────────────

function ScannerSheet({ orgId, onClose, onScanned }: {
  orgId: string; onClose: () => void; onScanned: () => void;
}): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  useEffect(() => {
    let cancelled = false;
    let scanner: import('qr-scanner').default | null = null;
    (async () => {
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (!videoRef.current || cancelled) return;
        scanner = new QrScanner(videoRef.current, async (result) => {
          if (busy) return;
          setBusy(true);
          void tick();
          try {
            await scanCommunityContact(orgId, result.data);
            void hapticSuccess();
            scanner?.stop();
            onScanned();
          } catch (e) {
            void hapticError();
            setError(e instanceof Error ? e.message : 'Scan failed');
            setBusy(false);
          }
        }, { returnDetailedScanResult: true, highlightScanRegion: true });
        await scanner.start();
      } catch {
        if (!cancelled) setError('Camera not available. Ask your friend to share their hash by text instead.');
      }
    })();
    return () => { cancelled = true; scanner?.stop(); scanner?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    const unregister = registerBackHandler(onClose);
    return () => { window.removeEventListener('keydown', onKey); unregister(); };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Scan QR"
      className="fixed inset-0 z-50 flex flex-col app-fullscreen"
      style={{ background: '#0A0A0A' }}
    >
      <div
        className="safe-top flex items-center gap-3 px-3 py-2"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center"
          style={{ color: '#FFFFFF' }}
        >
          <Ico name="x" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[0.9375rem] font-bold" style={{ color: '#FFFFFF' }}>
            Scan a contact QR
          </h1>
          <p className="text-[0.6875rem]" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Point at your friend's ANTON QR
          </p>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {error && (
          <div
            className="absolute inset-x-4 bottom-6 rounded-[var(--radius-r2)] p-3 text-center text-[0.8125rem]"
            style={{ background: 'rgba(0,0,0,0.85)', color: '#FFFFFF' }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
