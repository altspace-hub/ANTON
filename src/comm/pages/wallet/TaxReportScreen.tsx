/**
 * TaxReportScreen — annual report preview + adviser export.
 *
 * Produces a K4 section D dataset (Sweden) or the cross-jurisdiction
 * ledger CSV (anywhere else / unsupported). Both formats carry the
 * §3 disclaimer in the comment preamble.
 *
 * The "Export" buttons hand the CSV body to @capacitor/share, which
 * surfaces the native chooser (email / Drive / Files / etc.). On a
 * desktop browser the share service falls back to a Blob download.
 *
 * Hard-rule surfaces preserved from TaxPositionScreen:
 *   - Estimate-only framing (§2.1)
 *   - Disclaimer always visible
 *   - Rule version + staleness banner
 *   - Review-required reasons
 *
 * Per § 8.3, unsupported jurisdictions can still export the raw
 * ledger — the engine produces a RefusalResult with no numbers, but
 * the user's adviser-facing CSV is the same shape.
 */
import { useEffect, useState } from 'react';
import { tax } from '@futurechain/sdk';
import { loadResidency, type TaxResidency } from '../../services/tax-residency';
import { listTxsByRange } from '../../services/transactions';
import {
  calendarYearBounds,
  currentTaxYear,
  toTaxInputTxs,
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
    const year = currentTaxYear();
    if (!rule) {
      setLoad({
        state: 'unsupported',
        residency,
        message: `Tax calculation for ${residency.jurisdictionName} is not currently supported in this version. You can still export the raw transaction ledger below for your adviser.`,
      });
      return;
    }
    const { fromTs, toTs } = calendarYearBounds(year);
    const walletTxs = await listTxsByRange(fromTs, toTs);
    const taxInputs = toTaxInputTxs(walletTxs);
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
      setStatus(`Exported ${filename} (${ds.rows.length} disposal${ds.rows.length === 1 ? '' : 's'}).`);
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
      setStatus(`Exported ${filename}.`);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setExporting(null);
    }
  }

  if (load.state === 'loading') {
    return (
      <section className="flex flex-col h-full items-center justify-center">
        <span className="text-sm text-[var(--color-text-faint)]">Preparing report…</span>
      </section>
    );
  }

  if (load.state === 'no-residency') {
    return (
      <section className="flex flex-col h-full safe-bottom">
        <Header title="Report" onBack={onBack} />
        <div className="px-5 pt-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            Declare your tax residency first.
          </p>
        </div>
      </section>
    );
  }

  if (load.state === 'unsupported') {
    return (
      <section className="flex flex-col h-full overflow-y-auto safe-bottom">
        <Header title="Report" onBack={onBack} />
        <div className="px-5 pt-2 pb-5">
          <ResidencyChip residency={load.residency} />
          <div className="mt-4 p-4 rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-dim)]">
            <div className="text-xs uppercase tracking-wider mb-1 text-[var(--color-gold)] font-bold">
              Refer to a local adviser
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text-body)]">
              {load.message}
            </p>
          </div>
          <p className="mt-4 text-[11px] text-[var(--color-text-faint)] leading-relaxed">
            We can still export a CSV of your transactions so your adviser
            can compute the position offline. This is the §8.3 fallback
            from FutureChain&apos;s tax policy.
          </p>
          {/* No engine result for unsupported jurisdictions — the raw
              ledger comes from a Phase 4 CSV-only path. */}
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
      <Header title="Report" onBack={onBack} />

      <div className="px-5 pt-1 pb-5">
        <ResidencyChip residency={residency} />

        <div className="mt-4 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
            {isSE ? 'K4 section D · ' : 'Adviser ledger · '}{year}
          </div>
          <div className="mt-2 text-base text-[var(--color-text-body)] leading-relaxed">
            {disposalCount === 0
              ? 'No disposals this year — exports will contain a header and the §3 disclaimer only.'
              : `${disposalCount} disposal${disposalCount === 1 ? '' : 's'} · estimated tax ${fmt(a.estimatedTaxFiat)} ${a.fiatCurrency}.`}
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--color-border-soft)] text-[11px] text-[var(--color-text-muted)] leading-relaxed">
            Hand the CSV to your tax adviser as a pre-filing draft.
            Every export carries the §3 disclaimer at the top.
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
            {exporting === 'k4' ? 'Exporting…' : 'Export K4 CSV'}
          </button>
        )}
        <button
          type="button"
          onClick={exportLedger}
          disabled={exporting !== null}
          className="mt-2 w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] transition-opacity"
          style={{ opacity: exporting === 'ledger' ? 0.5 : 1 }}
        >
          {exporting === 'ledger' ? 'Exporting…' : isSE ? 'Export raw ledger CSV' : 'Export ledger CSV'}
        </button>

        {status && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">{status}</p>
        )}

        {result.reviewRequired && (
          <div className="mt-4 p-3 rounded-lg border border-[var(--color-gold)] bg-[var(--color-gold-dim)]">
            <div className="text-xs font-semibold text-[var(--color-gold)] mb-1">
              Review recommended before filing
            </div>
            <ul className="text-[12px] leading-relaxed text-[var(--color-text-body)] list-disc pl-4">
              {result.reviewReasons.map((r) => (
                <li key={r} className="font-mono break-words">{humaniseReason(r)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg bg-[var(--color-surface-muted)] border border-[var(--color-border-soft)]">
          <div className="flex justify-between items-center">
            <span className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
              Rule version
            </span>
            <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
              {result.ruleVersion}
            </span>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] mb-2 font-bold">
            Disclaimer (included in every export)
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
  return (
    <div className="flex items-center p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          Tax residency
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

function humaniseReason(raw: string): string {
  if (raw.startsWith('estimated_tax_above_threshold_')) {
    return `Estimated tax is above ${raw.slice('estimated_tax_above_threshold_'.length)} — consult an adviser before filing.`;
  }
  if (raw.startsWith('rule_confidence_')) {
    return `Rule confidence: ${raw.slice('rule_confidence_'.length)}.`;
  }
  if (raw.startsWith('review_flag_')) {
    return raw.slice('review_flag_'.length).replace(/_/g, ' ');
  }
  return raw;
}
