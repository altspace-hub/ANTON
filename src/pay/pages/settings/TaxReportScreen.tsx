/**
 * TaxReportScreen — annual report preview + adviser export (#78, ported
 * from Comm, with a raw-ledger CSV path added for non-bundled jurisdictions).
 *
 * Produces a K4 section D dataset (Sweden) or the cross-jurisdiction ledger
 * CSV (anywhere bundled). For an unsupported jurisdiction the engine refuses
 * with no numbers — but the user can still export the raw windowed ledger CSV
 * for a local adviser (§8.3).
 *
 * Export hands the CSV body to @capacitor/share (native chooser), with a Blob
 * download fallback on the web.
 *
 * Hard-rule surfaces preserved: estimate-only framing (§2.1), disclaimer
 * always visible, rule version, review-required reasons.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { tax } from '@futurechain/sdk';
import { loadResidency, type TaxResidency } from '../../services/tax-residency';
import {
  currentTaxYearForRule,
  taxYearBoundsForRule,
  calendarYearBounds,
  buildTaxInputs,
  rawLedgerCsv,
} from '../../services/tax-bridge';
import { shareFile } from '../../services/share';
import { loadFtcClassification } from '../../services/ftc-classification';

interface Props {
  onBack: () => void;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'no-residency' }
  | { state: 'unsupported'; residency: TaxResidency; message: string }
  | { state: 'ready'; residency: TaxResidency; result: tax.TaxComputationResult; year: number };

const ADVISER_THRESHOLD_SEK = 50_000;

export default function TaxReportScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });
  const [exporting, setExporting] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void compute();
  }, []);

  async function compute() {
    const residency = await loadResidency();
    if (!residency) {
      setLoad({ state: 'no-residency' });
      return;
    }
    const rule = tax.getBundledRule(residency.jurisdictionCode);
    if (!rule) {
      setLoad({
        state: 'unsupported',
        residency,
        message: t('tax.reportUnsupported', { name: residency.jurisdictionName }),
      });
      return;
    }
    const year = currentTaxYearForRule(rule);
    const { fromTs, toTs } = taxYearBoundsForRule(rule, year);
    const taxInputs = await buildTaxInputs(fromTs, toTs);
    const ftcClassification = await loadFtcClassification();
    const result = tax.computeTaxPosition({
      rule,
      transactions: taxInputs,
      options: { ftc_classification: ftcClassification },
      adviserReferralThresholdFiat: ADVISER_THRESHOLD_SEK,
      locale: residency.jurisdictionCode === 'SE' ? 'sv' : 'en',
    });
    if (tax.isRefused(result)) {
      setLoad({ state: 'unsupported', residency, message: result.message });
      return;
    }
    setLoad({ state: 'ready', residency, result, year });
  }

  async function exportK4() {
    if (load.state !== 'ready') return;
    setExporting('k4');
    setStatus(null);
    try {
      const ds = tax.buildK4Dataset(load.result, { taxYear: load.year });
      const csv = tax.buildK4Csv(ds);
      const filename = `anton-k4-${load.year}.csv`;
      await shareFile(
        { filename, mimeType: 'text/csv', body: csv },
        { title: `K4 · ${load.year}` },
      );
      setStatus(t('tax.reportExportedK4', { filename, count: ds.rows.length }));
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setExporting(null);
    }
  }

  async function exportLedger() {
    if (load.state !== 'ready') return;
    setExporting('ledger');
    setStatus(null);
    try {
      const csv = tax.buildLedgerCsv(load.result);
      const filename = `anton-ledger-${load.residency.jurisdictionCode}-${load.year}.csv`;
      await shareFile(
        { filename, mimeType: 'text/csv', body: csv },
        { title: `Tax ledger · ${load.year}` },
      );
      setStatus(t('tax.reportExported', { filename }));
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setExporting(null);
    }
  }

  /** Unsupported jurisdiction (§8.3): no engine numbers, but export the raw
   *  windowed ledger so a local adviser has the data. Calendar-year window
   *  since there's no rule to define a fiscal calendar. */
  async function exportRaw() {
    if (load.state !== 'unsupported') return;
    setExporting('raw');
    setStatus(null);
    try {
      const year = new Date().getUTCFullYear();
      const { fromTs, toTs } = calendarYearBounds(year);
      const inputs = await buildTaxInputs(fromTs, toTs);
      if (inputs.length === 0) {
        // Nothing this calendar year — don't ship a header-only CSV under a
        // false "Exported" success. Tell the user there's nothing to export.
        setStatus(t('tax.reportNoDisposals'));
        return;
      }
      const csv = rawLedgerCsv(inputs);
      const filename = `anton-ledger-${load.residency.jurisdictionCode}-${year}.csv`;
      await shareFile(
        { filename, mimeType: 'text/csv', body: csv },
        { title: `Tax ledger · ${year}` },
      );
      setStatus(t('tax.reportExported', { filename }));
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setExporting(null);
    }
  }

  if (load.state === 'loading') {
    return (
      <section className="flex flex-col h-full items-center justify-center">
        <span className="text-sm text-[var(--color-text-faint)]">{t('tax.computing')}</span>
      </section>
    );
  }

  if (load.state === 'no-residency') {
    return (
      <section className="flex flex-col h-full safe-bottom">
        <Header title={t('tax.reportTitle')} onBack={onBack} />
        <div className="px-5 pt-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            {t('tax.reportNoResidency')}
          </p>
        </div>
      </section>
    );
  }

  if (load.state === 'unsupported') {
    return (
      <section className="flex flex-col h-full overflow-y-auto safe-bottom">
        <Header title={t('tax.reportTitle')} onBack={onBack} />
        <div className="px-5 pt-2 pb-5">
          <ResidencyChip residency={load.residency} />
          <div className="mt-4 p-4 rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-dim)]">
            <div className="text-xs uppercase tracking-wider mb-1 text-[var(--color-gold)] font-bold">
              {t('tax.referLocalAdviser')}
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text-body)]">
              {load.message}
            </p>
          </div>
          <button
            type="button"
            onClick={exportRaw}
            disabled={exporting !== null}
            className="mt-4 w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] transition-opacity"
            style={{ opacity: exporting === 'raw' ? 0.5 : 1 }}
          >
            {exporting === 'raw' ? t('tax.exporting') : t('tax.exportLedgerCsv')}
          </button>
          {status && (
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">{status}</p>
          )}
          <p className="mt-4 text-[11px] text-[var(--color-text-faint)] leading-relaxed">
            {t('tax.unsupportedHistoryNote')}
          </p>
        </div>
      </section>
    );
  }

  const { result, residency, year } = load;
  const a = result.annual;
  const disposalCount = result.perTransaction.length;
  const isSE = residency.jurisdictionCode === 'SE';

  return (
    <section className="flex flex-col h-full overflow-y-auto safe-bottom">
      <Header title={t('tax.reportTitle')} onBack={onBack} />

      <div className="px-5 pt-1 pb-5">
        <ResidencyChip residency={residency} />

        <div className="mt-4 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
            {isSE
              ? t('tax.reportK4Label', { year })
              : t('tax.reportLedgerLabel', { year })}
          </div>
          <div className="mt-2 text-base text-[var(--color-text-body)] leading-relaxed">
            {disposalCount === 0
              ? t('tax.reportNoDisposals')
              : t('tax.reportSummary', { count: disposalCount, tax: fmt(a.estimatedTaxFiat), ccy: a.fiatCurrency })}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-soft)] text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            {t('tax.reportHandOff')}
          </div>
        </div>

        {isSE && (
          <button
            type="button"
            onClick={exportK4}
            disabled={exporting !== null}
            className="mt-4 w-full py-4 rounded-xl font-bold text-base text-[var(--color-accent-fg)] bg-[var(--color-accent)] transition-opacity"
            style={{ opacity: exporting === 'k4' ? 0.5 : 1 }}
          >
            {exporting === 'k4' ? t('tax.exporting') : t('tax.exportK4Csv')}
          </button>
        )}
        <button
          type="button"
          onClick={exportLedger}
          disabled={exporting !== null}
          className="mt-2 w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] transition-opacity"
          style={{ opacity: exporting === 'ledger' ? 0.5 : 1 }}
        >
          {exporting === 'ledger'
            ? t('tax.exporting')
            : isSE ? t('tax.exportRawLedgerCsv') : t('tax.exportLedgerCsv')}
        </button>

        {status && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">{status}</p>
        )}

        {result.reviewRequired && (
          <div className="mt-4 p-3 rounded-lg border border-[var(--color-gold)] bg-[var(--color-gold-dim)]">
            <div className="text-xs font-semibold text-[var(--color-gold)] mb-1">
              {t('tax.reviewBeforeFiling')}
            </div>
            <ul className="text-[12px] leading-relaxed text-[var(--color-text-body)] list-disc pl-4">
              {result.reviewReasons.map((r) => (
                <li key={r} className="font-mono break-words">{humaniseReason(r, t)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border-soft)]">
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
              {t('tax.ruleVersion')}
            </span>
            <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
              {result.ruleVersion}
            </span>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] mb-2 font-bold">
            {t('tax.disclaimerInExport')}
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-body)]">
            {result.disclaimer}
          </p>
        </div>
      </div>
    </section>
  );
}

function ResidencyChip({ residency }: { residency: TaxResidency }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          {t('tax.residency')}
        </div>
        <div className="text-sm font-medium text-[var(--color-text)]">
          {residency.jurisdictionName}{' '}
          <span className="font-mono text-[var(--color-text-muted)]">({residency.jurisdictionCode})</span>
        </div>
      </div>
    </div>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-2">
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

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function humaniseReason(raw: string, t: TFunction): string {
  if (raw.startsWith('estimated_tax_above_threshold_')) {
    return t('tax.reasonAboveThreshold', { threshold: raw.slice('estimated_tax_above_threshold_'.length) });
  }
  if (raw.startsWith('rule_confidence_')) {
    return t('tax.reasonConfidence', { level: raw.slice('rule_confidence_'.length) });
  }
  if (raw.startsWith('review_flag_')) {
    return raw.slice('review_flag_'.length).replace(/_/g, ' ');
  }
  return raw;
}
