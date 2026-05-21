/**
 * HistoryScreen — full activity timeline, both directions.
 *
 * Merges outgoing PaymentRecord rows with inbound ReceivedRecord
 * rows via buildActivity(). Each row is tappable to expand the per-
 * tx detail inline. Outgoing rows surface merchant / order / ref;
 * inbound rows surface sender / remittance / block height.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFtc, listPayments } from '../services/payment';
import { listReceived } from '../services/received';
import { buildActivity } from '../services/activity';
import { isDust } from '../services/address-book';
import type { Activity, PaymentRecord, ReceivedRecord } from '../services/types';

interface Props {
  onBack: () => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function rowKey(a: Activity): string {
  return a.direction === 'sent' ? `s-${a.record.id}` : `r-${a.record.txId}`;
}

function abbreviate(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function HistoryScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Activity[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [sent, received] = await Promise.all([listPayments(), listReceived()]);
      // Hide dust by default — common delivery vector for address-
      // poisoning attacks. The user can switch to "show all" once a
      // setting is added; for now hide-by-default is the safer choice.
      const nonDust = received.filter(r => !isDust(r.amountMicroFtc));
      setItems(buildActivity(sent, nonDust));
    })();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('history.activityTitle', 'Activity')}
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl p-6 text-center mt-4"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('history.empty')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('history.emptyBody')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((a) => {
              const key = rowKey(a);
              const open = expanded === key;
              return (
                <div key={key} className="rounded-xl overflow-hidden"
                     style={{ backgroundColor: 'var(--color-surface)',
                              border: '1px solid var(--color-border)' }}>
                  <button type="button"
                          onClick={() => setExpanded(open ? null : key)}
                          className="w-full flex items-center gap-3 p-3.5 text-left">
                    <DirectionGlyph direction={a.direction} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm"
                           style={{ color: 'var(--color-text)' }}>
                        {a.direction === 'sent'
                          ? t(`review.purpose${a.record.purpose}`)
                          : t('history.receivedFrom', { defaultValue: 'Received' })}
                      </div>
                      <div className="text-xs mt-0.5"
                           style={{ color: 'var(--color-text-muted)' }}>
                        {formatDate(a.at)}
                      </div>
                    </div>
                    <div className="mono text-sm font-semibold"
                         style={{ color: a.direction === 'received'
                                    ? 'var(--color-accent)'
                                    : 'var(--color-text)' }}>
                      {a.direction === 'received' ? '+' : ''}
                      {formatFtc(a.record.amountMicroFtc)} FTC
                    </div>
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5 pt-1"
                         style={{ borderTop: '1px solid var(--color-border-soft)' }}>
                      {a.direction === 'sent'
                        ? <SentDetail r={a.record} />
                        : <ReceivedDetail r={a.record} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DirectionGlyph({ direction }: { direction: 'sent' | 'received' }) {
  const isOut = direction === 'sent';
  return (
    <span aria-hidden
          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{ backgroundColor: isOut ? 'var(--color-surface-alt, rgba(0,0,0,0.04))'
                                          : 'var(--color-accent-soft, rgba(45,212,168,0.12))',
                   color: isOut ? 'var(--color-text-muted)' : 'var(--color-accent)' }}>
      {isOut ? (
        // ↗
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        // ↙
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M17 7L7 17M15 17H7V9" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function SentDetail({ r }: { r: PaymentRecord }) {
  const { t } = useTranslation();
  return (
    <>
      <DetailRow label={t('history.merchant')} value={r.merchantId} />
      <DetailRow label={t('history.orderId')} value={r.orderId} />
      <DetailRow label={t('history.amount')}
                 value={`${formatFtc(r.amountMicroFtc)} FTC`} />
      <DetailRow label={t('history.reference')} value={r.ref} wrap />
      {r.txId && <DetailRow label={t('history.txId', 'Tx id')} value={r.txId} wrap />}
    </>
  );
}

function ReceivedDetail({ r }: { r: ReceivedRecord }) {
  const { t } = useTranslation();
  return (
    <>
      <DetailRow label={t('history.from', 'From')}
                 value={r.fromName ? `${r.fromName} · ${abbreviate(r.fromAddress)}` : abbreviate(r.fromAddress) || '—'} />
      <DetailRow label={t('history.amount')}
                 value={`+${formatFtc(r.amountMicroFtc)} FTC`} />
      {r.remittance && <DetailRow label={t('history.note', 'Note')} value={r.remittance} wrap />}
      <DetailRow label={t('history.txId', 'Tx id')} value={r.txId} wrap />
      {r.blockHeight && <DetailRow label={t('history.block', 'Block')} value={String(r.blockHeight)} />}
    </>
  );
}

function DetailRow({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-xs shrink-0" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
      <span className={`mono text-xs text-right ${wrap ? 'break-all' : ''}`}
            style={{ color: 'var(--color-text-body)' }}>
        {value}
      </span>
    </div>
  );
}
