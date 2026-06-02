/**
 * HistoryScreen — full activity timeline, both directions.
 *
 * Merges outgoing PaymentRecord rows with inbound ReceivedRecord
 * rows via buildActivity(). Each row is tappable — it opens the
 * full-screen PaymentDetailScreen (the old inline accordion is gone).
 * Outgoing rows show the merchant / friend label + a status pill;
 * inbound rows show the sender's friend label / name. Amounts are
 * signed: received '+' in accent, sent '-' in default text.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StatusPill from '../components/StatusPill';
import PaymentTypeBadge from '../components/PaymentTypeBadge';
import { formatFtc, listPayments } from '../services/payment';
import { listReceived } from '../services/received';
import { buildActivity, groupActivityByDay } from '../services/activity';
import {
  isDust, listContacts, buildContactNameMap, resolveName,
} from '../services/address-book';
import { PAYMENT_TYPES, paymentTypeMeta, type PaymentType } from '../services/payment-type';
import type { Activity } from '../services/types';

interface Props {
  onBack: () => void;
  /** Open the full-screen detail view for a tapped row. */
  onOpen: (activity: Activity) => void;
}

/** Explicit calendar date for a day header — no time component (the
 *  time moved onto each row). */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Just the time-of-day for a row — the full date now lives in the
 *  sticky day header above it. */
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
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

/** Counterparty display name for a row — friend label first, then the
 *  record's own name field, then the abbreviated address. Never the
 *  raw merchant hash on its own when a friendlier label exists. */
function counterpartyOf(a: Activity, byAddr: Record<string, string>): string {
  if (a.direction === 'sent') {
    return resolveName(a.record.toAddress, byAddr) ?? a.record.merchantId;
  }
  return resolveName(a.record.fromAddress, byAddr)
    ?? a.record.fromName
    ?? (a.record.fromAddress ? abbreviate(a.record.fromAddress) : '—');
}

export default function HistoryScreen({ onBack, onOpen }: Props) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Activity[]>([]);
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  /** #76 — filter the timeline by sender payment-type. 'all' = no filter.
   *  Received rows have no type, so any type filter narrows to sent rows. */
  const [typeFilter, setTypeFilter] = useState<PaymentType | 'all'>('all');

  useEffect(() => {
    void (async () => {
      const [sent, received, contacts] = await Promise.all([
        listPayments(), listReceived(), listContacts(),
      ]);
      // Hide dust by default — common delivery vector for address-
      // poisoning attacks. The user can switch to "show all" once a
      // setting is added; for now hide-by-default is the safer choice.
      const nonDust = received.filter(r => !isDust(r.amountMicroFtc));
      setItems(buildActivity(sent, nonDust));
      setContactNames(buildContactNameMap(contacts));
    })();
  }, []);

  // #76 — apply the type filter before grouping. Legacy/undefined and
  // received rows match only 'all' (never silently bucketed as a type).
  const filtered = typeFilter === 'all'
    ? items
    : items.filter((a) => a.direction === 'sent' && a.record.paymentType === typeFilter);

  // Bucket the flat stream into per-day groups for sticky headers.
  // `now` is read once per render — the Today / Yesterday boundary only
  // needs to be correct at paint time.
  const groups = groupActivityByDay(filtered, {
    today: t('history.today', 'Today'),
    yesterday: t('history.yesterday', 'Yesterday'),
    formatDate,
  }, Date.now());

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
          <>
            {/* #76 — filter chips: All + the four payment types. */}
            <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
              {(['all', ...PAYMENT_TYPES] as const).map((f) => {
                const active = typeFilter === f;
                const label = f === 'all'
                  ? t('history.filterAll', 'All')
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
            {groups.length === 0 ? (
              <div className="rounded-xl p-6 text-center mt-2"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)' }}>
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('history.filterEmpty', 'No payments of this type yet')}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((g) => (
              <div key={g.dayKey} className="flex flex-col gap-2">
                {/* Sticky day header — Today / Yesterday / explicit date. */}
                <div className="sticky top-0 z-10 py-1.5 text-[11px] uppercase tracking-wider font-semibold"
                     style={{ color: 'var(--color-text-faint)',
                              backgroundColor: 'var(--color-bg)' }}>
                  {g.label}
                </div>
                {g.items.map((a) => {
                  const isIn = a.direction === 'received';
                  return (
                    <button key={rowKey(a)} type="button"
                            onClick={() => onOpen(a)}
                            className="w-full flex items-center gap-3 p-3.5 text-left rounded-xl active:opacity-90 transition-opacity"
                            style={{ backgroundColor: 'var(--color-surface)',
                                     border: '1px solid var(--color-border)' }}>
                      <DirectionGlyph direction={a.direction} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate"
                                style={{ color: 'var(--color-text)' }}>
                            {counterpartyOf(a, contactNames)}
                          </span>
                          {a.direction === 'sent' && <StatusPill status={a.record.status} />}
                          {a.direction === 'sent' && a.record.paymentType && (
                            <PaymentTypeBadge type={a.record.paymentType} />
                          )}
                        </div>
                        <div className="text-xs mt-0.5 truncate"
                             style={{ color: 'var(--color-text-muted)' }}>
                          {formatTime(a.at)}
                        </div>
                      </div>
                      <div className="mono text-sm font-semibold shrink-0"
                           style={{ color: isIn ? 'var(--color-accent)' : 'var(--color-text)' }}>
                        {isIn ? '+' : '-'}{formatFtc(a.record.amountMicroFtc)} FTC
                      </div>
                    </button>
                  );
                })}
              </div>
                ))}
              </div>
            )}
          </>
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
