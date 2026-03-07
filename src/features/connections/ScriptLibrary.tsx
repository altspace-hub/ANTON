import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Code, Loader2, X, ChevronDown, ChevronRight,
  CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import type { Script } from './types';
import { useAuthStore } from '@/stores/useAuthStore';

const getToken = () => localStorage.getItem('openexpert-token') ?? '';

const LANG_COLORS: Record<string, string> = {
  python:     'bg-adv-blue/20 text-adv-blue border-adv-blue/30',
  bash:       'bg-adv-green/20 text-adv-green border-adv-green/30',
  r:          'bg-adv-gold/20 text-adv-gold border-adv-gold/30',
  powershell: 'bg-adv-teal/20 text-adv-teal border-adv-teal/30',
  node:       'bg-adv-green/20 text-adv-green border-adv-green/30',
};

function LangBadge({ language }: { language: string }) {
  const cls = LANG_COLORS[language] ?? 'bg-adv-card text-adv-gray border-border';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${cls}`}>
      <Code className="h-3 w-3" />
      {language}
    </span>
  );
}

interface ScriptRowProps {
  script: Script;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}

function ScriptRow({ script, isAdmin, onDelete }: ScriptRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-adv-card">
      <div className="flex items-center gap-3 p-4">
        <button onClick={() => setExpanded((v) => !v)} className="shrink-0 text-adv-gray hover:text-adv-off-white transition-colors">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <Code className="h-4 w-4 shrink-0 text-adv-gray" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-adv-off-white">{script.display_name}</p>
          {script.description && <p className="truncate text-xs text-adv-gray">{script.description}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LangBadge language={script.language} />
          <span className="text-xs text-adv-gray">v{script.version}</span>
          {script.approved_by ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-adv-green/30 bg-adv-green/20 px-2 py-0.5 text-xs text-adv-green">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-adv-gold/30 bg-adv-gold/20 px-2 py-0.5 text-xs text-adv-gold">
              <Clock className="h-3 w-3" /> Pending
            </span>
          )}
        </div>

        {isAdmin && (
          <button onClick={() => onDelete(script.id)} className="rounded-lg p-1 text-adv-gray hover:text-adv-red transition-colors" title="Delete script">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-adv-gray">Script Path</p>
              <p className="mt-0.5 font-mono text-adv-off-white">{script.script_path}</p>
            </div>
            <div>
              <p className="text-adv-gray">Max Runtime</p>
              <p className="mt-0.5 text-adv-off-white">{script.max_runtime_seconds}s</p>
            </div>
            <div>
              <p className="text-adv-gray">Memory Limit</p>
              <p className="mt-0.5 text-adv-off-white">{script.memory_limit_mb} MB</p>
            </div>
            <div>
              <p className="text-adv-gray">Sandbox</p>
              <p className="mt-0.5 text-adv-off-white">{script.sandbox ? 'Enabled' : 'Disabled'}</p>
            </div>
            <div>
              <p className="text-adv-gray">Network Access</p>
              <p className="mt-0.5 text-adv-off-white">{script.network_access ? 'Allowed' : 'Blocked'}</p>
            </div>
            {script.file_hash && (
              <div className="col-span-2">
                <p className="text-adv-gray">File Hash (SHA-256)</p>
                <p className="mt-0.5 break-all font-mono text-xs text-adv-gray">{script.file_hash}</p>
              </div>
            )}
          </div>
          {script.parameters && (
            <div>
              <p className="mb-1 text-xs text-adv-gray">Parameters</p>
              <pre className="overflow-x-auto rounded-lg bg-adv-dark p-2 text-xs text-adv-off-white">
                {JSON.stringify(script.parameters, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AddScriptFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

function AddScriptForm({ onCreated, onCancel }: AddScriptFormProps) {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<Script['language']>('python');
  const [scriptPath, setScriptPath] = useState('');
  const [maxRuntime, setMaxRuntime] = useState(300);
  const [memoryLimit, setMemoryLimit] = useState(1024);
  const [networkAccess, setNetworkAccess] = useState(false);
  const [parametersJson, setParametersJson] = useState('{}');
  const [jsonError, setJsonError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!displayName || !scriptPath) {
      setError('Display name and script path are required');
      return;
    }

    let parsedParams: Record<string, unknown> | undefined;
    try {
      parsedParams = JSON.parse(parametersJson) as Record<string, unknown>;
    } catch {
      setJsonError('Invalid JSON in parameters');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/connections/scripts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          description: description || undefined,
          language,
          script_path: scriptPath,
          parameters: parsedParams,
          max_runtime_seconds: maxRuntime,
          memory_limit_mb: memoryLimit,
          network_access: networkAccess,
        }),
      });
      if (!res.ok) {
        const e = await res.json() as { error?: string };
        setError(e.error ?? 'Failed to create script');
        return;
      }
      onCreated();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const INPUT_CLASS = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1';
  const LABEL_CLASS = 'mb-1 block text-xs font-medium text-adv-gray';

  return (
    <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
      <h3 className="text-sm font-semibold text-adv-off-white">Register New Script</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS}>Display Name *</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Data Export Script" className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Language *</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value as Script['language'])} className={INPUT_CLASS}>
            <option value="python">Python</option>
            <option value="bash">Bash</option>
            <option value="r">R</option>
            <option value="powershell">PowerShell</option>
            <option value="node">Node.js</option>
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>Description</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this script do?" className={INPUT_CLASS} />
      </div>

      <div>
        <label className={LABEL_CLASS}>Script File Path *</label>
        <input type="text" value={scriptPath} onChange={(e) => setScriptPath(e.target.value)} placeholder="/path/to/script.py" className={INPUT_CLASS} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS}>Max Runtime (seconds)</label>
          <input type="number" min={1} max={3600} value={maxRuntime} onChange={(e) => setMaxRuntime(parseInt(e.target.value) || 300)} className={INPUT_CLASS} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Memory Limit (MB)</label>
          <input type="number" min={64} max={8192} value={memoryLimit} onChange={(e) => setMemoryLimit(parseInt(e.target.value) || 1024)} className={INPUT_CLASS} />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-adv-off-white">
        <input type="checkbox" checked={networkAccess} onChange={(e) => setNetworkAccess(e.target.checked)} className="rounded border-border" />
        Allow network access
        <AlertTriangle className="h-3 w-3 text-adv-gold" />
      </label>

      <div>
        <label className={LABEL_CLASS}>Parameters Schema (JSON)</label>
        <textarea rows={4} value={parametersJson} onChange={(e) => { setParametersJson(e.target.value); setJsonError(''); }} className={`${INPUT_CLASS} font-mono`} placeholder='{"param1": {"type": "string", "description": "..."}}' />
        {jsonError && <p className="mt-1 text-xs text-adv-red">{jsonError}</p>}
      </div>

      {error && <p className="text-xs text-adv-red">{error}</p>}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Register Script
        </button>
        <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ScriptLibrary() {
  const { user, isTeamMode } = useAuthStore();
  const isAdmin = user?.role === 'admin' || !isTeamMode;

  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadScripts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/connections/scripts', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setScripts(await res.json() as Script[]);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScripts();
  }, [loadScripts]);

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this script from the library?')) return;
    try {
      await fetch(`/api/connections/scripts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await loadScripts();
    } catch {
      // non-fatal
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-adv-teal" />
          <h2 className="text-lg font-semibold text-adv-white">Script Library</h2>
          <span className="text-xs text-adv-gray">({scripts.length} scripts)</span>
        </div>
        {isAdmin && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal-dim px-3 py-1.5 text-sm text-adv-teal hover:bg-adv-teal/20 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Register Script
          </button>
        )}
      </div>

      {showAddForm && (
        <AddScriptForm
          onCreated={() => { setShowAddForm(false); void loadScripts(); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {loading ? (
        <p className="text-sm text-adv-gray">Loading scripts...</p>
      ) : scripts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <Code className="mx-auto mb-2 h-6 w-6 text-adv-gray" />
          <p className="text-sm text-adv-gray">No scripts in the library.</p>
          {isAdmin && <p className="mt-1 text-xs text-adv-gray">Register approved scripts to make them available to workflows.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {scripts.map((s) => (
            <ScriptRow key={s.id} script={s} isAdmin={isAdmin} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
