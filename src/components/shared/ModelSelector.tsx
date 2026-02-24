import { useEffect, useRef, useState } from 'react';
import { MODELS } from '@/lib/constants';
import type { ModelId, ModelInfo } from '@/lib/types';
import { Star, HardDrive, ChevronDown, Check, Sparkles } from 'lucide-react';

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

export default function ModelSelector({ value, onChange, variant = 'dropdown' }: ModelSelectorProps) {
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaChecked, setOllamaChecked] = useState(false);
  const [customModels, setCustomModels] = useState<ModelInfo[]>([]);
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
  const currentLabel = currentModel?.label || (typeof value === 'string' && value.startsWith('ollama:') ? value.replace('ollama:', '') : value);
  const isCustomModel = customModels.some((m) => m.id === value);

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
              <span className="flex shrink-0 items-center gap-1 rounded bg-adv-teal/10 px-1.5 py-0.5 text-[10px] font-medium text-adv-teal">
                <Star className="h-2.5 w-2.5" />
              </span>
            )}
            {isCustomModel && (
              <span className="flex shrink-0 items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                <Sparkles className="h-2.5 w-2.5" />
                Custom
              </span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-adv-gray transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-border bg-adv-card shadow-xl">
            {/* Cloud models */}
            {MODELS.map((model) => {
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
                        <span className="flex shrink-0 items-center gap-1 rounded bg-adv-teal/10 px-1.5 py-0.5 text-[10px] font-medium text-adv-teal">
                          <Star className="h-2.5 w-2.5" />
                          Rec
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-adv-gray-med truncate">
                      ${model.inputCostPer1M}/M in · ${model.outputCostPer1M}/M out
                    </p>
                  </div>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-adv-teal" />}
                </button>
              );
            })}

            {/* Custom models section */}
            {customModels.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-adv-gray-med">
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
                          <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                            Custom
                          </span>
                        </div>
                        <p className="text-[10px] text-adv-gray-med truncate">
                          ${model.inputCostPer1M}/M in · ${model.outputCostPer1M}/M out · {model.provider}
                        </p>
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
                  <HardDrive className="h-3 w-3 text-adv-gray-med" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-adv-gray-med">
                    Local (Ollama)
                  </span>
                </div>
                {ollamaModels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-adv-gray-med">
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
                            <span className="rounded bg-adv-green/10 px-1.5 py-0.5 text-[10px] font-medium text-adv-green">
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
        {MODELS.map((model) => {
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
                    <span className="flex items-center gap-1 rounded bg-adv-teal/10 px-1.5 py-0.5 text-[10px] font-medium text-adv-teal">
                      <Star className="h-2.5 w-2.5" />
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-adv-gray">{model.description}</p>
                <p className="mt-1 text-[10px] text-adv-gray-med">
                  ${model.inputCostPer1M}/M input · ${model.outputCostPer1M}/M output
                </p>
              </div>
            </button>
          );
        })}

        {/* Custom Models section */}
        {customModels.length > 0 && (
          <div className="pt-1">
            <div className="mb-1.5 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray-med">
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
                      <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                        Custom · {model.provider}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-adv-gray">{model.description}</p>
                    <p className="mt-1 text-[10px] text-adv-gray-med">
                      ${model.inputCostPer1M}/M input · ${model.outputCostPer1M}/M output
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Local (Ollama) section */}
        <div className="pt-1">
          <div className="mb-1.5 flex items-center gap-2">
            <HardDrive className="h-3.5 w-3.5 text-adv-gray-med" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-adv-gray-med">
              Local (Ollama)
            </span>
          </div>

          {ollamaChecked && ollamaModels.length === 0 ? (
            <div className="rounded-lg border border-border bg-adv-card px-3 py-2.5 text-xs text-adv-gray-med">
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
              <code className="rounded bg-adv-dark px-1 py-0.5 text-[10px]">ollama pull llama3.2</code>
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
                      <span className="rounded bg-adv-green/10 px-1.5 py-0.5 text-[10px] font-medium text-adv-green">
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
