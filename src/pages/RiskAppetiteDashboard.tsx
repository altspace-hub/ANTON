import { useState, useEffect } from 'react';
import { ShieldAlert, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

// LONE-06: Risk appetite status dashboard for CRO persona

type RiskStatus = 'within' | 'approaching' | 'breached';

interface RiskDimension {
  id: string;
  category: string;
  metric: string;
  appetite: string;
  tolerance: string;
  current: string;
  status: RiskStatus;
  trend: 'up' | 'down' | 'stable';
  owner: string;
  lastReview: string;
}

const SAMPLE_DIMENSIONS: RiskDimension[] = [
  {
    id: 'ml-sar-rate',
    category: 'AML / Financial Crime',
    metric: 'SAR Filing Rate',
    appetite: '< 0.5% of transactions',
    tolerance: '< 0.8% of transactions',
    current: '0.31%',
    status: 'within',
    trend: 'stable',
    owner: 'MLRO',
    lastReview: '2026-03-01',
  },
  {
    id: 'ml-edd-coverage',
    category: 'AML / Financial Crime',
    metric: 'EDD Completion Rate (High-Risk Customers)',
    appetite: '> 95% within 30 days',
    tolerance: '> 90% within 30 days',
    current: '91.4%',
    status: 'approaching',
    trend: 'down',
    owner: 'Head of KYC',
    lastReview: '2026-02-28',
  },
  {
    id: 'sanctions-false-positive',
    category: 'Sanctions',
    metric: 'Sanctions False Positive Rate',
    appetite: '< 95%',
    tolerance: '< 97%',
    current: '96.2%',
    status: 'approaching',
    trend: 'up',
    owner: 'Sanctions Officer',
    lastReview: '2026-03-05',
  },
  {
    id: 'regulatory-findings',
    category: 'Regulatory Compliance',
    metric: 'Open High-Severity Regulatory Findings',
    appetite: '0',
    tolerance: '≤ 2',
    current: '1',
    status: 'approaching',
    trend: 'stable',
    owner: 'CCO',
    lastReview: '2026-03-07',
  },
  {
    id: 'tm-alert-backlog',
    category: 'Transaction Monitoring',
    metric: 'TM Alert Backlog > 30 days',
    appetite: '< 50 alerts',
    tolerance: '< 200 alerts',
    current: '38',
    status: 'within',
    trend: 'down',
    owner: 'Head of FIU Operations',
    lastReview: '2026-03-06',
  },
  {
    id: 'pep-refresh',
    category: 'AML / Financial Crime',
    metric: 'PEP Annual Refresh Completion',
    appetite: '100% by deadline',
    tolerance: '>95% by deadline',
    current: '78%',
    status: 'breached',
    trend: 'up',
    owner: 'Head of KYC',
    lastReview: '2026-02-15',
  },
  {
    id: 'training-completion',
    category: 'Training & Culture',
    metric: 'Annual AML Training Completion',
    appetite: '100% by Nov 30',
    tolerance: '> 95% by Dec 31',
    current: '97.3%',
    status: 'within',
    trend: 'stable',
    owner: 'Head of Compliance Training',
    lastReview: '2026-01-10',
  },
  {
    id: 'dora-ict-incidents',
    category: 'Operational Resilience (DORA)',
    metric: 'ICT Major Incidents (Reportable)',
    appetite: '0 per quarter',
    tolerance: '≤ 1 per quarter',
    current: '0',
    status: 'within',
    trend: 'stable',
    owner: 'CISO',
    lastReview: '2026-03-01',
  },
];

const STATUS_CONFIG: Record<RiskStatus, { label: string; icon: typeof CheckCircle; textColor: string; borderColor: string; bgColor: string }> = {
  within:     { label: 'Within Appetite',  icon: CheckCircle,  textColor: 'text-adv-green', borderColor: 'border-adv-green/30', bgColor: 'bg-adv-green/10' },
  approaching:{ label: 'Approaching Limit',icon: AlertTriangle, textColor: 'text-adv-gold',  borderColor: 'border-adv-gold/30',  bgColor: 'bg-adv-gold/10' },
  breached:   { label: 'Limit Breached',   icon: XCircle,      textColor: 'text-adv-red',   borderColor: 'border-adv-red/30',   bgColor: 'bg-adv-red/10' },
};

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up')   return <TrendingUp className="h-3.5 w-3.5 text-adv-green" />;
  if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5 text-adv-red" />;
  return <Minus className="h-3.5 w-3.5 text-adv-gray" />;
}

const CATEGORIES = Array.from(new Set(SAMPLE_DIMENSIONS.map((d) => d.category)));

export default function RiskAppetiteDashboard() {
  const [filter, setFilter] = useState<'all' | RiskStatus>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const withinCount    = SAMPLE_DIMENSIONS.filter((d) => d.status === 'within').length;
  const approachCount  = SAMPLE_DIMENSIONS.filter((d) => d.status === 'approaching').length;
  const breachedCount  = SAMPLE_DIMENSIONS.filter((d) => d.status === 'breached').length;

  const filtered = SAMPLE_DIMENSIONS.filter((d) => {
    if (filter !== 'all' && d.status !== filter) return false;
    if (selectedCategory !== 'all' && d.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-red/10">
            <ShieldAlert className="h-5 w-5 text-adv-red" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Risk Appetite Dashboard</h1>
            <p className="text-sm text-adv-gray">Real-time status across all risk appetite dimensions — CRO view</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-adv-gray">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Last updated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Status summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <button
          onClick={() => setFilter(filter === 'within' ? 'all' : 'within')}
          className={`rounded-xl border p-4 text-left transition-all ${filter === 'within' ? 'border-adv-green bg-adv-green/10' : 'border-border bg-adv-dark-2 hover:border-adv-green/30'}`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-adv-green" />
            <span className="text-sm font-medium text-adv-off-white">Within Appetite</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-adv-green">{withinCount}</p>
          <p className="text-xs text-adv-gray">of {SAMPLE_DIMENSIONS.length} dimensions</p>
        </button>

        <button
          onClick={() => setFilter(filter === 'approaching' ? 'all' : 'approaching')}
          className={`rounded-xl border p-4 text-left transition-all ${filter === 'approaching' ? 'border-adv-gold bg-adv-gold/10' : 'border-border bg-adv-dark-2 hover:border-adv-gold/30'}`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-adv-gold" />
            <span className="text-sm font-medium text-adv-off-white">Approaching Limit</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-adv-gold">{approachCount}</p>
          <p className="text-xs text-adv-gray">requires monitoring</p>
        </button>

        <button
          onClick={() => setFilter(filter === 'breached' ? 'all' : 'breached')}
          className={`rounded-xl border p-4 text-left transition-all ${filter === 'breached' ? 'border-adv-red bg-adv-red/10' : 'border-border bg-adv-dark-2 hover:border-adv-red/30'}`}
        >
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-adv-red" />
            <span className="text-sm font-medium text-adv-off-white">Limit Breached</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-adv-red">{breachedCount}</p>
          <p className="text-xs text-adv-gray">requires immediate action</p>
        </button>
      </div>

      {/* Category filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedCategory === 'all' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
        >
          All categories
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedCategory === cat ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Risk dimension table */}
      <div className="overflow-hidden rounded-xl border border-border bg-adv-dark-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-adv-card">
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Metric</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Appetite</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Tolerance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Current</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Trend</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Owner</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-adv-gray">Last Review</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-adv-gray">
                  No dimensions match the current filter
                </td>
              </tr>
            )}
            {filtered.map((dim, idx) => {
              const sc = STATUS_CONFIG[dim.status];
              const StatusIcon = sc.icon;
              return (
                <tr
                  key={dim.id}
                  className={`border-b border-border/50 last:border-0 ${idx % 2 === 0 ? 'bg-adv-dark-2' : 'bg-adv-dark'}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-adv-off-white">{dim.metric}</p>
                    <p className="text-xs text-adv-gray">{dim.category}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-adv-gray">{dim.appetite}</td>
                  <td className="px-4 py-3 text-xs text-adv-gray">{dim.tolerance}</td>
                  <td className={`px-4 py-3 text-sm font-semibold ${sc.textColor}`}>{dim.current}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <TrendIcon trend={dim.trend} />
                      <span className="text-xs text-adv-gray capitalize">{dim.trend}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${sc.bgColor} ${sc.borderColor} ${sc.textColor}`}>
                      <StatusIcon className="h-3 w-3" />
                      {sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-adv-gray">{dim.owner}</td>
                  <td className="px-4 py-3 text-xs text-adv-gray">{dim.lastReview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="mt-4 text-xs text-adv-gray">
        Risk appetite limits are illustrative defaults. Update them to reflect your institution's approved Risk Appetite Statement.
        Connect to live data sources via the Data Partnerships module.
      </p>
    </div>
  );
}
