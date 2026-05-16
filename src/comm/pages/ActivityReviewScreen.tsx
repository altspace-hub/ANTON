/**
 * ActivityReviewScreen — the Comm user's spending pattern at a glance
 * plus a log of sends the light fraud engine flagged.
 *
 * Read-only and reflective: it helps the user notice anything that
 * looked unusual after the fact, alongside the baseline the engine
 * compares against. Reached from Settings → Activity review.
 *
 * Everything is derived on-device from the local wallet ledger — the
 * behaviour profile from loadBehaviorProfile(), the flagged list from
 * the `risk` snapshot stored on each `send` tx at confirm time.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTxs, loadBehaviorProfile, type WalletTx } from '../services/transactions';
import type { BehaviorProfile } from '../services/behavior-profile';

interface Props {
  onBack: () => void;
}

/** micro-FTC → "1.2345" display string. */
function formatFtc(microFtc: bigint): string {
  return (Number(microFtc) / 1_000_000).toFixed(4);
}

function formatDate(ms: number): string {
  if (ms <= 0) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function ActivityReviewScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [behavior, setBehavior] = useState<BehaviorProfile | null>(null);
  const [flagged, setFlagged] = useState<WalletTx[]>([]);

  useEffect(() => {
    void (async () => {
      const [b, txs] = await Promise.all([loadBehaviorProfile(), listTxs(1000)]);
      setBehavior(b);
      setFlagged(txs.filter(
        (tx) => tx.kind === 'send' && tx.risk !== undefined && tx.risk.signals.length > 0,
      ));
    })();
  }, []);

  return (
    <section className="flex flex-col h-full safe-bottom">
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <button type="button" onClick={onBack} className="p-2 rounded-lg" aria-label={t('common.back')}
                style={{ color: 'var(--color-text-muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          {t('activityReview.title')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-5">
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-5">
          {t('activityReview.subtitle')}
        </p>

        {/* Usual pattern */}
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
          {t('activityReview.patternHeading')}
        </h3>
        <div className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] overflow-hidden mb-6">
          <PatternRow label={t('activityReview.payments')}
                      value={String(behavior?.count ?? 0)} first />
          <PatternRow label={t('activityReview.median')}
                      value={`${formatFtc(behavior?.medianMicroFtc ?? 0n)} FTC`} />
          <PatternRow label={t('activityReview.largest')}
                      value={`${formatFtc(behavior?.maxMicroFtc ?? 0n)} FTC`} />
          <PatternRow label={t('activityReview.merchants')}
                      value={String(behavior?.knownCounterparties.length ?? 0)} />
          <PatternRow label={t('activityReview.lastPayment')}
                      value={formatDate(behavior?.lastPaymentAt ?? 0)} />
        </div>

        {/* Flagged payments */}
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-2">
          {t('activityReview.flaggedHeading')}
        </h3>
        {flagged.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5 text-center">
            <div className="text-sm font-semibold text-[var(--color-text)]">
              {t('activityReview.empty')}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">
              {t('activityReview.emptyBody')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {flagged.map((tx) => {
              const level = tx.risk?.level ?? 'clear';
              const accent = level === 'warning' ? 'var(--color-red)'
                : level === 'caution' ? 'var(--color-gold)'
                : 'var(--color-text-faint)';
              let microFtc = 0n;
              try { microFtc = BigInt(tx.amountMicroFtc); } catch { /* keep 0n */ }
              return (
                <div key={tx.id}
                     className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-3.5"
                     style={{ borderLeft: `3px solid ${accent}` }}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[var(--color-text)]">
                      {t('wallet.txKind.send')}
                    </div>
                    <div className="font-mono text-sm font-semibold text-[var(--color-text)]">
                      {formatFtc(microFtc)} FTC
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-[var(--color-text-muted)] mt-0.5 mb-2 break-all">
                    {tx.counterparty} · {formatDate(tx.ts)}
                  </div>
                  <div className="flex flex-col gap-1">
                    {(tx.risk?.signals ?? []).map((s) => (
                      <div key={s.id} className="text-xs text-[var(--color-text-body)]">
                        • {t(s.messageKey, s.params)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function PatternRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3"
         style={{ borderTop: first ? undefined : '1px solid var(--color-border-soft)' }}>
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="font-mono text-sm font-semibold text-[var(--color-text)]">{value}</span>
    </div>
  );
}
