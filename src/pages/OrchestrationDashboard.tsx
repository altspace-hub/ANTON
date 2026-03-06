/**
 * OrchestrationDashboard.tsx
 * Improvement 6 — Orchestration Dashboard.
 * Unified view aggregating Session Resume, Proactive Intelligence,
 * Org Context, Continuity Profiles, and Event Triggers into one surface.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Brain, Building2, Users, Zap, RefreshCw,
  ChevronRight, Bell, CheckCircle, AlertTriangle, XCircle,
  Clock, TrendingUp, Activity, ArrowRight, Settings,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ── Types ────────────────────────────────────────────────────────────────────

interface OrgContext {
  org_name: string | null;
  org_type: string | null;
  jurisdiction: string | null;
  regulatory_perimeter: string[];
  current_priorities: string[];
  risk_appetite: string | null;
}

interface Insight {
  id: string;
  insight_type: string;
  title: string;
  summary: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  is_read: number;
  created_at: string;
}

interface ContinuityProfile {
  id: string;
  profile_name: string;
  role: string;
  status: 'active' | 'transitioning' | 'archived';
  expertise_summary: string | null;
}

interface TriggerSummary {
  active: number;
  paused: number;
  error: number;
  events_24h: number;
  triggered_24h: number;
}

interface RecentSession {
  id: string;
  name: string | null;
  module: string | null;
  updated_at: string;
  has_snapshot: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const severityColor: Record<string, string> = {
  critical: 'text-red-400 bg-red-900/30 border-red-800',
  high:     'text-orange-400 bg-orange-900/30 border-orange-800',
  medium:   'text-yellow-400 bg-yellow-900/30 border-yellow-800',
  low:      'text-blue-400 bg-blue-900/30 border-blue-800',
  info:     'text-gray-400 bg-gray-900/30 border-gray-700',
};

const severityIcon: Record<string, React.ReactNode> = {
  critical: <XCircle className="h-4 w-4" />,
  high:     <AlertTriangle className="h-4 w-4" />,
  medium:   <AlertTriangle className="h-4 w-4" />,
  low:      <Bell className="h-4 w-4" />,
  info:     <Bell className="h-4 w-4" />,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SectionCard({ title, icon, linkTo, linkLabel, children }: {
  title: string; icon: React.ReactNode; linkTo?: string; linkLabel?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-[#152238] rounded-xl border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <span className="text-[#2DD4A8]">{icon}</span>
          {title}
        </div>
        {linkTo && (
          <Link to={linkTo} className="flex items-center gap-1 text-xs text-[#2DD4A8] hover:underline">
            {linkLabel ?? 'View all'} <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatPill({ label, value, color = 'teal' }: { label: string; value: number | string; color?: 'teal' | 'gold' | 'red' | 'gray' }) {
  const clr = { teal: 'text-[#2DD4A8]', gold: 'text-[#F5A623]', red: 'text-[#E74C3C]', gray: 'text-gray-400' }[color];
  return (
    <div className="bg-[#0F1B2D] rounded-lg px-4 py-3 text-center">
      <div className={`text-2xl font-bold ${clr}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrchestrationDashboard() {
  const [orgCtx, setOrgCtx] = useState<OrgContext | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profiles, setProfiles] = useState<ContinuityProfile[]>([]);
  const [triggerSummary, setTriggerSummary] = useState<TriggerSummary | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ctxRes, insRes, unreadRes, profRes, trigRes, sessRes] = await Promise.allSettled([
        fetch('/api/org-context').then(r => r.json()),
        fetch('/api/insights?limit=5').then(r => r.json()),
        fetch('/api/insights/unread-count').then(r => r.json()),
        fetch('/api/continuity/profiles').then(r => r.json()),
        fetch('/api/triggers/metrics/summary').then(r => r.json()),
        fetch('/api/sessions?limit=5').then(r => r.json()),
      ]);

      if (ctxRes.status === 'fulfilled') setOrgCtx(ctxRes.value.context ?? null);
      if (insRes.status === 'fulfilled') setInsights(insRes.value.insights ?? []);
      if (unreadRes.status === 'fulfilled') setUnreadCount(unreadRes.value.count ?? 0);
      if (profRes.status === 'fulfilled') setProfiles(profRes.value.profiles ?? []);
      if (trigRes.status === 'fulfilled' && Array.isArray(trigRes.value?.summary)) {
        // Compute aggregate stats from the per-trigger summary array
        const items = trigRes.value.summary as Array<{
          status: string;
          metrics: { events_received: number; events_triggered: number };
        }>;
        setTriggerSummary({
          active: items.filter(t => t.status === 'active').length,
          paused: items.filter(t => t.status === 'paused').length,
          error: items.filter(t => t.status === 'error').length,
          events_24h: items.reduce((sum, t) => sum + (t.metrics?.events_received ?? 0), 0),
          triggered_24h: items.reduce((sum, t) => sum + (t.metrics?.events_triggered ?? 0), 0),
        });
      }
      if (sessRes.status === 'fulfilled') {
        // Sessions API returns a raw array (not wrapped) — handle both shapes defensively
        const sessData = sessRes.value;
        setRecentSessions(Array.isArray(sessData) ? sessData : (sessData?.sessions ?? []));
      }
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const statusColor = (s: string) =>
    s === 'active' ? 'bg-green-500' : s === 'transitioning' ? 'bg-yellow-500' : 'bg-gray-500';

  return (
    <div className="min-h-screen bg-[#0B1426] text-[#E0E0E0] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6 text-[#2DD4A8]" />
          <div>
            <h1 className="text-xl font-bold text-white">Orchestration Dashboard</h1>
            <p className="text-sm text-gray-400">Intelligence · Continuity · Automation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Updated {timeAgo(lastRefresh.toISOString())}</span>
          <button
            onClick={() => void fetchAll()}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-[#2DD4A8] hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-[#2DD4A8] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatPill label="Unread Insights" value={unreadCount} color={unreadCount > 0 ? 'gold' : 'teal'} />
        <StatPill label="Active Profiles" value={profiles.filter(p => p.status === 'active').length} color="teal" />
        <StatPill label="Active Triggers" value={triggerSummary?.active ?? '—'} color="teal" />
        <StatPill label="Events (24h)" value={triggerSummary?.events_24h ?? '—'} color="gray" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Org Context ─────────────────────────────────────────────────── */}
        <SectionCard
          title="Organisation Context"
          icon={<Building2 className="h-4 w-4" />}
          linkTo="/settings/org-context"
          linkLabel="Edit"
        >
          {orgCtx && (orgCtx.org_name || orgCtx.jurisdiction) ? (
            <div className="space-y-2 text-sm">
              {orgCtx.org_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Organisation</span>
                  <span className="font-medium text-white">{orgCtx.org_name}</span>
                </div>
              )}
              {orgCtx.org_type && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Type</span>
                  <span>{orgCtx.org_type}</span>
                </div>
              )}
              {orgCtx.jurisdiction && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Jurisdiction</span>
                  <span>{orgCtx.jurisdiction}</span>
                </div>
              )}
              {orgCtx.risk_appetite && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Risk Appetite</span>
                  <span className="capitalize">{orgCtx.risk_appetite}</span>
                </div>
              )}
              {orgCtx.current_priorities.length > 0 && (
                <div className="mt-3">
                  <p className="text-gray-400 text-xs mb-1.5">Current priorities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {orgCtx.current_priorities.slice(0, 4).map((p, i) => (
                      <span key={i} className="text-xs bg-[#144D3C] text-[#2DD4A8] px-2 py-0.5 rounded-full">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Building2 className="h-8 w-8 text-gray-600" />
              <p className="text-sm text-gray-400">No organisation context set.</p>
              <Link to="/settings/org-context" className="text-xs text-[#2DD4A8] hover:underline">
                Configure now <ArrowRight className="inline h-3 w-3" />
              </Link>
            </div>
          )}
        </SectionCard>

        {/* ── Proactive Insights ───────────────────────────────────────────── */}
        <SectionCard
          title="Proactive Insights"
          icon={<Brain className="h-4 w-4" />}
          linkTo="/insights"
          linkLabel={unreadCount > 0 ? `${unreadCount} unread` : 'View all'}
        >
          {insights.length > 0 ? (
            <div className="space-y-2">
              {insights.slice(0, 4).map(ins => (
                <div
                  key={ins.id}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs ${severityColor[ins.severity]}`}
                >
                  <span className="mt-0.5 shrink-0">{severityIcon[ins.severity]}</span>
                  <div className="min-w-0">
                    <p className={`font-medium truncate ${ins.is_read ? 'opacity-70' : ''}`}>{ins.title}</p>
                    <p className="text-gray-400 line-clamp-1 mt-0.5">{ins.summary}</p>
                  </div>
                  <span className="text-gray-500 shrink-0 ml-auto">{timeAgo(ins.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <TrendingUp className="h-8 w-8 text-gray-600" />
              <p className="text-sm text-gray-400">No insights yet.</p>
              <p className="text-xs text-gray-500">Insights are generated as you use modules across sessions.</p>
            </div>
          )}
        </SectionCard>

        {/* ── Continuity Profiles ──────────────────────────────────────────── */}
        <SectionCard
          title="Continuity Profiles"
          icon={<Users className="h-4 w-4" />}
          linkTo="/continuity"
          linkLabel="Manage"
        >
          {profiles.length > 0 ? (
            <div className="space-y-2">
              {profiles.slice(0, 4).map(p => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#0F1B2D]">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${statusColor(p.status)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{p.profile_name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.role}</p>
                  </div>
                  <span className="text-xs text-gray-500 capitalize shrink-0">{p.status}</span>
                </div>
              ))}
              {profiles.length > 4 && (
                <p className="text-xs text-gray-500 text-center pt-1">+{profiles.length - 4} more</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Users className="h-8 w-8 text-gray-600" />
              <p className="text-sm text-gray-400">No continuity profiles.</p>
              <p className="text-xs text-gray-500">Create profiles to preserve key-person knowledge across transitions.</p>
            </div>
          )}
        </SectionCard>

        {/* ── Event Triggers ───────────────────────────────────────────────── */}
        <SectionCard
          title="Event Triggers"
          icon={<Zap className="h-4 w-4" />}
          linkTo="/workflows/triggers"
          linkLabel="Manage"
        >
          {triggerSummary ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#0F1B2D] rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-green-400">{triggerSummary.active}</div>
                  <div className="text-xs text-gray-400">Active</div>
                </div>
                <div className="bg-[#0F1B2D] rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-yellow-400">{triggerSummary.paused}</div>
                  <div className="text-xs text-gray-400">Paused</div>
                </div>
                <div className="bg-[#0F1B2D] rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-red-400">{triggerSummary.error}</div>
                  <div className="text-xs text-gray-400">Error</div>
                </div>
              </div>
              <div className="flex justify-between text-sm border-t border-white/10 pt-3">
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Activity className="h-3.5 w-3.5" />
                  <span>{triggerSummary.events_24h} events received (24h)</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#2DD4A8]">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>{triggerSummary.triggered_24h} triggered</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Zap className="h-8 w-8 text-gray-600" />
              <p className="text-sm text-gray-400">No triggers configured.</p>
              <Link to="/workflows/triggers" className="text-xs text-[#2DD4A8] hover:underline">
                Create a trigger <ArrowRight className="inline h-3 w-3" />
              </Link>
            </div>
          )}
        </SectionCard>

        {/* ── Recent Sessions with Resume ──────────────────────────────────── */}
        <SectionCard
          title="Sessions with Resume Points"
          icon={<Clock className="h-4 w-4" />}
          linkTo="/sessions"
          linkLabel="All sessions"
        >
          {recentSessions.length > 0 ? (
            <div className="space-y-2">
              {recentSessions.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#0F1B2D] group">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {s.name || `Session ${s.id.slice(0, 8)}`}
                    </p>
                    <p className="text-xs text-gray-400">{s.module ?? 'No module'} · {timeAgo(s.updated_at)}</p>
                  </div>
                  {s.has_snapshot && (
                    <span className="text-xs bg-[#144D3C] text-[#2DD4A8] px-2 py-0.5 rounded-full shrink-0">
                      Resume
                    </span>
                  )}
                  <Link
                    to={`/prompt?session=${s.id}`}
                    className="opacity-0 group-hover:opacity-100 text-[#2DD4A8] transition-opacity"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Clock className="h-8 w-8 text-gray-600" />
              <p className="text-sm text-gray-400">No recent sessions.</p>
            </div>
          )}
        </SectionCard>

        {/* ── Quick Actions ────────────────────────────────────────────────── */}
        <SectionCard
          title="Quick Actions"
          icon={<Settings className="h-4 w-4" />}
        >
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Configure Org Context', icon: <Building2 className="h-4 w-4" />, to: '/settings/org-context' },
              { label: 'New Continuity Profile', icon: <Users className="h-4 w-4" />, to: '/continuity' },
              { label: 'New Event Trigger', icon: <Zap className="h-4 w-4" />, to: '/workflows/triggers' },
              { label: 'Generate Insights', icon: <Brain className="h-4 w-4" />, to: '/insights' },
              { label: 'New Workflow', icon: <Activity className="h-4 w-4" />, to: '/workflows' },
              { label: 'Start Session', icon: <ArrowRight className="h-4 w-4" />, to: '/prompt' },
            ].map(({ label, icon, to }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#0F1B2D] hover:bg-[#144D3C] hover:text-[#2DD4A8] text-sm transition-colors border border-white/5 hover:border-[#2DD4A8]/30"
              >
                <span className="text-[#2DD4A8] shrink-0">{icon}</span>
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </SectionCard>

      </div>
    </div>
  );
}
