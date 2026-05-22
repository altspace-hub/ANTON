/**
 * ReceiptsHistoryScreen — browsable list of every past kvitto.
 *
 * Before Wave 11 the only place a kvitto resurfaced after the sale
 * was the Z-report computation in DayCloseScreen — there was no way
 * to look one up. This screen is the entry point: newest-first list,
 * status filter chips, tap a row to open KvittoDetailScreen.
 *
 * Read-only. Editing a confirmed kvitto is never allowed (audit
 * trail); voiding lives on the detail screen and only for pendings.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listReceipts } from '../services/receipts';
import { formatKvittoNumber, type Receipt, type ReceiptStatus } from '../services/types';

interface Props {
  onBack: () => void;
  onOpenReceipt: (kvittoNumber: number) => void;
}

type Filter = 'all' | ReceiptStatus;

export default function ReceiptsHistoryScreen({ onBack, onOpenReceipt }: Props) {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    void (async () => {
      // listReceipts is newest-first by kvittoNumber index.
      const all = await listReceipts(500);
      setReceipts(all);
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return receipts;
    return receipts.filter((r) => r.status === filter);
  }, [receipts, filter]);

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all',       label: t('receipts.filterAll', 'All') },
    { id: 'confirmed', label: t('receipts.filterConfirmed', 'Confirmed') },
    { id: 'pending',   label: t('receipts.filterPending', 'Pending') },
    { id: 'voided',    label: t('receipts.filterVoided', 'Voided') },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back', 'Back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('receipts.title', 'Receipts')}
          </h2>
        </div>

        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto mb-3 -mx-1 px-1 pb-1">
          {filters.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: filter === f.id ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: filter === f.id ? 'var(--color-accent-fg)' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('common.loading', 'Loading…')}
          </p>
        ) : visible.length === 0 ? (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {receipts.length === 0
                ? t('receipts.empty', 'No kvittos yet. They appear here after your first sale.')
                : t('receipts.emptyFilter', 'No kvittos with this status.')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((r) => (
              <button key={r.kvittoNumber} type="button"
                      onClick={() => onOpenReceipt(r.kvittoNumber)}
                      className="rounded-xl p-3 flex items-center gap-3 text-left"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: '1px solid var(--color-border)' }}>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm"
                       style={{ color: 'var(--color-text)' }}>
                    {formatKvittoNumber(r.kvittoNumber)}
                  </div>
                  <div className="text-xs mt-0.5"
                       style={{ color: 'var(--color-text-muted)' }}>
                    {new Date(r.createdAt).toLocaleString('sv-SE', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {r.itemCount > 0 && ` · ${t('receipts.itemCount', '{{count}} item(s)', { count: r.itemCount })}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm mono"
                       style={{ color: 'var(--color-text)' }}>
                    {r.amountSek.toFixed(2)} SEK
                  </div>
                  <div className="text-xs mt-0.5"
                       style={{
                         color:
                           r.status === 'confirmed' ? '#0D7D6C'
                           : r.status === 'voided' ? '#C0392B'
                           : '#B8860B',
                       }}>
                    {r.status === 'confirmed' ? t('receipts.statusConfirmed', 'Confirmed')
                      : r.status === 'voided' ? t('receipts.statusVoided', 'Voided')
                      : t('receipts.statusPending', 'Pending')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && receipts.length > 0 && (
          <p className="text-xs mt-3 text-center"
             style={{ color: 'var(--color-text-faint)' }}>
            {t('receipts.totalCount', '{{count}} kvittos', { count: receipts.length })}
          </p>
        )}
      </div>
    </div>
  );
}
