import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface DashboardStats {
  activeRules: number;
  openViolations: number;
  criticalViolations: number;
  recentExecutions: Array<{
    title: string;
    category: string;
    result: string;
    executed_at: string;
  }>;
  violationsByCategory: Array<{ category: string; count: number }>;
  violationsBySeverity: Array<{ severity: string; count: number }>;
  executionStats: Array<{ result: string; count: number }>;
}

export default function ComplianceDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    try {
      const response = await fetch('/api/compliance/dashboard', {
        headers: getAuthHeader()
      });
      const data = await response.json();
      setStats({
        activeRules: data.activeRules ?? 0,
        openViolations: data.openViolations ?? 0,
        criticalViolations: data.criticalViolations ?? 0,
        recentExecutions: data.recentExecutions || [],
        violationsByCategory: data.violationsByCategory || [],
        violationsBySeverity: data.violationsBySeverity || [],
        executionStats: data.executionStats || []
      });
    } catch (error) {
      console.error('Failed to fetch compliance dashboard:', error);
      // Show empty dashboard rather than error state
      setStats({
        activeRules: 0, openViolations: 0, criticalViolations: 0,
        recentExecutions: [], violationsByCategory: [], violationsBySeverity: [], executionStats: []
      });
    } finally {
      setLoading(false);
    }
  }

  function getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem('openexpert-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-adv-gray">Loading compliance dashboard...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-adv-red">Failed to load dashboard</div>
      </div>
    );
  }

  const passCount = stats.executionStats.find(s => s.result === 'pass')?.count || 0;
  const failCount = stats.executionStats.find(s => s.result === 'fail')?.count || 0;
  const warnCount = stats.executionStats.find(s => s.result === 'warning')?.count || 0;
  const totalExecutions = passCount + failCount + warnCount;
  const complianceRate = totalExecutions > 0 ? Math.round((passCount / totalExecutions) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-adv-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal/20">
              <ShieldCheck className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <div className="text-2xl font-bold text-adv-white">{stats.activeRules}</div>
              <div className="text-xs text-adv-gray">Active Rules</div>
            </div>
          </div>
        </div>

        <div className="bg-adv-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-gold/20">
              <AlertTriangle className="h-5 w-5 text-adv-gold" />
            </div>
            <div>
              <div className="text-2xl font-bold text-adv-white">{stats.openViolations}</div>
              <div className="text-xs text-adv-gray">Open Violations</div>
            </div>
          </div>
        </div>

        <div className="bg-adv-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-red/20">
              <XCircle className="h-5 w-5 text-adv-red" />
            </div>
            <div>
              <div className="text-2xl font-bold text-adv-white">{stats.criticalViolations}</div>
              <div className="text-xs text-adv-gray">Critical</div>
            </div>
          </div>
        </div>

        <div className="bg-adv-card rounded-lg border border-border p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-green/20">
              <CheckCircle2 className="h-5 w-5 text-adv-green" />
            </div>
            <div>
              <div className="text-2xl font-bold text-adv-white">{complianceRate}%</div>
              <div className="text-xs text-adv-gray">Pass Rate (7d)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Violations by Category */}
        <div className="bg-adv-card rounded-lg border border-border p-5">
          <h3 className="text-sm font-semibold text-adv-white mb-4">Violations by Category</h3>
          {stats.violationsByCategory.length === 0 ? (
            <div className="text-center py-8 text-adv-gray text-sm">No open violations</div>
          ) : (
            <div className="space-y-3">
              {stats.violationsByCategory.map(item => (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-adv-off-white capitalize">{item.category.replace('_', ' ')}</span>
                    <span className="text-adv-teal font-semibold">{item.count}</span>
                  </div>
                  <div className="h-2 bg-adv-dark-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-adv-teal rounded-full transition-all"
                      style={{ width: `${(item.count / stats.openViolations) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Violations by Severity */}
        <div className="bg-adv-card rounded-lg border border-border p-5">
          <h3 className="text-sm font-semibold text-adv-white mb-4">Violations by Severity</h3>
          {stats.violationsBySeverity.length === 0 ? (
            <div className="text-center py-8 text-adv-gray text-sm">No open violations</div>
          ) : (
            <div className="space-y-3">
              {stats.violationsBySeverity.map(item => {
                const colors = {
                  critical: 'bg-adv-red',
                  high: 'bg-adv-gold',
                  medium: 'bg-adv-blue',
                  low: 'bg-adv-gray'
                };
                return (
                  <div key={item.severity}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-adv-off-white capitalize">{item.severity}</span>
                      <span className="text-adv-teal font-semibold">{item.count}</span>
                    </div>
                    <div className="h-2 bg-adv-dark-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colors[item.severity as keyof typeof colors]}`}
                        style={{ width: `${(item.count / stats.openViolations) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Executions */}
      <div className="bg-adv-card rounded-lg border border-border p-5">
        <h3 className="text-sm font-semibold text-adv-white mb-4">Recent Rule Executions</h3>
        {stats.recentExecutions.length === 0 ? (
          <div className="text-center py-8 text-adv-gray text-sm">No recent executions</div>
        ) : (
          <div className="space-y-2">
            {stats.recentExecutions.map((exec, idx) => {
              const resultIcons = {
                pass: <CheckCircle2 className="h-4 w-4 text-adv-green" />,
                fail: <XCircle className="h-4 w-4 text-adv-red" />,
                warning: <AlertTriangle className="h-4 w-4 text-adv-gold" />,
                error: <XCircle className="h-4 w-4 text-adv-red" />
              };
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-adv-dark-2 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {resultIcons[exec.result as keyof typeof resultIcons]}
                    <span className="text-sm text-adv-off-white truncate">{exec.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-adv-gray capitalize bg-adv-dark-2 px-2 py-1 rounded">
                      {exec.category.replace('_', ' ')}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-adv-gray">
                      <Clock className="h-3 w-3" />
                      {new Date(exec.executed_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
