/**
 * WalletBalanceScreen — wallet home.
 *
 * Shows the live balance, recent activity (5 most-recent txs) and
 * three actions: Receive / Send / History. The "balance" is currently
 * the locally-computed sum over the tx ledger — on-chain balance
 * queries land when the FutureChain RPC client ships in a follow-up.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeBalanceMicroFtc, listTxs, type WalletTx } from '../../services/transactions';
import ActiveSyncBanner from '../../components/ActiveSyncBanner';
import { startActiveSync, type ActiveSyncSnapshot } from '../../services/active-sync';
import { notifyIncoming } from '../../services/notifications';

interface Props {
  address: string;
  onReceive: () => void;
  onSend: () => void;
  onHistory: () => void;
  onTax: () => void;
  /** Multi-wallet management — open the Wallets list. */
  onManage: () => void;
  /** Switch which FutureChain hub the app talks to. */
  onRpcEndpoint: () => void;
  /** Open wallet Security (payment PIN + passphrase). */
  onSecurity: () => void;
  /** Open the scheduled / recurring payments list. */
  onSchedules: () => void;
}

export default function WalletBalanceScreen({
  address, onReceive, onSend, onHistory, onTax, onManage, onRpcEndpoint, onSecurity, onSchedules,
}: Props) {
  const { t } = useTranslation();
  const [balanceMicroFtc, setBalanceMicroFtc] = useState<bigint>(0n);
  const [recent, setRecent] = useState<WalletTx[]>([]);
  const [activeSync, setActiveSync] = useState<ActiveSyncSnapshot | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void refresh();
    return () => { cancelRef.current?.(); };
  }, []);

  async function refresh() {
    const [bal, txs] = await Promise.all([
      computeBalanceMicroFtc(),
      listTxs(5),
    ]);
    setBalanceMicroFtc(bal);
    setRecent(txs);
  }

  /** "Sync now" button — 5 min bounded active-sync (Stripe Terminal
   *  pattern). Stops on first incoming tx OR Cancel OR timeout. */
  function startSync() {
    if (cancelRef.current) return;
    const cancel = startActiveSync({
      budgetMs: 5 * 60 * 1000,
      onTick: setActiveSync,
      onFresh: async (fresh) => {
        for (const f of fresh) void notifyIncoming(f.tx, f.fromName);
        await refresh();
      },
      onEnd: () => {
        cancelRef.current = null;
        setActiveSync(null);
        void refresh();
      },
    });
    cancelRef.current = cancel;
    setActiveSync({ elapsedMs: 0, budgetMs: 5 * 60 * 1000, nextPollInMs: 5_000, pollCount: 0 });
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

        {/* Secondary row — wallet management + RPC endpoint. Tucked
            below the primary action grid because they're rare-use. */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ActionButton label={t('wallet.manage', 'Wallets')} onClick={onManage} />
          <ActionButton label={t('wallet.rpc', 'RPC endpoint')} onClick={onRpcEndpoint} />
          <ActionButton label={t('wallet.security', 'Security')} onClick={onSecurity} />
          <ActionButton label={t('schedules.short', 'Scheduled')} onClick={onSchedules} />
        </div>

        {/* Active-sync banner (only while polling) + Sync button. The
            previous always-on 30 s timer is gone — the user triggers
            polling explicitly when they expect a payment. */}
        {activeSync ? (
          <div className="mt-3">
            <ActiveSyncBanner
              snapshot={activeSync}
              onCancel={() => cancelRef.current?.()}
            />
          </div>
        ) : (
          <button type="button" onClick={startSync}
                  className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] flex items-center justify-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('wallet.syncNow', 'Sync now')}
          </button>
        )}

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
