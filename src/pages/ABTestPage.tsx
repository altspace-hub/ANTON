import { useState, useRef } from 'react';
import {
  FlaskConical, Play, Square, Copy, Check, Download,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage } from '@/lib/api';
import { MODULES, AREAS } from '@/lib/constants';
import type { StreamEvent, ThinkingLevel, CreativityLevel } from '@/lib/types';

// ── Constants ────────────────────────────────────────────────

const THINKING_OPTIONS: { value: ThinkingLevel; label: string }[] = [
  { value: 'quick',        label: 'Quick' },
  { value: 'think',        label: 'Think' },
  { value: 'think_hard',   label: 'Think Hard' },
  { value: 'investigate',  label: 'Investigate' },
  { value: 'plan_first',   label: 'Plan First' },
];

const CREATIVITY_OPTIONS: { value: CreativityLevel; label: string }[] = [
  { value: 'strict',   label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'creative', label: 'Creative' },
];

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

// Default system prompts for each variant
const DEFAULT_PROMPT_A = `You are ANTON, an expert AI assistant for professional compliance and regulatory work.
Provide precise, well-structured, factual responses. Cite relevant frameworks where applicable.
Format your output with clear headings and bullet points.`;

const DEFAULT_PROMPT_B = `You are ANTON, an expert AI assistant for professional compliance and regulatory work.
Think step by step and explore multiple angles before settling on your answer.
Provide a detailed, comprehensive response with examples and practical guidance.`;

// ── Types ────────────────────────────────────────────────────

interface VariantConfig {
  moduleId: string;
  thinking: ThinkingLevel;
  creativity: CreativityLevel;
  model: string;
  systemPromptOverride: string;
  showAdvanced: boolean;
}

interface ComparisonResult {
  wordCountA: number;
  wordCountB: number;
  tokenEstA: number;
  tokenEstB: number;
  winnerByLength: 'A' | 'B' | 'tie';
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildComparison(outputA: string, outputB: string): ComparisonResult {
  const wA = countWords(outputA);
  const wB = countWords(outputB);
  return {
    wordCountA: wA,
    wordCountB: wB,
    tokenEstA: estimateTokens(outputA),
    tokenEstB: estimateTokens(outputB),
    winnerByLength: wA > wB ? 'A' : wB > wA ? 'B' : 'tie',
  };
}

// ── Sub-components ────────────────────────────────────────────

interface VariantPanelProps {
  label: 'A' | 'B';
  config: VariantConfig;
  onChange: (updates: Partial<VariantConfig>) => void;
  output: string;
  isStreaming: boolean;
  onCopy: () => void;
  copied: boolean;
}

function VariantPanel({ label, config, onChange, output, isStreaming, onCopy, copied }: VariantPanelProps) {
  const accentColor = label === 'A' ? 'adv-teal' : 'adv-gold';
  const accentClass = label === 'A' ? 'text-adv-teal border-adv-teal/30 bg-adv-teal/5' : 'text-adv-gold border-adv-gold/30 bg-adv-gold/5';
  const badgeClass = label === 'A' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-gold text-adv-dark';

  const selectedModule = MODULES.find((m) => m.id === config.moduleId);
  const selectedArea = selectedModule
    ? AREAS.find((a) => (a.moduleIds as readonly string[]).includes(config.moduleId))
    : undefined;

  return (
    <div className={`flex flex-col rounded-xl border bg-adv-card overflow-hidden ${label === 'A' ? 'border-adv-teal/20' : 'border-adv-gold/20'}`}>
      {/* Panel header */}
      <div className={`flex items-center gap-2 border-b border-border px-4 py-3 ${label === 'A' ? 'bg-adv-teal/5' : 'bg-adv-gold/5'}`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${badgeClass}`}>
          {label}
        </span>
        <span className="text-sm font-semibold text-adv-off-white">Variant {label}</span>
        {selectedModule && (
          <span className={`ml-auto rounded border px-1.5 py-0.5 text-xs font-medium ${accentClass}`}>
            [{selectedArea?.shortLabel ?? '?'}] {selectedModule.shortLabel}
          </span>
        )}
      </div>

      {/* Config controls */}
      <div className="space-y-3 p-4">
        {/* Module selector */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-adv-gray">
            Module (determines system prompt base)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={selectedArea?.id ?? ''}
              onChange={(e) => {
                // When area changes, clear module
                onChange({ moduleId: '' });
              }}
              className="rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="">All areas</option>
              {AREAS.map((area) => (
                <option key={area.id} value={area.id}>{area.label}</option>
              ))}
            </select>
            <select
              value={config.moduleId}
              onChange={(e) => onChange({ moduleId: e.target.value })}
              className="rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="">None (custom prompt)</option>
              {(() => {
                const filterAreaId = selectedArea?.id ?? '';
                const filteredModules = filterAreaId
                  ? (AREAS.find((a) => a.id === filterAreaId)?.moduleIds ?? []).map(
                      (id) => MODULES.find((m) => m.id === id)
                    ).filter(Boolean)
                  : MODULES;
                return filteredModules.map((mod) => {
                  if (!mod) return null;
                  const area = AREAS.find((a) => (a.moduleIds as readonly string[]).includes(mod.id));
                  return (
                    <option key={mod.id} value={mod.id}>
                      {filterAreaId ? mod.shortLabel : `[${area?.shortLabel ?? '?'}] ${mod.shortLabel}`}
                    </option>
                  );
                });
              })()}
            </select>
          </div>
        </div>

        {/* Thinking + Creativity */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Thinking level</label>
            <select
              value={config.thinking}
              onChange={(e) => onChange({ thinking: e.target.value as ThinkingLevel })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {THINKING_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-adv-gray">Creativity</label>
            <select
              value={config.creativity}
              onChange={(e) => onChange({ creativity: e.target.value as CreativityLevel })}
              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {CREATIVITY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Model selector */}
        <div className="mt-3">
          <label className="text-xs text-adv-gray mb-1 block">Model</label>
          <div className="flex gap-1.5">
            {[
              { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
              { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet' },
              { id: 'claude-opus-4-8', label: 'Opus' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => onChange({ model: m.id })}
                className={`px-2 py-1 text-xs rounded border transition-colors ${
                  config.model === m.id
                    ? 'bg-adv-teal text-adv-dark border-adv-teal'
                    : 'bg-transparent text-adv-gray border-adv-gray/40 hover:border-adv-gray'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* System prompt */}
        <div>
          <button
            onClick={() => onChange({ showAdvanced: !config.showAdvanced })}
            className="flex items-center gap-1 text-[11px] text-adv-gray hover:text-adv-off-white transition-colors"
          >
            {config.showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            System prompt
          </button>
          {config.showAdvanced && (
            <textarea
              value={config.systemPromptOverride}
              onChange={(e) => onChange({ systemPromptOverride: e.target.value })}
              placeholder="Override system prompt for this variant..."
              className="mt-1.5 w-full rounded-lg border border-border bg-adv-dark px-2.5 py-2 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
              rows={5}
            />
          )}
        </div>
      </div>

      {/* Output area */}
      <div className="flex-1 border-t border-border">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
          <span className="text-[11px] font-medium text-adv-gray">Output</span>
          {output && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-adv-gray">
                {countWords(output)} words · ~{estimateTokens(output).toLocaleString()} tokens
              </span>
              <button
                onClick={onCopy}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                title="Copy output"
              >
                {copied ? <Check className="h-3 w-3 text-adv-green" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          )}
        </div>
        <div className="min-h-[300px] max-h-[600px] overflow-y-auto p-4">
          {isStreaming && !output && (
            <div className="flex items-center gap-2 text-adv-gray">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-adv-teal" />
              <span className="text-xs">Anton is working...</span>
            </div>
          )}
          {output ? (
            <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
              {isStreaming && <span className="animate-pulse text-adv-teal">▊</span>}
            </div>
          ) : !isStreaming ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-xs text-adv-gray">Output will appear here after running</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function ABTestPage() {
  const [variantA, setVariantA] = useState<VariantConfig>({
    moduleId: 'gap-analysis',
    thinking: 'think_hard',
    creativity: 'strict',
    model: 'claude-opus-4-8',
    systemPromptOverride: DEFAULT_PROMPT_A,
    showAdvanced: false,
  });
  const [variantB, setVariantB] = useState<VariantConfig>({
    moduleId: 'gap-analysis',
    thinking: 'investigate',
    creativity: 'balanced',
    model: 'claude-opus-4-8',
    systemPromptOverride: DEFAULT_PROMPT_B,
    showAdvanced: false,
  });

  const [userMessage, setUserMessage] = useState('');
  const [outputA, setOutputA] = useState('');
  const [outputB, setOutputB] = useState('');
  const [isRunningA, setIsRunningA] = useState(false);
  const [isRunningB, setIsRunningB] = useState(false);
  const [copiedA, setCopiedA] = useState(false);
  const [copiedB, setCopiedB] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const abortRefA = useRef<AbortController | null>(null);
  const abortRefB = useRef<AbortController | null>(null);

  const isRunning = isRunningA || isRunningB;

  const buildSystemPrompt = (config: VariantConfig): string => {
    if (config.moduleId) {
      const mod = MODULES.find((m) => m.id === config.moduleId);
      if (mod) {
        return `You are ANTON, an expert AI assistant specialising in: ${mod.label}.

${mod.description}

${config.systemPromptOverride}`;
      }
    }
    return config.systemPromptOverride;
  };

  const streamVariant = async (
    config: VariantConfig,
    setOutput: (fn: (prev: string) => string) => void,
    setIsRunning: (v: boolean) => void,
    abortRef: React.MutableRefObject<AbortController | null>
  ) => {
    setIsRunning(true);
    setOutput(() => '');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const stream = streamMessage(
        {
          model: config.model as 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001',
          thinking: config.thinking,
          creativity: config.creativity,
          systemPrompt: buildSystemPrompt(config),
          userMessage,
          history: [],
          outputFormats: [],
          knowledgeSources: EMPTY_KS,
        },
        controller.signal
      );

      for await (const event of stream as AsyncGenerator<StreamEvent>) {
        if (event.type === 'text_delta') {
          setOutput((prev) => prev + event.content);
        }
        if (event.type === 'error' || event.type === 'stream_end') break;
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setOutput((prev) => prev + `\n\n[Error: ${(err as Error).message}]`);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunBoth = async () => {
    if (!userMessage.trim() || isRunning) return;
    setShowComparison(false);
    setOutputA('');
    setOutputB('');

    // Run sequentially to avoid rate limits
    await streamVariant(variantA, setOutputA as (fn: (prev: string) => string) => void, setIsRunningA, abortRefA);
    await streamVariant(variantB, setOutputB as (fn: (prev: string) => string) => void, setIsRunningB, abortRefB);

    setShowComparison(true);
  };

  const handleStop = () => {
    abortRefA.current?.abort();
    abortRefB.current?.abort();
    setIsRunningA(false);
    setIsRunningB(false);
  };

  const handleCopyA = async () => {
    await navigator.clipboard.writeText(outputA);
    setCopiedA(true);
    setTimeout(() => setCopiedA(false), 2000);
  };

  const handleCopyB = async () => {
    await navigator.clipboard.writeText(outputB);
    setCopiedB(true);
    setTimeout(() => setCopiedB(false), 2000);
  };

  const handleDownload = () => {
    const content = [
      `# A/B Prompt Test Results`,
      `\nPrompt: ${userMessage}`,
      `\n---\n\n## Variant A`,
      `- Module: ${variantA.moduleId || 'none'}`,
      `- Thinking: ${variantA.thinking}`,
      `- Creativity: ${variantA.creativity}`,
      `\n### Output A\n${outputA}`,
      `\n---\n\n## Variant B`,
      `- Module: ${variantB.moduleId || 'none'}`,
      `- Thinking: ${variantB.thinking}`,
      `- Creativity: ${variantB.creativity}`,
      `\n### Output B\n${outputB}`,
    ].join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ab-test-results.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const comparison = (outputA && outputB) ? buildComparison(outputA, outputB) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-adv-teal" />
            <h1 className="text-xl font-bold text-adv-white">A/B Prompt Testing</h1>
          </div>
          <p className="mt-1 text-sm text-adv-gray">
            Compare two prompt configurations side by side on the same input. Run both variants sequentially and analyse the differences.
          </p>
        </div>
        {outputA && outputB && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download results
          </button>
        )}
      </div>

      {/* Shared input */}
      <div className="rounded-xl border border-border bg-adv-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-adv-gray shrink-0" />
          <p className="text-xs text-adv-gray">
            This message is sent to both variants. After running, the outputs are compared below.
            Variants A and B run sequentially to avoid rate limits.
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Your message (sent to both variants)</label>
          <textarea
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            placeholder="e.g., Summarise the key AML obligations under AMLR 2024/1624 for a Nordic bank..."
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRunBoth();
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          {isRunning ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 rounded-lg bg-adv-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRunBoth}
              disabled={!userMessage.trim()}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-4 w-4" />
              Run Both Variants
            </button>
          )}
          {isRunningA && !isRunningB && (
            <div className="flex items-center gap-1.5 text-xs text-adv-teal">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-adv-teal" />
              Running Variant A...
            </div>
          )}
          {isRunningB && (
            <div className="flex items-center gap-1.5 text-xs text-adv-gold">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-adv-gold" />
              Running Variant B...
            </div>
          )}
          <span className="text-[11px] text-adv-gray">Ctrl+Enter to run</span>
        </div>
      </div>

      {/* Side-by-side variant panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VariantPanel
          label="A"
          config={variantA}
          onChange={(updates) => setVariantA((prev) => ({ ...prev, ...updates }))}
          output={outputA}
          isStreaming={isRunningA}
          onCopy={handleCopyA}
          copied={copiedA}
        />
        <VariantPanel
          label="B"
          config={variantB}
          onChange={(updates) => setVariantB((prev) => ({ ...prev, ...updates }))}
          output={outputB}
          isStreaming={isRunningB}
          onCopy={handleCopyB}
          copied={copiedB}
        />
      </div>

      {/* Comparison summary */}
      {showComparison && comparison && (
        <div className="rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-5">
          <h2 className="mb-4 text-sm font-semibold text-adv-teal">Comparison Summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-adv-teal/20">
                  <th className="pb-2 text-left text-xs font-medium text-adv-gray">Metric</th>
                  <th className="pb-2 text-center text-xs font-medium text-adv-teal">Variant A</th>
                  <th className="pb-2 text-center text-xs font-medium text-adv-gold">Variant B</th>
                  <th className="pb-2 text-center text-xs font-medium text-adv-gray">Winner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2 text-adv-gray">Module</td>
                  <td className="py-2 text-center text-adv-off-white text-xs">
                    {variantA.moduleId
                      ? MODULES.find((m) => m.id === variantA.moduleId)?.shortLabel ?? variantA.moduleId
                      : <span className="text-adv-gray">None</span>}
                  </td>
                  <td className="py-2 text-center text-adv-off-white text-xs">
                    {variantB.moduleId
                      ? MODULES.find((m) => m.id === variantB.moduleId)?.shortLabel ?? variantB.moduleId
                      : <span className="text-adv-gray">None</span>}
                  </td>
                  <td className="py-2 text-center text-adv-gray text-xs">—</td>
                </tr>
                <tr>
                  <td className="py-2 text-adv-gray">Thinking level</td>
                  <td className="py-2 text-center text-adv-off-white text-xs">{variantA.thinking}</td>
                  <td className="py-2 text-center text-adv-off-white text-xs">{variantB.thinking}</td>
                  <td className="py-2 text-center text-adv-gray text-xs">—</td>
                </tr>
                <tr>
                  <td className="py-2 text-adv-gray">Creativity</td>
                  <td className="py-2 text-center text-adv-off-white text-xs">{variantA.creativity}</td>
                  <td className="py-2 text-center text-adv-off-white text-xs">{variantB.creativity}</td>
                  <td className="py-2 text-center text-adv-gray text-xs">—</td>
                </tr>
                <tr>
                  <td className="py-2 text-adv-gray">Model</td>
                  <td className="py-2 text-center text-adv-off-white text-xs">{variantA.model?.includes('opus') ? 'Opus 4.8' : variantA.model?.includes('sonnet') ? 'Sonnet 4.5' : 'Haiku 4.5'}</td>
                  <td className="py-2 text-center text-adv-off-white text-xs">{variantB.model?.includes('opus') ? 'Opus 4.8' : variantB.model?.includes('sonnet') ? 'Sonnet 4.5' : 'Haiku 4.5'}</td>
                  <td className="py-2 text-center text-adv-gray text-xs">—</td>
                </tr>
                <tr>
                  <td className="py-2 text-adv-gray">Word count</td>
                  <td className="py-2 text-center font-medium text-adv-off-white">
                    {comparison.wordCountA.toLocaleString()}
                  </td>
                  <td className="py-2 text-center font-medium text-adv-off-white">
                    {comparison.wordCountB.toLocaleString()}
                  </td>
                  <td className="py-2 text-center">
                    {comparison.winnerByLength === 'tie' ? (
                      <span className="rounded bg-adv-gray/20 px-2 py-0.5 text-xs text-adv-gray">Tie</span>
                    ) : (
                      <span className={`rounded px-2 py-0.5 text-xs font-bold text-adv-dark ${comparison.winnerByLength === 'A' ? 'bg-adv-teal' : 'bg-adv-gold'}`}>
                        Variant {comparison.winnerByLength}
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-adv-gray">Est. output tokens</td>
                  <td className="py-2 text-center text-adv-off-white">
                    ~{comparison.tokenEstA.toLocaleString()}
                  </td>
                  <td className="py-2 text-center text-adv-off-white">
                    ~{comparison.tokenEstB.toLocaleString()}
                  </td>
                  <td className="py-2 text-center text-adv-gray text-xs">—</td>
                </tr>
                <tr>
                  <td className="py-2 text-adv-gray">Response length ratio</td>
                  <td className="py-2 text-center text-adv-off-white text-xs" colSpan={2}>
                    {comparison.wordCountA > 0 && comparison.wordCountB > 0
                      ? `A is ${comparison.wordCountA > comparison.wordCountB
                          ? `${Math.round((comparison.wordCountA / comparison.wordCountB) * 100 - 100)}% longer`
                          : comparison.wordCountB > comparison.wordCountA
                          ? `${Math.round((comparison.wordCountB / comparison.wordCountA) * 100 - 100)}% shorter`
                          : 'the same length'} than B`
                      : '—'}
                  </td>
                  <td className="py-2" />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-adv-gray">
            Note: "Winner" is based on response length (more words = higher score). Evaluate quality manually.
            Length alone does not determine value — a concise answer may be superior.
          </p>
        </div>
      )}
    </div>
  );
}
