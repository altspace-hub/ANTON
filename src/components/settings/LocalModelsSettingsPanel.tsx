/**
 * LocalModelsSettingsPanel
 *
 * Settings tab for cost-effective and local models.
 *
 * Two halves:
 *  1. Ollama — install steps + recommended models + ollama pull commands
 *  2. OpenAI-compatible endpoints (DeepSeek, OpenRouter, Together, Groq, vLLM, …)
 *     with preset templates and a CRUD form.
 *
 * The wiring is already in place (openaiCompatibleAdapter + custom_model_endpoints
 * + unified-llm-client resolution). This panel is the surface for managing it.
 */

import { useEffect, useState } from 'react';
import {
  HardDrive,
  Globe,
  Check,
  X,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Save,
  ExternalLink,
  AlertCircle,
  Server,
  Edit2,
  Sparkles,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────

interface OllamaStatus {
  available: boolean;
  baseUrl: string;
  modelCount?: number;
  models?: Array<{ name: string; size: number }>;
  error?: string;
  hint?: string;
}

interface SafeEndpoint {
  id: number;
  slug: string;
  displayName: string;
  baseUrl: string;
  hasApiKey: boolean;
  defaultModel: string | null;
  availableModels: string[];
  contextWindow: number | null;
  extraHeaders: Record<string, string>;
  enabled: boolean;
  notes: string | null;
  updatedAt: string;
}

interface EndpointForm {
  slug: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  contextWindow: string;
  notes: string;
  refererForOpenRouter?: string;
}

// ── Preset endpoint templates ──────────────────────────────────────────

interface PresetEndpoint {
  slug: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  contextWindow: number;
  signupUrl: string;
  pricing: string;
  notes: string;
  needsExtraHeaders?: boolean;
}

const PRESETS: PresetEndpoint[] = [
  {
    slug: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    contextWindow: 64_000,
    signupUrl: 'https://platform.deepseek.com/',
    pricing: '~$0.14 / 1M input · $0.28 / 1M output (10× cheaper than GPT-4o)',
    notes: 'DeepSeek-V3 and R1 reasoning. Very strong / very cheap. Great default.',
  },
  {
    slug: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct',
    contextWindow: 128_000,
    signupUrl: 'https://openrouter.ai/',
    pricing: 'Pay-as-you-go across 200+ models — single key, transparent prices',
    notes: '200+ models from one key. After saving, set HTTP-Referer and X-Title in extra headers.',
    needsExtraHeaders: true,
  },
  {
    slug: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    contextWindow: 128_000,
    signupUrl: 'https://console.groq.com/',
    pricing: 'Llama / Mixtral / Qwen — extremely fast (500+ tokens/sec)',
    notes: 'Fastest tokens/sec in the industry. Free tier exists. Great for latency-sensitive tasks.',
  },
  {
    slug: 'together',
    displayName: 'Together.ai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    contextWindow: 128_000,
    signupUrl: 'https://api.together.xyz/',
    pricing: 'Llama / Mistral / Qwen / DeepSeek at hosted scale, ~$0.20-$0.90 / 1M',
    notes: 'Hosted open-source models. Good balance of price and speed.',
  },
  {
    slug: 'fireworks',
    displayName: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    contextWindow: 128_000,
    signupUrl: 'https://fireworks.ai/',
    pricing: 'Llama / Qwen / Mixtral — fast inference, competitive pricing',
    notes: 'Production-grade hosted inference. Strong for high-volume workloads.',
  },
  {
    slug: 'vllm',
    displayName: 'Self-hosted vLLM',
    baseUrl: 'http://your-host:8000/v1',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    contextWindow: 32_000,
    signupUrl: 'https://docs.vllm.ai/en/latest/getting_started/installation.html',
    pricing: 'Free — runs on your own GPU',
    notes: 'Production inference server. 5-10× faster than Ollama on the same GPU.',
  },
  {
    slug: 'lmstudio',
    displayName: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'qwen2.5-7b-instruct',
    contextWindow: 32_000,
    signupUrl: 'https://lmstudio.ai/',
    pricing: 'Free — desktop GUI for local models',
    notes: 'macOS / Windows / Linux GUI. Enable the local server in LM Studio settings.',
  },
];

// ── Recommended Ollama models ──────────────────────────────────────────

interface OllamaModel {
  pullCommand: string;
  label: string;
  sizeOnDisk: string;
  ram: string;
  description: string;
  contextWindow: number;
}

const OLLAMA_RECOMMENDED: OllamaModel[] = [
  {
    pullCommand: 'ollama pull qwen2.5:7b',
    label: 'Qwen 2.5 7B',
    sizeOnDisk: '~4.7 GB',
    ram: '8 GB',
    description: 'Alibaba\'s 7B — strong multilingual + reasoning. Best small-model default.',
    contextWindow: 128_000,
  },
  {
    pullCommand: 'ollama pull qwen2.5:14b',
    label: 'Qwen 2.5 14B',
    sizeOnDisk: '~9 GB',
    ram: '16 GB',
    description: 'Mid-size sweet spot. Often beats Llama 3.3 70B on Asian-language tasks.',
    contextWindow: 128_000,
  },
  {
    pullCommand: 'ollama pull deepseek-r1:7b',
    label: 'DeepSeek-R1 7B',
    sizeOnDisk: '~4.7 GB',
    ram: '8 GB',
    description: 'Reasoning model with visible thinking. Small enough for laptops.',
    contextWindow: 64_000,
  },
  {
    pullCommand: 'ollama pull deepseek-r1:32b',
    label: 'DeepSeek-R1 32B',
    sizeOnDisk: '~20 GB',
    ram: '32 GB',
    description: 'Frontier-class reasoning at home — when you have the RAM.',
    contextWindow: 64_000,
  },
  {
    pullCommand: 'ollama pull llama3.3:70b',
    label: 'Llama 3.3 70B',
    sizeOnDisk: '~43 GB',
    ram: '64 GB',
    description: 'Meta\'s flagship open model. Requires beefy hardware.',
    contextWindow: 128_000,
  },
  {
    pullCommand: 'ollama pull mistral-nemo:12b',
    label: 'Mistral Nemo 12B',
    sizeOnDisk: '~7 GB',
    ram: '12 GB',
    description: 'Mistral\'s collaboration with NVIDIA. Great for European languages.',
    contextWindow: 128_000,
  },
  {
    pullCommand: 'ollama pull nomic-embed-text',
    label: 'nomic-embed-text (embeddings)',
    sizeOnDisk: '~275 MB',
    ram: '2 GB',
    description: 'The embedding model ANTON uses for knowledge atoms by default.',
    contextWindow: 8_192,
  },
];

// ── Component ──────────────────────────────────────────────────────────

// ── SDK execution engine (Claude subscription) ────────────────────────

/**
 * Toggle + live test for the Claude Agent SDK execution engine: Anthropic
 * models run through this machine's Claude Code login instead of the
 * Messages API — no API key, usage draws on the Claude subscription.
 * Test works BEFORE enabling (the server bypasses the gate for the ping).
 */
function SdkEngineCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth('/api/settings/sdk-engine')
      .then((r) => (r.ok ? r.json() : { enabled: false, models: [] }))
      .then((d: { enabled: boolean; models: { id: string; label: string }[] }) => {
        setEnabled(!!d.enabled);
        setModels(d.models ?? []);
      })
      .catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    if (enabled === null || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetchWithAuth('/api/settings/sdk-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Save failed (${r.status})`);
      setEnabled(!enabled);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetchWithAuth('/api/settings/sdk-engine/test', { method: 'POST' });
      const d = (await r.json()) as { ok: boolean; message: string };
      setTestResult(d);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-adv-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-adv-teal" />
          <h3 className="text-base font-semibold text-adv-off-white">Claude via SDK — your subscription, no API key</h3>
        </div>
        <button
          onClick={toggle}
          disabled={enabled === null || saving}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
            enabled
              ? 'bg-adv-teal text-adv-dark hover:bg-adv-teal-dark'
              : 'border border-border text-adv-off-white hover:border-adv-teal'
          }`}
        >
          {enabled === null ? 'Loading…' : saving ? 'Saving…' : enabled ? 'Enabled — click to disable' : 'Enable'}
        </button>
      </div>

      <p className="text-sm text-adv-off-white mb-2">
        Runs Anthropic models through the <strong>Claude Code login on this machine</strong> instead of the API.
        Usage draws on your Claude subscription (Pro/Max/Team) — no <code className="text-xs">ANTHROPIC_API_KEY</code> needed.
        Requires Claude Code installed and logged in (run <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">claude</code> once in a terminal).
      </p>
      <p className="text-sm text-adv-gray mb-4">
        What this engine does <em>not</em> do: ANTON's web-search knowledge mode is unavailable on it, the first token
        arrives a few seconds later than the API (a runtime starts per request), and at most 2 requests run at once.
        Everything else — knowledge sources, output formats, thinking levels — works identically.
      </p>

      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={runTest}
          disabled={testing}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-adv-off-white hover:border-adv-teal transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
          {testing ? 'Testing (spawns the runtime — can take ~30s)…' : 'Test the engine'}
        </button>
        <span className="text-xs text-adv-gray">Works before enabling — test first, then switch it on.</span>
      </div>

      {testResult && (
        <div className={`rounded-lg border p-3 mb-3 ${testResult.ok ? 'border-adv-green/30 bg-adv-green/5' : 'border-adv-gold/30 bg-adv-gold/5'}`}>
          <div className="flex items-start gap-2 text-sm">
            {testResult.ok
              ? <Check className="h-4 w-4 text-adv-green shrink-0 mt-0.5" />
              : <AlertCircle className="h-4 w-4 text-adv-gold shrink-0 mt-0.5" />}
            <span className="text-adv-off-white">{testResult.message}</span>
          </div>
        </div>
      )}

      {saveError && (
        <p className="text-sm text-adv-red mb-3">{saveError}</p>
      )}

      {enabled && models.length > 0 && (
        <p className="text-xs text-adv-gray">
          Now available in every model picker under <span className="font-medium text-adv-off-white">Subscription (SDK)</span>:{' '}
          {models.map((m) => m.label).join(' · ')}
        </p>
      )}
    </section>
  );
}

export default function LocalModelsSettingsPanel() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [endpoints, setEndpoints] = useState<SafeEndpoint[]>([]);
  const [endpointsLoading, setEndpointsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [healthChecking, setHealthChecking] = useState<string | null>(null);
  const [healthResult, setHealthResult] = useState<Record<string, { available: boolean; modelCount?: number; error?: string }>>({});
  const [form, setForm] = useState<EndpointForm>({
    slug: '',
    displayName: '',
    baseUrl: '',
    apiKey: '',
    defaultModel: '',
    contextWindow: '',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────
  async function refreshOllama() {
    setOllamaLoading(true);
    try {
      const res = await fetchWithAuth('/api/ollama/status');
      const data = await res.json();
      setOllamaStatus(data);
    } catch (err) {
      setOllamaStatus({ available: false, baseUrl: '', error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setOllamaLoading(false);
    }
  }

  async function refreshEndpoints() {
    setEndpointsLoading(true);
    try {
      const res = await fetchWithAuth('/api/settings/model-endpoints');
      const data = await res.json();
      setEndpoints(data.endpoints ?? []);
    } catch (err) {
      console.error('[LocalModels] Failed to load endpoints:', err);
    } finally {
      setEndpointsLoading(false);
    }
  }

  useEffect(() => {
    void refreshOllama();
    void refreshEndpoints();
  }, []);

  // ── Endpoint mutations ─────────────────────────────────────────────
  function startAdd(preset?: PresetEndpoint) {
    setEditingSlug(null);
    setFormError(null);
    setForm(
      preset
        ? {
            slug: preset.slug,
            displayName: preset.displayName,
            baseUrl: preset.baseUrl,
            apiKey: '',
            defaultModel: preset.defaultModel,
            contextWindow: String(preset.contextWindow),
            notes: preset.notes,
          }
        : {
            slug: '',
            displayName: '',
            baseUrl: '',
            apiKey: '',
            defaultModel: '',
            contextWindow: '',
            notes: '',
          },
    );
    setShowAddForm(true);
  }

  function startEdit(ep: SafeEndpoint) {
    setEditingSlug(ep.slug);
    setFormError(null);
    setForm({
      slug: ep.slug,
      displayName: ep.displayName,
      baseUrl: ep.baseUrl,
      apiKey: '', // never re-display existing key
      defaultModel: ep.defaultModel ?? '',
      contextWindow: ep.contextWindow ? String(ep.contextWindow) : '',
      notes: ep.notes ?? '',
    });
    setShowAddForm(true);
  }

  function cancelForm() {
    setShowAddForm(false);
    setEditingSlug(null);
    setFormError(null);
  }

  async function saveForm() {
    setFormError(null);
    setFormSaving(true);
    try {
      const payload: Record<string, unknown> = {
        slug: form.slug,
        displayName: form.displayName,
        baseUrl: form.baseUrl,
        defaultModel: form.defaultModel || undefined,
        contextWindow: form.contextWindow ? Number(form.contextWindow) : undefined,
        notes: form.notes || undefined,
      };
      if (form.apiKey) payload.apiKey = form.apiKey;

      const url = editingSlug
        ? `/api/settings/model-endpoints/${editingSlug}`
        : '/api/settings/model-endpoints';
      const method = editingSlug ? 'PATCH' : 'POST';
      // For PATCH, omit the slug — it's the path
      if (editingSlug) delete (payload as Record<string, unknown>).slug;

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await refreshEndpoints();
      cancelForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setFormSaving(false);
    }
  }

  async function deleteEndpoint(slug: string) {
    if (!confirm(`Delete endpoint "${slug}"? This cannot be undone.`)) return;
    try {
      const res = await fetchWithAuth(`/api/settings/model-endpoints/${slug}`, { method: 'DELETE' });
      if (res.ok) await refreshEndpoints();
    } catch (err) {
      console.error('[LocalModels] Delete failed:', err);
    }
  }

  async function checkHealth(slug: string) {
    setHealthChecking(slug);
    try {
      const res = await fetchWithAuth(`/api/settings/model-endpoints/${slug}/health`, { method: 'POST' });
      const data = await res.json();
      setHealthResult((prev) => ({ ...prev, [slug]: data }));
      if (data.available) await refreshEndpoints();
    } catch (err) {
      setHealthResult((prev) => ({
        ...prev,
        [slug]: { available: false, error: err instanceof Error ? err.message : 'Unknown error' },
      }));
    } finally {
      setHealthChecking(null);
    }
  }

  function copyToClipboard(text: string) {
    void navigator.clipboard.writeText(text);
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-adv-off-white mb-1">Local & cost-effective models</h2>
        <p className="text-sm text-adv-gray max-w-3xl">
          Run Claude on your subscription via the SDK engine, use Ollama for fully-local inference, or plug in an
          OpenAI-compatible endpoint (DeepSeek, OpenRouter, Together, Groq, vLLM, LM Studio) for cheap or fast
          hosted models. The same workspace, every provider, switchable per session.
        </p>
      </div>

      {/* ── SDK EXECUTION ENGINE (Claude subscription) ─────────────── */}
      <SdkEngineCard />

      {/* ── OLLAMA SECTION ────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-adv-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-adv-teal" />
            <h3 className="text-base font-semibold text-adv-off-white">Ollama — fully local models</h3>
          </div>
          <button
            onClick={refreshOllama}
            disabled={ollamaLoading}
            className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${ollamaLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Status */}
        <div className="mb-4">
          {ollamaStatus === null ? (
            <p className="text-sm text-adv-gray">Checking Ollama…</p>
          ) : ollamaStatus.available ? (
            <div className="flex items-center gap-3 text-sm">
              <Check className="h-4 w-4 text-adv-green" />
              <span className="text-adv-off-white">
                Ollama running at <code className="text-xs">{ollamaStatus.baseUrl}</code> — {ollamaStatus.modelCount}{' '}
                model{ollamaStatus.modelCount === 1 ? '' : 's'} installed
              </span>
            </div>
          ) : (
            <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/5 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-adv-gold shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-adv-off-white">Ollama not detected at <code className="text-xs">{ollamaStatus.baseUrl || 'localhost:11434'}</code>.</p>
                  {ollamaStatus.error && <p className="text-xs text-adv-gray mt-1">{ollamaStatus.error}</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Setup steps */}
        <details className="mb-4">
          <summary className="cursor-pointer text-sm font-medium text-adv-teal select-none">How to set up Ollama →</summary>
          <div className="mt-3 space-y-2 text-sm text-adv-off-white">
            <ol className="list-decimal list-inside space-y-1.5 ml-2">
              <li>
                Download Ollama from{' '}
                <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-adv-teal hover:underline">
                  ollama.com <ExternalLink className="inline h-3 w-3" />
                </a>{' '}
                — available for macOS, Windows, and Linux.
              </li>
              <li>Install + start. It runs as a service on <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">localhost:11434</code>.</li>
              <li>Pull one or more models (see recommended list below).</li>
              <li>That's it — refresh this page and Ollama models will appear in every ModelSelector.</li>
            </ol>

            <div className="mt-3 rounded-lg border border-border bg-adv-dark/40 p-3">
              <p className="text-xs font-medium text-adv-gray mb-1">Remote Ollama?</p>
              <p className="text-xs text-adv-gray">
                Set <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">OLLAMA_BASE_URL</code> in your <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">.env</code> to point at a different host (LAN box, Tailscale peer, etc.). Set <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">OLLAMA_AUTH_TOKEN</code> if it sits behind a reverse proxy that requires a bearer token.
              </p>
            </div>
          </div>
        </details>

        {/* Recommended models */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-adv-gray mb-2">Recommended models</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {OLLAMA_RECOMMENDED.map((m) => (
              <div key={m.pullCommand} className="rounded-lg border border-border bg-adv-dark/30 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="text-sm font-medium text-adv-off-white">{m.label}</p>
                    <p className="text-[11px] text-adv-gray">{m.sizeOnDisk} on disk · {m.ram} RAM · {(m.contextWindow / 1000).toFixed(0)}K context</p>
                  </div>
                </div>
                <p className="text-xs text-adv-gray mb-2">{m.description}</p>
                <div className="flex items-center gap-1.5">
                  <code className="text-[11px] bg-adv-dark px-2 py-1 rounded flex-1 text-adv-off-white">{m.pullCommand}</code>
                  <button
                    onClick={() => copyToClipboard(m.pullCommand)}
                    className="p-1.5 rounded hover:bg-adv-card text-adv-gray hover:text-adv-teal transition-colors"
                    title="Copy command"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CUSTOM ENDPOINTS SECTION ────────────────────────────── */}
      <section className="rounded-xl border border-border bg-adv-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-adv-teal" />
            <h3 className="text-base font-semibold text-adv-off-white">OpenAI-compatible endpoints</h3>
          </div>
          {!showAddForm && (
            <button
              onClick={() => startAdd()}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add endpoint
            </button>
          )}
        </div>

        <p className="text-sm text-adv-gray mb-4 max-w-3xl">
          Plug in DeepSeek, OpenRouter, Together, Groq, Fireworks, or your own self-hosted vLLM / LM Studio /
          llama.cpp server. API keys are AES-256-GCM encrypted at rest. Models from each endpoint become
          selectable in every ModelSelector as <code className="text-xs">compat:&lt;slug&gt;:&lt;model&gt;</code>.
        </p>

        {/* Preset templates — only when no form is open and there are no endpoints yet */}
        {!showAddForm && (
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-adv-gray mb-2">Quick-add presets</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const alreadyAdded = endpoints.some((e) => e.slug === p.slug);
                return (
                  <button
                    key={p.slug}
                    onClick={() => startAdd(p)}
                    disabled={alreadyAdded}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      alreadyAdded
                        ? 'border-border bg-adv-dark/20 opacity-50 cursor-not-allowed'
                        : 'border-border bg-adv-dark/30 hover:border-adv-teal hover:bg-adv-dark/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="text-sm font-medium text-adv-off-white flex items-center gap-1.5">
                          {p.displayName}
                          {alreadyAdded && <span className="text-[10px] uppercase tracking-wider text-adv-green">added</span>}
                        </p>
                        <p className="text-[11px] text-adv-gray">{p.pricing}</p>
                      </div>
                      <a
                        href={p.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-adv-gray hover:text-adv-teal"
                        title="Sign up"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    <p className="text-xs text-adv-gray">{p.notes}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Add / edit form */}
        {showAddForm && (
          <div className="mb-4 rounded-lg border border-adv-teal/40 bg-adv-dark/40 p-4 space-y-3">
            <p className="text-sm font-medium text-adv-teal">
              {editingSlug ? `Edit "${editingSlug}"` : 'New OpenAI-compatible endpoint'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <Field
                label="Slug"
                hint="lowercase, a-z, 0-9, dashes — used in model IDs"
                value={form.slug}
                onChange={(v) => setForm({ ...form, slug: v })}
                disabled={!!editingSlug}
                placeholder="deepseek"
              />
              <Field
                label="Display name"
                value={form.displayName}
                onChange={(v) => setForm({ ...form, displayName: v })}
                placeholder="DeepSeek"
              />
              <Field
                label="Base URL"
                hint="OpenAI-compatible /v1 root"
                value={form.baseUrl}
                onChange={(v) => setForm({ ...form, baseUrl: v })}
                placeholder="https://api.deepseek.com/v1"
                fullWidth
              />
              <Field
                label={editingSlug ? 'API key (leave blank to keep existing)' : 'API key'}
                hint="Encrypted at rest"
                value={form.apiKey}
                onChange={(v) => setForm({ ...form, apiKey: v })}
                placeholder="sk-…"
                isPassword
                fullWidth
              />
              <Field
                label="Default model"
                hint="Recommended model id for this endpoint"
                value={form.defaultModel}
                onChange={(v) => setForm({ ...form, defaultModel: v })}
                placeholder="deepseek-chat"
              />
              <Field
                label="Context window"
                hint="Optional — informational"
                value={form.contextWindow}
                onChange={(v) => setForm({ ...form, contextWindow: v })}
                placeholder="64000"
                isNumber
              />
              <Field
                label="Notes"
                value={form.notes}
                onChange={(v) => setForm({ ...form, notes: v })}
                placeholder="Optional — visible in Settings only"
                fullWidth
              />
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/5 p-2.5">
                <AlertCircle className="h-4 w-4 text-adv-red shrink-0 mt-0.5" />
                <p className="text-xs text-adv-red">{formError}</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveForm}
                disabled={formSaving || !form.slug || !form.displayName || !form.baseUrl}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-3.5 w-3.5" /> {formSaving ? 'Saving…' : 'Save endpoint'}
              </button>
              <button
                onClick={cancelForm}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing endpoints */}
        {endpointsLoading ? (
          <p className="text-sm text-adv-gray">Loading endpoints…</p>
        ) : endpoints.length === 0 ? (
          <p className="text-sm text-adv-gray">No custom endpoints yet. Pick a preset above to get started.</p>
        ) : (
          <div className="space-y-2">
            {endpoints.map((ep) => {
              const health = healthResult[ep.slug];
              return (
                <div key={ep.slug} className="rounded-lg border border-border bg-adv-dark/30 p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-adv-off-white">{ep.displayName}</p>
                        <code className="text-[10px] bg-adv-dark px-1.5 py-0.5 rounded text-adv-gray">{ep.slug}</code>
                        {!ep.enabled && (
                          <span className="text-[10px] uppercase tracking-wider text-adv-gold">disabled</span>
                        )}
                        {ep.hasApiKey ? (
                          <span className="text-[10px] uppercase tracking-wider text-adv-green">key set</span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-adv-gold">no key</span>
                        )}
                      </div>
                      <p className="text-[11px] text-adv-gray font-mono">{ep.baseUrl}</p>
                      {ep.defaultModel && (
                        <p className="text-[11px] text-adv-gray">Default: <code className="text-xs">{ep.defaultModel}</code></p>
                      )}
                      {ep.availableModels.length > 0 && (
                        <p className="text-[11px] text-adv-gray mt-0.5">{ep.availableModels.length} model{ep.availableModels.length === 1 ? '' : 's'} discovered</p>
                      )}
                      {ep.notes && <p className="text-[11px] text-adv-gray italic mt-0.5">{ep.notes}</p>}
                      {health && (
                        <p className={`text-[11px] mt-1 ${health.available ? 'text-adv-green' : 'text-adv-red'}`}>
                          {health.available
                            ? `✓ Healthy — ${health.modelCount ?? 0} models exposed`
                            : `✗ ${health.error ?? 'Not reachable'}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => checkHealth(ep.slug)}
                        disabled={healthChecking === ep.slug}
                        className="p-1.5 rounded hover:bg-adv-card text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-50"
                        title="Health check"
                      >
                        {healthChecking === ep.slug ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Server className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => startEdit(ep)}
                        className="p-1.5 rounded hover:bg-adv-card text-adv-gray hover:text-adv-teal transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteEndpoint(ep.slug)}
                        className="p-1.5 rounded hover:bg-adv-card text-adv-gray hover:text-adv-red transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── HOW TO USE ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-adv-card p-5">
        <h3 className="text-base font-semibold text-adv-off-white mb-3">How models flow once configured</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-adv-off-white ml-2">
          <li>Configure an Ollama / custom endpoint above.</li>
          <li>
            Open the model picker anywhere in ANTON (top bar, module config, mission template). Local Ollama models
            appear under "Local (Ollama)"; custom endpoints' models become selectable as{' '}
            <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">compat:&lt;slug&gt;:&lt;model&gt;</code>.
          </li>
          <li>Switch model per session, per module, or per question. Knowledge stays on your side.</li>
          <li>
            Pro tip: run the same module against two different models (e.g. Claude Opus vs DeepSeek) and compare via{' '}
            <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">/comparison</code> to see whether the cheap model is good enough for your task.
          </li>
        </ol>
      </section>
    </div>
  );
}

// ── Small form field component ─────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  isPassword?: boolean;
  isNumber?: boolean;
}

function Field({ label, value, onChange, placeholder, hint, disabled, fullWidth, isPassword, isNumber }: FieldProps) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <label className="block text-xs text-adv-gray mb-1">
        {label}
        {hint && <span className="text-adv-gray opacity-60"> · {hint}</span>}
      </label>
      <input
        type={isPassword ? 'password' : isNumber ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 disabled:opacity-50 focus:outline-none focus:border-adv-teal transition-colors"
      />
    </div>
  );
}
