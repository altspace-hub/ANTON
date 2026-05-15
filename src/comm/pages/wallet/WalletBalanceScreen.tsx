/**
 * WalletBalanceScreen — wallet home.
 *
 * Shows the live balance, recent activity (5 most-recent txs) and
 * three actions: Receive / Send / History. The "balance" is currently
 * the locally-computed sum over the tx ledger — on-chain balance
 * queries land when the FutureChain RPC client ships in a follow-up.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeBalanceMicroFtc, listTxs, type WalletTx } from '../../services/transactions';

interface Props {
  address: string;
  onReceive: () => void;
  onSend: () => void;
  onHistory: () => void;
  onTax: () => void;
}

export default function WalletBalanceScreen({
  address, onReceive, onSend, onHistory, onTax,
}: Props) {
  const { t } = useTranslation();
  const [balanceMicroFtc, setBalanceMicroFtc] = useState<bigint>(0n);
  const [recent, setRecent] = useState<WalletTx[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const [bal, txs] = await Promise.all([
      computeBalanceMicroFtc(),
      listTxs(5),
    ]);
    setBalanceMicroFtc(bal);
    setRecent(txs);
  }

  const ftc = Number(balanceMicroFtc) / 1_000_000;

  return (
    <section className="flex flex-col h-full overflow-y-auto safe-bottom">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">{t('wallet.title')}</h1>

        <div className="mt-5 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
              {t('wallet.balance')}
            </span>
            <span className="text-[10px] font-mono text-[var(--color-text-faint)]">FTC</span>
          </div>
          <div className="mt-1 text-4xl font-semibold text-[var(--color-text)] tabular-nums">
            {ftc.toFixed(4)}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-soft)]">
            <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
              {t('wallet.address')}
            </div>
            <div className="mt-1 text-[12px] font-mono text-[var(--color-accent)] break-all">
              {address}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <ActionButton label={t('wallet.receive')} onClick={onReceive} />
          <ActionButton label={t('wallet.send')} onClick={onSend} />
          <ActionButton label={t('wallet.history')} onClick={onHistory} />
          <ActionButton label={t('wallet.tax')} onClick={onTax} />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">{t('wallet.recentActivity')}</h2>
            {recent.length > 0 && (
              <button type="button" onClick={onHistory}
                      className="text-xs text-[var(--color-accent)]">
                {t('wallet.seeAll')}
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)]">{t('wallet.noTransactions')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recent.map((tx) => <RecentRow key={tx.id} tx={tx} />)}
            </ul>
          )}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
          {t('wallet.taxHint')}
        </p>
      </div>
    </section>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="py-3 rounded-xl font-semibold text-sm bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] active:scale-[0.97] transition-transform"
    >
      {label}
    </button>
  );
}

function RecentRow({ tx }: { tx: WalletTx }) {
  const { t } = useTranslation();
  const ftc = Number(BigInt(tx.amountMicroFtc)) / 1_000_000;
  const sign = isInbound(tx.kind) ? '+' : '−';
  const date = new Date(tx.ts);
  const dateStr = date.toISOString().slice(0, 10);
  return (
    <li className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--color-text)]">
          {t(`wallet.txKind.${tx.kind}`)}
        </div>
        <div className="text-[11px] text-[var(--color-text-faint)] truncate">
          {tx.counterparty}
        </div>
      </div>
      <div className="text-right ml-3">
        <div className="text-sm font-mono tabular-nums text-[var(--color-text)]">
          {sign} {ftc.toFixed(4)}
        </div>
        <div className="text-[10px] text-[var(--color-text-faint)]">{dateStr}</div>
      </div>
    </li>
  );
}

function isInbound(kind: WalletTx['kind']): boolean {
  return kind === 'receive' || kind === 'refund_received' || kind === 'stake_reward' || kind === 'airdrop';
}
