/**
 * RevelationTrailPanel.tsx
 * Displays the iterative reasoning trail for a completed IRE response.
 * Shows each phase (Analyse, Reflect, Deepen, Explore, Validate, Synthesise)
 * with its thinking content, output, confidence score, and timing.
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Brain, Clock, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RevelationChain, RevelationStep } from '@/lib/types';

interface RevelationTrailPanelProps {
  chainId: string;
}

// Live phase progress indicator (shown during streaming)
interface PhaseProgressProps {
  currentPhase: number;
  totalPhases: number;
  currentPhaseName: string;
}

export function IREPhaseProgress({ currentPhase, totalPhases, currentPhaseName }: PhaseProgressProps) {
  if (totalPhases === 0) return null;
  const pct = totalPhases > 0 ? Math.round(((currentPhase) / totalPhases) * 100) : 0;
  return (
    <div className="mb-3 rounded-lg border border-adv-gold/20 bg-adv-gold/5 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-gold" />
          <span className="text-xs font-semibold text-adv-gold">
            Iterative Reasoning Engine — Phase {currentPhase + 1} of {totalPhases}
          </span>
        </div>
        <span className="text-xs text-adv-gray">{pct}% complete</span>
      </div>
      <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-adv-gold/10">
        <div
          className="h-full rounded-full bg-adv-gold transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-adv-gray capitalize">
        Current phase: <span className="font-medium text-adv-off-white">{currentPhaseName}</span>
      </p>
    </div>
  );
}

// Individual phase card
function PhaseCard({ step, index }: { step: RevelationStep; index: number }) {
  const [open, setOpen] = useState(false);

  const phaseColors: Record<string, string> = {
    analyse: 'text-adv-blue border-adv-blue/20 bg-adv-blue/5',
    reflect: 'text-adv-gold border-adv-gold/20 bg-adv-gold/5',
    plan: 'text-adv-teal border-adv-teal/20 bg-adv-teal-soft',
    deepen: 'text-purple-400 border-purple-400/20 bg-purple-400/5',
    explore: 'text-pink-400 border-pink-400/20 bg-pink-400/5',
    validate: 'text-orange-400 border-orange-400/20 bg-orange-400/5',
    synthesise: 'text-adv-green border-adv-green/20 bg-adv-green/5',
  };
  const colorClass = phaseColors[step.phaseName] ?? 'text-adv-gray border-border bg-adv-card';

  const durationSec = (step.durationMs / 1000).toFixed(1);
  const confidenceDisplay = step.confidenceScore !== null
    ? `${Math.round(step.confidenceScore * 100)}%`
    : null;

  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">
            {index + 1}
          </span>
          <span className="text-sm font-semibold capitalize">{step.phaseName}</span>
          {step.revisionNeeded && (
            <span className="rounded-full bg-adv-gold/10 px-2 py-0.5 text-[10px] font-medium text-adv-gold">
              revision needed
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {confidenceDisplay && (
            <span className="flex items-center gap-1 text-xs opacity-70">
              <TrendingUp className="h-3 w-3" />
              {confidenceDisplay}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs opacity-70">
            <Clock className="h-3 w-3" />
            {durationSec}s
          </span>
          <span className="text-xs opacity-50">
            {(step.inputTokens + step.outputTokens).toLocaleString()} tokens
          </span>
          {open ? <ChevronDown className="h-4 w-4 opacity-60" /> : <ChevronRight className="h-4 w-4 opacity-60" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          {step.thinkingContent && (
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium opacity-70 hover:opacity-100">
                <Brain className="h-3.5 w-3.5" />
                Internal reasoning
              </summary>
              <div className="mt-2 rounded-md bg-black/20 px-3 py-2">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-adv-gray">
                  {step.thinkingContent}
                </p>
              </div>
            </details>
          )}
          {step.outputContent && (
            <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{step.outputContent}</ReactMarkdown>
            </div>
          )}
          {step.nextAction && (
            <div className="flex items-start gap-2 rounded-md border border-adv-teal/20 bg-adv-teal-soft px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-teal" />
              <p className="text-xs text-adv-off-white">
                <span className="font-medium text-adv-teal">Next: </span>{step.nextAction}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main panel — fetches chain data and renders all phases
export default function RevelationTrailPanel({ chainId }: RevelationTrailPanelProps) {
  const [chain, setChain] = useState<RevelationChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chainId) return;
    setLoading(true);
    fetch(`/api/revelation-chains/${chainId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => { setChain(data as RevelationChain); setLoading(false); })
      .catch((e) => { setError((e as Error).message); setLoading(false); });
  }, [chainId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-adv-gray">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading reasoning trail…</span>
      </div>
    );
  }

  if (error || !chain) {
    return (
      <div className="rounded-lg border border-adv-red/20 bg-adv-red/5 px-4 py-3 text-sm text-adv-red">
        Could not load reasoning trail: {error ?? 'not found'}
      </div>
    );
  }

  const totalMs = chain.totalDurationMs;
  const totalSec = (totalMs / 1000).toFixed(1);
  const totalTokens = chain.totalInputTokens + chain.totalOutputTokens;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-adv-gold/20 bg-adv-gold/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-adv-gold">
            Iterative Reasoning Engine
          </span>
          <span className="rounded-full bg-adv-gold/10 px-2 py-0.5 text-[10px] text-adv-gold capitalize">
            {chain.thinkingLevel}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-adv-gray">
          <span className="flex items-center gap-1">
            <Brain className="h-3.5 w-3.5" />
            {chain.phaseCount} phases
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {totalSec}s total
          </span>
          <span>{totalTokens.toLocaleString()} tokens</span>
        </div>
      </div>

      {/* Phase cards */}
      <div className="space-y-2">
        {chain.steps.map((step, i) => (
          <PhaseCard key={step.id} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}
