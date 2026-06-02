/**
 * PaymentDetailScreen — full-screen, read-only detail view for one
 * activity row (sent PaymentRecord or inbound ReceivedRecord).
 *
 * Replaces the old inline accordion in HistoryScreen. Sections:
 *   • Amount + direction (signed FTC, SEK estimate for sent rows)
 *   • Counterparty (friend label preferred over the raw address)
 *   • Status (the lifecycle pill — sent rows only)
 *   • ISO 20022 / PACS.008 (from the persisted pacs008 snapshot)
 *   • Chain (txId, block height)
 *
 * Presentation-only: every value is read from what already persists on
 * the record. Nothing here mutates state or talks to the chain.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StatusPill from '../components/StatusPill';
import PaymentTypeBadge from '../components/PaymentTypeBadge';
import CopyRow from '../components/CopyRow';
import { estimateSek, formatFtc, formatSek } from '../services/payment';
import { loadProfile } from '../services/profile';
import { resolveName } from '../services/address-book';
import type { Activity, PaymentRecord, ReceivedRecord } from '../services/types';

interface Props {
  activity: Activity;
  /** Pre-built address → friend-label map (from HistoryScreen). */
  contactNames: Record<string, string>;
  onBack: () => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function abbreviate(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function PaymentDetailScreen({ activity, contactNames, onBack }: Props) {
  const { t } = useTranslation();
  const isSent = activity.direction === 'sent';

  // SEK estimate rate for the amount sub-line (sent rows). Falls back
  // to the default 0.1 until the profile loads.
  const [ftcPerSek, setFtcPerSek] = useState(0.1);
  useEffect(() => {
    void (async () => {
      const profile = await loadProfile();
      if (profile) setFtcPerSek(profile.ftcPerSek);
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
            {t('history.detailTitle', 'Payment detail')}
          </h2>
        </div>

        {/* Amount + direction card */}
        <div className="rounded-2xl p-6 text-center mb-4"
             style={{ backgroundColor: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)' }}>
          <div className="text-xs uppercase tracking-wider mb-1"
               style={{ color: 'var(--color-text-faint)' }}>
            {isSent
              ? t('history.detail.paid', 'You paid')
              : t('history.detail.received', 'You received')}
          </div>
          <div className="text-4xl font-bold mono"
               style={{ color: isSent ? 'var(--color-text)' : 'var(--color-accent)' }}>
            {isSent ? '-' : '+'}{formatFtc(activity.record.amountMicroFtc)}{' '}
            <span className="text-2xl">FTC</span>
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {t('review.estimated', { amount: formatSek(estimateSek(activity.record.amountMicroFtc, ftcPerSek)) })}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {formatDate(activity.at)}
          </div>
        </div>

        {isSent
          ? <SentSections r={activity.record} contactNames={contactNames} />
          : <ReceivedSections r={activity.record} contactNames={contactNames} />}
      </div>
    </div>
  );
}

function SentSections({ r, contactNames }: { r: PaymentRecord; contactNames: Record<string, string> }) {
  const { t } = useTranslation();
  const friend = resolveName(r.toAddress, contactNames);
  return (
    <>
      {/* Counterparty */}
      <Section title={t('history.detail.counterparty', 'Counterparty')}>
        <IsoRow label={t('history.merchant')} value={friend ?? r.merchantId} />
        {r.toAddress && (
          <CopyRow label={t('history.detail.address', 'Address')} value={r.toAddress} />
        )}
        <IsoRow label={t('history.orderId')} value={r.orderId} />
        <IsoRow label={t('review.purpose')} value={t(`review.purpose${r.purpose}`)} />
        {r.paymentType && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs shrink-0" style={{ color: 'var(--color-text-faint)' }}>
              {t('review.paymentTypeLabel', 'Type')}
            </span>
            <PaymentTypeBadge type={r.paymentType} />
          </div>
        )}
      </Section>

      {/* Status */}
      <Section title={t('history.detail.status', 'Status')}>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs shrink-0" style={{ color: 'var(--color-text-faint)' }}>
            {t('history.detail.status', 'Status')}
          </span>
          <StatusPill status={r.status} />
        </div>
        {r.status === 'failed' && r.error && (
          <IsoRow label={t('history.detail.error', 'Reason')} value={r.error} wrap />
        )}
      </Section>

      {/* Amount breakdown — network fee (0.1%, capped 0.1 FTC) + total */}
      {r.feeSatoshi != null && (
        <Section title={t('history.detail.amountSection', 'Amount')}>
          <IsoRow label={t('history.detail.sent', 'Sent')} value={`${formatFtc(r.amountMicroFtc)} FTC`} />
          <IsoRow label={t('history.detail.networkFee', 'Network fee')}
                  value={`${formatFtc(BigInt(Math.round(r.feeSatoshi / 100)))} FTC`} />
          <IsoRow label={t('history.detail.total', 'Total')}
                  value={`${formatFtc(r.amountMicroFtc + BigInt(Math.round(r.feeSatoshi / 100)))} FTC`} />
        </Section>
      )}

      {/* ISO 20022 / PACS.008 — from the persisted snapshot. */}
      {r.pacs008 && <IsoSection draft={r.pacs008} />}

      {/* Chain */}
      {(r.txId || r.requestId) && (
        <Section title={t('history.detail.chain', 'Chain')}>
          {r.txId && <CopyRow label={t('history.txId', 'Tx id')} value={r.txId} />}
          {r.requestId && (
            <IsoRow label={t('history.detail.requestId', 'Request id')} value={r.requestId} wrap />
          )}
        </Section>
      )}
    </>
  );
}

function ReceivedSections({ r, contactNames }: { r: ReceivedRecord; contactNames: Record<string, string> }) {
  const { t } = useTranslation();
  const friend = resolveName(r.fromAddress, contactNames);
  const name = friend ?? r.fromName;
  return (
    <>
      {/* Counterparty */}
      <Section title={t('history.detail.counterparty', 'Counterparty')}>
        <IsoRow label={t('history.from', 'From')} value={name || abbreviate(r.fromAddress) || '—'} />
        {r.fromAddress && (
          <CopyRow label={t('history.detail.address', 'Address')} value={r.fromAddress} />
        )}
        {r.remittance && <IsoRow label={t('history.note', 'Note')} value={r.remittance} wrap />}
      </Section>

      {/* Chain — inbound rows are confirmed by the time we observe them. */}
      <Section title={t('history.detail.chain', 'Chain')}>
        <CopyRow label={t('history.txId', 'Tx id')} value={r.txId} />
        {r.blockHeight !== undefined && (
          <IsoRow label={t('history.block', 'Block')} value={String(r.blockHeight)} />
        )}
      </Section>
    </>
  );
}

/** ISO 20022 / PACS.008 section, rendered from the persisted draft
 *  snapshot. Mirrors ReviewScreen's IsoRow layout + review.iso.* keys. */
function IsoSection({ draft }: { draft: NonNullable<PaymentRecord['pacs008']> }) {
  const { t } = useTranslation();
  const partyLine = (p: { name: string; country: string; city?: string; street?: string; postcode?: string }) => {
    const loc = [p.street, p.postcode, p.city, p.country].filter(Boolean).join(', ');
    return loc ? `${p.name} · ${loc}` : `${p.name} · ${p.country}`;
  };
  return (
    <Section title={t('review.iso.title')}>
      <IsoRow label={t('review.iso.debtor')} value={partyLine(draft.debtor)} wrap />
      <IsoRow label={t('review.iso.creditor')} value={partyLine(draft.creditor)} wrap />
      <IsoRow label={t('review.iso.purpose')} value={draft.purpose} />
      <CopyRow label={t('review.iso.reference')} value={draft.reference} />
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden mb-4"
         style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-4 py-2 text-xs uppercase tracking-wider"
           style={{ color: 'var(--color-text-faint)',
                    borderBottom: '1px solid var(--color-border-soft)' }}>
        {title}
      </div>
      <div className="px-4 pb-3 pt-1">
        {children}
      </div>
    </div>
  );
}

/** Same layout as ReviewScreen's IsoRow — kept visually identical so
 *  the ISO section reads the same on review and on the receipt. */
function IsoRow({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
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
