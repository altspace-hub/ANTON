import { useState, useEffect, useCallback } from 'react';
import {
  Plus, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Database, Globe, FolderOpen, Mail, Code,
  Plug, Check, X,
} from 'lucide-react';
import type { Connection, AuditEntry } from './types';
import { ConnectionWizard } from './ConnectionWizard';
import { useAuthStore } from '@/stores/useAuthStore';

const getToken = () => localStorage.getItem('openexpert-token') ?? '';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  database:       Database,
  api:            Globe,
  filesystem:     FolderOpen,
  email:          Mail,
  script_library: Code,
};

const TYPE_LABELS: Record<string, string> = {
  database:       'Database',
  api:            'API',
  filesystem:     'Filesystem',
  email:          'Email',
  script_library: 'Script Library',
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; classes: string }> = {
  pending:  { label: 'Pending',  icon: Clock,         classes: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30' },
  active:   { label: 'Active',   icon: CheckCircle2,  classes: 'bg-adv-green/20 text-adv-green border-adv-green/30' },
  disabled: { label: 'Disabled', icon: XCircle,       classes: 'bg-adv-gray-med/20 text-adv-gray border-adv-gray-med/30' },
  error:    { label: 'Error',    icon: AlertTriangle,  classes: 'bg-adv-red/20 text-adv-red border-adv-red/30' },
};

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? Plug;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-adv-teal/30 bg-adv-teal-dim px-2 py-0.5 text-xs text-adv-teal">
      <Icon className="h-3 w-3" />
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.disabled;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${cfg.classes}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

interface AuditLogPanelProps {
  connectionId: string;
}

function AuditLogPanel({ connectionId }: AuditLogPanelProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/connections/${connectionId}/audit`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEntries(data as AuditEntry[]))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [connectionId]);

  if (loading) return <p className="py-3 text-xs text-adv-gray">Loading audit log...</p>;
  if (entries.length === 0) return <p className="py-3 text-xs text-adv-gray">No audit entries yet.</p>;

  return (
    <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-adv-dark-2 text-left">
            <th className="px-3 py-1.5 font-medium text-adv-gray">Time</th>
            <th className="px-3 py-1.5 font-medium text-adv-gray">Action</th>
            <th className="px-3 py-1.5 font-medium text-adv-gray">Result</th>
            <th className="px-3 py-1.5 font-medium text-adv-gray">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((e) => (
            <tr key={e.id} className="hover:bg-adv-dark-2/50">
              <td className="px-3 py-1.5 text-adv-gray">{new Date(e.executed_at).toLocaleString()}</td>
              <td className="px-3 py-1.5 font-mono text-adv-off-white">{e.action}</td>
              <td className="px-3 py-1.5 text-adv-gray">{e.result_summary ?? '—'}</td>
              <td className="px-3 py-1.5 text-adv-gray">{e.executed_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ConnectionRowProps {
  connection: Connection;
  isAdmin: boolean;
  onApprove: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  testingId: string | null;
  testResults: Record<string, { ok: boolean; message: string }>;
}

function ConnectionRow({
  connection,
  isAdmin,
  onApprove,
  onDelete,
  onTest,
  testingId,
  testResults,
}: ConnectionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const testResult = testResults[connection.id];

  return (
    <div className="rounded-lg border border-border bg-adv-card">
      <div className="flex items-center gap-3 p-4">
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-adv-gray hover:text-adv-off-white transition-colors"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Type icon */}
        {(() => { const Icon = TYPE_ICONS[connection.type] ?? Plug; return <Icon className="h-4 w-4 shrink-0 text-adv-gray" />; })()}

        {/* Name */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-adv-off-white">{connection.display_name}</p>
          <p className="text-xs text-adv-gray">
            Created {new Date(connection.created_at).toLocaleDateString()}
            {connection.last_tested && ` · Tested ${new Date(connection.last_tested).toLocaleDateString()}`}
          </p>
        </div>

        {/* Badges */}
        <div className="flex shrink-0 items-center gap-2">
          <TypeBadge type={connection.type} />
          <StatusBadge status={connection.status} />
        </div>

        {/* Test result inline */}
        {testResult && (
          <span className={`text-xs ${testResult.ok ? 'text-adv-green' : 'text-adv-red'}`}>
            {testResult.ok ? <Check className="inline h-3 w-3" /> : <X className="inline h-3 w-3" />}
            {' '}{testResult.message}
          </span>
        )}

        {/* Actions */}
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => onTest(connection.id)}
              disabled={testingId === connection.id}
              title="Test connection"
              className="flex items-center gap-1 rounded-lg bg-adv-dark px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${testingId === connection.id ? 'animate-spin' : ''}`} />
              Test
            </button>

            {connection.status === 'pending' && (
              <button
                onClick={() => onApprove(connection.id)}
                title="Approve connection"
                className="flex items-center gap-1 rounded-lg bg-adv-green/20 px-2 py-1 text-xs text-adv-green hover:bg-adv-green/30 transition-colors"
              >
                <CheckCircle2 className="h-3 w-3" />
                Approve
              </button>
            )}

            <button
              onClick={() => onDelete(connection.id)}
              title="Disable connection"
              className="rounded-lg p-1 text-adv-gray hover:text-adv-red transition-colors"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded: config preview + audit log */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="rounded-lg bg-adv-dark p-3">
            <p className="mb-1 text-xs font-semibold text-adv-gray">Configuration (sanitized)</p>
            <pre className="overflow-x-auto text-xs text-adv-off-white">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(connection.config).filter(
                    ([k]) => !['password', 'auth_value', 'secret', 'token', 'api_key'].includes(k.toLowerCase())
                  )
                ),
                null,
                2
              )}
            </pre>
          </div>
          {isAdmin && (
            <>
              <p className="mt-3 text-xs font-semibold text-adv-gray">Audit Log</p>
              <AuditLogPanel connectionId={connection.id} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectionManager() {
  const { user, isTeamMode } = useAuthStore();
  const isAdmin = user?.role === 'admin' || !isTeamMode;

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/connections', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setConnections(await res.json() as Connection[]);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const handleApprove = async (id: string) => {
    try {
      await fetch(`/api/connections/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await loadConnections();
    } catch {
      // non-fatal
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Disable this connection? It can be re-enabled by editing it.')) return;
    try {
      await fetch(`/api/connections/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await loadConnections();
    } catch {
      // non-fatal
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/connections/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const result = await res.json() as { ok: boolean; message: string };
        setTestResults((prev) => ({ ...prev, [id]: result }));
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: 'Network error' } }));
    } finally {
      setTestingId(null);
    }
  };

  const pending = connections.filter((c) => c.status === 'pending');
  const active = connections.filter((c) => c.status === 'active');
  const other = connections.filter((c) => c.status !== 'pending' && c.status !== 'active');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-adv-teal" />
          <h2 className="text-lg font-semibold text-adv-white">Connections</h2>
          <span className="text-xs text-adv-gray">({connections.length} total)</span>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Connection
          </button>
        )}
      </div>

      {showWizard && (
        <ConnectionWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); void loadConnections(); }}
        />
      )}

      {loading ? (
        <p className="text-sm text-adv-gray">Loading connections...</p>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Plug className="mx-auto mb-3 h-8 w-8 text-adv-gray" />
          <p className="text-sm text-adv-gray">No connections configured yet.</p>
          {isAdmin && (
            <p className="mt-1 text-xs text-adv-gray">Click "Add Connection" to register your first integration.</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending approvals */}
          {pending.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gold">
                Pending Approval ({pending.length})
              </p>
              <div className="space-y-2">
                {pending.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    connection={c}
                    isAdmin={isAdmin}
                    onApprove={handleApprove}
                    onDelete={handleDelete}
                    onTest={handleTest}
                    testingId={testingId}
                    testResults={testResults}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Active */}
          {active.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-green">
                Active ({active.length})
              </p>
              <div className="space-y-2">
                {active.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    connection={c}
                    isAdmin={isAdmin}
                    onApprove={handleApprove}
                    onDelete={handleDelete}
                    onTest={handleTest}
                    testingId={testingId}
                    testResults={testResults}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Disabled / Error */}
          {other.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                Disabled / Error ({other.length})
              </p>
              <div className="space-y-2">
                {other.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    connection={c}
                    isAdmin={isAdmin}
                    onApprove={handleApprove}
                    onDelete={handleDelete}
                    onTest={handleTest}
                    testingId={testingId}
                    testResults={testResults}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
