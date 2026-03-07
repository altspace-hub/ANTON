/**
 * DeliberationPanel.tsx
 *
 * Multi-Model Deliberation Protocol UI
 *
 * Shows the progress of Opus + Sonnet + Haiku running in parallel,
 * then streams the synthesised confidence-weighted response.
 * After completion, displays agreement metadata and expandable
 * individual model responses.
 */

import { useCallback, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { streamDeliberation } from '@/lib/api';
import type { DeliberationConfig } from '@/lib/api';
import type { DeliberationMeta, DeliberationOpinion, DeliberationPanelist } from '@/lib/types';

// ── Sub-components ──────────────────────────────────────────────

type PanelistStatus = 'pending' | 'running' | 'complete' | 'error';

interface PanelistCardProps {
  panelist: DeliberationPanelist;
  status: PanelistStatus;
  executionMs?: number;
  responsePreview?: string;
  fullResponse?: string;
}

function PanelistCard({ panelist, status, executionMs, responsePreview, fullResponse }: PanelistCardProps) {
  const [expanded, setExpanded] = useState(false);

  const modelShort = panelist.model.includes('opus') ? 'Opus' : panelist.model.includes('sonnet') ? 'Sonnet' : 'Haiku';
  const statusColor = {
    pending: 'border-adv-gray-med/20 bg-adv-card/30',
    running: 'border-adv-teal/40 bg-adv-teal-soft',
    complete: 'border-adv-green/30 bg-adv-green/5',
    error: 'border-adv-red/30 bg-adv-red/5',
  }[status];

  return (
    <div className={`rounded-lg border p-3 transition-all ${statusColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'pending' && <div className="h-3 w-3 rounded-full bg-adv-gray-med/40" />}
          {status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-adv-teal" />}
          {status === 'complete' && <CheckCircle2 className="h-3 w-3 text-adv-green" />}
          {status === 'error' && <AlertTriangle className="h-3 w-3 text-adv-red" />}
          <span className="text-xs font-semibold text-adv-off-white">{panelist.role}</span>
          <span className="rounded-full bg-adv-card px-1.5 py-0.5 text-xs text-adv-gray">{modelShort}</span>
        </div>
        <div className="flex items-center gap-2">
          {executionMs !== undefined && (
            <span className="flex items-center gap-1 text-xs text-adv-gray">
              <Clock className="h-2.5 w-2.5" />
              {(executionMs / 1000).toFixed(1)}s
            </span>
          )}
          {status === 'complete' && fullResponse && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-0.5 text-xs text-adv-teal hover:text-adv-teal-dark"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {expanded ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
      </div>
      {status === 'running' && (
        <p className="mt-1.5 text-[11px] text-adv-teal/80 italic">Analysing independently…</p>
      )}
      {status === 'complete' && !expanded && responsePreview && (
        <p className="mt-1.5 line-clamp-2 text-[11px] text-adv-gray">{responsePreview}…</p>
      )}
      {expanded && fullResponse && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded border border-adv-gray-med/10 bg-adv-dark/40 p-2">
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-adv-gray">{fullResponse}</p>
        </div>
      )}
    </div>
  );
}

// Agreement badge
function AgreementBadge({ meta }: { meta: DeliberationMeta }) {
  const config = {
    unanimous: { label: 'Unanimous', color: 'text-adv-green border-adv-green/30 bg-adv-green/10', icon: '✓✓✓' },
    majority: { label: 'Majority Agreement', color: 'text-adv-gold border-adv-gold/30 bg-adv-gold/10', icon: '✓✓○' },
    split: { label: 'Split Views', color: 'text-adv-red border-adv-red/30 bg-adv-red/10', icon: '✓○○' },
  }[meta.agreementLevel];

  const confidenceLabel = { high: 'High confidence', medium: 'Moderate confidence', low: 'Low confidence' }[meta.confidence];

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${config.color}`}>
      <span className="text-sm font-mono">{config.icon}</span>
      <span className="text-xs font-semibold">{config.label}</span>
      <span className="text-xs opacity-70">· {confidenceLabel}</span>
      <span className="text-xs font-mono opacity-60">{Math.round(meta.agreementScore * 100)}%</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

interface DeliberationPanelProps {
  config: DeliberationConfig;
  onNewDeliberation?: () => void;
}

export default function DeliberationPanel({ config, onNewDeliberation }: DeliberationPanelProps) {
  const abortRef = useRef<AbortController | null>(null);

  // State
  const [phase, setPhase] = useState<'idle' | 'panel' | 'synthesis' | 'complete' | 'error'>('idle');
  const [panelists, setPanelists] = useState<DeliberationPanelist[]>([]);
  const [panelistStatuses, setPanelistStatuses] = useState<Record<string, PanelistStatus>>({});
  const [panelistExecutionMs, setPanelistExecutionMs] = useState<Record<string, number>>({});
  const [panelistPreviews, setPanelistPreviews] = useState<Record<string, string>>({});
  const [opinions, setOpinions] = useState<DeliberationOpinion[]>([]);
  const [synthesisText, setSynthesisText] = useState('');
  const [meta, setMeta] = useState<DeliberationMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDisagreements, setShowDisagreements] = useState(false);

  // Strip metadata comment from synthesis for display
  const displayText = synthesisText.replace(/\s*<!--\s*DELIBERATION_META:[\s\S]*?-->\s*$/, '').trimEnd();

  const run = useCallback(async () => {
    if (phase === 'panel' || phase === 'synthesis') return;

    abortRef.current = new AbortController();
    setPhase('panel');
    setSynthesisText('');
    setMeta(null);
    setError(null);
    setOpinions([]);
    setPanelistStatuses({});
    setPanelistExecutionMs({});
    setPanelistPreviews({});

    try {
      for await (const event of streamDeliberation(config, abortRef.current.signal)) {
        switch (event.type) {
          case 'deliberation_start':
            setPanelists(event.panelists);
            setPanelistStatuses(Object.fromEntries(event.panelists.map((p) => [p.model, 'pending' as PanelistStatus])));
            break;

          case 'model_start':
            setPanelistStatuses((prev) => ({ ...prev, [event.model]: 'running' }));
            break;

          case 'model_complete':
            setPanelistStatuses((prev) => ({ ...prev, [event.model]: 'complete' }));
            setPanelistExecutionMs((prev) => ({ ...prev, [event.model]: event.executionMs }));
            setPanelistPreviews((prev) => ({ ...prev, [event.model]: event.responsePreview }));
            break;

          case 'text_delta':
            setPhase('synthesis');
            setSynthesisText((prev) => prev + event.content);
            break;

          case 'deliberation_complete': {
            const { type: _type, opinions: ops, ...metaFields } = event as typeof event & { opinions: DeliberationOpinion[] };
            setMeta(metaFields as DeliberationMeta);
            setOpinions(ops || []);
            setPhase('complete');
            break;
          }

          case 'error':
            setError(event.message);
            setPhase('error');
            break;
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setPhase('error');
      }
    }
  }, [config, phase]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setPhase('complete');
  }, []);

  // Idle state — show launch button
  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
        <div className="rounded-full border border-adv-teal/30 bg-adv-teal-soft p-5">
          <Layers className="h-8 w-8 text-adv-teal" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-adv-white">Multi-Model Deliberation</h3>
          <p className="mt-1 max-w-sm text-sm text-adv-gray">
            Runs Opus, Sonnet, and Haiku in parallel on your question, then synthesises a confidence-weighted response with agreement scoring.
          </p>
          <p className="mt-2 text-xs text-adv-gold">~3× cost · Best for high-stakes or safety-critical queries</p>
        </div>
        <button
          onClick={run}
          className="flex items-center gap-2 rounded-xl bg-adv-teal px-6 py-3 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark transition-colors"
        >
          <Layers className="h-4 w-4" />
          Start Deliberation
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Panel Progress */}
      <div className="rounded-xl border border-adv-teal/20 bg-adv-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-adv-teal" />
            <span className="text-sm font-semibold text-adv-white">Deliberation Panel</span>
            {(phase === 'panel' || phase === 'synthesis') && (
              <span className="text-xs text-adv-teal italic animate-pulse">
                {phase === 'panel' ? 'Models analysing…' : 'Synthesising…'}
              </span>
            )}
          </div>
          {(phase === 'panel' || phase === 'synthesis') && (
            <button onClick={stop} className="text-xs text-adv-gray hover:text-adv-red transition-colors">
              Stop
            </button>
          )}
          {phase === 'complete' && onNewDeliberation && (
            <button onClick={onNewDeliberation} className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors">
              New deliberation
            </button>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {panelists.map((p) => (
            <PanelistCard
              key={p.model}
              panelist={p}
              status={panelistStatuses[p.model] ?? 'pending'}
              executionMs={panelistExecutionMs[p.model]}
              responsePreview={panelistPreviews[p.model]}
              fullResponse={opinions.find((o) => o.model === p.model)?.response}
            />
          ))}
        </div>
      </div>

      {/* Red Flags */}
      {meta && meta.redFlags.length > 0 && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-adv-red" />
            <span className="text-sm font-semibold text-adv-red">Red Flags</span>
            <span className="text-xs text-adv-gray">— raised by one or more models</span>
          </div>
          <ul className="space-y-1">
            {meta.redFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-adv-red/90">
                <span className="mt-0.5 text-xs">▶</span>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Synthesis */}
      {(phase === 'synthesis' || phase === 'complete') && displayText && (
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-adv-white">Synthesised Response</span>
            {meta && <AgreementBadge meta={meta} />}
          </div>
          <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
          </div>
          {phase === 'synthesis' && (
            <span className="inline-block h-4 w-0.5 animate-pulse bg-adv-teal align-middle" />
          )}
        </div>
      )}

      {/* Disagreements */}
      {meta && meta.disagreements.length > 0 && phase === 'complete' && (
        <div className="rounded-xl border border-adv-gold/20 bg-adv-card p-4">
          <button
            onClick={() => setShowDisagreements(!showDisagreements)}
            className="flex w-full items-center justify-between text-sm font-semibold text-adv-gold"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Disagreements ({meta.disagreements.length})</span>
            </div>
            {showDisagreements ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showDisagreements && (
            <div className="mt-3 space-y-3">
              {meta.disagreements.map((d, i) => (
                <div key={i} className="rounded-lg bg-adv-dark/50 p-3">
                  <p className="mb-2 text-xs font-semibold text-adv-gold">{d.topic}</p>
                  <div className="space-y-1.5">
                    {Object.entries(d.positions).map(([role, view]) => (
                      <div key={role} className="flex items-start gap-2">
                        <span className="mt-0.5 min-w-[90px] text-xs font-medium text-adv-gray">{role}:</span>
                        <span className="text-xs text-adv-off-white">{view}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/5 p-4">
          <p className="text-sm font-semibold text-adv-red">Deliberation failed</p>
          <p className="mt-1 text-xs text-adv-gray">{error}</p>
          <button onClick={run} className="mt-3 rounded bg-adv-red/20 px-3 py-1 text-xs text-adv-red hover:bg-adv-red/30">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
