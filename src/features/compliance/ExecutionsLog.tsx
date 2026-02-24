import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Activity, ChevronDown, ChevronRight } from 'lucide-react';

interface RuleExecution {
  id: number;
  rule_id: number;
  execution_context: string;
  result: string;
  findings: string | null;
  auto_remediated: number;
  executed_at: string;
  rule_title?: string;
  rule_code?: string;
}

export default function ExecutionsLog() {
  const [executions, setExecutions] = useState<RuleExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedExecution, setExpandedExecution] = useState<number | null>(null);

  useEffect(() => {
    fetchExecutions();
  }, []);

  async function fetchExecutions() {
    try {
      // Fetch executions with rule details
      const response = await fetch('/api/compliance/dashboard', {
        headers: getAuthHeader()
      });
      const data = await response.json();
      if (data.success) {
        // Map recent executions from dashboard
        const mapped = (data.recentExecutions || []).map((exec: any, idx: number) => ({
          id: idx,
          rule_id: 0,
          execution_context: '{}',
          result: exec.result,
          findings: null,
          auto_remediated: 0,
          executed_at: exec.executed_at,
          rule_title: exec.title,
          rule_code: exec.category
        }));
        setExecutions(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    } finally {
      setLoading(false);
    }
  }

  function getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem('openexpert-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const resultIcons = {
    pass: { icon: CheckCircle2, color: 'text-adv-green', bg: 'bg-adv-green/20' },
    fail: { icon: XCircle, color: 'text-adv-red', bg: 'bg-adv-red/20' },
    warning: { icon: AlertTriangle, color: 'text-adv-gold', bg: 'bg-adv-gold/20' },
    error: { icon: XCircle, color: 'text-adv-red', bg: 'bg-adv-red/20' }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-adv-white">Execution History</h2>
          <p className="text-sm text-adv-gray mt-1">Recent rule execution results</p>
        </div>
        <button
          onClick={fetchExecutions}
          className="px-4 py-2 bg-adv-card border border-border rounded-lg text-sm text-adv-off-white hover:bg-adv-dark-2 transition-colors flex items-center gap-2"
        >
          <Activity className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Executions List */}
      {loading ? (
        <div className="text-center py-12 text-adv-gray">Loading executions...</div>
      ) : executions.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <div className="text-adv-gray">No executions yet</div>
        </div>
      ) : (
        <div className="bg-adv-card border border-border rounded-lg overflow-hidden">
          {executions.map((execution, idx) => {
            const resultConfig = resultIcons[execution.result as keyof typeof resultIcons];
            const Icon = resultConfig.icon;
            const isExpanded = expandedExecution === execution.id;

            return (
              <div
                key={execution.id}
                className={`border-b border-border last:border-b-0 ${
                  isExpanded ? 'bg-adv-dark-2' : 'hover:bg-adv-dark-2'
                } transition-colors`}
              >
                <button
                  onClick={() => setExpandedExecution(isExpanded ? null : execution.id)}
                  className="w-full px-4 py-3 flex items-center gap-4 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-adv-gray shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-adv-gray shrink-0" />
                  )}

                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${resultConfig.bg} shrink-0`}>
                    <Icon className={`h-4 w-4 ${resultConfig.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-adv-off-white truncate">
                      {execution.rule_title || `Rule ${execution.rule_id}`}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-adv-gray mt-1">
                      {execution.rule_code && (
                        <span className="capitalize">{execution.rule_code.replace('_', ' ')}</span>
                      )}
                      <span>{new Date(execution.executed_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${
                      resultConfig.bg
                    } ${resultConfig.color}`}>
                      {execution.result}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border bg-adv-dark-2/50">
                    <div className="grid grid-cols-2 gap-4 pt-3">
                      <div>
                        <div className="text-xs text-adv-gray mb-1">Result</div>
                        <div className="text-sm text-adv-off-white capitalize">{execution.result}</div>
                      </div>
                      <div>
                        <div className="text-xs text-adv-gray mb-1">Auto Remediated</div>
                        <div className="text-sm text-adv-off-white">
                          {execution.auto_remediated === 1 ? 'Yes' : 'No'}
                        </div>
                      </div>
                    </div>

                    {execution.findings && (
                      <div>
                        <div className="text-xs text-adv-gray mb-1">Findings</div>
                        <div className="text-sm text-adv-off-white font-mono bg-adv-dark p-2 rounded">
                          {execution.findings}
                        </div>
                      </div>
                    )}

                    {execution.execution_context && execution.execution_context !== '{}' && (
                      <div>
                        <div className="text-xs text-adv-gray mb-1">Context</div>
                        <div className="text-xs text-adv-off-white font-mono bg-adv-dark p-2 rounded overflow-auto max-h-48">
                          <pre>{JSON.stringify(JSON.parse(execution.execution_context), null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
