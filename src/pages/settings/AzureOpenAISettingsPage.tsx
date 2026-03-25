import { useCallback, useEffect, useState } from 'react';
import {
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Loader2,
  Cloud,
  Eye,
  EyeOff,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface AzureConfig {
  configured: boolean;
  endpoint?: string;
  apiKeyMasked?: string;
  apiVersion?: string;
  isActive?: boolean;
  bingSearchConfigured?: boolean;
  bingSearchApiKey?: string;
}

interface Deployment {
  id: string;
  deploymentName: string;
  modelName: string;
  displayName?: string;
  isReasoningModel?: boolean;
  isActive?: boolean;
}

interface TestResult {
  ok: boolean;
  message?: string;
  error?: string;
  deploymentResults?: Array<{
    deploymentName: string;
    ok: boolean;
    message?: string;
  }>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MODEL_NAME_OPTIONS = [
  'gpt-5.4',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'o3',
  'o4-mini',
] as const;

const DEFAULT_API_VERSION = '2024-10-21';

// ── Component ──────────────────────────────────────────────────────────────

export default function AzureOpenAISettingsPage() {
  // Config state
  const [config, setConfig] = useState<AzureConfig | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiVersion, setApiVersion] = useState(DEFAULT_API_VERSION);
  const [bingSearchApiKey, setBingSearchApiKey] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);

  // Deployments state
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  // Add deployment form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDeploymentName, setNewDeploymentName] = useState('');
  const [newModelName, setNewModelName] = useState<string>(MODEL_NAME_OPTIONS[0]);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newIsReasoningModel, setNewIsReasoningModel] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addingDeployment, setAddingDeployment] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Data Fetching ──────────────────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/azure-openai/config');
      if (res.ok) {
        const data = await res.json() as { configured: boolean; config?: { endpoint?: string; apiKey?: string; apiVersion?: string; isActive?: boolean; bingSearchConfigured?: boolean; bingSearchApiKey?: string } };
        const cfg: AzureConfig = {
          configured: data.configured,
          endpoint: data.config?.endpoint,
          apiKeyMasked: data.config?.apiKey,
          apiVersion: data.config?.apiVersion,
          isActive: data.config?.isActive,
          bingSearchConfigured: data.config?.bingSearchConfigured,
          bingSearchApiKey: data.config?.bingSearchApiKey,
        };
        setConfig(cfg);
        if (cfg.endpoint) setEndpoint(cfg.endpoint);
        if (cfg.apiVersion) setApiVersion(cfg.apiVersion);
        if (cfg.isActive !== undefined) setIsActive(cfg.isActive);
      }
    } catch {
      // Config not available yet
    }
  }, []);

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/azure-openai/deployments');
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments ?? []);
      }
    } catch {
      // Deployments not available
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchDeployments()]);
      setLoading(false);
    };
    load();
  }, [fetchConfig, fetchDeployments]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const body: Record<string, unknown> = { endpoint, apiVersion, isActive };
      if (apiKey) body.apiKey = apiKey;
      if (bingSearchApiKey) body.bingSearchApiKey = bingSearchApiKey;
      const res = await fetchWithAuth('/api/azure-openai/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaveMessage({ type: 'success', text: 'Configuration saved successfully.' });
        setApiKey('');
        setBingSearchApiKey('');
        await fetchConfig();
      } else {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        setSaveMessage({ type: 'error', text: (err as { error: string }).error ?? 'Save failed.' });
      }
    } catch {
      setSaveMessage({ type: 'error', text: 'Network error — could not save configuration.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = { endpoint, apiVersion };
      if (apiKey) {
        body.apiKey = apiKey;
      }
      const res = await fetchWithAuth('/api/azure-openai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data);
      } else {
        setTestResult({ ok: false, message: data.error ?? 'Test request failed.' });
      }
    } catch {
      setTestResult({ ok: false, message: 'Network error — could not reach server.' });
    } finally {
      setTesting(false);
    }
  };

  const handleAddDeployment = async () => {
    if (!newDeploymentName.trim() || !newModelName) return;
    setAddingDeployment(true);
    try {
      const res = await fetchWithAuth('/api/azure-openai/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deploymentName: newDeploymentName.trim(),
          modelName: newModelName,
          displayName: newDisplayName.trim() || undefined,
          isReasoningModel: newIsReasoningModel,
        }),
      });
      if (res.ok) {
        setNewDeploymentName('');
        setNewModelName(MODEL_NAME_OPTIONS[0]);
        setNewDisplayName('');
        setNewIsReasoningModel(false);
        setShowAddForm(false);
        await fetchDeployments();
      }
    } catch {
      // Silent fail — user sees no new row
    } finally {
      setAddingDeployment(false);
    }
  };

  const handleDeleteDeployment = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetchWithAuth(`/api/azure-openai/deployments/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchDeployments();
      }
    } catch {
      // Silent fail
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
          <Cloud className="h-6 w-6 text-adv-teal" />
          Azure OpenAI Settings
        </h1>
        <p className="text-sm text-adv-gray mt-1">
          Configure your Azure OpenAI Service endpoint and model deployments.
        </p>
      </div>

      {/* Status Banner */}
      {!config?.configured && (
        <div className="flex items-center gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-adv-gold" />
          <span className="text-sm text-adv-gold">
            Azure OpenAI is not configured. Add your endpoint and API key below to get started.
          </span>
        </div>
      )}

      {testResult?.ok && (
        <div className="flex items-center gap-3 rounded-xl border border-adv-green/30 bg-adv-green/5 px-4 py-3">
          <CheckCircle className="h-5 w-5 shrink-0 text-adv-green" />
          <span className="text-sm text-adv-green">Connected to Azure OpenAI successfully.</span>
        </div>
      )}

      {/* ── Configuration Card ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-adv-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-adv-off-white flex items-center gap-2">
            <Settings className="h-5 w-5 text-adv-teal" />
            Configuration
          </h2>
          {config?.configured && config.isActive && (
            <span className="rounded-full bg-adv-green/10 px-3 py-1 text-xs font-medium text-adv-green">
              Active
            </span>
          )}
        </div>

        {/* Endpoint */}
        <div>
          <label className="block text-sm font-medium text-adv-off-white mb-1.5">
            Endpoint
          </label>
          <input
            type="url"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://my-resource.openai.azure.com"
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-adv-gray">
            Your Azure OpenAI resource endpoint URL.
          </p>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-adv-off-white mb-1.5">
            API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config?.apiKeyMasked ?? 'Enter your Azure OpenAI API key'}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 pr-10 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-adv-gray hover:text-adv-off-white"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-adv-gray">
            {config?.apiKeyMasked
              ? `Current key: ${config.apiKeyMasked}. Leave blank to keep existing key.`
              : 'Found in Azure Portal under your OpenAI resource > Keys and Endpoint.'}
          </p>
        </div>

        {/* API Version */}
        <div>
          <label className="block text-sm font-medium text-adv-off-white mb-1.5">
            API Version
          </label>
          <input
            type="text"
            value={apiVersion}
            onChange={(e) => setApiVersion(e.target.value)}
            placeholder={DEFAULT_API_VERSION}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-adv-gray">
            Azure OpenAI API version string (e.g. 2024-10-21).
          </p>
        </div>

        {/* Bing Search API Key */}
        <div>
          <label className="block text-sm font-medium text-adv-off-white mb-1.5">
            Bing Search API Key
            {config?.bingSearchConfigured && (
              <span className="ml-2 text-xs font-normal text-adv-green">Configured</span>
            )}
          </label>
          <input
            type="password"
            value={bingSearchApiKey}
            onChange={(e) => setBingSearchApiKey(e.target.value)}
            placeholder={config?.bingSearchApiKey ?? 'Enter your Bing Web Search API key (optional)'}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
          />
          <p className="mt-1 text-xs text-adv-gray">
            {config?.bingSearchConfigured
              ? `Current key: ${config.bingSearchApiKey}. Leave blank to keep existing key.`
              : 'Enables web search for Azure models. Create a Bing Search resource in Azure Portal and copy the key.'}
          </p>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isActive}
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              isActive ? 'bg-adv-teal' : 'bg-adv-gray/30'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
                isActive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-adv-off-white">
            {isActive ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleSaveConfig}
            disabled={saving || !endpoint.trim()}
            className="rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            ) : (
              'Save Configuration'
            )}
          </button>

          <button
            onClick={handleTestConnection}
            disabled={testing || !config?.configured}
            className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-4 py-2.5 text-sm font-medium text-adv-off-white hover:border-adv-gray-med disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Test Connection
          </button>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              saveMessage.type === 'success'
                ? 'bg-adv-green/10 text-adv-green'
                : 'bg-adv-red/10 text-adv-red'
            }`}
          >
            {saveMessage.type === 'success' ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            {saveMessage.text}
          </div>
        )}

        {/* Test Result (failure detail) */}
        {testResult && !testResult.ok && (
          <div className="flex items-center gap-2 rounded-lg bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
            <XCircle className="h-4 w-4 shrink-0" />
            {testResult.message ?? testResult.error ?? 'Connection test failed.'}
          </div>
        )}

        {/* Test Result: per-deployment details */}
        {testResult?.deploymentResults && testResult.deploymentResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-adv-gray uppercase tracking-wider">
              Deployment Results
            </p>
            {testResult.deploymentResults.map((dr) => (
              <div
                key={dr.deploymentName}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  dr.ok ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-red/10 text-adv-red'
                }`}
              >
                {dr.ok ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="font-medium">{dr.deploymentName}</span>
                {dr.message && <span className="text-xs opacity-80">— {dr.message}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Deployments Card ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-adv-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-adv-off-white">Model Deployments</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Add Deployment
          </button>
        </div>

        {/* Add Deployment Form */}
        {showAddForm && (
          <div className="rounded-lg border border-border bg-adv-dark-2 p-4 space-y-4">
            <h3 className="text-sm font-medium text-adv-off-white">New Deployment</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Deployment Name */}
              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-1.5">
                  Deployment Name <span className="text-adv-red">*</span>
                </label>
                <input
                  type="text"
                  value={newDeploymentName}
                  onChange={(e) => setNewDeploymentName(e.target.value)}
                  placeholder="e.g. gpt-4o-deployment"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                />
              </div>

              {/* Model Name */}
              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-1.5">
                  Model Name <span className="text-adv-red">*</span>
                </label>
                <select
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
                >
                  {MODEL_NAME_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Optional friendly name"
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                />
              </div>

              {/* Reasoning Model */}
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsReasoningModel}
                    onChange={(e) => setNewIsReasoningModel(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal focus:ring-offset-0"
                  />
                  <span className="text-sm font-medium text-adv-off-white">Reasoning Model</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={handleAddDeployment}
                disabled={addingDeployment || !newDeploymentName.trim()}
                className="rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingDeployment ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </span>
                ) : (
                  'Add Deployment'
                )}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewDeploymentName('');
                  setNewModelName(MODEL_NAME_OPTIONS[0]);
                  setNewDisplayName('');
                  setNewIsReasoningModel(false);
                }}
                className="rounded-lg border border-border bg-adv-dark px-4 py-2.5 text-sm font-medium text-adv-off-white hover:border-adv-gray-med"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Deployments Table */}
        {deployments.length === 0 ? (
          <div className="rounded-lg border border-border/50 bg-adv-dark-2 px-6 py-10 text-center">
            <Cloud className="mx-auto h-10 w-10 text-adv-gray/40" />
            <p className="mt-3 text-sm text-adv-gray">
              No deployments configured yet. Add a deployment to start using Azure OpenAI models.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-adv-gray">
                    Deployment Name
                  </th>
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-adv-gray">
                    Model Name
                  </th>
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-adv-gray">
                    Display Name
                  </th>
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-adv-gray">
                    Reasoning
                  </th>
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-adv-gray">
                    Active
                  </th>
                  <th className="pb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {deployments.map((dep) => (
                  <tr key={dep.id} className="group">
                    <td className="py-3 pr-4 font-medium text-adv-off-white">
                      {dep.deploymentName}
                    </td>
                    <td className="py-3 pr-4 text-adv-gray">
                      <span className="rounded-md bg-adv-dark px-2 py-0.5 text-xs font-mono">
                        {dep.modelName}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-adv-gray">
                      {dep.displayName || <span className="text-adv-gray/40">--</span>}
                    </td>
                    <td className="py-3 pr-4">
                      {dep.isReasoningModel ? (
                        <span className="rounded-full bg-adv-blue/10 px-2.5 py-0.5 text-xs font-medium text-adv-blue">
                          Yes
                        </span>
                      ) : (
                        <span className="text-adv-gray/40 text-xs">No</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {dep.isActive !== false ? (
                        <span className="rounded-full bg-adv-green/10 px-2.5 py-0.5 text-xs font-medium text-adv-green">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-adv-gray/10 px-2.5 py-0.5 text-xs font-medium text-adv-gray">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleDeleteDeployment(dep.id)}
                        disabled={deletingId === dep.id}
                        className="rounded-lg bg-adv-red/10 px-3 py-1.5 text-xs font-medium text-adv-red hover:bg-adv-red/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Delete deployment ${dep.deploymentName}`}
                      >
                        {deletingId === dep.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
