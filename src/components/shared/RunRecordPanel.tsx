/**
 * RunRecordPanel.tsx — what the engine did in an agentic run (Wave 5).
 *
 * A small collapsible panel for a gap batch, a task step or an engagement
 * iteration: the run record(s) of that parent — engine, model, status,
 * turns, tokens, output hash — with a "Tool calls" list (name, duration,
 * error flag, input summary, output preview with "show full") and a
 * "Transcript" toggle (the assistant's turns in order). Everything is
 * fetched on open, nothing before.
 */
import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, ListOrdered, AlertCircle, CheckCircle2, Wrench, MessageSquareText } from 'lucide-react';
import {
  fetchRunRecordsByParent,
  fetchRunRecord,
  fetchRunToolCalls,
  type RunRecordParentKind,
  type RunRecordSummary,
  type RunToolCallRow,
} from '@/lib/api';

interface RunRecordPanelProps {
  parentKind: RunRecordParentKind;
  parentId: string;
  title?: string;
  /** Change it to re-fetch (e.g. when a run finishes). */
  refreshKey?: string | number;
  /** Replaces the default top border (`border-t border-border`) when given. */
  className?: string;
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function formatTokens(n: number): string {
  return n.toLocaleString('en-GB');
}

function seconds(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '';
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function inputSummary(input: Record<string, unknown> | null): string {
  if (!input || typeof input !== 'object') return '';
  const parts = Object.entries(input).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  const joined = parts.join(' · ');
  return joined.length > 160 ? `${joined.slice(0, 160)}…` : joined;
}

/** A readable name for the record inside its parent (which batch, which attempt). */
function recordLabel(r: RunRecordSummary): string {
  const p = r.request_params ?? {};
  if (r.parent_kind === 'gap_batch') {
    const framework = typeof p.framework === 'string' ? p.framework : null;
    const batch = typeof p.batchIndex === 'number' ? p.batchIndex + 1 : null;
    const total = typeof p.totalBatches === 'number' ? p.totalBatches : null;
    const lane = p.lane === 'second_opinion' ? ' · second opinion' : '';
    if (framework && batch !== null) return `${framework} — batch ${batch}${total ? ` of ${total}` : ''}${lane}`;
  }
  if (r.parent_kind === 'task_step') {
    const attempt = typeof p.attempt === 'number' ? p.attempt : null;
    return attempt && attempt > 1 ? `Attempt ${attempt}` : 'Run';
  }
  if (r.parent_kind === 'engagement_step') {
    const n = typeof p.iterationNumber === 'number' ? p.iterationNumber : null;
    return n ? `Iteration ${n}` : 'Run';
  }
  return 'Run';
}

export default function RunRecordPanel({ parentKind, parentId, title = 'Run record', refreshKey, className }: RunRecordPanelProps) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<RunRecordSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRunRecordsByParent(parentKind, parentId)
      .then((rows) => { if (!cancelled) setRecords(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e, 'Could not load the run record')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, parentKind, parentId, refreshKey]);

  return (
    <div className={className ?? 'border-t border-border'}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-adv-dark-2/30 transition-colors"
      >
        <ListOrdered className="h-4 w-4 text-adv-teal/70 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium text-adv-gray">{title}</span>
        {records && (
          <span className="text-sm text-adv-gray/70">
            ({records.length} {records.length === 1 ? 'run' : 'runs'})
          </span>
        )}
        <span className="ml-auto" aria-hidden="true">
          {open ? <ChevronUp className="h-4 w-4 text-adv-gray" /> : <ChevronDown className="h-4 w-4 text-adv-gray" />}
        </span>
      </button>
      {open && (
        <div id={bodyId} className="px-5 pb-4 space-y-3">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-adv-gray" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the run record…
            </p>
          )}
          {error && <p className="text-sm text-adv-red" role="alert">{error}</p>}
          {!loading && !error && records && records.length === 0 && (
            <p className="text-sm text-adv-gray">
              No run record for this run yet. Records are written for runs on the agentic engine; older runs have none.
            </p>
          )}
          {records?.map((r) => <RunRecordCard key={r.id} record={r} />)}
        </div>
      )}
    </div>
  );
}

function RunRecordCard({ record }: { record: RunRecordSummary }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const usage = record.usage;
  const status = record.status;
  const statusClass = status === 'completed'
    ? 'text-adv-green bg-adv-green/10 border-adv-green/30'
    : status === 'failed'
      ? 'text-adv-red bg-adv-red/10 border-adv-red/30'
      : 'text-adv-gold bg-adv-gold/10 border-adv-gold/30';
  const turns = typeof record.request_params?.turns === 'number' ? (record.request_params.turns as number) : null;
  const warning = typeof record.request_params?.warning === 'string' ? (record.request_params.warning as string) : null;
  const runError = typeof record.request_params?.error === 'string' ? (record.request_params.error as string) : null;
  const finished = record.finished_at ?? record.created_at;

  return (
    <div className="rounded-lg border border-border bg-adv-dark-2/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="text-sm font-medium text-adv-off-white">{recordLabel(record)}</span>
        <span className={`text-sm font-medium border rounded-full px-2 py-0.5 ${statusClass}`}>{status}</span>
        {record.model_requested && (
          <span className="text-sm text-adv-gray" title={`Engine ${record.engine ?? 'unknown'}${record.engine_version ? ` v${record.engine_version}` : ''}`}>
            {record.model_requested}
          </span>
        )}
        {turns !== null && <span className="text-sm text-adv-gray">{turns} {turns === 1 ? 'turn' : 'turns'}</span>}
        {usage && (
          <span className="text-sm text-adv-gray" title="Input / output tokens (cache reads not counted)">
            {formatTokens(usage.inputTokens)} in · {formatTokens(usage.outputTokens)} out
          </span>
        )}
        <span className="ml-auto text-sm text-adv-gray/80">
          {new Date(finished).toLocaleString()}
        </span>
      </div>
      {(warning || runError) && (
        <p className={`px-4 pb-2 text-sm ${runError ? 'text-adv-red' : 'text-adv-gold'}`}>
          {runError ?? warning}
        </p>
      )}
      <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-adv-gray/80">
        {record.output_sha256 && (
          <span title={`Output sha256 ${record.output_sha256}`}>output {record.output_sha256.slice(0, 12)}…</span>
        )}
        <span title={`Prompt sha256 ${record.prompt_sha256}`}>prompt {record.prompt_sha256.slice(0, 12)}… ({formatTokens(record.prompt_chars)} chars)</span>
        {record.cost_basis === 'plan_usage' && <span>subscription usage</span>}
      </div>

      <div className="border-t border-border/60 flex flex-wrap">
        <button
          type="button"
          onClick={() => setToolsOpen((p) => !p)}
          aria-expanded={toolsOpen}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${toolsOpen ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
        >
          <Wrench className="h-4 w-4" aria-hidden="true" />
          Tool calls ({record.tool_call_count})
        </button>
        <button
          type="button"
          onClick={() => setTranscriptOpen((p) => !p)}
          aria-expanded={transcriptOpen}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${transcriptOpen ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
        >
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          Transcript ({record.transcript_turns} {record.transcript_turns === 1 ? 'turn' : 'turns'})
        </button>
      </div>
      {toolsOpen && <ToolCallList runId={record.id} count={record.tool_call_count} />}
      {transcriptOpen && <TranscriptView runId={record.id} />}
    </div>
  );
}

function ToolCallList({ runId, count }: { runId: string; count: number }) {
  const [calls, setCalls] = useState<RunToolCallRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullOutputs, setFullOutputs] = useState<Record<string, string> | null>(null);
  const [fullLoading, setFullLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetchRunToolCalls(runId)
      .then((rows) => { if (!cancelled) setCalls(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e, 'Could not load the tool calls')); });
    return () => { cancelled = true; };
  }, [runId]);

  async function showFull(callId: string) {
    if (!fullOutputs) {
      setFullLoading(true);
      try {
        const rows = await fetchRunToolCalls(runId, { full: true });
        const map: Record<string, string> = {};
        for (const row of rows) map[row.id] = row.output_text ?? row.output_preview;
        setFullOutputs(map);
      } catch (e: unknown) {
        setError(errorText(e, 'Could not load the full output'));
        setFullLoading(false);
        return;
      }
      setFullLoading(false);
    }
    setExpanded((p) => ({ ...p, [callId]: true }));
  }

  if (error) return <p className="px-4 py-3 text-sm text-adv-red border-t border-border/60" role="alert">{error}</p>;
  if (!calls) {
    return (
      <p className="flex items-center gap-2 px-4 py-3 text-sm text-adv-gray border-t border-border/60" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading tool calls…
      </p>
    );
  }
  if (calls.length === 0) {
    return <p className="px-4 py-3 text-sm text-adv-gray border-t border-border/60">{count > 0 ? 'The tool calls of this run are not available.' : 'This run made no tool calls.'}</p>;
  }
  return (
    <ol className="border-t border-border/60 divide-y divide-border/40" aria-label="Tool calls in order">
      {calls.map((c) => {
        const isExpanded = expanded[c.id] === true && fullOutputs !== null;
        const text = isExpanded ? (fullOutputs?.[c.id] ?? c.output_preview) : c.output_preview;
        const canShowFull = c.output_preview_truncated && !isExpanded;
        return (
          <li key={c.id} className="px-4 py-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm text-adv-gray/70 tabular-nums">#{c.seq}</span>
              <span className="text-sm font-medium text-adv-off-white">{c.tool_name.replace(/_/g, ' ')}</span>
              {c.is_error ? (
                <span className="flex items-center gap-1 text-sm text-adv-red"><AlertCircle className="h-4 w-4" aria-hidden="true" /> failed</span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-adv-green"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> ok</span>
              )}
              {c.duration_ms !== null && <span className="text-sm text-adv-gray">{seconds(c.duration_ms)}</span>}
              <span className="ml-auto text-sm text-adv-gray/70" title={c.output_sha256 ? `Output sha256 ${c.output_sha256}` : undefined}>
                {formatTokens(c.output_chars)} chars
              </span>
            </div>
            {inputSummary(c.input) && (
              <p className="text-sm text-adv-gray break-words" title={JSON.stringify(c.input)}>{inputSummary(c.input)}</p>
            )}
            {text && (
              <pre className={`whitespace-pre-wrap font-mono text-sm leading-relaxed text-adv-off-white/90 bg-adv-dark/60 rounded-md p-3 ${isExpanded ? 'max-h-[480px]' : 'max-h-40'} overflow-y-auto`}>
                {text}
                {canShowFull ? '…' : ''}
              </pre>
            )}
            {canShowFull && (
              <button
                type="button"
                onClick={() => { void showFull(c.id); }}
                disabled={fullLoading}
                className="text-sm font-medium text-adv-teal hover:text-adv-teal-dark disabled:opacity-60 transition-colors"
              >
                {fullLoading ? 'Loading…' : `Show full output (${formatTokens(c.stored_chars)} of ${formatTokens(c.output_chars)} chars stored)`}
              </button>
            )}
            {isExpanded && (
              <button
                type="button"
                onClick={() => setExpanded((p) => ({ ...p, [c.id]: false }))}
                className="text-sm font-medium text-adv-teal hover:text-adv-teal-dark transition-colors"
              >
                Show less
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TranscriptView({ runId }: { runId: string }) {
  const [turns, setTurns] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRunRecord(runId)
      .then((r) => { if (!cancelled) setTurns(r?.transcript ?? []); })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e, 'Could not load the transcript')); });
    return () => { cancelled = true; };
  }, [runId]);

  if (error) return <p className="px-4 py-3 text-sm text-adv-red border-t border-border/60" role="alert">{error}</p>;
  if (!turns) {
    return (
      <p className="flex items-center gap-2 px-4 py-3 text-sm text-adv-gray border-t border-border/60" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading the transcript…
      </p>
    );
  }
  if (turns.length === 0) return <p className="px-4 py-3 text-sm text-adv-gray border-t border-border/60">No transcript was kept for this run.</p>;
  return (
    <ol className="border-t border-border/60 divide-y divide-border/40 max-h-[560px] overflow-y-auto" aria-label="Assistant turns in order">
      {turns.map((t, i) => (
        <li key={i} className="px-4 py-3">
          <p className="text-sm font-medium text-adv-gray mb-1">Turn {i + 1}{i === turns.length - 1 ? ' — final answer' : ''}</p>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-adv-off-white/90">{t}</pre>
        </li>
      ))}
    </ol>
  );
}
