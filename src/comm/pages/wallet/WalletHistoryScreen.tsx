/**
 * WalletHistoryScreen — full transaction ledger.
 *
 * Most-recent first. Tapping a row opens a detail expansion inline
 * with: counterparty, amount, fiat at tx (if known), ref, on-chain
 * hash, and the user's declared jurisdiction at the time of the
 * disposal — the inputs the Phase-1 tax engine needs.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTxs, type WalletTx } from '../../services/transactions';

interface Props {
  onBack: () => void;
}

export default function WalletHistoryScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    listTxs(500).then(setTxs);
  }, []);

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title={t('wallet.historyTitle')} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {txs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-faint)] text-center mt-12">
            {t('wallet.noTransactions')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {txs.map((tx) => (
              <li key={tx.id}>
                <Row tx={tx}
                     expanded={expanded === tx.id}
                     onToggle={() => setExpanded(expanded === tx.id ? null : tx.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Row({
  tx, expanded, onToggle,
}: { tx: WalletTx; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const ftc = Number(BigInt(tx.amountMicroFtc)) / 1_000_000;
  const inbound = isInbound(tx.kind);
  const sign = inbound ? '+' : '−';
  const sek = tx.fiatValueAtTx;
  const date = new Date(tx.ts);
  return (
    <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]"
         onClick={onToggle}
         style={{ cursor: 'pointer' }}>
      <div className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--color-text)]">
            {t(`wallet.txKind.${tx.kind}`)}
          </div>
          <div className="text-[11px] text-[var(--color-text-faint)] truncate font-mono">
            {tx.counterparty}
          </div>
        </div>
        <div className="text-right ml-3">
          <div className="text-sm font-mono tabular-nums text-[var(--color-text)]">
            {sign} {ftc.toFixed(4)} FTC
          </div>
          <div className="text-[10px] text-[var(--color-text-faint)]">
            {date.toISOString().slice(0, 16).replace('T', ' ')}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 text-[11px] text-[var(--color-text-muted)] font-mono leading-relaxed border-t border-[var(--color-border-soft)]">
          <KV label={t('wallet.histId')} value={tx.id} />
          {sek > 0 && <KV label={t('wallet.histFiatAtTx')} value={`${sek.toFixed(2)} ${tx.fiatCurrency}`} />}
          {!sek && <KV label={t('wallet.histFiatAtTx')} value={t('wallet.histNotRecorded')} muted />}
          {tx.ref && <KV label={t('wallet.histRef')} value={tx.ref} />}
          {tx.txHash && <KV label={t('wallet.histOnChain')} value={tx.txHash} />}
          {!tx.txHash && <KV label={t('wallet.histOnChain')} value={t('wallet.histPending')} muted />}
          {tx.jurisdictionAtTx && <KV label={t('wallet.histJurisdiction')} value={tx.jurisdictionAtTx} />}
          {tx.refundOf && <KV label={t('wallet.histRefundOf')} value={tx.refundOf} />}
          {tx.note && <KV label={t('wallet.histNote')} value={tx.note} />}
        </div>
      )}
    </div>
  );
}

function KV({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex">
      <span className="w-24 shrink-0 text-[var(--color-text-faint)]">{label}</span>
      <span className="flex-1 break-all"
            style={{ color: muted ? 'var(--color-text-faint)' : 'inherit' }}>
        {value}
      </span>
    </div>
  );
}

function isInbound(kind: WalletTx['kind']): boolean {
  return kind === 'receive' || kind === 'refund_received' || kind === 'stake_reward' || kind === 'airdrop';
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
