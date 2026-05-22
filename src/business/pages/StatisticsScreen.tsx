/**
 * StatisticsScreen — sales analytics dashboard.
 *
 * A period selector drives every panel below it:
 *   • Summary cards — gross, sales count, average sale, VAT, refunds,
 *     with a period-over-period delta where one exists.
 *   • Trend bar chart — gross sales bucketed by hour/day/week/month.
 *   • Top items — the best sellers by gross revenue.
 *   • Category donut — revenue share by item segment.
 *   • VAT breakdown — net + VAT per rate (handy for the accountant).
 *   • Busiest hours — 24h heat strip.
 *
 * All figures are computed live from the receipt + refund stores via
 * services/stats.ts — no rolled-up store, no schema change.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, DonutChart, HeatStrip } from '../components/Charts';
import { loadItems } from '../services/items';
import {
  loadStatsBundle, resolvePeriod, previousRange, summarise, trend,
  topItems, revenueByCategory, revenueByVatRate, hourHistogram,
  type StatsBundle, type StatsPeriod, type SalesSummary,
} from '../services/stats';

interface Props {
  onBack: () => void;
}

const PERIODS: StatsPeriod[] = ['today', 'week', 'month', 'quarter', 'year', 'all'];

export default function StatisticsScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [bundle, setBundle] = useState<StatsBundle | null>(null);
  const [nameToCategory, setNameToCategory] = useState<Map<string, string>>(new Map());
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [b, items] = await Promise.all([loadStatsBundle(), loadItems()]);
      const map = new Map<string, string>();
      for (const it of items) {
        if (it.category) map.set(it.name, it.category);
      }
      setBundle(b);
      setNameToCategory(map);
      setLoading(false);
    })();
  }, []);

  const view = useMemo(() => {
    if (!bundle) return null;
    const range = resolvePeriod(period);
    const summary = summarise(bundle.receipts, bundle.refunds, range);
    const prev = previousRange(range);
    const prevSummary = period === 'all'
      ? null
      : summarise(bundle.receipts, bundle.refunds, prev);
    return {
      range,
      summary,
      prevSummary,
      trend: trend(bundle.receipts, range),
      top: topItems(bundle.receipts, range, 8),
      categories: revenueByCategory(bundle.receipts, range, nameToCategory),
      vatRates: revenueByVatRate(bundle.receipts, range),
      hours: hourHistogram(bundle.receipts, range),
    };
  }, [bundle, period, nameToCategory]);

  function periodLabel(p: StatsPeriod): string {
    return t(`stats.period.${p}`, {
      today: 'Today', week: 'Week', month: 'Month',
      quarter: 'Quarter', year: 'Year', all: 'All time',
    }[p]);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-4">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back', 'Back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('stats.title', 'Statistics')}
          </h2>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 overflow-x-auto mb-4 -mx-1 px-1 pb-1">
          {PERIODS.map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: period === p ? 'var(--color-accent)' : 'var(--color-surface)',
                      color: period === p ? 'var(--color-accent-fg)' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                    }}>
              {periodLabel(p)}
            </button>
          ))}
        </div>

        {loading || !view ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('common.loading', 'Loading…')}
          </p>
        ) : view.summary.saleCount === 0 ? (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('stats.empty', 'No sales in this period yet.')}
            </p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <SummaryCard
                label={t('stats.gross', 'Gross sales')}
                value={`${view.summary.grossSek.toFixed(0)} SEK`}
                delta={delta(view.summary.grossSek, view.prevSummary?.grossSek)} />
              <SummaryCard
                label={t('stats.saleCount', 'Sales')}
                value={String(view.summary.saleCount)}
                delta={delta(view.summary.saleCount, view.prevSummary?.saleCount)} />
              <SummaryCard
                label={t('stats.avgSale', 'Average sale')}
                value={`${view.summary.avgSaleSek.toFixed(0)} SEK`}
                delta={delta(view.summary.avgSaleSek, view.prevSummary?.avgSaleSek)} />
              <SummaryCard
                label={t('stats.vat', 'VAT collected')}
                value={`${view.summary.vatSek.toFixed(0)} SEK`}
                delta={null} />
            </div>

            {(view.summary.refundCount > 0) && (
              <div className="rounded-xl p-3 mb-4 text-xs flex justify-between"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-muted)' }}>
                <span>
                  {t('stats.refunds', '{{count}} refunds', { count: view.summary.refundCount })}
                </span>
                <span style={{ color: 'var(--color-error)' }}>
                  −{view.summary.refundedSek.toFixed(2)} SEK
                </span>
              </div>
            )}

            {/* Trend */}
            <Panel title={t('stats.trend', 'Sales trend')}>
              <BarChart data={view.trend.map((b) => ({ label: b.label, value: b.grossSek }))}
                        valueFormat={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)} />
            </Panel>

            {/* Top items */}
            <Panel title={t('stats.topItems', 'Top items')}>
              <div className="flex flex-col gap-1.5">
                {view.top.map((it, i) => {
                  const maxGross = view.top[0]?.grossSek || 1;
                  const name = it.name === '__quick_sale__'
                    ? t('stats.quickSale', 'Quick sales')
                    : it.name;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="truncate" style={{ color: 'var(--color-text)' }}>
                          {name}
                        </span>
                        <span className="tabular ml-2" style={{ color: 'var(--color-text-muted)' }}>
                          {it.qty}× · {it.grossSek.toFixed(0)} SEK
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3,
                                    backgroundColor: 'var(--color-surface-muted)' }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          width: `${Math.max((it.grossSek / maxGross) * 100, 2)}%`,
                          backgroundColor: 'var(--color-accent)',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Category donut */}
            {view.categories.length > 0 && (
              <Panel title={t('stats.byCategory', 'Revenue by segment')}>
                <DonutChart
                  slices={view.categories.slice(0, 6).map((c) => ({
                    label: c.category === '__uncategorised__'
                      ? t('stats.uncategorised', 'Uncategorised')
                      : c.category,
                    value: c.grossSek,
                  }))}
                  centerValue={`${view.summary.grossSek.toFixed(0)}`}
                  centerLabel="SEK" />
              </Panel>
            )}

            {/* VAT breakdown */}
            {view.vatRates.length > 0 && (
              <Panel title={t('stats.byVat', 'VAT breakdown')}>
                <div className="flex flex-col gap-1">
                  {view.vatRates.map((v) => (
                    <div key={v.rate} className="flex justify-between text-xs">
                      <span style={{ color: 'var(--color-text-body)' }}>
                        {t('stats.vatRateRow', 'VAT {{rate}}% · net {{net}}',
                          { rate: v.rate, net: v.netSek.toFixed(2) })}
                      </span>
                      <span className="tabular font-semibold"
                            style={{ color: 'var(--color-text)' }}>
                        {v.vatSek.toFixed(2)} SEK
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Busiest hours */}
            <Panel title={t('stats.busiestHours', 'Busiest hours')}>
              <HeatStrip hours={view.hours} />
            </Panel>

            <p className="text-xs mt-1 text-center"
               style={{ color: 'var(--color-text-faint)' }}>
              {t('stats.itemsSoldFooter', '{{count}} items sold in this period',
                { count: view.summary.itemsSold })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-3"
         style={{ backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)' }}>
      <div className="text-xs font-bold uppercase tracking-wider mb-3"
           style={{ color: 'var(--color-text-faint)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SummaryCard({
  label, value, delta,
}: { label: string; value: string; delta: DeltaInfo | null }) {
  return (
    <div className="rounded-xl p-3"
         style={{ backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)' }}>
      <div className="text-xs" style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </div>
      <div className="text-lg font-bold mt-0.5 tabular"
           style={{ color: 'var(--color-text)' }}>
        {value}
      </div>
      {delta && (
        <div className="text-xs mt-0.5"
             style={{ color: delta.up ? 'var(--color-success)' : 'var(--color-error)' }}>
          {delta.up ? '▲' : '▼'} {delta.pct}
        </div>
      )}
    </div>
  );
}

interface DeltaInfo { up: boolean; pct: string; }

/** Period-over-period delta. null when there's no previous figure or
 *  the previous figure was zero (no meaningful percentage). */
function delta(current: number, previous: number | undefined): DeltaInfo | null {
  if (previous === undefined || previous === 0) return null;
  const change = (current - previous) / previous;
  if (!Number.isFinite(change) || Math.abs(change) < 0.005) return null;
  return {
    up: change > 0,
    pct: `${Math.abs(change * 100).toFixed(0)}%`,
  };
}
