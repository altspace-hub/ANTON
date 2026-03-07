import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart2,
  Activity,
  DollarSign,
  Zap,
  Layers,
  Brain,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────

interface OverviewData {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  uniqueModules: number;
  avgCostPerSession: number;
}

interface TimePoint {
  date: string;
  count: number;
}

interface ModuleUsage {
  moduleId: string;
  label: string;
  count: number;
  cost: number;
}

interface CostPoint {
  date: string;
  cost: number;
  tokens: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `€${n.toFixed(2)}`;
}

function abbreviateDate(dateStr: string, locale: string): string {
  // dateStr = "YYYY-MM-DD"
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

// ── Custom Tooltip ───────────────────────────────────────────────

interface TooltipPayload {
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatter?: (value: number) => string;
}

function CustomTooltip({ active, payload, label, formatter }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{ background: '#152238', border: '1px solid #2DD4A8', borderRadius: 6, padding: '8px 12px' }}
    >
      <p style={{ color: '#B0B0B0', fontSize: 12, marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#2DD4A8', fontSize: 13, margin: 0 }}>
          {formatter ? formatter(p.value ?? 0) : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-adv-card ${className}`}
      style={{ minHeight: 20 }}
    />
  );
}

// ── Stat Card ────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}

function StatCard({ icon, label, value, sub, loading }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-adv-card p-5 shadow-lg">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-sm text-adv-gray">{label}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="mb-2 h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-adv-off-white">{value}</div>
          {sub && <div className="mt-1 text-xs text-adv-gray">{sub}</div>}
        </>
      )}
    </div>
  );
}

// ── Chart Card ───────────────────────────────────────────────────

function ChartCard({ title, loading, children }: { title: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-adv-card p-5 shadow-lg">
      <h3 className="mb-4 text-sm font-semibold text-adv-off-white">{title}</h3>
      {loading ? <Skeleton className="h-64 w-full" /> : children}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { i18n } = useTranslation();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [sessionsOverTime, setSessionsOverTime] = useState<TimePoint[]>([]);
  const [moduleUsage, setModuleUsage] = useState<ModuleUsage[]>([]);
  const [costTrend, setCostTrend] = useState<CostPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('openexpert-token');
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.all([
      fetch('/api/analytics/overview', { headers }).then((r) => r.json()).catch(() => null),
      fetch('/api/analytics/sessions-over-time?days=30', { headers }).then((r) => r.json()).catch(() => []),
      fetch('/api/analytics/module-usage?limit=10', { headers }).then((r) => r.json()).catch(() => []),
      fetch('/api/analytics/cost-trend?days=30', { headers }).then((r) => r.json()).catch(() => []),
    ]).then(([ov, sot, mu, ct]) => {
      if (ov) setOverview(ov as OverviewData);
      setSessionsOverTime((sot as TimePoint[]) || []);
      setModuleUsage((mu as ModuleUsage[]) || []);
      setCostTrend((ct as CostPoint[]) || []);
      setLoading(false);
    });
  }, []);

  async function generateNarrative() {
    if (!overview) return;
    setNarrativeLoading(true);
    const token = localStorage.getItem('openexpert-token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    try {
      const r = await fetch('/api/ai-assist/analytics-narrative', {
        method: 'POST',
        headers,
        body: JSON.stringify({ overview, topModules: moduleUsage.slice(0, 5), costTrend: costTrend.slice(-7) }),
      });
      if (r.ok) {
        const data = await r.json() as { narrative: string };
        setNarrative(data.narrative);
      }
    } catch { /* ignore */ } finally { setNarrativeLoading(false); }
  }

  // ROI calculation
  const hoursPerSession = 4;
  const ratePerHour = 250;
  const estimatedValue = (overview?.totalSessions ?? 0) * hoursPerSession * ratePerHour;
  const daysSaved = Math.round(((overview?.totalSessions ?? 0) * hoursPerSession) / 8);

  // Abbreviated date for chart X axis
  const sessionChartData = sessionsOverTime.map((d) => ({
    ...d,
    label: abbreviateDate(d.date, i18n.language),
  }));

  const costChartData = costTrend.map((d) => ({
    ...d,
    label: abbreviateDate(d.date, i18n.language),
  }));

  // For horizontal bar chart, recharts needs width to be a number prop on Bar, not a %
  const moduleChartData = [...moduleUsage].reverse(); // so highest is at top

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
          <BarChart2 className="h-5 w-5 text-adv-teal" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-adv-off-white">Usage Analytics</h1>
          <p className="text-sm text-adv-gray">Track your openEXPERT usage, cost, and ROI</p>
        </div>
        <button
          onClick={generateNarrative}
          disabled={narrativeLoading || loading || !overview}
          className="flex items-center gap-2 rounded-lg border border-adv-teal/40 bg-adv-teal/10 px-3 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
          title="Let AI summarise your usage patterns in plain English"
        >
          {narrativeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          Narrate
        </button>
      </div>

      {/* AI narrative panel */}
      {narrative && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-4 w-4 text-adv-teal" />
            <span className="text-sm font-semibold text-adv-off-white">Usage Summary</span>
            <button onClick={() => setNarrative(null)} className="ml-auto text-xs text-adv-gray hover:text-adv-off-white transition-colors">Dismiss</button>
          </div>
          <p className="text-sm text-adv-off-white leading-relaxed">{narrative}</p>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          loading={loading}
          icon={<Activity className="h-4 w-4 text-adv-teal" />}
          label="Total Sessions"
          value={String(overview?.totalSessions ?? 0)}
          sub={`${overview?.totalMessages ?? 0} messages`}
        />
        <StatCard
          loading={loading}
          icon={<DollarSign className="h-4 w-4 text-adv-gold" />}
          label="Total Cost"
          value={formatCost(overview?.totalCost ?? 0)}
          sub={`avg ${formatCost(overview?.avgCostPerSession ?? 0)} / session`}
        />
        <StatCard
          loading={loading}
          icon={<Zap className="h-4 w-4 text-adv-blue" />}
          label="Tokens Used"
          value={formatTokens(overview?.totalTokens ?? 0)}
          sub="across all sessions"
        />
        <StatCard
          loading={loading}
          icon={<Layers className="h-4 w-4 text-adv-teal" />}
          label="Unique Modules"
          value={String(overview?.uniqueModules ?? 0)}
          sub="modules used"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sessions over time */}
        <ChartCard title="Session Activity — Last 30 Days" loading={loading}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={sessionChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2DD4A8" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2DD4A8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#152238" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#707070', fontSize: 11 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fill: '#707070', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                content={
                  <CustomTooltip
                    formatter={(v) => `${v} session${v !== 1 ? 's' : ''}`}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#2DD4A8"
                strokeWidth={2}
                fill="url(#tealGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#2DD4A8', stroke: '#0B1426', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Daily cost trend */}
        <ChartCard title="Daily Cost — Last 30 Days" loading={loading}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={costChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F5A623" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#F5A623" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#152238" />
              <XAxis
                dataKey="label"
                tick={{ fill: '#707070', fontSize: 11 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#707070', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `€${v.toFixed(2)}`}
              />
              <Tooltip
                content={
                  <CustomTooltip formatter={(v) => `€${v.toFixed(4)}`} />
                }
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#F5A623"
                strokeWidth={2}
                fill="url(#goldGrad)"
                dot={false}
                activeDot={{ r: 4, fill: '#F5A623', stroke: '#0B1426', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Module usage — full width horizontal bar */}
      <ChartCard title="Most Used Modules" loading={loading}>
        {moduleChartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-adv-gray">
            No module usage data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, moduleChartData.length * 36)}>
            <BarChart
              data={moduleChartData}
              layout="vertical"
              margin={{ top: 4, right: 30, left: 10, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#152238" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: '#707070', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
                tick={{ fill: '#B0B0B0', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={
                  <CustomTooltip formatter={(v) => `${v} session${v !== 1 ? 's' : ''}`} />
                }
              />
              <Bar dataKey="count" fill="#2DD4A8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ROI Estimator */}
      <div className="rounded-xl border border-adv-teal-dim bg-adv-teal-soft p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-adv-teal" />
          <h3 className="text-base font-semibold text-adv-teal">ROI Estimate</h3>
        </div>

        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <p className="mb-3 text-lg font-bold text-adv-off-white">
              {overview?.totalSessions ?? 0} sessions &times; {hoursPerSession}h avg &times; €{ratePerHour}/hr ={' '}
              <span className="text-adv-teal">€{estimatedValue.toLocaleString(i18n.language)} estimated value</span>
            </p>
            <p className="text-sm text-adv-gray">
              Equivalent to approximately{' '}
              <span className="text-adv-off-white font-semibold">{daysSaved} working day{daysSaved !== 1 ? 's' : ''}</span>{' '}
              of consulting time saved.
            </p>
            <p className="mt-2 text-xs text-adv-gray">
              Based on typical compliance consulting rates of €{ratePerHour}/hour and an estimated {hoursPerSession} hours of
              equivalent manual work per AI session.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
