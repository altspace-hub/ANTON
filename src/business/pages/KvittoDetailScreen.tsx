/**
 * KvittoDetailScreen — full detail for a single past kvitto.
 *
 * Reached by tapping a row in ReceiptsHistoryScreen. Renders the
 * Skatteverket-compliant KvittoView (which already shows line items,
 * VAT breakdown, FTC total, and — Wave 10 — any customer-attached
 * remittance), plus the actions a merchant needs against a past sale:
 *
 *   • Share — hands a text summary to the OS share sheet.
 *   • Print / Save PDF — opens the WebView print dialog.
 *   • Void — only for a still-`pending` kvitto, PIN-gated when a
 *     merchant PIN is set (same gate as day-close / refund).
 *
 * A confirmed kvitto is an audit-defensible voucher — it is never
 * editable from here. Bokföringslagen 7-year retention means the row
 * stays; voiding only flips status, it never deletes.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KvittoView, kvittoToHtml } from '../components/KvittoView';
import PinPad from '../components/PinPad';
import { getReceipt, voidReceipt } from '../services/receipts';
import { loadConfig } from '../services/merchant';
import { shareKvitto, printKvitto } from '../services/kvitto-export';
import { isPinSet } from '../services/pin';
import { formatKvittoNumber, type MerchantConfig, type Receipt } from '../services/types';

interface Props {
  kvittoNumber: number;
  onBack: () => void;
}

export default function KvittoDetailScreen({ kvittoNumber, onBack }: Props) {
  const { t } = useTranslation();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [merchant, setMerchant] = useState<MerchantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  async function refresh() {
    const [r, cfg] = await Promise.all([getReceipt(kvittoNumber), loadConfig()]);
    setReceipt(r);
    setMerchant(cfg);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, [kvittoNumber]);

  async function handleShare() {
    if (!receipt || !merchant) return;
    setBusy(true);
    try {
      await shareKvitto(receipt, merchant, kvittoToHtml(receipt, merchant));
    } catch (e) {
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!receipt || !merchant) return;
    setBusy(true);
    try {
      await printKvitto(receipt, merchant, kvittoToHtml(receipt, merchant));
    } catch (e) {
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Void — gate behind the merchant PIN when one is set. */
  async function attemptVoid() {
    if (await isPinSet()) {
      setShowPin(true);
    } else {
      await doVoid();
    }
  }

  async function doVoid() {
    if (!receipt) return;
    if (!confirm(t('kvittoDetail.confirmVoid',
      'Void this kvitto? It stays on record (Bokföringslagen) but is marked voided and excluded from the Z report.'))) {
      return;
    }
    setBusy(true);
    try {
      await voidReceipt(receipt.kvittoNumber);
      setFlash(t('kvittoDetail.voided', 'Kvitto voided.'));
      await refresh();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
            {formatKvittoNumber(kvittoNumber)}
          </h2>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('common.loading', 'Loading…')}
          </p>
        ) : !receipt || !merchant ? (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('kvittoDetail.notFound', 'Kvitto not found.')}
            </p>
          </div>
        ) : (
          <>
            {/* Status badge */}
            <div className="mb-3">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor:
                        receipt.status === 'confirmed' ? 'rgba(45,212,168,0.14)'
                        : receipt.status === 'voided' ? 'rgba(192,57,43,0.12)'
                        : 'rgba(245,166,35,0.14)',
                      color:
                        receipt.status === 'confirmed' ? '#0D7D6C'
                        : receipt.status === 'voided' ? '#C0392B'
                        : '#B8860B',
                    }}>
                {receipt.status === 'confirmed' ? t('kvittoDetail.statusConfirmed', 'Confirmed')
                  : receipt.status === 'voided' ? t('kvittoDetail.statusVoided', 'Voided')
                  : t('kvittoDetail.statusPending', 'Pending')}
              </span>
              {receipt.confirmedAt && (
                <span className="text-xs ml-2" style={{ color: 'var(--color-text-faint)' }}>
                  {new Date(receipt.confirmedAt).toLocaleString('sv-SE', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {/* The kvitto itself */}
            <KvittoView receipt={receipt} merchant={merchant} />

            {receipt.txHash && (
              <div className="text-[10px] break-all mt-2"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('kvittoDetail.txHash', 'Chain tx')}: {receipt.txHash}
              </div>
            )}

            {flash && (
              <p className="text-xs mt-3 text-center"
                 style={{ color: 'var(--color-text-muted)' }}>{flash}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={handleShare} disabled={busy}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-accent)',
                               color: 'var(--color-accent-fg)',
                               opacity: busy ? 0.6 : 1 }}>
                {t('kvittoDetail.share', 'Share')}
              </button>
              <button type="button" onClick={handlePrint} disabled={busy}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: '1px solid var(--color-border)',
                               color: 'var(--color-text)',
                               opacity: busy ? 0.6 : 1 }}>
                {t('kvittoDetail.print', 'Print / PDF')}
              </button>
            </div>

            {receipt.status === 'pending' && (
              <button type="button" onClick={attemptVoid} disabled={busy}
                      className="w-full py-3 mt-2 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'transparent', color: '#C0392B' }}>
                {t('kvittoDetail.void', 'Void this kvitto')}
              </button>
            )}
          </>
        )}
      </div>

      <PinPad open={showPin} mode="verify"
              title={t('kvittoDetail.pinTitle', 'Confirm with merchant PIN')}
              onCancel={() => setShowPin(false)}
              onConfirm={async () => {
                setShowPin(false);
                await doVoid();
              }} />
    </div>
  );
}
