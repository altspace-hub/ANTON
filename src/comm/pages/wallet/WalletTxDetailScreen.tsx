/**
 * WalletTxDetailScreen — full-screen, read-only detail for one wallet
 * transaction (#86 Pay parity). Replaces the old inline accordion in
 * WalletHistoryScreen. Sections:
 *   • Amount + direction (signed FTC, fiat-at-tx, date)
 *   • Counterparty (friend label preferred over the raw address)
 *   • Status (the lifecycle pill — sent rows only)
 *   • Amount breakdown (network fee + total — sent rows with a fee)
 *   • ISO 20022 / PACS.008 (from the persisted pacs008 snapshot)
 *   • Chain (txHash, declared jurisdiction)
 *
 * Presentation-only: every value is read from what already persists on
 * the WalletTx. Nothing here mutates state or talks to the chain.
 * Mirrors src/pay/pages/PaymentDetailScreen.tsx.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import StatusPill from '../../components/StatusPill';
import PaymentTypeBadge from '../../components/PaymentTypeBadge';
import CopyRow from '../../components/CopyRow';
import { formatFtc } from '../../services/payment';
import { resolveName, addContact } from '../../services/address-book';
import type { WalletTx } from '../../services/transactions';

interface Props {
  tx: WalletTx;
  /** Pre-built address → friend-label map (from WalletScreen). */
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
  if (!addr) return '—';
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

function isInbound(kind: WalletTx['kind']): boolean {
  return kind === 'receive' || kind === 'refund_received' || kind === 'stake_reward' || kind === 'airdrop';
}

/** Fee is signed into the tx as satoshi; 1 micro-FTC = 100 satoshi
 *  (same conversion Pay's PaymentDetailScreen uses). */
function feeMicroFromSatoshi(feeSatoshi: number): bigint {
  return BigInt(Math.round(feeSatoshi / 100));
}

export default function WalletTxDetailScreen({ tx, contactNames, onBack }: Props) {
  const { t } = useTranslation();
  const inbound = isInbound(tx.kind);
  const amountMicro = BigInt(tx.amountMicroFtc);
  const counterpartyIsAddress = tx.counterparty.startsWith('fc_');

  // "Save as friend" — the counterparty's saved label, optimistically tracked
  // here so the row re-resolves without re-reading the parent's contactNames map.
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const friend = savedLabel ?? resolveName(tx.counterparty, contactNames);

  async function saveAsFriend() {
    if (saveBusy) return;
    setSaveBusy(true);
    setSaveErr(null);
    try {
      // Prefer the real PACS.008 party name (creditor for a send, debtor for a
      // receive); '' lands as "Unnamed" rather than the address.
      const partyName = (inbound ? tx.pacs008?.debtor?.name : tx.pacs008?.creditor?.name)?.trim() || '';
      const created = await addContact(partyName, tx.counterparty);
      setSavedLabel(created.label);
    } catch (e) {
      // addContact's look-alike / duplicate guard surfaces here.
      setSaveErr(e instanceof Error ? e.message : t('txDetail.saveError', 'Could not save friend.'));
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <section className="flex flex-col h-full overflow-y-auto safe-bottom">
      <Header title={t('txDetail.title', 'Payment detail')} onBack={onBack} />

      <div className="flex flex-col flex-1 px-5 pb-6">
        {/* Amount + direction card */}
        <div className="rounded-2xl p-6 text-center mb-4"
             style={{ backgroundColor: 'var(--color-accent-soft)',
                      border: '1px solid var(--color-accent-dim)' }}>
          <div className="text-xs uppercase tracking-wider mb-1"
               style={{ color: 'var(--color-text-faint)' }}>
            {inbound ? t('txDetail.received', 'You received') : t('txDetail.paid', 'You paid')}
          </div>
          <div className="text-4xl font-bold mono"
               style={{ color: inbound ? 'var(--color-accent)' : 'var(--color-text)' }}>
            {inbound ? '+' : '−'}{formatFtc(amountMicro)}{' '}
            <span className="text-2xl">FTC</span>
          </div>
          {tx.fiatValueAtTx > 0 && (
            <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
              ≈ {tx.fiatValueAtTx.toFixed(2)} {tx.fiatCurrency}
            </div>
          )}
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {formatDate(tx.ts)}
          </div>
        </div>

        {/* Counterparty */}
        <Section title={t('txDetail.counterparty', 'Counterparty')}>
          <IsoRow label={inbound ? t('txDetail.from', 'From') : t('txDetail.to', 'To')}
                  value={friend ?? abbreviate(tx.counterparty)} />
          {counterpartyIsAddress && (
            <CopyRow label={t('txDetail.address', 'Address')} value={tx.counterparty} />
          )}
          {counterpartyIsAddress && !friend && (
            <div className="pt-1.5">
              <button type="button" onClick={() => void saveAsFriend()} disabled={saveBusy}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                      style={{ color: 'var(--color-accent)', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                {saveBusy ? t('common.working', 'Working…') : `+ ${t('txDetail.saveFriend', 'Save as friend')}`}
              </button>
              {saveErr && <p className="mt-2 text-xs text-[var(--color-red)]">{saveErr}</p>}
            </div>
          )}
          {tx.paymentType && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs shrink-0" style={{ color: 'var(--color-text-faint)' }}>
                {t('txDetail.type', 'Type')}
              </span>
              <PaymentTypeBadge type={tx.paymentType} />
            </div>
          )}
          {tx.note && <IsoRow label={t('txDetail.note', 'Note')} value={tx.note} wrap />}
        </Section>

        {/* Status — sent rows carry the lifecycle. */}
        {tx.status && (
          <Section title={t('txDetail.status', 'Status')}>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs shrink-0" style={{ color: 'var(--color-text-faint)' }}>
                {t('txDetail.status', 'Status')}
              </span>
              <StatusPill status={tx.status} />
            </div>
          </Section>
        )}

        {/* Amount breakdown — network fee (0.1%, capped 0.1 FTC) + total. */}
        {tx.feeSatoshi != null && (
          <Section title={t('txDetail.amountSection', 'Amount')}>
            <IsoRow label={t('txDetail.sent', 'Sent')} value={`${formatFtc(amountMicro)} FTC`} />
            <IsoRow label={t('txDetail.networkFee', 'Network fee')}
                    value={`${formatFtc(feeMicroFromSatoshi(tx.feeSatoshi))} FTC`} />
            <IsoRow label={t('txDetail.total', 'Total')}
                    value={`${formatFtc(amountMicro + feeMicroFromSatoshi(tx.feeSatoshi))} FTC`} />
          </Section>
        )}

        {/* ISO 20022 / PACS.008 — from the persisted snapshot. */}
        {tx.pacs008 && <IsoSection draft={tx.pacs008} />}

        {/* Chain */}
        <Section title={t('txDetail.chain', 'Chain')}>
          {tx.txHash
            ? <CopyRow label={t('txDetail.txId', 'Tx id')} value={tx.txHash} />
            : <IsoRow label={t('txDetail.txId', 'Tx id')} value={t('txDetail.pending', 'Pending')} />}
          {tx.ref && !tx.pacs008 && (
            <CopyRow label={t('txDetail.reference', 'Reference')} value={tx.ref} />
          )}
          {tx.jurisdictionAtTx && (
            <IsoRow label={t('txDetail.jurisdiction', 'Tax residency')} value={tx.jurisdictionAtTx} />
          )}
        </Section>
      </div>
    </section>
  );
}

/** ISO 20022 / PACS.008 section, rendered from the persisted draft
 *  snapshot. Mirrors Pay's IsoSection. */
function IsoSection({ draft }: { draft: NonNullable<WalletTx['pacs008']> }) {
  const { t } = useTranslation();
  const partyLine = (p: { name: string; country: string; city?: string; street?: string; postcode?: string }) => {
    const loc = [p.street, p.postcode, p.city, p.country].filter(Boolean).join(', ');
    return loc ? `${p.name} · ${loc}` : `${p.name} · ${p.country}`;
  };
  return (
    <Section title={t('txDetail.iso', 'ISO 20022 payment details')}>
      <IsoRow label={t('txDetail.debtor', 'Debtor')} value={partyLine(draft.debtor)} wrap />
      <IsoRow label={t('txDetail.creditor', 'Creditor')} value={partyLine(draft.creditor)} wrap />
      <IsoRow label={t('txDetail.purpose', 'Purpose')} value={draft.purpose} />
      {draft.reference && <CopyRow label={t('txDetail.reference', 'Reference')} value={draft.reference} />}
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
      <div className="px-4 pb-3 pt-1">{children}</div>
    </div>
  );
}

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
