/**
 * TaxPositionScreen — current-year tax position.
 *
 * Pulls residency + this-year's ledger, calls computeTaxPosition()
 * from @futurechain/sdk/tax, renders the AnnualSummary.
 *
 * Compliance surfaces baked in per FUTURECHAIN_TAX_RULES.md hard rules:
 *   - §3 disclaimer ALWAYS visible at the bottom of the page
 *   - "Estimated tax" framing — never "tax bill" per §2.1
 *   - Rule version (`last_verified`) + stale banner if > 90 days old
 *   - `reviewRequired` → yellow callout listing reasons
 *   - RefusalResult (§8.3) → message + CSV-export-only path,
 *     no numbers shown
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { tax } from '@futurechain/sdk';
import { loadResidency, type TaxResidency } from '../../services/tax-residency';
import { listTxsByRange } from '../../services/transactions';
import {
  currentTaxYearForRule,
  taxYearBoundsForRule,
  toTaxInputTxs,
} from '../../services/tax-bridge';
import {
  loadFtcClassification,
  saveFtcClassification,
  type FtcClassification,
} from '../../services/ftc-classification';

interface Props {
  onBack: () => void;
  onChangeResidency: () => void;
  onExportReport: () => void;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'no-residency' }
  | { state: 'unsupported'; residency: TaxResidency; message: string }
  | { state: 'ready'; residency: TaxResidency; result: tax.TaxComputationResult; year: number };

const STALE_DAYS = 90;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
/** Per §2.2 the spec's default referral threshold is €5k equivalent.
 *  Until we have a rate oracle we use SEK as the local-currency proxy
 *  with a conservative 50_000 SEK ≈ €4.5k threshold. */
const ADVISER_THRESHOLD_SEK = 50_000;

export default function TaxPositionScreen({ onBack, onChangeResidency, onExportReport }: Props) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<LoadState>({ state: 'loading' });

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
      // Unsupported jurisdiction — engine would return RefusalResult
      // anyway, but we short-circuit so the user gets a clear screen
      // without needing to construct a placeholder rule.
      setLoad({
        state: 'unsupported',
        residency,
        message:
          `Tax calculation for ${residency.jurisdictionName} is not currently ` +
          `supported in this version. Your transactions are still recorded and ` +
          `can be exported for use by a local tax adviser. We recommend ` +
          `consulting a qualified crypto tax specialist in ${residency.jurisdictionName} ` +
          `before filing.`,
      });
      return;
    }

    const year = currentTaxYearForRule(rule);
    const { fromTs, toTs } = taxYearBoundsForRule(rule, year);
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
        <Header title={t('tax.title')} onBack={onBack} />
        <div className="px-5 pt-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            {t('tax.setResidencyPrompt')}
          </p>
          <button
            type="button"
            onClick={onChangeResidency}
            className="mt-4 w-full py-3 rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-semibold"
          >
            {t('tax.setResidency')}
          </button>
        </div>
      </section>
    );
  }

  if (load.state === 'unsupported') {
    return (
      <section className="flex flex-col h-full safe-bottom overflow-y-auto">
        <Header title={t('tax.title')} onBack={onBack} />
        <div className="px-5 pt-2 pb-5">
          <ResidencyChip residency={load.residency} onChange={onChangeResidency} />
          <div className="mt-4 p-4 rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-dim)]">
            <div className="text-xs uppercase tracking-wider mb-1 text-[var(--color-gold)] font-bold">
              {t('tax.referLocalAdviser')}
            </div>
            <p className="text-sm leading-relaxed text-[var(--color-text-body)]">
              {load.message}
            </p>
          </div>
          <p className="mt-4 text-[11px] text-[var(--color-text-faint)] leading-relaxed">
            {t('tax.unsupportedHistoryNote')}
          </p>
        </div>
      </section>
    );
  }

  // Ready
  const { result, residency, year } = load;
  const a = result.annual;
  const ruleStale = isStale(result.ruleVersion);

  return (
    <section className="flex flex-col h-full overflow-y-auto safe-bottom">
      <Header title={t('tax.title')} onBack={onBack} />

      <div className="px-5 pt-1 pb-3">
        <ResidencyChip residency={residency} onChange={onChangeResidency} />

        <div className="mt-4 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5">
          <div className="flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-wider text-[var(--color-text-faint)]">
              {t('tax.estimatedTaxYear', { year })}
            </span>
            <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
              {a.fiatCurrency}
            </span>
          </div>
          <div className="mt-1 text-4xl font-semibold tabular-nums text-[var(--color-text)]">
            {fmt(a.estimatedTaxFiat)}
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-text-faint)] italic">
            {t('tax.estimateOnly')}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatCard label={t('tax.gains')}          value={fmt(a.totalGainsFiat)} ccy={a.fiatCurrency} />
          <StatCard label={t('tax.losses')}         value={fmt(a.totalLossesFiat)} ccy={a.fiatCurrency} />
          <StatCard label={t('tax.netTaxable')}     value={fmt(a.netTaxableGainsFiat)} ccy={a.fiatCurrency} />
          <StatCard label={t('tax.longTermExempt')} value={fmt(a.longTermExemptGainsFiat)} ccy={a.fiatCurrency} />
        </div>

        {a.exemptionApplied > 0 && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {t('tax.exemptionApplied', { amount: fmt(a.exemptionApplied), ccy: a.fiatCurrency })}
          </p>
        )}
        {a.carryForwardLossesFiat > 0 && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t('tax.carryForward', { amount: fmt(a.carryForwardLossesFiat), ccy: a.fiatCurrency })}
          </p>
        )}

        {result.reviewRequired && (
          <div className="mt-4 p-3 rounded-lg border border-[var(--color-gold)] bg-[var(--color-gold-dim)]">
            <div className="text-xs font-semibold text-[var(--color-gold)] mb-1">
              {t('tax.reviewRecommended')}
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
            <span
              className="text-[11px] font-mono"
              style={{ color: ruleStale ? 'var(--color-gold)' : 'var(--color-text-muted)' }}
            >
              {result.ruleVersion}{ruleStale ? ` · ${t('tax.stale')}` : ''}
            </span>
          </div>
          {ruleStale && (
            <p className="mt-1 text-[11px] text-[var(--color-text-body)]">
              {t('tax.staleNote', { days: STALE_DAYS })}
            </p>
          )}
        </div>

        <FtcClassificationToggle
          current={result.ftcClassification}
          emtEnabledHere={hasEmtCarveOut(result)}
          onToggle={async (next) => {
            await saveFtcClassification(next);
            // Re-run the computation so the rates flip live.
            setLoad({ state: 'loading' });
            await compute();
          }}
        />

        <PerTxSection entries={result.perTransaction} ccy={a.fiatCurrency} />

        <div className="mt-6 p-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)] mb-2 font-bold">
            {t('tax.disclaimer')}
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-body)]">
            {result.disclaimer}
          </p>
        </div>

        <button
          type="button"
          onClick={onExportReport}
          className="mt-4 w-full py-3 rounded-xl font-semibold text-sm bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] active:scale-[0.99] transition-transform"
        >
          {t('tax.exportReport')}
        </button>
      </div>
    </section>
  );
}

function PerTxSection({
  entries, ccy,
}: { entries: tax.PerTxResult[]; ccy: string }) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return (
      <p className="mt-4 text-sm text-[var(--color-text-faint)] text-center">
        {t('tax.noTaxableEvents')}
      </p>
    );
  }
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">
        {t('tax.disposals', { count: entries.length })}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <li key={e.txId}
              className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-mono text-[var(--color-text-faint)] truncate">
                {new Date(e.ts).toISOString().slice(0, 10)}
              </span>
              <span
                className="text-sm font-mono tabular-nums"
                style={{
                  color: e.effectiveGainLossFiat >= 0
                    ? 'var(--color-text)'
                    : 'var(--color-red)',
                }}
              >
                {e.effectiveGainLossFiat >= 0 ? '+' : ''}
                {fmt(e.effectiveGainLossFiat)} {ccy}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-[var(--color-text-muted)] font-mono">
              <span>{t('tax.basisProceeds', { basis: fmt(e.costBasisFiat), proceeds: fmt(e.proceedsFiat) })}</span>
              <span>{t('tax.taxLabel', { amount: fmt(e.taxFiat) })}</span>
            </div>
            {e.longTerm && (
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-green)]">
                {t('tax.longTerm')}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({ label, value, ccy }: { label: string; value: string; ccy: string }) {
  return (
    <div className="p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums text-[var(--color-text)]">
        {value}
        <span className="ml-1 text-[10px] font-mono text-[var(--color-text-faint)]">{ccy}</span>
      </div>
    </div>
  );
}

function ResidencyChip({
  residency, onChange,
}: { residency: TaxResidency; onChange: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center justify-between w-full p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]"
    >
      <div className="text-left">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          {t('tax.residency')}
        </div>
        <div className="text-sm font-medium text-[var(--color-text)]">
          {residency.jurisdictionName} <span className="font-mono text-[var(--color-text-muted)]">({residency.jurisdictionCode})</span>
        </div>
      </div>
      <span className="text-xs text-[var(--color-accent)]">{t('common.change')}</span>
    </button>
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

function isStale(isoDate: string): boolean {
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > STALE_MS;
}

function humaniseReason(raw: string, t: TFunction): string {
  if (raw.startsWith('estimated_tax_above_threshold_')) {
    const threshold = raw.slice('estimated_tax_above_threshold_'.length);
    return t('tax.reasonAboveThreshold', { threshold });
  }
  if (raw.startsWith('rule_confidence_')) {
    return t('tax.reasonConfidence', { level: raw.slice('rule_confidence_'.length) });
  }
  if (raw.startsWith('review_flag_')) {
    return raw.slice('review_flag_'.length).replace(/_/g, ' ');
  }
  return raw;
}

/** Does the user's current jurisdiction rule have the EMT carve-out
 *  enabled? Italy is the canonical case today. When false, flipping
 *  the toggle won't change the rate — the toggle still works (it
 *  affects future jurisdictions automatically), but we surface that
 *  fact so the user isn't surprised. */
function hasEmtCarveOut(result: tax.TaxComputationResult): boolean {
  const rule = tax.getBundledRule(result.jurisdictionCode);
  return !!rule?.exemptions_and_reliefs.emt_special_treatment.enabled;
}

function FtcClassificationToggle({
  current,
  emtEnabledHere,
  onToggle,
}: {
  current: FtcClassification;
  emtEnabledHere: boolean;
  onToggle: (next: FtcClassification) => void;
}) {
  const { t } = useTranslation();
  const next: FtcClassification = current === 'utility_token' ? 'emt' : 'utility_token';
  const isEmt = current === 'emt';
  return (
    <div className="mt-3 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-soft)]">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            {t('tax.ftcClassification')}
          </div>
          <div className="text-sm font-medium text-[var(--color-text)]">
            {isEmt ? t('tax.emtToken') : t('tax.utilityToken')}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(next)}
          className="text-xs text-[var(--color-accent)] font-semibold ml-3 shrink-0"
        >
          {next === 'emt' ? t('tax.switchToEmt') : t('tax.switchToUtility')}
        </button>
      </div>
      {emtEnabledHere ? (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          {t('tax.emtEnabledNote')}
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-faint)]">
          {t('tax.emtDisabledNote')}
        </p>
      )}
    </div>
  );
}
