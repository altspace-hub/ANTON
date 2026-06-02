/**
 * WalletSendDoneScreen — post-submit confirmation (#79 Phase 4).
 *
 * Loads the WalletTx by id and live-refreshes it every 3s so the lifecycle the
 * background poller writes (queued → confirmed) shows live; re-arms the poller on
 * mount. Ported from Pay's PaymentDoneScreen, adapted to WalletTx (counterparty /
 * txHash / string amount; no error field).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '../../components/PrimaryButton';
import CopyRow from '../../components/CopyRow';
import { formatFtc, pollConfirmation } from '../../services/payment';
import { getTxById, type PaymentStatus, type WalletTx } from '../../services/transactions';

interface Props {
  txId: string;
  onHome: () => void;
  onHistory: () => void;
}

const POLL_MS = 3_000;

export default function WalletSendDoneScreen({ txId, onHome, onHistory }: Props) {
  const { t } = useTranslation();
  const [row, setRow] = useState<WalletTx | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTxById(txId).then((r) => { if (!cancelled) setRow(r); });
    return () => { cancelled = true; };
  }, [txId]);

  // Live refresh while non-terminal.
  useEffect(() => {
    if (!row || isTerminal(row.status)) return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      const fresh = await getTxById(txId);
      if (!cancelled && fresh) setRow(fresh);
    }, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [txId, row?.status]);

  // Re-arm the confirmation poller (idempotent) in case the original was killed.
  useEffect(() => {
    if (!row || isTerminal(row.status) || !row.txHash) return;
    void pollConfirmation(row.id, row.txHash, row.counterparty);
  }, [row?.id, row?.status, row?.txHash, row?.counterparty]);

  const view = statusView(row?.status);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex flex-col items-center text-center mt-10 mb-7">
          <span className="flex items-center justify-center w-20 h-20 rounded-full" style={{ backgroundColor: view.bg }}>
            {view.icon}
          </span>
          <h1 className="text-2xl font-bold mt-5 text-[var(--color-text)]">{t(view.titleKey, view.titleFallback)}</h1>
          <p className="text-base leading-relaxed mt-2 text-[var(--color-text-body)]">{t(view.bodyKey, view.bodyFallback)}</p>
        </div>

        {row && (
          <div className="rounded-xl overflow-hidden mb-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--color-text-muted)]">{t('paymentDone.amountPaid', 'Amount paid')}</span>
              <span className="mono text-sm font-bold text-[var(--color-text)]">{formatFtc(BigInt(row.amountMicroFtc))} FTC</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--color-border-soft)' }}>
              <span className="text-sm text-[var(--color-text-muted)]">{t('wallet.to', 'To')}</span>
              <span className="mono text-xs font-semibold text-[var(--color-text)] truncate ml-3 max-w-[60%]">{row.counterparty}</span>
            </div>
            {row.txHash && (
              <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border-soft)' }}>
                <CopyRow label={t('paymentDone.txId', 'Tx id')} value={row.txHash} />
              </div>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2.5">
          <PrimaryButton onClick={onHome} marginTopAuto={false}>{t('paymentDone.backHome', 'Back to wallet')}</PrimaryButton>
          <button type="button" onClick={onHistory}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-body)' }}>
            {t('paymentDone.viewHistory', 'View history')}
          </button>
        </div>
      </div>
    </div>
  );
}

function isTerminal(s?: PaymentStatus): boolean {
  return s === 'confirmed' || s === 'failed' || s === 'recorded';
}

interface View { bg: string; icon: React.ReactNode; titleKey: string; titleFallback: string; bodyKey: string; bodyFallback: string; }

function statusView(s?: PaymentStatus): View {
  const spinner = (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-accent)' }} className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.6" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
  const check = (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-accent)' }}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const cross = (
    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--color-red)' }}>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  switch (s) {
    case 'submitting':
      return { bg: 'var(--color-accent-soft)', icon: spinner, titleKey: 'paymentDone.submittingTitle', titleFallback: 'Submitting…', bodyKey: 'paymentDone.submittingBody', bodyFallback: 'Signing and forwarding to the network.' };
    case 'queued':
    case 'accepted':
      return { bg: 'var(--color-accent-soft)', icon: spinner, titleKey: 'paymentDone.queuedTitle', titleFallback: 'Awaiting confirmation', bodyKey: 'paymentDone.queuedBody', bodyFallback: 'Sent to the chain. Waiting for a miner to include it in a block.' };
    case 'confirmed':
      return { bg: 'var(--color-accent-soft)', icon: check, titleKey: 'paymentDone.title', titleFallback: 'Payment confirmed', bodyKey: 'paymentDone.body', bodyFallback: 'Mined into a block on FutureChain.' };
    case 'failed':
      return { bg: 'var(--color-red-dim)', icon: cross, titleKey: 'paymentDone.failedTitle', titleFallback: 'Payment failed', bodyKey: 'paymentDone.failedBody', bodyFallback: 'The transaction was rejected.' };
    default:
      return { bg: 'var(--color-accent-soft)', icon: spinner, titleKey: 'paymentDone.queuedTitle', titleFallback: 'Awaiting confirmation', bodyKey: 'paymentDone.queuedBody', bodyFallback: 'Sent to the chain. Waiting for a miner to include it in a block.' };
  }
}
