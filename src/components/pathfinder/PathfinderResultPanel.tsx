import { useState, useMemo, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronRight, Bot, Sparkles, Brain, Globe, Database, BookOpen, Lightbulb, Search, Info } from 'lucide-react';
import { ModelStatusCards } from './DepthSelector';
import SourceCard from './SourceCard';
import WebSourcesList from './WebSourcesList';
import type { PathfinderModelResult, PathfinderWebSource, SearchDepth, SourceType } from '@/lib/pathfinder-api';

interface ModelStatus {
  modelId: string;
  role: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  durationMs?: number;
}

interface PathfinderResultPanelProps {
  phase: 'idle' | 'searching' | 'synthesizing' | 'complete' | 'error';
  depth: SearchDepth;
  synthesis: string;
  thinking: string;
  preSearchReasoning?: string;
  modelStatuses: ModelStatus[];
  modelResults: PathfinderModelResult[];
  webSources: PathfinderWebSource[];
  localSources?: PathfinderWebSource[];
  enrichedQuery?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  error?: string;
}

type SourceFilter = SourceType | 'all';

const FILTER_OPTIONS: { value: SourceFilter; label: string; icon: typeof Globe; hint?: string }[] = [
  { value: 'all', label: 'All', icon: Globe },
  { value: 'web', label: 'Web', icon: Globe, hint: 'Results from live web search' },
  { value: 'local', label: 'Local', icon: Database, hint: 'Your knowledge atoms, session outputs, and indexed documents' },
  { value: 'knowledge_pack', label: 'Knowledge', icon: BookOpen, hint: 'Regulatory knowledge packs installed in ANTON' },
  { value: 'institutional_memory', label: 'Memory', icon: Brain, hint: 'Your institutional memory and past decisions' },
];

/** Custom link renderer — opens in new tab, styled as teal */
function MarkdownLink(props: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-adv-teal hover:underline"
    />
  );
}

const mdComponents = { a: MarkdownLink };

/**
 * Extract the "Why These Results" section from synthesis text and return
 * [mainText, whySection]. If not found, returns [synthesis, ''].
 */
function extractWhySection(synthesis: string): [string, string] {
  // Match "### Why These Results" or "## Why These Results" followed by content
  const whyMatch = synthesis.match(/###?\s*Why These Results\s*\n([\s\S]*?)(?=\n###?\s|\n## |$)/i);
  if (!whyMatch) return [synthesis, ''];

  const whyText = whyMatch[1].trim();
  // Remove the WHY section from the main synthesis
  const mainText = synthesis.replace(whyMatch[0], '').trim();
  return [mainText, whyText];
}

export default function PathfinderResultPanel({
  phase, depth, synthesis, thinking, preSearchReasoning,
  modelStatuses, modelResults, webSources,
  localSources = [], enrichedQuery,
  inputTokens, outputTokens, costUsd, durationMs, error,
}: PathfinderResultPanelProps) {
  const [showThinking, setShowThinking] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showStrategy, setShowStrategy] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  // Extract WHY section from synthesis
  const [mainSynthesis, whySection] = useMemo(
    () => extractWhySection(synthesis),
    [synthesis],
  );

  if (phase === 'idle') return null;

  // Combine all sources for the filter bar
  const allSources = [...webSources, ...localSources];
  const hasLocalSources = localSources.length > 0;
  const activeFilterHint = FILTER_OPTIONS.find(o => o.value === sourceFilter)?.hint;
  const hasSources = allSources.length > 0;
  const hasAnswer = !!mainSynthesis || phase === 'synthesizing';

  return (
    <div className="space-y-4">
      {/* ── Full-width: Pre-search reasoning (Search Strategy) ── */}
      {preSearchReasoning && (
        <div className="rounded-xl border border-adv-teal/20 bg-adv-teal/5 p-3">
          <button
            onClick={() => setShowStrategy(!showStrategy)}
            className="flex items-center gap-1.5 text-xs font-medium text-adv-teal w-full"
          >
            {showStrategy ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Search className="h-3 w-3" />
            Search Strategy
          </button>
          {showStrategy && (
            <div className="mt-2 text-xs text-adv-off-white/80 whitespace-pre-wrap leading-relaxed pl-5">
              {preSearchReasoning.split('\n').map((line, i) => {
                // Bold **text** rendering
                const parts = line.split(/(\*\*.*?\*\*)/g);
                return (
                  <div key={i} className="mb-0.5">
                    {parts.map((part, j) =>
                      part.startsWith('**') && part.endsWith('**')
                        ? <span key={j} className="font-semibold text-adv-teal">{part.slice(2, -2)}</span>
                        : <span key={j}>{part}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Full-width: Model status cards ── */}
      {depth !== 'quick' && modelStatuses.length > 0 && (
        <div className="rounded-xl border border-border bg-adv-card p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-adv-gray">
            <Bot className="h-3.5 w-3.5" />
            Search Pipeline
          </div>
          <ModelStatusCards models={modelStatuses} />
        </div>
      )}

      {/* ── Full-width: Error ── */}
      {error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/5 p-4 text-sm text-adv-red">
          {error}
        </div>
      )}

      {/* ── Two-column layout: Sources (left) | Answer (right) ── */}
      {(hasAnswer || hasSources) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── LEFT COLUMN: Sources + Why + Meta ── */}
          <div className="space-y-3 order-2 lg:order-1 min-w-0">

            {/* Source type filter bar + sources */}
            {hasSources && (
              <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
                {/* Filter bar — only show if we have mixed source types */}
                {hasLocalSources && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {FILTER_OPTIONS.map(opt => {
                        const count = opt.value === 'all'
                          ? allSources.length
                          : allSources.filter(s => (s.sourceType || 'web') === opt.value).length;
                        if (opt.value !== 'all' && count === 0) return null;
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setSourceFilter(opt.value)}
                            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
                              sourceFilter === opt.value
                                ? 'bg-adv-teal/15 text-adv-teal border border-adv-teal/30'
                                : 'text-adv-gray hover:text-adv-off-white border border-transparent'
                            }`}
                          >
                            <Icon className="h-2.5 w-2.5" />
                            {opt.label}
                            <span className="opacity-60">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Filter hint — explains what this source type contains */}
                    {activeFilterHint && sourceFilter !== 'all' && (
                      <div className="flex items-center gap-1 text-[10px] text-adv-gray/60 pl-1">
                        <Info className="h-2.5 w-2.5 shrink-0" />
                        {activeFilterHint}
                      </div>
                    )}
                  </div>
                )}

                <WebSourcesList sources={allSources} filter={sourceFilter} />
              </div>
            )}

            {/* Why These Results */}
            {whySection && phase === 'complete' && (
              <div className="rounded-xl border border-adv-gold/20 bg-adv-gold/5 p-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-adv-gold mb-2">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Why These Results
                </div>
                <div className="prose prose-invert prose-xs max-w-none text-adv-off-white/80">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{whySection}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Thinking (collapsible) */}
            {thinking && (
              <div>
                <button
                  onClick={() => setShowThinking(!showThinking)}
                  className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  {showThinking ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Brain className="h-3 w-3" />
                  Reasoning ({thinking.length > 100 ? `${Math.round(thinking.length / 100) * 100}+ chars` : `${thinking.length} chars`})
                </button>
                {showThinking && (
                  <div className="mt-2 rounded-lg border border-adv-gold/20 bg-adv-gold/5 p-3 text-xs text-adv-gray whitespace-pre-wrap max-h-64 overflow-auto">
                    {thinking}
                  </div>
                )}
              </div>
            )}

            {/* Per-model results (collapsible) */}
            {modelResults.length > 1 && (
              <div>
                <button
                  onClick={() => setShowModels(!showModels)}
                  className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  {showModels ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Individual model responses ({modelResults.length})
                </button>
                {showModels && (
                  <div className="mt-2 space-y-2">
                    {modelResults.map(r => <SourceCard key={r.modelId} result={r} />)}
                  </div>
                )}
              </div>
            )}

            {/* Cost display */}
            {phase === 'complete' && (
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-adv-gray px-1">
                <span>{(durationMs / 1000).toFixed(1)}s</span>
                <span>{inputTokens.toLocaleString()} in / {outputTokens.toLocaleString()} out</span>
                {costUsd > 0 && <span>${costUsd.toFixed(4)}</span>}
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Synthesis (main answer) ── */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start min-w-0">
            {(mainSynthesis || phase === 'synthesizing') && (
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-adv-gray">
                  <Sparkles className="h-3 w-3 text-adv-teal" />
                  Answer
                </div>
                {phase === 'synthesizing' && !synthesis && (
                  <div className="flex items-center gap-2 text-sm text-adv-teal">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    Synthesizing results...
                  </div>
                )}
                <div className="prose prose-invert prose-xs max-w-none text-adv-off-white text-[13px] leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{mainSynthesis}</ReactMarkdown>
                  {phase === 'synthesizing' && <span className="inline-block w-1.5 h-4 bg-adv-teal animate-pulse ml-0.5" />}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
