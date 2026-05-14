/**
 * WalletReceiveScreen — show the user's address as a QR for a merchant
 * or another Comm user to scan.
 *
 * The QR encodes the raw address (no amount) — the payer chooses
 * what to send. For request-amount flows the customer would build a
 * `futurechain:pay` URI themselves; that's a follow-up.
 */
import { useState } from 'react';
import QrCode from '../../components/QrCode';

interface Props {
  address: string;
  onBack: () => void;
}

export default function WalletReceiveScreen({ address, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API can fail on Android WebViews without permission;
      // fall back silently — the user can long-press the text below.
    }
  }

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title="Receive" onBack={onBack} />

      <div className="flex flex-col items-center px-5 pt-2 pb-6 overflow-y-auto">
        <p className="text-sm text-center text-[var(--color-text-muted)] mb-5 max-w-[280px]">
          Show this code to whoever&apos;s paying you. They scan it
          with their wallet to pick the amount.
        </p>

        <div className="p-4 rounded-2xl bg-white border border-[var(--color-border)]">
          <QrCode value={address} size={240} />
        </div>

        <div className="mt-5 w-full px-2">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] mb-1">
            Your address
          </div>
          <div className="font-mono text-[12px] break-all text-[var(--color-accent)] select-all">
            {address}
          </div>
        </div>

        <button
          type="button"
          onClick={copy}
          className="mt-4 w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]"
        >
          {copied ? 'Copied ✓' : 'Copy address'}
        </button>
      </div>
    </section>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-3">
      <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label="Back"
              style={{ color: 'var(--color-text-muted)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold text-[var(--color-text)]">{title}</h2>
    </div>
  );
}
