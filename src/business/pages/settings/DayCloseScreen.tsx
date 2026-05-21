/**
 * DayCloseScreen — produce a signed Z-rapport for the window since
 * the previous close. SKVFS 2021:17/18 requires this; the bokföring-
 * skonsult expects one Z-rapport + one SIE 4 file per day.
 *
 * Flow:
 *   1. Show "Day close preview" — counts + totals for the open window
 *      (since lastZ.closedAt). Updates as the merchant taps Refresh.
 *   2. "Close day" button signs the report via the active wallet's
 *      Ed25519 key, persists it, and shows the Z details.
 *   3. After close: "Download SIE 4" generates the accounting file
 *      and shares it via Capacitor Share / browser download. "Email"
 *      pre-fills a mail-to to the bokföringskonsult.
 *
 * The list of past Z reports is also surfaced so the merchant can
 * resend a previous file to their accountant.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  closeDay, lastZReport, listZReports,
} from '../../services/z-reports';
import { buildSieForZ } from '../../services/sie-export';
import { listReceipts } from '../../services/receipts';
import { listRefunds } from '../../services/refunds';
import { loadConfig } from '../../services/merchant';
import { isPinSet } from '../../services/pin';
import PinPad from '../../components/PinPad';
import { formatZNumber, type ZReport, type MerchantConfig } from '../../services/types';

interface Props { onBack: () => void; }

interface Preview {
  windowOpenedAt: number;
  receiptsCount: number;
  refundsCount: number;
  salesGrossSek: number;
  refundsGrossSek: number;
}

function formatDateTime(ms: number): string {
  if (ms === 0) return '—';
  return new Date(ms).toLocaleString('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function DayCloseScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<MerchantConfig | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [past, setPast] = useState<ZReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [justClosed, setJustClosed] = useState<ZReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  async function refresh() {
    const [cfg, lastZ, allReceipts, allRefunds, history] = await Promise.all([
      loadConfig(), lastZReport(), listReceipts(2000), listRefunds(2000), listZReports(20),
    ]);
    setConfig(cfg);
    setPast(history);
    const opened = lastZ?.closedAt ?? 0;
    const r = allReceipts.filter(r => r.createdAt > opened && r.status !== 'voided');
    const k = allRefunds.filter(k => k.createdAt > opened && k.status !== 'voided');
    setPreview({
      windowOpenedAt: opened,
      receiptsCount: r.length,
      refundsCount: k.length,
      salesGrossSek: r.reduce((s, x) => s + x.amountSek, 0),
      refundsGrossSek: k.reduce((s, x) => s + x.amountSek, 0),
    });
  }

  useEffect(() => { void refresh(); }, []);

  async function attemptClose() {
    // If a merchant PIN is set, gate the day-close behind it.
    // SKVFS-shaped audit trail benefits from this — only the till
    // holder can close the day, not a passer-by who picked up the
    // till mid-shift.
    if (await isPinSet()) {
      setShowPin(true);
    } else {
      await doClose();
    }
  }

  async function doClose() {
    setError(null); setBusy(true);
    try {
      const z = await closeDay();
      setJustClosed(z);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadSie(z: ZReport) {
    try {
      const sie = await buildSieForZ(z);
      const filename = `${formatZNumber(z.zNumber)}-${config?.orgNr ?? 'merchant'}.sie`;
      // Browser path — creates a Blob and a hidden link.
      const blob = new Blob([sie], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function emailToAccountant(z: ZReport) {
    const sie = await buildSieForZ(z);
    const subject = encodeURIComponent(
      t('dayClose.emailSubject', { zNumber: formatZNumber(z.zNumber), defaultValue: 'Z-rapport {{zNumber}} + SIE 4' }),
    );
    const body = encodeURIComponent(
      t('dayClose.emailBody', {
        zNumber: formatZNumber(z.zNumber),
        defaultValue: 'Attached: Z-rapport {{zNumber}} signed by the merchant wallet.\n\n— Paste the SIE 4 file content below into your accounting software (Bokio / Fortnox / Visma).',
      }),
    );
    const sieEncoded = encodeURIComponent(sie);
    const mailto = `mailto:${config?.kvittoEmail ?? ''}?subject=${subject}&body=${body}%0A%0A%0A${sieEncoded}`;
    window.location.href = mailto;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('dayClose.title', 'Day close')}
          </h2>
        </div>

        {justClosed ? (
          <div className="rounded-xl p-4 mb-4"
               style={{ backgroundColor: 'rgba(45,212,168,0.08)',
                        border: '1px solid rgba(45,212,168,0.32)' }}>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
              {t('dayClose.signedTitle', 'Z report signed')} · {formatZNumber(justClosed.zNumber)}
            </div>
            <div className="text-xs space-y-1 mb-3" style={{ color: 'var(--color-text-muted)' }}>
              <div>{t('dayClose.window', 'Window')}: {formatDateTime(justClosed.openedAt)} → {formatDateTime(justClosed.closedAt)}</div>
              <div>{t('dayClose.sales', 'Sales')}: {justClosed.salesGrossSek.toFixed(2)} SEK ({justClosed.toKvittoNumber - justClosed.fromKvittoNumber + 1} kvittos)</div>
              <div>{t('dayClose.refunds', 'Refunds')}: {justClosed.refundsGrossSek.toFixed(2)} SEK ({justClosed.refundsCount} kreditnotor)</div>
              <div>{t('dayClose.vat', 'VAT')}: 25%={justClosed.vatSek25.toFixed(2)} · 12%={justClosed.vatSek12.toFixed(2)} · 6%={justClosed.vatSek6.toFixed(2)} SEK</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => downloadSie(justClosed)}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-accent)',
                               color: 'var(--color-accent-fg)' }}>
                {t('dayClose.downloadSie', 'Download SIE 4')}
              </button>
              <button type="button" onClick={() => emailToAccountant(justClosed)}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: '1px solid var(--color-border)',
                               color: 'var(--color-text)' }}>
                {t('dayClose.email', 'Email accountant')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl p-4 mb-4"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <div className="text-xs uppercase tracking-wider mb-2"
                   style={{ color: 'var(--color-text-faint)' }}>
                {t('dayClose.preview', 'Open window')}
              </div>
              {preview ? (
                <div className="space-y-1 text-sm" style={{ color: 'var(--color-text)' }}>
                  <div>{t('dayClose.since', 'Since')}: {formatDateTime(preview.windowOpenedAt)}</div>
                  <div>{t('dayClose.kvittos', 'Kvittos')}: {preview.receiptsCount} · {preview.salesGrossSek.toFixed(2)} SEK</div>
                  <div>{t('dayClose.kreditnotor', 'Kreditnotor')}: {preview.refundsCount} · {preview.refundsGrossSek.toFixed(2)} SEK</div>
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('common.loading', 'Loading…')}
                </div>
              )}
            </div>
            {error && (
              <p className="text-xs mb-3" style={{ color: '#C0392B' }}>{error}</p>
            )}
            <button type="button" onClick={attemptClose}
                    disabled={busy || !preview || preview.receiptsCount === 0}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-accent)',
                             color: 'var(--color-accent-fg)',
                             opacity: (busy || !preview || preview.receiptsCount === 0) ? 0.6 : 1 }}>
              {busy ? t('common.working', 'Working…') : t('dayClose.close', 'Close day · sign Z report')}
            </button>
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              {t('dayClose.hint',
                'Signs the day\'s sales with your merchant wallet (Ed25519). The resulting Z report is the audit-defensible bookkeeping voucher for the window. SKVFS 2021:17/18 requires this for kassaregister.')}
            </p>
          </>
        )}

        {past.length > 0 && (
          <>
            <h3 className="text-sm font-bold uppercase tracking-wider mt-6 mb-2"
                style={{ color: 'var(--color-text-faint)' }}>
              {t('dayClose.history', 'Past Z reports')}
            </h3>
            <div className="flex flex-col gap-2">
              {past.filter(z => !justClosed || z.zNumber !== justClosed.zNumber).map((z) => (
                <button key={z.zNumber} type="button" onClick={() => downloadSie(z)}
                        className="rounded-xl p-3 flex items-center justify-between text-left"
                        style={{ backgroundColor: 'var(--color-surface)',
                                 border: '1px solid var(--color-border)' }}>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                      {formatZNumber(z.zNumber)}
                    </div>
                    <div className="text-xs mt-0.5 truncate"
                         style={{ color: 'var(--color-text-muted)' }}>
                      {formatDateTime(z.closedAt)} · {z.salesGrossSek.toFixed(2)} SEK
                    </div>
                  </div>
                  <span className="text-xs font-semibold"
                        style={{ color: 'var(--color-accent)' }}>
                    SIE 4
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <PinPad open={showPin} mode="verify"
              title="Confirm with merchant PIN"
              onCancel={() => setShowPin(false)}
              onConfirm={async () => {
                setShowPin(false);
                await doClose();
              }} />
    </div>
  );
}
