/**
 * GrowPage.tsx
 *
 * Grow Pillar dashboard — CRM & Business Development Intelligence.
 * Route: /grow
 *
 * Shows stats cards, quick actions, recent signals, and pipeline summary.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Users,
  Building2,
  Target,
  DollarSign,
  CalendarClock,
  Zap,
  UserPlus,
  Plus,
  Loader2,
  AlertCircle,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

// Matches backend getDashboardStats() response shape
interface DashboardStats {
  contacts: number;
  organisations: number;
  openOpportunities: number;
  pipelineValue: number;
  avgProbability: number;
  openSignals: number;
  pendingActivities: number;
  overdueActivities: number;
  recentInteractions: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  const v = Number(value) || 0;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toLocaleString()}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-adv-red bg-adv-red/10 border-adv-red/30',
  medium: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30',
  low: 'text-adv-blue bg-adv-blue/10 border-adv-blue/30',
};

const STAGE_COLORS: Record<string, string> = {
  Prospect: 'bg-adv-blue',
  Qualified: 'bg-adv-teal',
  Proposal: 'bg-adv-gold',
  Negotiation: 'bg-purple-500',
  Won: 'bg-adv-green',
  Lost: 'bg-adv-red',
};

// ── Stats Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-adv-card p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-adv-off-white">{value}</p>
          <p className="text-xs text-adv-gray">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function GrowPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/grow/dashboard', { headers: getAuthHeader() })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load dashboard');
        return r.json() as Promise<DashboardStats>;
      })
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-adv-gray" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-adv-gray" />
        <p className="mb-4 text-sm text-adv-red">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-adv-teal px-5 py-2 font-semibold text-adv-dark hover:bg-adv-teal-dark"
        >
          Retry
        </button>
      </div>
    );
  }

  const s = stats ?? {
    contacts: 0, organisations: 0, openOpportunities: 0,
    pipelineValue: 0, avgProbability: 0, openSignals: 0,
    pendingActivities: 0, overdueActivities: 0, recentInteractions: 0,
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-adv-dark">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
            <TrendingUp className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-adv-off-white">Grow</h1>
            <p className="text-xs text-adv-gray">CRM & Business Development Intelligence</p>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 px-6 py-6 max-w-6xl mx-auto w-full space-y-6">
        {/* Stats cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={Users} label="Contacts" value={s.contacts} iconBg="bg-adv-blue/10" iconColor="text-adv-blue" />
          <StatCard icon={Building2} label="Organisations" value={s.organisations} iconBg="bg-purple-500/10" iconColor="text-purple-400" />
          <StatCard icon={Target} label="Open Opportunities" value={s.openOpportunities} iconBg="bg-adv-teal-dim" iconColor="text-adv-teal" />
          <StatCard icon={DollarSign} label="Pipeline Value" value={formatCurrency(s.pipelineValue)} iconBg="bg-adv-green/10" iconColor="text-adv-green" />
          <StatCard icon={CalendarClock} label="Pending Activities" value={s.pendingActivities} iconBg="bg-adv-gold/10" iconColor="text-adv-gold" />
          <StatCard icon={Zap} label="Open Signals" value={s.openSignals} iconBg="bg-adv-red/10" iconColor="text-adv-red" />
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-adv-gray">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/grow/contacts?action=add')}
              className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2.5 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:bg-adv-card/80"
            >
              <UserPlus className="h-4 w-4 text-adv-teal" />
              Add Contact
            </button>
            <button
              onClick={() => navigate('/grow/organisations?action=add')}
              className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2.5 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:bg-adv-card/80"
            >
              <Building2 className="h-4 w-4 text-adv-teal" />
              Add Organisation
            </button>
            <button
              onClick={() => navigate('/grow/pipeline?action=add')}
              className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2.5 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:bg-adv-card/80"
            >
              <Plus className="h-4 w-4 text-adv-teal" />
              New Opportunity
            </button>
          </div>
        </div>

        {/* Two-column: Signals + Pipeline */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent signals */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-adv-off-white">
                <Zap className="h-4 w-4 text-adv-gold" />
                Recent Signals
              </h2>
              <span className="text-xs text-adv-gray">{s.openSignals} open</span>
            </div>

            {s.openSignals === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Zap className="mb-2 h-8 w-8 text-adv-gray" />
                <p className="text-sm text-adv-gray">No signals detected yet.</p>
                <p className="mt-1 text-xs text-adv-gray">
                  Signals are generated as you add contacts and opportunities.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <Zap className="mb-2 h-8 w-8 text-adv-gold" />
                <p className="text-sm text-adv-off-white">{s.openSignals} open signals</p>
                <p className="mt-1 text-xs text-adv-gray">Signal detail view coming soon.</p>
              </div>
            )}
          </div>

          {/* Pipeline summary mini-chart */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-adv-off-white">
                <BarChart3 className="h-4 w-4 text-adv-teal" />
                Pipeline Summary
              </h2>
              <button
                onClick={() => navigate('/grow/pipeline')}
                className="flex items-center gap-1 text-xs text-adv-teal transition hover:text-adv-teal-dark"
              >
                View pipeline
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>

            {s.openOpportunities === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Target className="mb-2 h-8 w-8 text-adv-gray" />
                <p className="text-sm text-adv-gray">No pipeline data yet.</p>
                <p className="mt-1 text-xs text-adv-gray">
                  Create opportunities to see your pipeline here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-adv-dark p-3">
                  <span className="text-sm text-adv-off-white">{s.openOpportunities} open opportunities</span>
                  <span className="text-sm font-semibold text-adv-teal">{formatCurrency(s.pipelineValue)}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-adv-dark p-3">
                  <span className="text-xs text-adv-gray">Avg. probability</span>
                  <span className="text-sm text-adv-off-white">{Math.round(Number(s.avgProbability))}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
