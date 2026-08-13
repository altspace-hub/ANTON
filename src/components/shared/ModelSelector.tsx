import { Fragment, useEffect, useRef, useState } from 'react';
import { MODELS } from '@/lib/constants';
import type { ModelId, ModelInfo } from '@/lib/types';
import { Star, HardDrive, ChevronDown, Check, Sparkles, AlertTriangle, Cloud, Zap } from 'lucide-react';

// MGOV-03: Compute days until a model's EOL date (negative = already past)
function daysUntilEol(eolDate: string): number {
  return Math.ceil((new Date(eolDate).getTime() - Date.now()) / 86_400_000);
}

interface CustomModelConfig {
  enabled: boolean;
  displayName: string;
  modelId: string;
  provider: 'anthropic' | 'openai' | 'google' | 'mistral';
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  costTier: 0 | 1 | 2 | 3;
  supportsThinking: boolean;
  supportsJsonMode: boolean;
}

function customConfigToModelInfo(config: CustomModelConfig): ModelInfo {
  return {
    id: config.modelId as ModelId,
    label: config.displayName,
    description: `Custom ${config.provider} model`,
    inputCostPer1M: config.inputCostPer1M,
    outputCostPer1M: config.outputCostPer1M,
    maxOutput: config.maxOutputTokens,
    provider: config.provider,
    contextWindow: config.contextWindow,
    costTier: config.costTier,
  };
}

interface ModelSelectorProps {
  value: ModelId;
  onChange: (value: ModelId) => void;
  /** Render as compact dropdown (default) or full card list */
  variant?: 'dropdown' | 'cards';
}

interface AzureDeployment {
  id: string;
  deploymentName: string;
  modelName: string;
  displayName: string | null;
  isReasoningModel: boolean;
  isActive: boolean;
}

/** A user-configured OpenAI-compatible endpoint (OpenRouter / Together / Groq / DeepSeek / vLLM / …). */
interface CompatEndpoint {
  slug: string;
  displayName: string;
  defaultModel: string | null;
  availableModels: string[];
  enabled: boolean;
}

/** SDK execution engine state (Settings → Execution engines). When enabled,
 *  sdk:<model> ids run through the machine's Claude Code login — no API key. */
interface SdkEngineState {
  enabled: boolean;
  models: { id: string; label: string }[];
}

// Built-in cloud models grouped by AI company (display order). The company label
// is derived from each model's technical `provider` field — no per-model field to
// keep in sync. Ollama-provider entries are intentionally omitted here: the live
// "Local (Ollama)" section below reflects the actually-installed models.
const COMPANY_SECTIONS: { provider: string; label: string }[] = [
  { provider: 'anthropic', label: 'Claude' },
  { provider: 'openai', label: 'ChatGPT (OpenAI)' },
  { provider: 'google', label: 'Gemini (Google)' },
  { provider: 'mistral', label: 'Mistral' },
];

export default function ModelSelector({ value, onChange, variant = 'dropdown' }: ModelSelectorProps) {
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaChecked, setOllamaChecked] = useState(false);
  const [customModels, setCustomModels] = useState<ModelInfo[]>([]);
  const [azureDeployments, setAzureDeployments] = useState<AzureDeployment[]>([]);
  const [compatEndpoints, setCompatEndpoints] = useState<CompatEndpoint[]>([]);
  const [sdkEngine, setSdkEngine] = useState<SdkEngineState>({ enabled: false, models: [] });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ollama/models')
      .then((r) => r.json())
      .then((data: { models?: string[] }) => {
        setOllamaModels(data.models ?? []);
      })
      .catch(() => {
        setOllamaModels([]);
      })
      .finally(() => {
        setOllamaChecked(true);
      });
  }, []);

  // Fetch Azure OpenAI deployments
  useEffect(() => {
    fetch('/api/azure-openai/deployments')
      .then((r) => r.ok ? r.json() : { deployments: [] })
      .then((data: { deployments?: AzureDeployment[] }) => {
        setAzureDeployments((data.deployments ?? []).filter(d => d.isActive));
      })
      .catch(() => {
        setAzureDeployments([]);
      });
  }, []);

  // Fetch custom models from settings
  useEffect(() => {
    fetch('/api/settings/custom-models')
      .then((r) => r.json())
      .then((data: { slot1: CustomModelConfig | null; slot2: CustomModelConfig | null }) => {
        const models: ModelInfo[] = [];
        if (data.slot1?.enabled) models.push(customConfigToModelInfo(data.slot1));
        if (data.slot2?.enabled) models.push(customConfigToModelInfo(data.slot2));
        setCustomModels(models);
      })
      .catch(() => {
        setCustomModels([]);
      });
  }, []);

  // Fetch OpenAI-compatible custom endpoints (compat:<slug>:<model>)
  useEffect(() => {
    fetch('/api/settings/model-endpoints')
      .then((r) => r.ok ? r.json() : { endpoints: [] })
      .then((data: { endpoints?: CompatEndpoint[] }) => {
        setCompatEndpoints((data.endpoints ?? []).filter((e) => e.enabled));
      })
      .catch(() => {
        setCompatEndpoints([]);
      });
  }, []);

  // Fetch the SDK execution-engine state (sdk:<model> — subscription auth)
  useEffect(() => {
    fetch('/api/settings/sdk-engine')
      .then((r) => r.ok ? r.json() : { enabled: false, models: [] })
      .then((data: SdkEngineState) => {
        setSdkEngine({ enabled: !!data.enabled, models: data.models ?? [] });
      })
      .catch(() => {
        setSdkEngine({ enabled: false, models: [] });
      });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const allModels = [...MODELS, ...customModels];
  const currentModel = allModels.find((m) => m.id === value);
  const azureMatch = typeof value === 'string' && value.startsWith('azure:')
    ? azureDeployments.find(d => d.deploymentName === value.replace('azure:', ''))
    : null;
  // Flatten enabled OpenAI-compatible endpoints into compat:<slug>:<model> options.
  const compatOptions = compatEndpoints.flatMap((ep) => {
    const models = ep.availableModels.length > 0
      ? ep.availableModels
      : ep.defaultModel ? [ep.defaultModel] : [];
    return models.map((m) => ({
      id: `compat:${ep.slug}:${m}` as ModelId,
      model: m,
      endpointName: ep.displayName,
    }));
  });
  const isCompatModel = typeof value === 'string' && value.startsWith('compat:');
  const compatBareModel = isCompatModel ? (value as string).split(':').slice(2).join(':') : '';
  const sdkMatch = typeof value === 'string' && value.startsWith('sdk:')
    ? sdkEngine.models.find((m) => m.id === value)
    : undefined;
  const currentLabel = currentModel?.label
    || (azureMatch ? `Azure: ${azureMatch.displayName || azureMatch.deploymentName}` : null)
    || (isCompatModel ? compatBareModel : null)
    || (sdkMatch ? sdkMatch.label : null)
    || (typeof value === 'string' && value.startsWith('ollama:') ? value.replace('ollama:', '') : value);
  const isCustomModel = customModels.some((m) => m.id === value);
  const isAzureModel = !!azureMatch;

  // ── Dropdown variant (compact) ───────────────────────────────
  if (variant === 'dropdown') {
    return (
      <div ref={containerRef} className="relative">
        <label className="mb-2 block text-sm font-medium text-adv-off-white">Model</label>
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-left transition-colors hover:border-adv-gray-med"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-adv-off-white truncate">{currentLabel}</span>
            {currentModel?.recommended && (
              <span className="flex shrink-0 items-center gap-1 rounded bg-adv-teal/10 px-1.5 py-0.5 text-xs font-medium text-adv-teal">
                <Star className="h-2.5 w-2.5" />
              </span>
            )}
            {isAzureModel && (
              <span className="flex shrink-0 items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                <Cloud className="h-2.5 w-2.5" />
                Azure
              </span>
            )}
            {isCustomModel && (
              <span className="flex shrink-0 items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-xs font-medium text-purple-400">
                <Sparkles className="h-2.5 w-2.5" />
                Custom
              </span>
            )}
            {isCompatModel && (
              <span className="flex shrink-0 items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                <Zap className="h-2.5 w-2.5" />
                API
              </span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-adv-gray transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* MGOV-03: EOL warning banner */}
        {currentModel?.eolDate && (() => {
          const days = daysUntilEol(currentModel.eolDate!);
          if (days > 90) return null;
          return (
            <div className="mt-1.5 flex items-start gap-2 rounded-md border border-adv-gold/30 bg-adv-gold/10 px-2.5 py-1.5 text-[11px] text-adv-gold">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {days <= 0
                  ? `${currentModel.label} has been retired (${currentModel.eolDate}). Switch to a supported model.`
                  : days <= 30
                  ? `${currentModel.label} retires in ${days} days (${currentModel.eolDate}). Migrate soon.`
                  : `${currentModel.label} retires in ~${Math.round(days / 30)} months (${currentModel.eolDate}). Plan migration.`}
              </span>
            </div>
          );
        })()}

        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-border bg-adv-card shadow-xl">
            {/* Built-in models, grouped by AI company */}
            {COMPANY_SECTIONS.map(({ provider, label }, gi) => {
              const models = MODELS.filter((m) => m.provider === provider);
              if (models.length === 0) return null;
              return (
                <div key={provider}>
                  <div className={`flex items-center gap-2 px-3 py-2 ${gi === 0 ? '' : 'border-t border-border'}`}>
                    <span className="text-xs font-semibold uppercase tracking-wide text-adv-gray">{label}</span>
                  </div>
                  {models.map((model) => {
                    const isActive = value === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => { onChange(model.id); setOpen(false); }}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          isActive
                            ? 'bg-adv-teal-dim text-adv-teal'
                            : 'hover:bg-adv-dark text-adv-off-white'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium truncate ${isActive ? 'text-adv-teal' : ''}`}>
                              {model.label}
                            </span>
                            {model.recommended && (
                              <span className="flex shrink-0 items-center gap-1 rounded bg-adv-teal/10 px-1.5 py-0.5 text-xs font-medium text-adv-teal">
                                <Star className="h-2.5 w-2.5" />
                                Rec
                              </span>
                            )}
                            {model.eolDate && (() => {
                              const days = daysUntilEol(model.eolDate);
                              if (days > 90) return null;
                              return (
                                <span className="flex shrink-0 items-center gap-1 rounded bg-adv-gold/10 px-1.5 py-0.5 text-xs font-medium text-adv-gold">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {days <= 0 ? 'Retired' : `EOL ${days}d`}
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-adv-gray truncate">
                            ${model.inputCostPer1M}/M in · ${model.outputCostPer1M}/M out
                          </p>
                        </div>
                        {isActive && <Check className="h-4 w-4 shrink-0 text-adv-teal" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Azure OpenAI section */}
            {azureDeployments.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                  <Cloud className="h-3 w-3 text-blue-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-adv-gray">
                    Azure OpenAI
                  </span>
                </div>
                {azureDeployments.map((deployment) => {
                  const modelId: ModelId = `azure:${deployment.deploymentName}`;
                  const isActive = value === modelId;
                  return (
                    <button
                      key={modelId}
                      onClick={() => { onChange(modelId); setOpen(false); }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'bg-adv-teal-dim text-adv-teal'
                          : 'hover:bg-adv-dark text-adv-off-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : ''}`}>
                            {deployment.displayName || deployment.deploymentName}
                          </span>
                          <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs font-medium text-blue-400">
                            Azure · {deployment.modelName}
                          </span>
                        </div>
                      </div>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-adv-teal" />}
                    </button>
                  );
                })}
              </>
            )}

            {/* Custom models section */}
            {customModels.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-adv-gray">
                    Custom Models
                  </span>
                </div>
                {customModels.map((model) => {
                  const isActive = value === model.id;
                  return (
                    <button
                      key={model.id}
                      onClick={() => { onChange(model.id); setOpen(false); }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'bg-adv-teal-dim text-adv-teal'
                          : 'hover:bg-adv-dark text-adv-off-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : ''}`}>
                            {model.label}
                          </span>
                          <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-xs font-medium text-purple-400">
                            Custom
                          </span>
                        </div>
                        <p className="text-xs text-adv-gray truncate">
                          ${model.inputCostPer1M}/M in · ${model.outputCostPer1M}/M out · {model.provider}
                        </p>
                      </div>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-adv-teal" />}
                    </button>
                  );
                })}
              </>
            )}

            {/* Cost-effective (OpenAI-compatible) endpoints */}
            {compatOptions.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                  <Zap className="h-3 w-3 text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-adv-gray">
                    Cost-effective (API)
                  </span>
                </div>
                {compatOptions.map((opt) => {
                  const isActive = value === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => { onChange(opt.id); setOpen(false); }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'bg-adv-teal-dim text-adv-teal'
                          : 'hover:bg-adv-dark text-adv-off-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${isActive ? 'text-adv-teal' : ''}`}>
                            {opt.model}
                          </span>
                          <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                            {opt.endpointName}
                          </span>
                        </div>
                      </div>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-adv-teal" />}
                    </button>
                  );
                })}
              </>
            )}

            {/* Subscription (SDK engine) — Claude models via this machine's Claude Code login */}
            {sdkEngine.enabled && sdkEngine.models.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                  <Sparkles className="h-3 w-3 text-adv-teal" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-adv-gray">
                    Subscription (SDK)
                  </span>
                </div>
                {sdkEngine.models.map((m) => {
                  const isActive = value === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { onChange(m.id as ModelId); setOpen(false); }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'bg-adv-teal-dim text-adv-teal'
                          : 'hover:bg-adv-dark text-adv-off-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate ${isActive ? 'text-adv-teal' : ''}`}>
                            {m.label}
                          </span>
                          <span className="shrink-0 rounded bg-adv-teal/10 px-1.5 py-0.5 text-xs font-medium text-adv-teal">
                            No API key
                          </span>
                        </div>
                      </div>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-adv-teal" />}
                    </button>
                  );
                })}
              </>
            )}

            {/* Ollama divider + models */}
            {ollamaChecked && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                  <HardDrive className="h-3 w-3 text-adv-gray" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-adv-gray">
                    Local (Ollama)
                  </span>
                </div>
                {ollamaModels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-adv-gray">
                    Start Ollama to use local models.
                  </div>
                ) : (
                  ollamaModels.map((modelName) => {
                    const modelId: ModelId = `ollama:${modelName}`;
                    const isActive = value === modelId;
                    return (
                      <button
                        key={modelId}
                        onClick={() => { onChange(modelId); setOpen(false); }}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          isActive
                            ? 'bg-adv-teal-dim text-adv-teal'
                            : 'hover:bg-adv-dark text-adv-off-white'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : ''}`}>
                              {modelName}
                            </span>
                            <span className="rounded bg-adv-green/10 px-1.5 py-0.5 text-xs font-medium text-adv-green">
                              Free
                            </span>
                          </div>
                        </div>
                        {isActive && <Check className="h-4 w-4 shrink-0 text-adv-teal" />}
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Cards variant (original full-size layout) ────────────────
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-adv-off-white">Model</label>
      <div className="space-y-2">
        {/* Built-in models, grouped by AI company */}
        {COMPANY_SECTIONS.map(({ provider, label }) => {
          const models = MODELS.filter((m) => m.provider === provider);
          if (models.length === 0) return null;
          return (
            <Fragment key={provider}>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray">{label}</span>
              </div>
              {models.map((model) => {
                const isActive = value === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => onChange(model.id)}
                    className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                      isActive
                        ? 'border-adv-teal bg-adv-teal-dim'
                        : 'border-border bg-adv-card hover:border-adv-gray-med'
                    }`}
                  >
                    <div
                      className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        isActive ? 'border-adv-teal' : 'border-adv-gray-med'
                      }`}
                    >
                      {isActive && <div className="h-2 w-2 rounded-full bg-adv-teal" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                          {model.label}
                        </span>
                        {model.recommended && (
                          <span className="flex items-center gap-1 rounded bg-adv-teal/10 px-1.5 py-0.5 text-xs font-medium text-adv-teal">
                            <Star className="h-2.5 w-2.5" />
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-adv-gray">{model.description}</p>
                      <p className="mt-1 text-xs text-adv-gray">
                        ${model.inputCostPer1M}/M input · ${model.outputCostPer1M}/M output
                      </p>
                    </div>
                  </button>
                );
              })}
            </Fragment>
          );
        })}

        {/* Custom Models section */}
        {customModels.length > 0 && (
          <div className="pt-1">
            <div className="mb-1.5 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
                Custom Models
              </span>
            </div>
            {customModels.map((model) => {
              const isActive = value === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => onChange(model.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                    isActive
                      ? 'border-adv-teal bg-adv-teal-dim'
                      : 'border-border bg-adv-card hover:border-adv-gray-med'
                  }`}
                >
                  <div
                    className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      isActive ? 'border-adv-teal' : 'border-adv-gray-med'
                    }`}
                  >
                    {isActive && <div className="h-2 w-2 rounded-full bg-adv-teal" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                        {model.label}
                      </span>
                      <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-xs font-medium text-purple-400">
                        Custom · {model.provider}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-adv-gray">{model.description}</p>
                    <p className="mt-1 text-xs text-adv-gray">
                      ${model.inputCostPer1M}/M input · ${model.outputCostPer1M}/M output
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Cost-effective (OpenAI-compatible) endpoints */}
        {compatOptions.length > 0 && (
          <div className="pt-1">
            <div className="mb-1.5 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
                Cost-effective (API)
              </span>
            </div>
            {compatOptions.map((opt) => {
              const isActive = value === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => onChange(opt.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                    isActive
                      ? 'border-adv-teal bg-adv-teal-dim'
                      : 'border-border bg-adv-card hover:border-adv-gray-med'
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-adv-teal' : 'border-adv-gray-med'}`}>
                    {isActive && <div className="h-2 w-2 rounded-full bg-adv-teal" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                        {opt.model}
                      </span>
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                        {opt.endpointName}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-adv-gray">OpenAI-compatible endpoint · no extra setup needed.</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Subscription (SDK engine) section */}
        {sdkEngine.enabled && sdkEngine.models.length > 0 && (
          <div className="pt-1">
            <div className="mb-1.5 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-adv-teal" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
                Subscription (SDK)
              </span>
            </div>
            {sdkEngine.models.map((m) => {
              const isActive = value === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onChange(m.id as ModelId)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                    isActive
                      ? 'border-adv-teal bg-adv-teal-dim'
                      : 'border-border bg-adv-card hover:border-adv-gray-med'
                  }`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-adv-teal' : 'border-adv-gray-med'}`}>
                    {isActive && <div className="h-2 w-2 rounded-full bg-adv-teal" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                        {m.label}
                      </span>
                      <span className="rounded bg-adv-teal/10 px-1.5 py-0.5 text-xs font-medium text-adv-teal">
                        No API key
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-adv-gray">Runs through this machine's Claude Code login · web search unavailable on this engine.</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Local (Ollama) section */}
        <div className="pt-1">
          <div className="mb-1.5 flex items-center gap-2">
            <HardDrive className="h-3.5 w-3.5 text-adv-gray" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray">
              Local (Ollama)
            </span>
          </div>

          {ollamaChecked && ollamaModels.length === 0 ? (
            <div className="rounded-lg border border-border bg-adv-card px-3 py-2.5 text-xs text-adv-gray">
              Start Ollama to use local models.{' '}
              <a
                href="https://ollama.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-adv-teal hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Get Ollama
              </a>
              {' '}then run{' '}
              <code className="rounded bg-adv-dark px-1 py-0.5 text-xs">ollama pull llama3.2</code>
            </div>
          ) : (
            ollamaModels.map((modelName) => {
              const modelId: ModelId = `ollama:${modelName}`;
              const isActive = value === modelId;
              return (
                <button
                  key={modelId}
                  onClick={() => onChange(modelId)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                    isActive
                      ? 'border-adv-teal bg-adv-teal-dim'
                      : 'border-border bg-adv-card hover:border-adv-gray-med'
                  }`}
                >
                  <div
                    className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                      isActive ? 'border-adv-teal' : 'border-adv-gray-med'
                    }`}
                  >
                    {isActive && <div className="h-2 w-2 rounded-full bg-adv-teal" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isActive ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                        {modelName}
                      </span>
                      <span className="rounded bg-adv-green/10 px-1.5 py-0.5 text-xs font-medium text-adv-green">
                        Free · Local
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-adv-gray">No API key needed. Runs on your machine.</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
