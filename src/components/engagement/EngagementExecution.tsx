/**
 * EngagementExecution.tsx
 * Phase 6: Execution
 * Execute workstreams using the full 7-layer prompt, stream output from Claude Opus.
 */

import { useState, useRef, useEffect } from 'react';
import {
  Play, Loader2, ChevronRight, CheckCircle, AlertCircle,
  GitBranch, Clock, Zap, FileText, RotateCcw, ExternalLink, Brain, ChevronDown, ChevronUp
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import type { EngagementData, Workstream } from '@/pages/EngagementWorkspacePage';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

export default function EngagementExecution({ engagement, onUpdate, onNext, onReload }: Props) {
  const [executing, setExecuting] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [streamedThinking, setStreamedThinking] = useState('');
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [selectedWorkstream, setSelectedWorkstream] = useState<string | null>(
    engagement.workstreams.length === 1 ? engagement.workstreams[0].id : null
  );
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current && streamedText) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [streamedText]);

  // Check if there's already a draft iteration
  const latestIteration = engagement.iterations.find(it => it.status === 'draft');
  const hasOutput = !!latestIteration?.output_content;

  const activeWorkstream = selectedWorkstream
    ? engagement.workstreams.find(w => w.id === selectedWorkstream)
    : null;

  async function execute() {
    setExecuting(true);
    setStreamedText('');
    setStreamedThinking('');
    setThinkingOpen(false);
    setError(null);
    setDone(false);

    abortRef.current = new AbortController();

    try {
      const res = await fetchWithAuth(`/api/engagements/${engagement.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstream_id: selectedWorkstream || undefined }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') setStreamedText(prev => prev + event.text);
            if (event.type === 'thinking_delta') setStreamedThinking(prev => prev + event.content);
            if (event.type === 'done') { setDone(true); onReload(); }
            if (event.type === 'error') setError(event.error);
          } catch { /**/ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e));
    } finally {
      setExecuting(false);
    }
  }

  function abort() {
    abortRef.current?.abort();
    setExecuting(false);
  }

  const resourceCount = engagement.resources.filter(r => !['not_available', 'coming_later'].includes(r.status)).length;
  const scopeCount = engagement.scope_items.filter(si => si.status !== 'removed').length;
  const hasBlueprint = engagement.quality_blueprint && engagement.quality_blueprint !== '{}';

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 6</p>
        <h2 className="text-xl font-bold text-adv-white">Execution</h2>
        <p className="mt-1 text-sm text-adv-gray">
          ANTON will execute the engagement using your confirmed scope, client intelligence, uploaded resources, and quality blueprint. Output streams in real time.
        </p>
      </div>

      {/* Execution context summary */}
      <div className="grid grid-cols-3 gap-3">
        <ContextTile icon={FileText} label="Scope items" value={scopeCount} ok={scopeCount > 0} />
        <ContextTile icon={GitBranch} label="Resources" value={resourceCount} ok={resourceCount > 0} />
        <ContextTile icon={Zap} label="Quality Blueprint" value={hasBlueprint ? 'Loaded' : 'Not set'} ok={!!hasBlueprint} isText />
      </div>

      {/* Workstream selector (if any) */}
      {engagement.workstreams.length > 1 && (
        <div className="bg-adv-card border border-border rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-adv-off-white">Select Workstream</h3>
          <p className="text-xs text-adv-gray">Choose which workstream to execute first.</p>
          <div className="space-y-2">
            {engagement.workstreams.map(ws => (
              <WorkstreamRow
                key={ws.id}
                ws={ws}
                selected={selectedWorkstream === ws.id}
                onSelect={() => setSelectedWorkstream(ws.id)}
              />
            ))}
            <button
              onClick={() => setSelectedWorkstream(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-sm ${
                selectedWorkstream === null
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border text-adv-gray hover:border-adv-teal/40'
              }`}
            >
              <GitBranch className="h-4 w-4 shrink-0" />
              <span>Execute full engagement (all workstreams combined)</span>
            </button>
          </div>
        </div>
      )}

      {/* Prior iteration notice */}
      {hasOutput && !streamedText && (
        <div className="bg-adv-gold/5 border border-adv-gold/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <Clock className="h-4 w-4 text-adv-gold shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-adv-off-white">Previous draft exists</p>
            <p className="text-xs text-adv-gray mt-0.5">
              Iteration #{latestIteration?.iteration_number} is waiting for review. You can re-execute to create a new draft or proceed to review the existing one.
            </p>
          </div>
        </div>
      )}

      {/* Execute button */}
      {!executing && !streamedText && (
        <div className="flex gap-3">
          <button
            onClick={execute}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-adv-teal text-adv-dark text-sm font-semibold hover:bg-adv-teal-dark transition-colors"
          >
            <Play className="h-4 w-4" />
            {hasOutput ? 'Re-execute (New Iteration)' : `Execute ${activeWorkstream ? activeWorkstream.title : 'Engagement'}`}
          </button>
          {hasOutput && (
            <button
              onClick={onNext}
              className="flex items-center gap-2 px-6 py-3 rounded-lg border border-border text-sm text-adv-gray hover:text-adv-off-white transition-colors"
            >
              Go to Review
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Executing state */}
      {executing && !streamedText && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-adv-teal-soft border border-adv-teal/20">
          <Loader2 className="h-5 w-5 text-adv-teal animate-spin shrink-0" />
          <div>
            <p className="text-sm text-adv-teal font-medium">ANTON is executing…</p>
            <p className="text-xs text-adv-gray mt-0.5">Assembling context, building prompt, streaming output</p>
          </div>
          <button onClick={abort} className="ml-auto text-xs text-adv-gray hover:text-adv-red transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Live thinking indicator — visible while model reasons */}
      {streamedThinking && (
        <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl overflow-hidden">
          <button
            onClick={() => setThinkingOpen(p => !p)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-adv-teal/5 transition-colors text-left"
          >
            <Brain className="h-3.5 w-3.5 text-adv-teal shrink-0" />
            <span className="text-xs font-medium text-adv-teal">
              {executing ? 'ANTON is thinking…' : 'Reasoning complete'}
            </span>
            {executing && <Loader2 className="h-3 w-3 text-adv-teal/60 animate-spin ml-1" />}
            <span className="ml-auto">
              {thinkingOpen ? <ChevronUp className="h-3.5 w-3.5 text-adv-teal/60" /> : <ChevronDown className="h-3.5 w-3.5 text-adv-teal/60" />}
            </span>
          </button>
          {thinkingOpen && (
            <div className="border-t border-adv-teal/10 px-4 pb-4 max-h-48 overflow-y-auto">
              <pre className="text-[11px] text-adv-gray whitespace-pre-wrap font-mono leading-relaxed pt-3">
                {streamedThinking}
                {executing && <span className="inline-block w-1 h-3 bg-adv-teal/60 animate-pulse ml-0.5 align-text-bottom" />}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Streaming output */}
      {streamedText && (
        <div className="bg-adv-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            {executing ? (
              <Loader2 className="h-3.5 w-3.5 text-adv-teal animate-spin" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5 text-adv-green" />
            )}
            <span className="text-xs font-medium text-adv-off-white">
              {executing ? 'Streaming output…' : 'Execution complete'}
            </span>
            {executing && (
              <button onClick={abort} className="ml-auto text-xs text-adv-gray hover:text-adv-red transition-colors">
                Stop
              </button>
            )}
          </div>
          <div
            ref={outputRef}
            className="p-5 max-h-[60vh] overflow-y-auto font-mono text-xs text-adv-off-white whitespace-pre-wrap leading-relaxed"
          >
            {streamedText}
            {executing && <span className="inline-block w-1.5 h-3.5 bg-adv-teal animate-pulse ml-0.5 align-text-bottom" />}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Done — Continue to Review */}
      {(done || (hasOutput && !streamedText)) && !executing && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={execute}
            className="flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-execute
          </button>
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors"
          >
            Continue to Review
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ContextTile({ icon: Icon, label, value, ok, isText }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  ok: boolean;
  isText?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border flex flex-col gap-1 ${ok ? 'bg-adv-card border-border' : 'bg-adv-red/5 border-adv-red/20'}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${ok ? 'text-adv-teal' : 'text-adv-red'}`} />
        <span className="text-xs text-adv-gray uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-lg font-bold ${ok ? 'text-adv-off-white' : 'text-adv-red'}`}>
        {isText ? value : typeof value === 'number' && value === 0 ? '—' : value}
      </span>
    </div>
  );
}

function WorkstreamRow({ ws, selected, onSelect }: { ws: Workstream; selected: boolean; onSelect: () => void }) {
  const statusColors: Record<string, string> = {
    pending:   'text-adv-gray bg-adv-dark border-border',
    ready:     'text-adv-teal bg-adv-teal-dim border-adv-teal/20',
    executing: 'text-adv-gold bg-adv-gold/10 border-adv-gold/20',
    review:    'text-adv-blue bg-adv-blue/10 border-adv-blue/20',
    completed: 'text-adv-green bg-adv-green/10 border-adv-green/20',
    blocked:   'text-adv-red bg-adv-red/10 border-adv-red/20',
  };
  const sc = statusColors[ws.execution_status] || statusColors.pending;
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
        selected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border hover:border-adv-teal/40'
      }`}
    >
      <CheckCircle className={`h-4 w-4 shrink-0 ${selected ? 'text-adv-teal' : 'text-adv-gray'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-adv-off-white font-medium">{ws.title}</p>
        {ws.description && <p className="text-xs text-adv-gray mt-0.5 truncate">{ws.description}</p>}
      </div>
      <span className={`text-xs border rounded-full px-2 py-0.5 shrink-0 ${sc}`}>
        {ws.execution_status}
      </span>
    </button>
  );
}
