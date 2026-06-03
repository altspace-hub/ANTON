/**
 * WalletHistoryScreen — full transaction ledger.
 *
 * Most-recent first. Tapping a row opens the full-screen
 * WalletTxDetailScreen (#86 Pay parity — replaced the old inline
 * accordion). Counterparty addresses resolve to a saved friend label
 * when one exists (address-book), else show the abbreviated address.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTxs, type WalletTx } from '../../services/transactions';
import { groupTxsByDay } from '../../services/tx-grouping';
import { listContacts, buildContactNameMap, resolveName } from '../../services/address-book';
import PaymentTypeBadge from '../../components/PaymentTypeBadge';
import StatusPill from '../../components/StatusPill';
import { PAYMENT_TYPES, paymentTypeMeta, type PaymentType } from '../../services/payment-type';

interface Props {
  onBack: () => void;
  /** Open the full-screen detail view for a tapped row. */
  onOpen: (tx: WalletTx) => void;
}

export default function WalletHistoryScreen({ onBack, onOpen }: Props) {
  const { t } = useTranslation();
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  /** #76 — filter by sender payment-type. Only outbound sends carry a type. */
  const [typeFilter, setTypeFilter] = useState<PaymentType | 'all'>('all');

  useEffect(() => {
    listTxs(500).then(setTxs);
    listContacts().then((cs) => setContactNames(buildContactNameMap(cs)));
  }, []);

  const filtered = typeFilter === 'all'
    ? txs
    : txs.filter((tx) => tx.paymentType === typeFilter);

  // Bucket into per-day groups with sticky "Today / Yesterday / <date>" headers.
  const groups = groupTxsByDay(filtered, {
    today: t('history.today', 'Today'),
    yesterday: t('history.yesterday', 'Yesterday'),
    formatDate: (ms) => new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    }),
  }, Date.now());

  return (
    <section className="flex flex-col h-full safe-bottom">
      <Header title={t('wallet.historyTitle')} onBack={onBack} />

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {txs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-faint)] text-center mt-12">
            {t('wallet.noTransactions')}
          </p>
        ) : (
          <>
            {/* #76 — filter chips: All + the four payment types. */}
            <div className="flex gap-2 overflow-x-auto pb-3">
              {(['all', ...PAYMENT_TYPES] as const).map((f) => {
                const active = typeFilter === f;
                const label = f === 'all'
                  ? t('wallet.filterAll', 'All')
                  : t(`paymentType.${f}`, paymentTypeMeta(f).labelFallback);
                return (
                  <button key={f} type="button" onClick={() => setTypeFilter(f)}
                          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
                          style={active
                            ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }
                            : { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)',
                                border: '1px solid var(--color-border)' }}>
                    {label}
                  </button>
                );
              })}
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--color-text-faint)] text-center mt-8">
                {t('wallet.filterEmpty', 'No payments of this type yet')}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map((group) => (
                  <div key={group.dayKey}>
                    {/* Sticky per-day header. */}
                    <div className="sticky top-0 z-10 py-1.5 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] bg-[var(--color-bg)]">
                      {group.label}
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {group.items.map((tx) => (
                        <li key={tx.id}>
                          <Row tx={tx} contactNames={contactNames} onOpen={() => onOpen(tx)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Row({
  tx, contactNames, onOpen,
}: { tx: WalletTx; contactNames: Record<string, string>; onOpen: () => void }) {
  const { t } = useTranslation();
  const ftc = Number(BigInt(tx.amountMicroFtc)) / 1_000_000;
  const inbound = isInbound(tx.kind);
  const sign = inbound ? '+' : '−';
  const date = new Date(tx.ts);
  const name = resolveName(tx.counterparty, contactNames) ?? abbreviate(tx.counterparty);
  return (
    <div className="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]"
         onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div className="flex items-center justify-between p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">
              {t(`wallet.txKind.${tx.kind}`)}
            </span>
            {tx.paymentType && <PaymentTypeBadge type={tx.paymentType} />}
            {tx.status && <StatusPill status={tx.status} />}
          </div>
          <div className="text-[11px] text-[var(--color-text-faint)] truncate font-mono">
            {name}
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
    </div>
  );
}

function abbreviate(addr: string): string {
  if (!addr) return '—';
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
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
