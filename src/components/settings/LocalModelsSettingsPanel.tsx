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

import { useEffect, useState, type ReactNode } from 'react';
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
import {
  buildEndpointPayload,
  describeModelMeta,
  jsonForEditor,
  normaliseAllowedModels,
  openRouterAttributionHeaders,
  parseExtraBodyInput,
  parseExtraHeadersInput,
  parseMaxOutputTokensInput,
  parsePriceInput,
  OPENROUTER_EU_ZDR_EXTRA_BODY,
  OPENROUTER_SHOWCASE_MODEL,
  type EndpointFormValues,
  type EndpointModelMeta,
} from '@/lib/model-endpoint-form';

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
  /** Merged into every request body (e.g. OpenRouter provider routing). */
  extraBody?: Record<string, unknown>;
  /** Non-empty = only these bare model ids may run on this endpoint. */
  allowedModels?: string[];
  /** Ceiling for max_tokens on this endpoint. */
  maxOutputTokens?: number | null;
  /** Read-only: what the endpoint's /models said, per bare model id. */
  modelMeta?: Record<string, EndpointModelMeta>;
  /** USD per million tokens, for spend caps on an endpoint that reports no cost. */
  inputPricePerMillion?: number | null;
  outputPricePerMillion?: number | null;
  enabled: boolean;
  notes: string | null;
  updatedAt: string;
}

type EndpointForm = EndpointFormValues;

const EMPTY_FORM: EndpointForm = {
  slug: '',
  displayName: '',
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  contextWindow: '',
  notes: '',
  extraHeaders: '',
  extraBody: '',
  allowedModels: [],
  maxOutputTokens: '',
  inputPricePerMillion: '',
  outputPricePerMillion: '',
};

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
  /** Pre-filled extra request body. */
  extraBody?: Readonly<Record<string, unknown>>;
  /** Pre-filled allow-list. */
  allowedModels?: string[];
  /** Pre-fill the OpenRouter app-attribution headers for this page's origin. */
  attributionHeaders?: boolean;
  /**
   * Pre-filled prices (USD per 1M tokens). Used to reserve a call's worst case
   * before it is sent and to price one cut short. OpenRouter's /models lists
   * the cheapest provider's (often promotional) price, not the pinned ones'.
   */
  prices?: { input: number; output: number };
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
    // Pre-set for the public showcase: GLM 5.3 Flash pinned to the two EU
    // zero-retention providers. The provider pin applies to every model on the
    // endpoint, so the allow-list starts with that one model.
    slug: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: OPENROUTER_SHOWCASE_MODEL,
    contextWindow: 131_072,
    signupUrl: 'https://openrouter.ai/',
    pricing: 'One key for 400+ models, pay as you go. Pre-set: GLM 5.3 Flash (list price about $0.15 in / $0.50 out per 1M)',
    notes: 'Pre-filled for GLM 5.3 Flash on the EU zero-retention providers (Inceptron, NextBit; no fallback), with the app-attribution headers. To run other models, change provider.only in the extra body and the allowed models.',
    extraBody: OPENROUTER_EU_ZDR_EXTRA_BODY,
    allowedModels: [OPENROUTER_SHOWCASE_MODEL],
    attributionHeaders: true,
    // The dearer of the two pinned providers (NextBit, 2026-09-25); Inceptron
    // charged about $0.11 / $0.50 in a live check. /models says $0.045 / $0.14,
    // which is one other provider's promotional price.
    prices: { input: 0.165, output: 0.55 },
  },
  {
    slug: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    contextWindow: 131_072,
    signupUrl: 'https://console.groq.com/',
    pricing: 'gpt-oss / Llama / Qwen — extremely fast (500+ tokens/sec)',
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
    defaultModel: 'openai/gpt-oss-120b',
    contextWindow: 131_072,
    signupUrl: 'https://docs.vllm.ai/en/latest/getting_started/installation.html',
    pricing: 'Free — runs on your own GPU',
    notes: 'Production inference server for a shared machine. The model is the Hugging Face repo id vLLM was started with (openai/gpt-oss-20b fits one 16 GB+ GPU). Start with --enable-auto-tool-choice for tool calls.',
  },
  {
    slug: 'lmstudio',
    displayName: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'openai/gpt-oss-20b',
    contextWindow: 131_072,
    signupUrl: 'https://lmstudio.ai/',
    pricing: 'Free — desktop GUI for local models',
    notes: 'macOS / Windows / Linux GUI. Enable the local server in LM Studio settings; use the model key LM Studio shows for the loaded model.',
  },
  {
    slug: 'llamacpp',
    displayName: 'llama.cpp server (local)',
    baseUrl: 'http://localhost:8080/v1',
    defaultModel: 'local-model',
    contextWindow: 32_000,
    signupUrl: 'https://github.com/ggml-org/llama.cpp',
    pricing: 'Free — runs a GGUF file on your own CPU / GPU',
    notes: 'llama-server answers with the model it was started with. Set the context window to the -c value you started it with.',
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

// Tags, download sizes and context windows as listed on ollama.com/library,
// checked 2026-09-23. RAM is a working guide: the download plus room for context.
const OLLAMA_RECOMMENDED: OllamaModel[] = [
  {
    pullCommand: 'ollama pull qwen3.5:9b',
    label: 'Qwen 3.5 9B',
    sizeOnDisk: '~6.6 GB',
    ram: '12 GB',
    description: "Alibaba's current small model — strong multilingual + reasoning, 256K context. Best small-model default. Apache 2.0.",
    contextWindow: 256_000,
  },
  {
    pullCommand: 'ollama pull gemma4:12b',
    label: 'Gemma 4 12B',
    sizeOnDisk: '~7.6 GB',
    ram: '16 GB',
    description: "Google's Gemma 4 — the first Gemma under Apache 2.0. Good European-language quality, 256K context.",
    contextWindow: 256_000,
  },
  {
    pullCommand: 'ollama pull gpt-oss:20b',
    label: 'gpt-oss 20B',
    sizeOnDisk: '~14 GB',
    ram: '24 GB',
    description: "OpenAI's open-weight reasoning model. Adjustable reasoning, strong tool use. Apache 2.0.",
    contextWindow: 128_000,
  },
  {
    pullCommand: 'ollama pull qwen3.5:27b',
    label: 'Qwen 3.5 27B',
    sizeOnDisk: '~17 GB',
    ram: '32 GB',
    description: 'Mid-size sweet spot for a workstation or a small server GPU. 256K context.',
    contextWindow: 256_000,
  },
  {
    pullCommand: 'ollama pull deepseek-r1:32b',
    label: 'DeepSeek-R1 32B',
    sizeOnDisk: '~20 GB',
    ram: '32 GB',
    description: 'Reasoning model with visible thinking. MIT licence.',
    contextWindow: 128_000,
  },
  {
    pullCommand: 'ollama pull gpt-oss:120b',
    label: 'gpt-oss 120B',
    sizeOnDisk: '~65 GB',
    ram: '80 GB',
    description: 'Near-frontier open model for a shared server with a large GPU (or 80 GB+ unified memory). Apache 2.0.',
    contextWindow: 128_000,
  },
  {
    pullCommand: 'ollama pull nomic-embed-text',
    label: 'nomic-embed-text (embeddings)',
    sizeOnDisk: '~275 MB',
    ram: '2 GB',
    description: 'The embedding model ANTON uses for knowledge atoms by default. bge-m3 is the multilingual alternative (set OLLAMA_EMBEDDING_MODEL).',
    contextWindow: 8_192,
  },
];

// ── Component ──────────────────────────────────────────────────────────

// ── Subscription execution engines (Claude / ChatGPT) ─────────────────

/**
 * Toggle + live test for a subscription execution engine: models run through
 * a machine login (Claude Code / ChatGPT sign-in) instead of an API key.
 * Test works BEFORE enabling (the server bypasses the gate for the ping).
 */
function SubscriptionEngineCard(props: {
  endpoint: string; // e.g. '/api/settings/sdk-engine'
  title: string;
  description: ReactNode;
  notes: ReactNode;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth(props.endpoint)
      .then((r) => (r.ok ? r.json() : { enabled: false, models: [] }))
      .then((d: { enabled: boolean; models: { id: string; label: string }[] }) => {
        setEnabled(!!d.enabled);
        setModels(d.models ?? []);
      })
      .catch(() => setEnabled(false));
  }, [props.endpoint]);

  const toggle = async () => {
    if (enabled === null || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetchWithAuth(props.endpoint, {
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
      const r = await fetchWithAuth(`${props.endpoint}/test`, { method: 'POST' });
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
          <h3 className="text-base font-semibold text-adv-off-white">{props.title}</h3>
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

      <p className="text-sm text-adv-off-white mb-2">{props.description}</p>
      <p className="text-sm text-adv-gray mb-4">{props.notes}</p>

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

function SdkEngineCard() {
  return (
    <SubscriptionEngineCard
      endpoint="/api/settings/sdk-engine"
      title="Claude via SDK — your subscription, no API key"
      description={
        <>
          Runs Anthropic models through the <strong>Claude Code login on this machine</strong> instead of the API.
          Usage draws on your Claude subscription (Pro/Max/Team) — no <code className="text-xs">ANTHROPIC_API_KEY</code> needed.
          Requires Claude Code installed and logged in (run <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">claude</code> once in a terminal).
        </>
      }
      notes={
        <>
          What this engine does <em>not</em> do: ANTON's web-search knowledge mode is unavailable on it, the first token
          arrives a few seconds later than the API (a runtime starts per request), and at most 2 requests run at once.
          Everything else — knowledge sources, output formats, thinking levels — works identically.
        </>
      }
    />
  );
}

function CodexEngineCard() {
  return (
    <SubscriptionEngineCard
      endpoint="/api/settings/codex-engine"
      title="ChatGPT via Codex — your subscription, no API key"
      description={
        <>
          Runs OpenAI models through the <strong>ChatGPT sign-in on this machine</strong> instead of the API.
          Usage draws on your ChatGPT subscription (Plus/Pro/Team) — no <code className="text-xs">OPENAI_API_KEY</code> needed.
          Sign in once with <code className="text-xs bg-adv-dark px-1 py-0.5 rounded">npx codex login</code> in the ANTON folder
          (opens a browser; the runtime itself is bundled with ANTON).
        </>
      }
      notes={
        <>
          Honest limits: ANTON's web-search knowledge mode is unavailable on it, ANTON's instructions ride inside the
          prompt (Codex has no separate system-prompt channel), the first token arrives seconds later than the API,
          and at most 2 requests run at once. The run executes in a read-only sandbox with network access off.
        </>
      }
    />
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
  const [form, setForm] = useState<EndpointForm>(EMPTY_FORM);
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
            ...EMPTY_FORM,
            slug: preset.slug,
            displayName: preset.displayName,
            baseUrl: preset.baseUrl,
            defaultModel: preset.defaultModel,
            contextWindow: String(preset.contextWindow),
            notes: preset.notes,
            extraHeaders: preset.attributionHeaders
              ? jsonForEditor(openRouterAttributionHeaders(window.location.origin))
              : '',
            extraBody: jsonForEditor(preset.extraBody ? { ...preset.extraBody } : undefined),
            allowedModels: preset.allowedModels ? [...preset.allowedModels] : [],
            inputPricePerMillion: preset.prices ? String(preset.prices.input) : '',
            outputPricePerMillion: preset.prices ? String(preset.prices.output) : '',
          }
        : EMPTY_FORM,
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
      extraHeaders: jsonForEditor(ep.extraHeaders),
      extraBody: jsonForEditor(ep.extraBody),
      allowedModels: ep.allowedModels ?? [],
      maxOutputTokens: ep.maxOutputTokens ? String(ep.maxOutputTokens) : '',
      inputPricePerMillion: ep.inputPricePerMillion != null ? String(ep.inputPricePerMillion) : '',
      outputPricePerMillion: ep.outputPricePerMillion != null ? String(ep.outputPricePerMillion) : '',
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
    // The JSON fields are checked here so a typo never reaches the server.
    const built = buildEndpointPayload(form, !!editingSlug);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    setFormSaving(true);
    try {
      // For PATCH the slug is the path, not part of the body.
      const url = editingSlug
        ? `/api/settings/model-endpoints/${editingSlug}`
        : '/api/settings/model-endpoints';
      const method = editingSlug ? 'PATCH' : 'POST';

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.value),
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

      {/* ── SUBSCRIPTION EXECUTION ENGINES (Claude / ChatGPT) ──────── */}
      <SdkEngineCard />
      <CodexEngineCard />

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
              <Field
                label="Max output tokens"
                hint="Optional — ceiling for every answer on this endpoint; reasoning counts against it"
                value={form.maxOutputTokens}
                onChange={(v) => setForm({ ...form, maxOutputTokens: v })}
                placeholder="16000"
                isNumber
                error={formFieldError(parseMaxOutputTokensInput(form.maxOutputTokens))}
              />
              <Field
                label="Input price (USD per 1M tokens)"
                hint="Optional — only for an endpoint that reports no cost (OpenRouter does); feeds the daily spend caps"
                value={form.inputPricePerMillion}
                onChange={(v) => setForm({ ...form, inputPricePerMillion: v })}
                placeholder="0.15"
                inputMode="decimal"
                error={formFieldError(parsePriceInput(form.inputPricePerMillion, 'Input price'))}
              />
              <Field
                label="Output price (USD per 1M tokens)"
                hint="Optional — as above; reasoning is billed as output"
                value={form.outputPricePerMillion}
                onChange={(v) => setForm({ ...form, outputPricePerMillion: v })}
                placeholder="0.50"
                inputMode="decimal"
                error={formFieldError(parsePriceInput(form.outputPricePerMillion, 'Output price'))}
              />
            </div>

            <AllowedModelsPicker
              selected={form.allowedModels}
              discovered={editingSlug ? endpoints.find((e) => e.slug === editingSlug)?.availableModels ?? [] : []}
              meta={editingSlug ? endpoints.find((e) => e.slug === editingSlug)?.modelMeta : undefined}
              onChange={(next) => setForm({ ...form, allowedModels: next })}
            />

            <JsonField
              label="Extra headers (JSON)"
              hint="Sent with every request, e.g. OpenRouter's HTTP-Referer and X-OpenRouter-Title. Stored as plain text — never put a key here."
              value={form.extraHeaders}
              onChange={(v) => setForm({ ...form, extraHeaders: v })}
              placeholder={'{\n  "HTTP-Referer": "https://anton.example.com"\n}'}
              error={formFieldError(parseExtraHeadersInput(form.extraHeaders))}
              rows={4}
            />

            <JsonField
              label="Extra request body (JSON)"
              hint="Merged into every request, e.g. OpenRouter provider routing or plugins. ANTON sets model, messages and stream itself."
              value={form.extraBody}
              onChange={(v) => setForm({ ...form, extraBody: v })}
              placeholder={'{\n  "provider": { "zdr": true, "data_collection": "deny" }\n}'}
              error={formFieldError(parseExtraBodyInput(form.extraBody))}
              rows={7}
            />

            {formError && (
              <div className="flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/5 p-2.5">
                <AlertCircle className="h-4 w-4 text-adv-red shrink-0 mt-0.5" />
                <p className="text-xs text-adv-red">{formError}</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveForm}
                disabled={formSaving || !form.slug || !form.displayName || !form.baseUrl || !buildEndpointPayload(form, !!editingSlug).ok}
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
              const extraBodyKeys = Object.keys(ep.extraBody ?? {});
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
                      {(ep.allowedModels ?? []).length > 0 ? (
                        <div className="mt-0.5 text-[11px] text-adv-gray">
                          <span className="text-adv-off-white">Only these models may run:</span>
                          <ul className="ml-3 list-disc">
                            {(ep.allowedModels ?? []).map((m) => {
                              const meta = describeModelMeta(ep.modelMeta?.[m]);
                              return (
                                <li key={m}>
                                  <code className="text-xs">{m}</code>
                                  {meta && <span> — {meta}</span>}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-[11px] text-adv-gray mt-0.5">Any model the endpoint lists may run (no allowed-models list).</p>
                      )}
                      {(ep.maxOutputTokens || extraBodyKeys.length > 0) ? (
                        <p className="text-[11px] text-adv-gray mt-0.5">
                          {[
                            ep.maxOutputTokens ? `Answers capped at ${ep.maxOutputTokens.toLocaleString()} tokens` : '',
                            extraBodyKeys.length > 0 ? `Extra request body: ${extraBodyKeys.join(', ')}` : '',
                          ].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                      {(ep.inputPricePerMillion != null || ep.outputPricePerMillion != null) ? (
                        <p className="text-[11px] text-adv-gray mt-0.5">
                          Priced at ${ep.inputPricePerMillion ?? 0} in / ${ep.outputPricePerMillion ?? 0} out per 1M tokens
                        </p>
                      ) : null}
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
  /** A text field for a decimal value (a number input steps by whole units). */
  inputMode?: 'decimal';
  error?: string;
}

function Field({ label, value, onChange, placeholder, hint, disabled, fullWidth, isPassword, isNumber, inputMode, error }: FieldProps) {
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
        inputMode={inputMode}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 disabled:opacity-50 focus:outline-none focus:border-adv-teal transition-colors ${error ? 'border-adv-red' : 'border-border'}`}
      />
      {error && <p className="mt-1 text-xs text-adv-red">{error}</p>}
    </div>
  );
}

function formFieldError(result: { ok: true } | { ok: false; error: string }): string | undefined {
  return result.ok ? undefined : result.error;
}

// ── JSON text field (extra headers / extra request body) ──────────────

interface JsonFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
  rows: number;
}

function JsonField({ label, hint, value, onChange, placeholder, error, rows }: JsonFieldProps) {
  return (
    <div>
      <label className="block text-xs text-adv-gray mb-1">
        {label}
        <span className="text-adv-gray opacity-60"> · {hint}</span>
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border bg-adv-dark px-3 py-1.5 font-mono text-xs text-adv-off-white placeholder:text-adv-gray/50 focus:outline-none focus:border-adv-teal transition-colors ${error ? 'border-adv-red' : 'border-border'}`}
      />
      {error && <p className="mt-1 text-xs text-adv-red">{error}</p>}
    </div>
  );
}

// ── Allowed models: pick from the endpoint's discovered list ──────────

const MAX_LISTED_MODELS = 100;

interface AllowedModelsPickerProps {
  selected: string[];
  /** What the endpoint's last health check discovered. */
  discovered: string[];
  meta?: Record<string, EndpointModelMeta>;
  onChange: (next: string[]) => void;
}

function AllowedModelsPicker({ selected, discovered, meta, onChange }: AllowedModelsPickerProps) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const matches = discovered.filter((m) => !needle || m.toLowerCase().includes(needle));
  const typed = filter.trim();
  const canAddTyped = typed.length > 0 && !selected.includes(typed);

  const toggle = (model: string) => {
    onChange(selected.includes(model) ? selected.filter((m) => m !== model) : normaliseAllowedModels([...selected, model]));
  };

  return (
    <div>
      <p className="block text-xs text-adv-gray mb-1">
        Allowed models
        <span className="opacity-60">
          {' '}· Only these models may run on this endpoint, for everyone — the server refuses any other. Empty = any model the endpoint lists.
        </span>
      </p>

      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <span key={m} className="flex items-center gap-1 rounded bg-adv-teal/10 px-2 py-0.5 text-xs text-adv-teal">
              <code>{m}</code>
              <button
                type="button"
                onClick={() => toggle(m)}
                className="rounded hover:text-adv-red"
                aria-label={`Remove ${m} from allowed models`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={discovered.length > 0 ? `Filter ${discovered.length} discovered models, or type a model id` : 'Type a model id, e.g. z-ai/glm-5.3-flash'}
          aria-label="Filter discovered models or type a model id"
          className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white placeholder:text-adv-gray/50 focus:outline-none focus:border-adv-teal transition-colors"
        />
        <button
          type="button"
          onClick={() => {
            onChange(normaliseAllowedModels([...selected, typed]));
            setFilter('');
          }}
          disabled={!canAddTyped}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {discovered.length === 0 ? (
        <p className="mt-1 text-xs text-adv-gray">
          Save the endpoint and run its health check (the server icon) to list the models it offers, or type a model id above.
        </p>
      ) : (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-adv-dark/40">
          {matches.slice(0, MAX_LISTED_MODELS).map((m) => {
            const line = describeModelMeta(meta?.[m]);
            return (
              <label key={m} className="flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-adv-dark">
                <input
                  type="checkbox"
                  checked={selected.includes(m)}
                  onChange={() => toggle(m)}
                  className="mt-0.5 rounded border-adv-gray-med accent-adv-teal"
                />
                <span className="min-w-0">
                  <code className="text-xs text-adv-off-white">{m}</code>
                  {line && <span className="block text-[11px] text-adv-gray">{line}</span>}
                </span>
              </label>
            );
          })}
          {matches.length > MAX_LISTED_MODELS && (
            <p className="px-3 py-1.5 text-xs text-adv-gray">
              {matches.length - MAX_LISTED_MODELS} more — narrow the filter.
            </p>
          )}
          {matches.length === 0 && <p className="px-3 py-1.5 text-xs text-adv-gray">No discovered model matches.</p>}
        </div>
      )}
    </div>
  );
}
