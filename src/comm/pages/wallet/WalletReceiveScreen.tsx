/**
 * WalletReceiveScreen — show the user's address as a QR for a merchant
 * or another Comm user to scan.
 *
 * The QR encodes the raw address (no amount) — the payer chooses
 * what to send. For request-amount flows the customer would build a
 * `futurechain:pay` URI themselves; that's a follow-up.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrCode from '../../components/QrCode';
import ActiveSyncBanner from '../../components/ActiveSyncBanner';
import { startActiveSync, type ActiveSyncSnapshot } from '../../services/active-sync';
import { notifyIncoming } from '../../services/notifications';

interface Props {
  address: string;
  onBack: () => void;
}

export default function WalletReceiveScreen({ address, onBack }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [activeSync, setActiveSync] = useState<ActiveSyncSnapshot | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Auto-arm a 5-min active-sync when the Receive screen mounts —
  // showing your own QR is a strong "I'm expecting one" signal
  // (Galoy POS pattern). Cancels automatically on unmount.
  useEffect(() => {
    const cancel = startActiveSync({
      budgetMs: 5 * 60 * 1000,
      onTick: setActiveSync,
      onFresh: (fresh) => {
        for (const f of fresh) void notifyIncoming(f.tx, f.fromName);
      },
      onEnd: () => {
        cancelRef.current = null;
        setActiveSync(null);
      },
    });
    cancelRef.current = cancel;
    setActiveSync({ elapsedMs: 0, budgetMs: 5 * 60 * 1000, nextPollInMs: 5_000, pollCount: 0 });
    return () => { cancel(); };
  }, []);

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
      <Header title={t('wallet.receiveTitle')} onBack={onBack} />

      <div className="flex flex-col items-center px-5 pt-2 pb-6 overflow-y-auto">
        <p className="text-sm text-center text-[var(--color-text-muted)] mb-5 max-w-[280px]">
          {t('wallet.receiveHelp')}
        </p>

        <div className="p-4 rounded-2xl bg-white border border-[var(--color-border)]">
          <QrCode value={address} size={240} />
        </div>

        {/* Active-sync banner — armed automatically while the Receive
            screen is visible; auto-cancels on unmount. */}
        {activeSync && (
          <div className="mt-4 w-full">
            <ActiveSyncBanner
              snapshot={activeSync}
              onCancel={() => cancelRef.current?.()}
            />
          </div>
        )}

        <div className="mt-5 w-full px-2">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] mb-1">
            {t('wallet.yourAddress')}
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
          {copied ? `${t('common.copied')} ✓` : t('wallet.copyAddress')}
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
