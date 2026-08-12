import { useState } from 'react';
import { X, Database, Globe, FolderOpen, Mail, Code, MessageSquare, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { ConnectionType } from './types';

const getToken = () => localStorage.getItem('openexpert-token') ?? '';

interface ConnectionWizardProps {
  onClose: () => void;
  onCreated: () => void;
}

type WizardStep = 'type' | 'config' | 'test' | 'confirm';

interface TypeOption {
  id: ConnectionType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TYPE_OPTIONS: TypeOption[] = [
  { id: 'database',       label: 'Database',       description: 'Connect to SQLite, PostgreSQL, or MySQL databases', icon: Database },
  { id: 'api',            label: 'API',             description: 'Connect to REST APIs with bearer, basic, or API key auth', icon: Globe },
  { id: 'filesystem',     label: 'Filesystem',      description: 'Access local folders with configurable permissions', icon: FolderOpen },
  { id: 'email',          label: 'Email',           description: 'SMTP or IMAP email integration', icon: Mail },
  { id: 'script_library', label: 'Script Library',  description: 'Register a folder of approved executable scripts', icon: Code },
  // The server has always been able to READ messaging connections (Slack/Teams tests,
  // sends, and the workflow "Messaging Notification" step) but nothing could create one,
  // so every one of those paths was permanently empty. This option is what makes them
  // reachable.
  { id: 'messaging',      label: 'Messaging',       description: 'Post workflow notifications to a Slack or Teams channel', icon: MessageSquare },
];

const INPUT_CLASS = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-adv-gray';

// ─────────────────────────────────────────────────────────────────────────────
// Type-specific config forms
// ─────────────────────────────────────────────────────────────────────────────

function DatabaseForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="db-driver" className={LABEL_CLASS}>Driver</label>
        <select id="db-driver" value={String(config.driver ?? 'sqlite')} onChange={(e) => set('driver', e.target.value)} className={INPUT_CLASS}>
          <option value="sqlite">SQLite</option>
          <option value="postgresql">PostgreSQL</option>
          <option value="mysql">MySQL / MariaDB</option>
          <option value="mssql">Microsoft SQL Server</option>
          <option value="mongodb">MongoDB (NoSQL)</option>
        </select>
      </div>
      {String(config.driver ?? 'sqlite') === 'sqlite' ? (
        <div>
          <label htmlFor="db-file-path" className={LABEL_CLASS}>Database File Path</label>
          <input id="db-file-path" type="text" placeholder="/path/to/database.sqlite" value={String(config.host ?? '')} onChange={(e) => set('host', e.target.value)} className={INPUT_CLASS} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="db-host" className={LABEL_CLASS}>Host / IP Address</label>
              <input id="db-host" type="text" placeholder="localhost or 192.168.1.100" value={String(config.host ?? '')} onChange={(e) => set('host', e.target.value)} className={INPUT_CLASS} />
              <p className="mt-1 text-xs text-adv-gray">Use IP or hostname for remote servers</p>
            </div>
            <div>
              <label htmlFor="db-port" className={LABEL_CLASS}>Port</label>
              <input id="db-port" type="number" placeholder={
                String(config.driver) === 'postgresql' ? '5432' :
                String(config.driver) === 'mysql' ? '3306' :
                String(config.driver) === 'mssql' ? '1433' :
                String(config.driver) === 'mongodb' ? '27017' : '5432'
              } value={String(config.port ?? '')} onChange={(e) => set('port', parseInt(e.target.value) || undefined)} className={INPUT_CLASS} />
            </div>
          </div>
          <div>
            <label htmlFor="db-name" className={LABEL_CLASS}>Database Name</label>
            <input id="db-name" type="text" placeholder="mydb" value={String(config.database ?? '')} onChange={(e) => set('database', e.target.value)} className={INPUT_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="db-username" className={LABEL_CLASS}>Username</label>
              <input id="db-username" type="text" value={String(config.username ?? '')} onChange={(e) => set('username', e.target.value)} className={INPUT_CLASS} />
            </div>
            <div>
              <label htmlFor="db-password" className={LABEL_CLASS}>Password</label>
              <input id="db-password" type="password" value={String(config.password ?? '')} onChange={(e) => set('password', e.target.value)} className={INPUT_CLASS} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-adv-off-white">
              <input type="checkbox" checked={!!config.ssl} onChange={(e) => set('ssl', e.target.checked)} className="rounded border-border" />
              Enable SSL/TLS encryption
            </label>
            {!!config.ssl && (
              <label className="ml-6 flex items-center gap-2 text-sm text-adv-gray">
                <input type="checkbox" checked={config.sslVerifyCert !== false} onChange={(e) => set('sslVerifyCert', e.target.checked)} className="rounded border-border" />
                Verify SSL certificate (uncheck for self-signed certs)
              </label>
            )}
          </div>
        </>
      )}
      <div>
        <label htmlFor="db-max-rows" className={LABEL_CLASS}>Max Rows Per Query</label>
        <input id="db-max-rows" type="number" min={1} max={100000} placeholder="10000" value={String(config.max_rows_per_query ?? '')} onChange={(e) => set('max_rows_per_query', parseInt(e.target.value) || undefined)} className={INPUT_CLASS} />
        <p className="mt-1 text-xs text-adv-gray">A ceiling on what any workflow step may request. Blank = no ceiling.</p>
      </div>
      <div>
        <label htmlFor="db-allowed-tables" className={LABEL_CLASS}>Allowed Tables (comma-separated, leave blank for all)</label>
        <input id="db-allowed-tables" type="text" placeholder="users, orders, products" value={String(config.allowed_tables ?? '')} onChange={(e) => set('allowed_tables', e.target.value)} className={INPUT_CLASS} />
        <p className="mt-1 text-xs text-adv-gray">Every table a query reads must appear here. Blank = every table.</p>
      </div>
      {/*
        The escape hatch for the read-only default. Workflow SQL is assembled by
        interpolating workflow context into a template, so anything other than a single
        SELECT is refused unless write access was granted here, deliberately, at creation.
      */}
      <div>
        <label className={LABEL_CLASS}>Permissions</label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-adv-off-white">
          <input
            type="checkbox"
            checked={((config.permissions as string[]) ?? []).includes('write')}
            onChange={(e) => set('permissions', e.target.checked ? ['read', 'write'] : ['read'])}
            className="rounded border-border"
          />
          Allow write queries (INSERT / UPDATE / DELETE)
        </label>
        <p className="mt-1 text-xs text-adv-gray">
          Off by default — workflow steps may only run SELECT statements on this connection.
        </p>
      </div>
    </div>
  );
}

function ApiForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const [newEndpoint, setNewEndpoint] = useState({ method: 'GET', path: '' });
  const endpoints = (config.allowed_endpoints as Array<{ method: string; path: string }>) ?? [];

  const addEndpoint = () => {
    if (!newEndpoint.path) return;
    set('allowed_endpoints', [...endpoints, newEndpoint]);
    setNewEndpoint({ method: 'GET', path: '' });
  };
  const removeEndpoint = (i: number) => set('allowed_endpoints', endpoints.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="api-base-url" className={LABEL_CLASS}>Base URL *</label>
        <input id="api-base-url" type="url" placeholder="https://api.example.com" value={String(config.base_url ?? '')} onChange={(e) => set('base_url', e.target.value)} className={INPUT_CLASS} />
      </div>
      <div>
        <label htmlFor="api-auth-type" className={LABEL_CLASS}>Auth Type</label>
        <select id="api-auth-type" value={String(config.auth_type ?? 'bearer')} onChange={(e) => set('auth_type', e.target.value)} className={INPUT_CLASS}>
          <option value="bearer">Bearer Token</option>
          <option value="basic">Basic Auth (base64)</option>
          <option value="apikey">API Key Header</option>
          <option value="none">No Auth</option>
        </select>
      </div>
      {String(config.auth_type ?? 'bearer') !== 'none' && (
        <div>
          <label htmlFor="api-auth-value" className={LABEL_CLASS}>Auth Value</label>
          <input id="api-auth-value" type="password" placeholder="Token / credentials" value={String(config.auth_value ?? '')} onChange={(e) => set('auth_value', e.target.value)} className={INPUT_CLASS} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="api-rate-limit" className={LABEL_CLASS}>Rate Limit (req/min, 0 = unlimited)</label>
          <input id="api-rate-limit" type="number" min={0} placeholder="60" value={String(config.rate_limit ?? '')} onChange={(e) => set('rate_limit', parseInt(e.target.value) || 0)} className={INPUT_CLASS} />
        </div>
        <div>
          <label htmlFor="api-timeout" className={LABEL_CLASS}>Timeout (seconds)</label>
          <input id="api-timeout" type="number" min={1} max={300} placeholder="30" value={String(config.timeout_seconds ?? '')} onChange={(e) => set('timeout_seconds', parseInt(e.target.value) || 30)} className={INPUT_CLASS} />
        </div>
      </div>

      {/* Allowed endpoints */}
      <div>
        <label className={LABEL_CLASS}>Allowed Endpoints</label>
        <p className="mb-1.5 text-xs text-adv-gray">
          Workflow API steps may only call paths listed here. Leave empty to allow any path
          under the base URL.
        </p>
        <div className="space-y-1.5">
          {endpoints.map((ep, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-2 py-1.5 text-xs">
              <span className="rounded bg-adv-teal-dim px-1.5 py-0.5 font-mono text-adv-teal">{ep.method}</span>
              <span className="flex-1 font-mono text-adv-off-white">{ep.path}</span>
              <button onClick={() => removeEndpoint(i)} className="text-adv-gray hover:text-adv-red transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <select value={newEndpoint.method} onChange={(e) => setNewEndpoint((v) => ({ ...v, method: e.target.value }))}
              className="rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1">
              <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option><option>*</option>
            </select>
            <input type="text" placeholder="/api/endpoint or /api/*" value={newEndpoint.path} onChange={(e) => setNewEndpoint((v) => ({ ...v, path: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') addEndpoint(); }}
              className="flex-1 rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
            <button onClick={addEndpoint} className="rounded-lg bg-adv-teal-dim px-2 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors">Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilesystemForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const allowedExts = (config.allowed_extensions as string[]) ?? [];
  const EXT_OPTIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html', '.json', '.xml', '.png', '.jpg'];

  const toggleExt = (ext: string) => {
    if (allowedExts.includes(ext)) {
      set('allowed_extensions', allowedExts.filter((e) => e !== ext));
    } else {
      set('allowed_extensions', [...allowedExts, ext]);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL_CLASS}>Base Path *</label>
        <input type="text" placeholder="/path/to/folder or C:\Users\..." value={String(config.base_path ?? '')} onChange={(e) => set('base_path', e.target.value)} className={INPUT_CLASS} />
        <p className="mt-1 text-xs text-adv-gray">All file access is restricted to this directory and its subdirectories.</p>
      </div>
      <div>
        <label className={LABEL_CLASS}>Allowed Extensions (none = all allowed)</label>
        <div className="flex flex-wrap gap-1.5">
          {EXT_OPTIONS.map((ext) => (
            <button key={ext} onClick={() => toggleExt(ext)}
              className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${allowedExts.includes(ext) ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'}`}>
              {ext}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Permissions</label>
        <div className="flex gap-4">
          {['read', 'write'].map((perm) => {
            const perms = (config.permissions as string[]) ?? [];
            const has = perms.includes(perm);
            return (
              <label key={perm} className="flex cursor-pointer items-center gap-2 text-sm text-adv-off-white">
                <input type="checkbox" checked={has} onChange={() => {
                  const next = has ? perms.filter((p) => p !== perm) : [...perms, perm];
                  set('permissions', next);
                }} className="rounded border-border" />
                {perm.charAt(0).toUpperCase() + perm.slice(1)}
              </label>
            );
          })}
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Max File Size (MB)</label>
        <input type="number" min={1} max={500} placeholder="50" value={String(config.max_file_size_mb ?? '')} onChange={(e) => set('max_file_size_mb', parseInt(e.target.value) || 50)} className={INPUT_CLASS} />
      </div>
    </div>
  );
}

function MessagingForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val });
  const platform = String(config.platform ?? 'slack');
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="msg-platform" className={LABEL_CLASS}>Platform</label>
        <select id="msg-platform" value={platform} onChange={(e) => set('platform', e.target.value)} className={INPUT_CLASS}>
          <option value="slack">Slack</option>
          <option value="teams">Microsoft Teams</option>
        </select>
      </div>
      <div>
        <label htmlFor="msg-webhook" className={LABEL_CLASS}>Incoming Webhook URL *</label>
        {/* Treated as a credential: encrypted at rest and stripped from API responses
            (credential-vault SENSITIVE_FIELDS). Anyone holding this URL can post to the
            channel, so it is a password field, not a URL field. */}
        <input
          id="msg-webhook"
          type="password"
          placeholder={platform === 'slack' ? 'https://hooks.slack.com/services/...' : 'https://outlook.office.com/webhook/...'}
          value={String(config.webhook_url ?? '')}
          onChange={(e) => set('webhook_url', e.target.value)}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-adv-gray">
          {platform === 'slack'
            ? 'Slack → Channel settings → Integrations → Add apps → Incoming Webhooks.'
            : 'Teams → Channel → Connectors → Incoming Webhook.'}
        </p>
      </div>
      <p className="text-xs text-adv-gray">
        Validating this connection posts a real test message to the channel.
      </p>
    </div>
  );
}

function GenericForm({ config, onChange }: { config: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void }) {
  const [rawJson, setRawJson] = useState(JSON.stringify(config, null, 2));
  const [jsonError, setJsonError] = useState('');

  const handleChange = (val: string) => {
    setRawJson(val);
    try {
      onChange(JSON.parse(val) as Record<string, unknown>);
      setJsonError('');
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  return (
    <div>
      <label className={LABEL_CLASS}>Configuration (JSON)</label>
      <textarea rows={6} value={rawJson} onChange={(e) => handleChange(e.target.value)} className={`${INPUT_CLASS} font-mono`} />
      {jsonError && <p className="mt-1 text-xs text-adv-red">{jsonError}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard
// ─────────────────────────────────────────────────────────────────────────────

export function ConnectionWizard({ onClose, onCreated }: ConnectionWizardProps) {
  const [step, setStep] = useState<WizardStep>('type');
  const [selectedType, setSelectedType] = useState<ConnectionType | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSelectType = (type: ConnectionType) => {
    setSelectedType(type);
    setConfig({});
  };

  const handleNext = () => {
    if (step === 'type') {
      if (!selectedType) { setError('Please select a connection type.'); return; }
      setError('');
      setStep('config');
    } else if (step === 'config') {
      if (!displayName.trim()) { setError('Display name is required.'); return; }
      setError('');
      setStep('test');
    } else if (step === 'test') {
      setStep('confirm');
    }
  };

  const handleTest = async () => {
    // Real connectivity test against the config being typed, before anything is saved.
    //
    // This used to sleep 600ms and set { ok: true } unconditionally — it could not fail.
    // Someone entering the wrong database password got a green tick reading
    // "Configuration validated", saved the connection, and found out when a workflow
    // failed days later. A test that always passes is worse than no test button at all:
    // it converts "I should check this" into false confidence.
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, config }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setTestResult({ ok: false, message: data.error ?? `Test failed (HTTP ${res.status})` });
      } else {
        setTestResult({ ok: data.ok === true, message: data.message ?? 'No response from test' });
      }
    } catch (e) {
      // A failed request is a failed test. Reporting it as a pass is the bug being fixed.
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Test request failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // Database connections carry permissions too now — the executor reads
      // permissions.includes('write') to decide whether non-SELECT SQL is allowed, so
      // leaving them out here would make the checkbox above decorative.
      const permissions = selectedType === 'filesystem' || selectedType === 'database'
        ? (config.permissions as string[] | undefined) ?? ['read']
        : [];

      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, type: selectedType, config, permissions }),
      });

      if (!res.ok) {
        const e = await res.json() as { error?: string };
        setError(e.error ?? 'Failed to create connection');
        return;
      }

      onCreated();
    } catch {
      setError('Network error — could not save connection');
    } finally {
      setSaving(false);
    }
  };

  const STEPS: { id: WizardStep; label: string }[] = [
    { id: 'type',    label: 'Type' },
    { id: 'config',  label: 'Configure' },
    { id: 'test',    label: 'Test' },
    { id: 'confirm', label: 'Save' },
  ];

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-adv-dark-2 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-adv-white">New Connection</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 pt-4">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                i < stepIndex ? 'bg-adv-teal text-adv-dark' :
                i === stepIndex ? 'bg-adv-teal text-adv-dark' :
                'border border-border text-adv-gray'
              }`}>
                {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-xs ${i === stepIndex ? 'text-adv-off-white font-medium' : 'text-adv-gray'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-adv-gray" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 min-h-[300px]">
          {/* Step 1: Choose type */}
          {step === 'type' && (
            <div className="space-y-2">
              <p className="mb-3 text-sm text-adv-gray">Select the type of integration to create:</p>
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedType === opt.id;
                return (
                  <button key={opt.id} onClick={() => handleSelectType(opt.id)}
                    className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors ${isSelected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border bg-adv-card hover:border-adv-gray-med'}`}>
                    <Icon className={`h-5 w-5 shrink-0 ${isSelected ? 'text-adv-teal' : 'text-adv-gray'}`} />
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? 'text-adv-teal' : 'text-adv-off-white'}`}>{opt.label}</p>
                      <p className="text-xs text-adv-gray">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 'config' && selectedType && (
            <div className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>Display Name *</label>
                <input type="text" placeholder={`e.g. Production DB, Reporting API`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={INPUT_CLASS} />
              </div>
              {selectedType === 'database'       && <DatabaseForm config={config} onChange={setConfig} />}
              {selectedType === 'api'            && <ApiForm config={config} onChange={setConfig} />}
              {selectedType === 'filesystem'     && <FilesystemForm config={config} onChange={setConfig} />}
              {selectedType === 'messaging'      && <MessagingForm config={config} onChange={setConfig} />}
              {(selectedType === 'email' || selectedType === 'script_library') && <GenericForm config={config} onChange={setConfig} />}
            </div>
          )}

          {/* Step 3: Test */}
          {step === 'test' && (
            <div className="space-y-4">
              <p className="text-sm text-adv-gray">Validate configuration before saving:</p>
              <div className="rounded-xl border border-border bg-adv-card p-4">
                <p className="mb-1 text-xs font-semibold text-adv-gray">Connection Summary</p>
                <p className="text-sm text-adv-off-white">{displayName}</p>
                <p className="mt-0.5 text-xs text-adv-gray capitalize">{selectedType}</p>
              </div>
              <button onClick={handleTest} disabled={testing}
                className="flex items-center gap-2 rounded-lg bg-adv-teal-dim px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {testing ? 'Validating...' : 'Validate Configuration'}
              </button>
              {testResult && (
                <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${testResult.ok ? 'border-adv-green/30 bg-adv-green/10 text-adv-green' : 'border-adv-red/30 bg-adv-red/10 text-adv-red'}`}>
                  {testResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-adv-gray">Review and save your connection:</p>
              <div className="rounded-xl border border-border bg-adv-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-adv-gray">Name</span>
                  <span className="text-sm text-adv-off-white">{displayName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-adv-gray">Type</span>
                  <span className="text-sm capitalize text-adv-off-white">{selectedType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-adv-gray">Status after save</span>
                  <span className="text-xs text-adv-gold">Pending approval</span>
                </div>
              </div>
              <p className="text-xs text-adv-gray">
                The connection will be in "pending" status until an administrator approves it. Active connections are available to all users.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div>
            {error && <p className="text-xs text-adv-red">{error}</p>}
          </div>
          <div className="flex gap-2">
            {step !== 'type' && (
              <button onClick={() => setStep(STEPS[stepIndex - 1].id)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                Back
              </button>
            )}
            {step !== 'confirm' ? (
              <button onClick={handleNext} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                Next
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Connection
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
