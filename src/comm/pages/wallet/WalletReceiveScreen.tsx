/**
 * WalletReceiveScreen — show the user's address as a QR to be paid.
 *
 * #79: optionally request an amount. With an amount + a saved payment identity,
 * the screen can show an ANIMATED, fountain-coded rich QR that carries the
 * receiver's ISO 20022 creditor party + an order envelope (mirrors Pay's
 * ReceiveScreen). Without both, it falls back to the static address QR.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrCode from '../../components/QrCode';
import AnimatedQrCode from '../../components/AnimatedQrCode';
import ActiveSyncBanner from '../../components/ActiveSyncBanner';
import { startActiveSync, type ActiveSyncSnapshot } from '../../services/active-sync';
import { notifyIncoming } from '../../services/notifications';
import { loadPayerIdentity, type PayerIdentity } from '../../services/payment-identity';
import { getActiveWalletMeta } from '../../services/wallets';
import { buildCompactReceiveUri, buildRichReceiveUri } from '../../services/qr-transfer/receive-uri';

interface Props {
  address: string;
  onBack: () => void;
}

export default function WalletReceiveScreen({ address, onBack }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [activeSync, setActiveSync] = useState<ActiveSyncSnapshot | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [amountFtc, setAmountFtc] = useState('');
  // #84 — default to the rich/animated QR (carries the receiver's creditor
  // identity so a scan auto-completes the payment). `showAnimated =
  // animated && canAnimate` falls back to the static address QR whenever
  // there's no rich payload (no amount / no identity); an explicit Static
  // tap sets animated=false and sticks.
  const [animated, setAnimated] = useState(true);
  const [identity, setIdentity] = useState<PayerIdentity | null>(null);
  const [label, setLabel] = useState<string | undefined>(undefined);

  useEffect(() => {
    void loadPayerIdentity().then(setIdentity);
    void getActiveWalletMeta().then((m) => setLabel(m?.label));
  }, []);

  // Auto-arm a 5-min active-sync while the Receive screen is visible.
  useEffect(() => {
    const cancel = startActiveSync({
      budgetMs: 5 * 60 * 1000,
      onTick: setActiveSync,
      onFresh: (fresh) => { for (const f of fresh) void notifyIncoming(f.tx, f.fromName); },
      onEnd: () => { cancelRef.current = null; setActiveSync(null); },
    });
    cancelRef.current = cancel;
    setActiveSync({ elapsedMs: 0, budgetMs: 5 * 60 * 1000, nextPollInMs: 5_000, pollCount: 0 });
    return () => { cancel(); };
  }, []);

  // Parse the requested amount → micro-FTC (0n = no amount).
  let microFtc = 0n;
  const trimmed = amountFtc.trim();
  if (trimmed) {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) microFtc = BigInt(Math.round(n * 1_000_000));
  }

  const compactUri = buildCompactReceiveUri(address, microFtc);
  const richUri = buildRichReceiveUri({ address, amountMicroFtc: microFtc, identity, label });
  const canAnimate = richUri !== null;
  const showAnimated = animated && canAnimate;

  async function copy() {
    try {
      await navigator.clipboard.writeText(showAnimated ? richUri! : compactUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — user can long-press the text below */ }
  }

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title={t('wallet.receiveTitle')} onBack={onBack} />

      <div className="flex flex-col items-center px-5 pt-2 pb-6 overflow-y-auto">
        <p className="text-sm text-center text-[var(--color-text-muted)] mb-4 max-w-[280px]">
          {t('wallet.receiveHelp')}
        </p>

        {/* Optional request amount */}
        <div className="w-full mb-4">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] mb-1">
            {t('receive.requestAmount', 'Request amount (optional)')}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" inputMode="decimal" min="0" step="0.0001"
              value={amountFtc} onChange={(e) => setAmountFtc(e.target.value)}
              placeholder="0.00"
              className="flex-1 p-3 rounded-xl text-base bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]"
            />
            <span className="text-sm font-semibold text-[var(--color-text-muted)]">FTC</span>
          </div>
        </div>

        {/* Static / Animated toggle — only when a rich QR is available */}
        {canAnimate && (
          <div className="flex gap-2 w-full mb-3">
            {([['static', false], ['animated', true]] as const).map(([key, on]) => (
              <button key={key} type="button" onClick={() => setAnimated(on)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold"
                      style={animated === on
                        ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                        : { backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }}>
                {on ? t('receive.qrAnimated', 'Animated') : t('receive.qrStatic', 'Static')}
              </button>
            ))}
          </div>
        )}

        <div className="p-4 rounded-2xl bg-white border border-[var(--color-border)]">
          {showAnimated
            ? <AnimatedQrCode value={richUri!} size={240} />
            : <QrCode value={compactUri} size={240} />}
        </div>
        {showAnimated && (
          <p className="text-[11px] text-center mt-2 text-[var(--color-text-faint)] max-w-[260px]">
            {t('receive.qrAnimatedHint', 'Hold the sender’s camera steady — the code cycles through frames.')}
          </p>
        )}

        {activeSync && (
          <div className="mt-4 w-full">
            <ActiveSyncBanner snapshot={activeSync} onCancel={() => cancelRef.current?.()} />
          </div>
        )}

        <div className="mt-5 w-full px-2">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)] mb-1">
            {t('wallet.yourAddress')}
          </div>
          <div className="font-mono text-[12px] break-all text-[var(--color-accent)] select-all">{address}</div>
        </div>

        <button type="button" onClick={copy}
                className="mt-4 w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)]">
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
