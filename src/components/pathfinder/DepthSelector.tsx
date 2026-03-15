import { useState } from 'react';
import { Zap, Search, Brain, Loader2, CheckCircle2, Info } from 'lucide-react';
import type { SearchDepth } from '@/lib/pathfinder-api';

interface DepthSelectorProps {
  value: SearchDepth;
  onChange: (depth: SearchDepth) => void;
  disabled?: boolean;
}

const DEPTH_CONFIG = {
  quick: {
    icon: Zap,
    label: 'Quick',
    color: '#27AE60',
    summary: 'Haiku search + think_hard synthesis',
    detail: 'Haiku searches the web, then synthesises results with think_hard reasoning. Fast and focused — typically 5-10 seconds.',
    models: 'Haiku (web search) → Haiku (think_hard synthesis)',
  },
  thorough: {
    icon: Search,
    label: 'Thorough',
    color: '#2DD4A8',
    summary: 'Haiku search + investigation → Sonnet chairman',
    detail: 'Haiku searches the web and analyses results with investigation-level reasoning. Sonnet then acts as chairman — validating, cross-referencing, and producing the final synthesis.',
    models: 'Haiku (web search + investigation) → Sonnet 4.6 (chairman synthesis)',
  },
  deep: {
    icon: Brain,
    label: 'Deep',
    color: '#F5A623',
    summary: 'Multi-phase IRE with confidence gating',
    detail: 'Haiku searches the web. Sonnet then runs a multi-phase reasoning loop: Analyse, Reflect (with confidence scoring), Deepen (if confidence below 0.8), and Synthesise. Maximum reasoning depth for complex queries.',
    models: 'Haiku (web search) → Sonnet IRE (analyse → reflect → deepen → synthesise)',
  },
} as const;

export default function DepthSelector({ value, onChange, disabled }: DepthSelectorProps) {
  const [showInfo, setShowInfo] = useState(false);
  const activeCfg = DEPTH_CONFIG[value];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-adv-dark p-0.5">
          {(Object.entries(DEPTH_CONFIG) as Array<[SearchDepth, typeof DEPTH_CONFIG.quick]>).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = value === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => !disabled && onChange(key)}
                disabled={disabled}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-adv-dark'
                    : disabled
                      ? 'text-adv-gray/40 cursor-not-allowed'
                      : 'text-adv-gray hover:text-adv-off-white'
                }`}
                style={isActive ? { backgroundColor: cfg.color } : undefined}
                title={cfg.summary}
              >
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          className={`rounded p-1 transition-colors ${showInfo ? 'text-adv-teal' : 'text-adv-gray/50 hover:text-adv-gray'}`}
          title="What do these modes do?"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline info panel */}
      {showInfo && (
        <div className="rounded-lg border border-border bg-adv-card p-3 space-y-2.5">
          {(Object.entries(DEPTH_CONFIG) as Array<[SearchDepth, typeof DEPTH_CONFIG.quick]>).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = value === key;
            return (
              <div
                key={key}
                className={`rounded-lg px-3 py-2 text-xs ${isActive ? 'border border-border bg-adv-dark/50' : ''}`}
              >
                <div className="flex items-center gap-1.5 font-medium text-adv-off-white mb-0.5">
                  <Icon className="h-3 w-3" style={{ color: cfg.color }} />
                  {cfg.label}
                </div>
                <p className="text-adv-gray leading-relaxed">{cfg.detail}</p>
                <p className="mt-1 text-[10px] text-adv-gray/60 font-mono">{cfg.models}</p>
              </div>
            );
          })}
          <p className="text-[10px] text-adv-gray/50 px-1">
            All modes use Claude — only your Anthropic API key is needed.
          </p>
        </div>
      )}
    </div>
  );
}

// Model status mini-cards for the result panel
export function ModelStatusCards({
  models,
}: {
  models: Array<{ modelId: string; role: string; status: 'pending' | 'running' | 'complete' | 'error'; durationMs?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {models.map((m, i) => (
        <div
          key={`${m.modelId}-${m.role}-${i}`}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
            m.status === 'complete' ? 'border-adv-green/30 bg-adv-green/5 text-adv-green'
            : m.status === 'running' ? 'border-adv-teal/40 bg-adv-teal/5 text-adv-teal'
            : m.status === 'error' ? 'border-adv-red/30 bg-adv-red/5 text-adv-red'
            : 'border-border bg-adv-card/30 text-adv-gray'
          }`}
        >
          {m.status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
          {m.status === 'complete' && <CheckCircle2 className="h-3 w-3" />}
          {m.status === 'pending' && <div className="h-2.5 w-2.5 rounded-full bg-adv-gray/40" />}
          <span className="font-medium">{m.role}</span>
          {m.durationMs != null && m.status === 'complete' && (
            <span className="text-[10px] opacity-60">{(m.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
      ))}
    </div>
  );
}
