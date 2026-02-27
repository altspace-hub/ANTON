import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileOutput,
  Star,
  Activity,
  Clock,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------
function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { headers: getAuthHeader() });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Types matching actual API shapes
// ---------------------------------------------------------------------------

interface QualityBaseline {
  module_id: string;
  baseline_score: number;
  sample_size: number;
  updated_at?: string;
  trend_direction: 'up' | 'down' | 'flat';
}

interface ComplianceRule {
  id: number;
  name: string;
  description?: string;
  category?: string;
  severity?: string;
  enabled: number; // 1 | 0
  pass_count?: number;
  fail_count?: number;
}

interface ComplianceViolation {
  id: number;
  rule_id: number;
  severity?: string;
  status?: string;
  created_at?: string;
  session_id?: string;
  module_id?: string;
  details?: string;
}

interface AuditEvent {
  id: string | number;
  timestamp: string;
  module_id?: string;
  model?: string;
  session_id?: string;
  review_status?: string;
  input_token_count?: number;
  output_token_count?: number;
  estimated_cost_usd?: number;
}

interface Session {
  id: string;
  title?: string;
  module_id?: string;
  updated_at?: string;
  message_count?: number;
}

// Compliance dashboard response shape
interface ComplianceDashboardData {
  totalRules?: number;
  activeRules?: number;
  recentViolations?: number;
  passRate?: number;
}

// ---------------------------------------------------------------------------
// Small utility: module id → readable label
// ---------------------------------------------------------------------------
const MODULE_LABELS: Record<string, string> = {
  'gap-analysis': 'AMLR Gap Analysis',
  'document-creation': 'Document Creation',
  'sanctions-advisory': 'Sanctions Advisory',
  'regulatory-monitor': 'Regulatory Monitor',
  'training-content': 'Training Content',
  'data-management': 'Data Management',
  'risk-assessment': 'Risk Assessment',
  'investigation-support': 'Investigation Support',
};

function moduleLabel(id?: string): string {
  if (!id) return 'Unknown';
  return MODULE_LABELS[id] ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Score colour helpers
// ---------------------------------------------------------------------------
function scoreColour(score: number): string {
  if (score >= 8) return 'text-adv-green';
  if (score >= 6) return 'text-adv-teal';
  if (score >= 4) return 'text-adv-gold';
  return 'text-adv-red';
}

function scoreBg(score: number): string {
  if (score >= 8) return 'bg-adv-green/10';
  if (score >= 6) return 'bg-adv-teal-dim';
  if (score >= 4) return 'bg-adv-gold/10';
  return 'bg-adv-red/10';
}

// ---------------------------------------------------------------------------
// Trend icon
// ---------------------------------------------------------------------------
function TrendIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'up') return <TrendingUp className="h-4 w-4 text-adv-green" />;
  if (direction === 'down') return <TrendingDown className="h-4 w-4 text-adv-red" />;
  return <Minus className="h-4 w-4 text-adv-gray" />;
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------
interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string; // tailwind text class
  loading?: boolean;
}

function SummaryCard({ icon, label, value, sub, accent = 'text-adv-teal', loading }: SummaryCardProps) {
  return (
    <div className="bg-adv-card border border-border rounded-xl p-5 flex gap-4 items-start shadow-md">
      <div className="mt-1 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-adv-gray uppercase tracking-wide font-medium mb-1">{label}</p>
        {loading ? (
          <div className="h-7 w-20 bg-adv-dark-2 rounded animate-pulse" />
        ) : (
          <p className={`text-2xl font-bold ${accent}`}>{value}</p>
        )}
        {sub && !loading && <p className="text-xs text-adv-gray-med mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-adv-gray-med gap-2">
      <Activity className="h-8 w-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-adv-card border border-border rounded-xl shadow-md overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        {icon}
        <h2 className="font-semibold text-adv-off-white text-base">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Violation severity badge
// ---------------------------------------------------------------------------
function SeverityBadge({ severity }: { severity?: string }) {
  const s = (severity ?? 'medium').toLowerCase();
  const map: Record<string, string> = {
    critical: 'bg-adv-red/15 text-adv-red border-adv-red/30',
    high: 'bg-adv-gold/15 text-adv-gold border-adv-gold/30',
    medium: 'bg-adv-blue/15 text-adv-blue border-adv-blue/30',
    low: 'bg-adv-green/15 text-adv-green border-adv-green/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium ${map[s] ?? map.medium}`}>
      {s.charAt(0).toUpperCase() + s.slice(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Timestamp formatter
// ---------------------------------------------------------------------------
function formatTs(ts?: string): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function GovernanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshed, setRefreshed] = useState<Date>(new Date());

  // Data slices
  const [leaderboard, setLeaderboard] = useState<QualityBaseline[]>([]);
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [violations, setViolations] = useState<ComplianceViolation[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [complianceDash, setComplianceDash] = useState<ComplianceDashboardData>({});

  const fetchAll = async () => {
    setLoading(true);

    const [lbData, rulesData, violationsData, auditData, sessionsData, compDashData] = await Promise.all([
      // Quality leaderboard — returns array directly
      safeFetch<QualityBaseline[]>('/api/quality/leaderboard', []),
      // Compliance rules — returns { success, rules }
      safeFetch<{ success?: boolean; rules?: ComplianceRule[] }>('/api/compliance/rules', {}),
      // Compliance violations — returns { success, violations }
      safeFetch<{ success?: boolean; violations?: ComplianceViolation[] }>('/api/compliance/violations', {}),
      // Audit events — returns array; limit to 5 recent
      safeFetch<AuditEvent[]>('/api/audit/events?limit=5&sortOrder=DESC', []),
      // Sessions — recent 5
      safeFetch<Session[]>('/api/sessions?limit=5', []),
      // Compliance dashboard summary
      safeFetch<{ success?: boolean; totalRules?: number; activeRules?: number; recentViolations?: number; passRate?: number }>(
        '/api/compliance/dashboard',
        {}
      ),
    ]);

    setLeaderboard(Array.isArray(lbData) ? lbData : []);
    setRules(rulesData.rules ?? []);
    setViolations(violationsData.violations ?? []);
    setAuditEvents(Array.isArray(auditData) ? auditData : []);
    setSessions(Array.isArray(sessionsData) ? sessionsData : []);
    setComplianceDash(compDashData ?? {});
    setRefreshed(new Date());
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Derived summary values
  // ---------------------------------------------------------------------------
  const avgTrustScore = leaderboard.length > 0
    ? (leaderboard.reduce((sum, m) => sum + (m.baseline_score ?? 0), 0) / leaderboard.length).toFixed(1)
    : '—';

  const recentViolationCount = violations.length;

  const qualityTrendUp = leaderboard.filter((m) => m.trend_direction === 'up').length;
  const qualityTrendLabel =
    leaderboard.length === 0
      ? '—'
      : qualityTrendUp > 0
      ? `${qualityTrendUp} module${qualityTrendUp > 1 ? 's' : ''} improving`
      : 'No modules improving';

  // "Total outputs this month" — sessions as a proxy (or audit events if sessions empty)
  const totalOutputs = sessions.length > 0 ? sessions.length : auditEvents.length;

  // ---------------------------------------------------------------------------
  // Rules with derived pass/fail status
  // ---------------------------------------------------------------------------
  const activeRules = rules.filter((r) => r.enabled === 1 || r.enabled === (1 as unknown as number) || r.enabled);

  return (
    <div className="flex h-full flex-col bg-adv-dark">
      {/* Page header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-6 w-6 text-adv-teal" />
            <div>
              <h1 className="text-xl font-bold text-adv-white">Governance Dashboard</h1>
              <p className="text-xs text-adv-gray mt-0.5">
                Quality, compliance and activity overview — last refreshed{' '}
                <span className="text-adv-off-white">{formatTs(refreshed.toISOString())}</span>
              </p>
            </div>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-adv-card border border-border text-adv-gray hover:text-adv-off-white hover:border-adv-teal transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── Summary Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SummaryCard
            icon={<FileOutput className="h-5 w-5 text-adv-teal" />}
            label="Total outputs (recent)"
            value={loading ? '…' : totalOutputs}
            sub="Sessions loaded from API"
            loading={loading}
          />
          <SummaryCard
            icon={<Star className="h-5 w-5 text-adv-gold" />}
            label="Average Trust Score"
            value={loading ? '…' : avgTrustScore}
            sub={`Across ${leaderboard.length} module${leaderboard.length !== 1 ? 's' : ''}`}
            accent={
              avgTrustScore === '—'
                ? 'text-adv-gray'
                : scoreColour(parseFloat(String(avgTrustScore)))
            }
            loading={loading}
          />
          <SummaryCard
            icon={<ShieldAlert className="h-5 w-5 text-adv-red" />}
            label="Compliance violations"
            value={loading ? '…' : recentViolationCount}
            sub={
              complianceDash.recentViolations !== undefined
                ? `${complianceDash.recentViolations} flagged recently`
                : 'All loaded violations'
            }
            accent={recentViolationCount > 0 ? 'text-adv-red' : 'text-adv-green'}
            loading={loading}
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-adv-green" />}
            label="Quality trend"
            value={loading ? '…' : qualityTrendLabel}
            sub={`${leaderboard.length} module${leaderboard.length !== 1 ? 's' : ''} tracked`}
            accent="text-adv-off-white"
            loading={loading}
          />
        </div>

        {/* ── Two-column grid: Leaderboard + Compliance Rules ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Quality Leaderboard */}
          <Section
            title="Quality Leaderboard"
            icon={<Star className="h-4 w-4 text-adv-gold" />}
          >
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 bg-adv-dark-2 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : leaderboard.length === 0 ? (
              <EmptyState message="No quality data yet. Run an analysis to start tracking." />
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-adv-gray-med text-xs uppercase tracking-wide">
                      <th className="text-left py-2 px-2 font-medium">Module</th>
                      <th className="text-center py-2 px-2 font-medium">Score</th>
                      <th className="text-center py-2 px-2 font-medium">Samples</th>
                      <th className="text-center py-2 px-2 font-medium">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {leaderboard
                      .slice()
                      .sort((a, b) => (b.baseline_score ?? 0) - (a.baseline_score ?? 0))
                      .map((m) => (
                        <tr key={m.module_id} className="hover:bg-adv-dark-2 transition-colors">
                          <td className="py-3 px-2 text-adv-off-white font-medium truncate max-w-[180px]">
                            {moduleLabel(m.module_id)}
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${scoreBg(m.baseline_score ?? 0)} ${scoreColour(m.baseline_score ?? 0)}`}
                            >
                              {(m.baseline_score ?? 0).toFixed(1)}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center text-adv-gray">
                            {m.sample_size ?? 0}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex justify-center">
                              <TrendIcon direction={m.trend_direction ?? 'flat'} />
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Compliance Rules Status */}
          <Section
            title="Compliance Rules Status"
            icon={<ShieldCheck className="h-4 w-4 text-adv-teal" />}
          >
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 bg-adv-dark-2 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : activeRules.length === 0 && rules.length === 0 ? (
              <EmptyState message="No compliance rules configured. Visit Compliance to add rules." />
            ) : (
              <div className="space-y-2">
                {rules.length === 0 && (
                  <EmptyState message="No rules returned from API." />
                )}
                {rules.slice(0, 8).map((rule) => {
                  const isEnabled = Boolean(rule.enabled);
                  const hasViolations = violations.some((v) => v.rule_id === rule.id);
                  const passing = isEnabled && !hasViolations;

                  return (
                    <div
                      key={rule.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-adv-dark-2 border border-border hover:border-adv-teal/30 transition-colors"
                    >
                      <div className="mt-0.5 shrink-0">
                        {!isEnabled ? (
                          <Minus className="h-4 w-4 text-adv-gray-med" />
                        ) : passing ? (
                          <CheckCircle2 className="h-4 w-4 text-adv-green" />
                        ) : (
                          <XCircle className="h-4 w-4 text-adv-red" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-adv-off-white font-medium truncate">{rule.name}</p>
                        {rule.description && (
                          <p className="text-xs text-adv-gray-med truncate">{rule.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {rule.severity && <SeverityBadge severity={rule.severity} />}
                        {!isEnabled && (
                          <span className="text-xs text-adv-gray-med bg-adv-card px-2 py-0.5 rounded border border-border">
                            Disabled
                          </span>
                        )}
                        {isEnabled && hasViolations && (
                          <span className="text-xs text-adv-red bg-adv-red/10 border border-adv-red/30 px-2 py-0.5 rounded font-medium">
                            Violation
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {rules.length > 8 && (
                  <p className="text-xs text-adv-gray-med text-center pt-2">
                    + {rules.length - 8} more rules — view in Compliance page
                  </p>
                )}
              </div>
            )}
          </Section>
        </div>

        {/* ── Recent Violations ─────────────────────────────────────────── */}
        {violations.length > 0 && (
          <Section
            title="Recent Compliance Violations"
            icon={<AlertTriangle className="h-4 w-4 text-adv-gold" />}
          >
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-adv-gray-med text-xs uppercase tracking-wide">
                    <th className="text-left py-2 px-2 font-medium">Rule</th>
                    <th className="text-left py-2 px-2 font-medium">Module</th>
                    <th className="text-center py-2 px-2 font-medium">Severity</th>
                    <th className="text-center py-2 px-2 font-medium">Status</th>
                    <th className="text-right py-2 px-2 font-medium">Logged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {violations.slice(0, 5).map((v) => {
                    const ruleName = rules.find((r) => r.id === v.rule_id)?.name ?? `Rule #${v.rule_id}`;
                    return (
                      <tr key={v.id} className="hover:bg-adv-dark-2 transition-colors">
                        <td className="py-3 px-2 text-adv-off-white font-medium max-w-[200px] truncate">
                          {ruleName}
                        </td>
                        <td className="py-3 px-2 text-adv-gray">
                          {moduleLabel(v.module_id)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <SeverityBadge severity={v.severity} />
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                            v.status === 'resolved'
                              ? 'bg-adv-green/10 text-adv-green border-adv-green/30'
                              : 'bg-adv-gold/10 text-adv-gold border-adv-gold/30'
                          }`}>
                            {v.status ?? 'open'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right text-adv-gray-med text-xs">
                          {formatTs(v.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* ── Recent Activity (Audit Log) ───────────────────────────────── */}
        <Section
          title="Recent Activity"
          icon={<Clock className="h-4 w-4 text-adv-blue" />}
        >
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-adv-dark-2 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : auditEvents.length === 0 ? (
            <EmptyState message="No audit log entries found." />
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-adv-gray-med text-xs uppercase tracking-wide">
                    <th className="text-left py-2 px-2 font-medium">Timestamp</th>
                    <th className="text-left py-2 px-2 font-medium">Module</th>
                    <th className="text-left py-2 px-2 font-medium">Model</th>
                    <th className="text-center py-2 px-2 font-medium">Review</th>
                    <th className="text-right py-2 px-2 font-medium">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditEvents.map((e) => (
                    <tr key={e.id} className="hover:bg-adv-dark-2 transition-colors">
                      <td className="py-3 px-2 text-adv-gray-med text-xs whitespace-nowrap">
                        {formatTs(e.timestamp)}
                      </td>
                      <td className="py-3 px-2 text-adv-off-white font-medium max-w-[160px] truncate">
                        {moduleLabel(e.module_id)}
                      </td>
                      <td className="py-3 px-2 text-adv-gray text-xs font-mono">
                        {e.model
                          ? e.model.replace('claude-', '').replace(/-20\d{6}$/, '')
                          : '—'}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${
                          e.review_status === 'approved'
                            ? 'bg-adv-green/10 text-adv-green border-adv-green/30'
                            : e.review_status === 'reviewed'
                            ? 'bg-adv-teal-dim text-adv-teal border-adv-teal/30'
                            : 'bg-adv-card text-adv-gray-med border-border'
                        }`}>
                          {e.review_status ?? 'draft'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right text-adv-gray text-xs">
                        {e.estimated_cost_usd != null
                          ? `$${e.estimated_cost_usd.toFixed(4)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}
