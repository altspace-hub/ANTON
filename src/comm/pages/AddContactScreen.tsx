import { useEffect, useRef, useState } from 'react';
import { isValidContactHash, deriveContactHash, getIdentity } from '../services/identity';
import { addContact, parseSharePayload } from '../services/contacts';

interface Props {
  onBack: () => void;
  onAdded: (contactHash: string) => void;
}

type Tab = 'scan' | 'paste';

export default function AddContactScreen({ onBack, onAdded }: Props) {
  const [tab, setTab] = useState<Tab>('scan');

  return (
    <section className="flex flex-col min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">
          Cancel
        </button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">Add contact</h1>
        <span className="w-12" />
      </header>

      <div className="flex border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <TabButton active={tab === 'scan'} onClick={() => setTab('scan')}>Scan QR</TabButton>
        <TabButton active={tab === 'paste'} onClick={() => setTab('paste')}>Paste code</TabButton>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'scan' && <ScanTab onAdded={onAdded} />}
        {tab === 'paste' && <PasteTab onAdded={onAdded} />}
      </div>
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-3 text-sm font-medium relative"
      style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
    >
      {children}
      {active && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-t"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
      )}
    </button>
  );
}

function ScanTab({ onAdded }: { onAdded: (contactHash: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownIdentity = getIdentity();

  useEffect(() => {
    let cancelled = false;
    let scanner: import('qr-scanner').default | null = null;
    (async () => {
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (!videoRef.current || cancelled) return;
        scanner = new QrScanner(videoRef.current, async (result) => {
          if (busy || cancelled) return;
          setBusy(true);
          try {
            const payload = parseSharePayload(result.data);
            if (!payload) {
              throw new Error('Not a valid ANTON contact code');
            }
            if (!isValidContactHash(payload.hash)) {
              throw new Error('Contact code format is invalid');
            }
            const derived = deriveContactHash(payload.pub);
            if (derived !== payload.hash) {
              throw new Error('Contact code does not match the embedded key');
            }
            if (ownIdentity && payload.hash === ownIdentity.contactHash) {
              throw new Error("That's your own contact code");
            }
            await addContact({
              contactHash: payload.hash,
              displayName: payload.name || payload.hash,
              publicKeyHex: payload.pub,
              source: 'qr',
            });
            scanner?.stop();
            onAdded(payload.hash);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Scan failed');
            setBusy(false);
          }
        }, { returnDetailedScanResult: true, highlightScanRegion: true });
        await scanner.start();
      } catch {
        if (!cancelled) {
          setError('Camera not available. Try the "Paste code" tab instead.');
        }
      }
    })();
    return () => { cancelled = true; scanner?.stop(); scanner?.destroy(); };
  // Deliberately empty deps — we want this to run exactly once when the tab mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center px-5 py-8">
      <div className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black relative">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      </div>
      <p className="mt-6 text-sm text-[var(--color-text-muted)] text-center max-w-xs">
        Hold the camera over a friend's ANTON contact QR.
      </p>
      {error && (
        <div className="mt-6 w-full max-w-sm rounded-xl bg-[var(--color-red-dim)] px-4 py-3 text-sm text-[var(--color-red)]">
          {error}
        </div>
      )}
    </div>
  );
}

function PasteTab({ onAdded }: { onAdded: (contactHash: string) => void }) {
  const [hash, setHash] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownIdentity = getIdentity();

  async function handleAdd() {
    setError(null);
    const trimmed = hash.trim().toUpperCase();
    if (!isValidContactHash(trimmed)) {
      setError('That doesn\'t look like a valid ANTON contact code (ANTON-XXXX-XXXX-XXXX-XXXX).');
      return;
    }
    if (ownIdentity && trimmed === ownIdentity.contactHash) {
      setError("That's your own contact code.");
      return;
    }
    setBusy(true);
    try {
      await addContact({
        contactHash: trimmed,
        displayName: name.trim() || trimmed,
        publicKeyHex: null,
        source: 'manual',
      });
      onAdded(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add contact');
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-6">
      <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
        Contact code
      </label>
      <input
        type="text"
        value={hash}
        onChange={(e) => { setHash(e.target.value); setError(null); }}
        placeholder="ANTON-XXXX-XXXX-XXXX-XXXX"
        autoFocus
        autoCapitalize="characters"
        spellCheck={false}
        className="mt-2 w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base font-mono text-[var(--color-text)] placeholder-[var(--color-text-faint)] tracking-wider focus:outline-none focus:ring-2"
        style={{ outlineColor: 'var(--color-accent)' }}
      />

      <label className="mt-6 block text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
        Name (optional)
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="How you'll see them in your chat list"
        maxLength={64}
        className="mt-2 w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:outline-none focus:ring-2"
        style={{ outlineColor: 'var(--color-accent)' }}
      />

      {error && (
        <p className="mt-3 text-xs text-[var(--color-red)]">{error}</p>
      )}

      <button
        onClick={() => void handleAdd()}
        disabled={busy || hash.trim().length === 0}
        className="mt-8 w-full py-4 rounded-2xl text-base font-medium transition-colors disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
      >
        {busy ? 'Adding…' : 'Add contact'}
      </button>

      <p className="mt-6 text-xs text-[var(--color-text-faint)] leading-relaxed">
        Adding by code alone doesn't include the friend's public key.
        Their key will be fetched automatically the first time you message them.
      </p>
    </div>
  );
}
