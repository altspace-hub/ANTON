import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, RefreshCw, EyeOff, Wrench, User, Clock, HelpCircle, ChevronRight,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';
import MarketDisclaimer from '../../components/shared/MarketDisclaimer';

interface FailureMode {
  id: string;
  label: string;
  meaning: string;
  remedy: 'operator' | 'code' | 'transient' | 'unknown';
}

interface DeadLetter {
  id: string;
  run_id: string;
  step_name: string;
  error: string | null;
  retry_count: number;
  created_at: string;
  workflow_id: string | null;
  run_status: string | null;
  run_error_message: string | null;
  mode: FailureMode;
}

interface Summary {
  total: number;
  affectedRuns: number;
  hiddenInSuccessfulRuns: number;
  runsThatClaimedSuccess: number;
  firstSeen: string | null;
  lastSeen: string | null;
  byMode: Array<{ mode: FailureMode; count: number; runs: number; lastSeen: string }>;
  byStep: Array<{ step: string; count: number; hidden: number; lastSeen: string }>;
}

const REMEDY_META: Record<FailureMode['remedy'], { label: string; icon: typeof Wrench; color: string }> = {
  operator: { label: 'Needs an operator', icon: User, color: 'text-adv-gold' },
  code: { label: 'Code defect', icon: Wrench, color: 'text-adv-red' },
  transient: { label: 'Transient', icon: Clock, color: 'text-adv-blue' },
  unknown: { label: 'Unclassified', icon: HelpCircle, color: 'text-adv-gray' },
};

const shortDate = (iso: string): string => new Date(iso).toLocaleDateString();
const fullDate = (iso: string): string => new Date(iso).toLocaleString();

export default function MarketDeadLettersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DeadLetter[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<string | null>(null);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/markets/workflows/dead-letters');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json() as { deadLetters: DeadLetter[]; summary: Summary };
      setRows(data.deadLetters);
      setSummary(data.summary);
    } catch (err) {
      console.error('[MarketDeadLetters] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Could not load the failure log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const visible = useMemo(() => rows.filter((r) => {
    if (modeFilter && r.mode.id !== modeFilter) return false;
    if (hiddenOnly && r.run_status !== 'completed') return false;
    return true;
  }), [rows, modeFilter, hiddenOnly]);

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/markets')}
            aria-label="Back to Markets"
            className="rounded-lg border border-adv-card bg-adv-card p-2 text-adv-gray hover:text-adv-teal transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-adv-off-white flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-adv-red" />
              Step Failures
            </h1>
            <p className="mt-0.5 text-sm text-adv-gray">
              Every markets workflow step that failed, and what would stop it happening again
            </p>
          </div>
        </div>
        <button
          onClick={fetchRows}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-2 text-sm text-adv-gray hover:text-adv-teal transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <MarketDisclaimer compact />

      {error && (
        <div className="rounded-xl border border-adv-red bg-adv-card p-4 text-sm text-adv-red">{error}</div>
      )}

      {/* The number this page exists for */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-adv-card bg-adv-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <EyeOff className="h-4 w-4 text-adv-red" />
              <span className="text-xs uppercase tracking-wide text-adv-gray">Hidden inside a successful run</span>
            </div>
            <p className="text-3xl font-bold text-adv-red">{summary.hiddenInSuccessfulRuns}</p>
            <p className="mt-1 text-xs text-adv-gray">
              across {summary.runsThatClaimedSuccess} runs that reported <span className="text-adv-green">completed</span> anyway.
              A step failure inside a &ldquo;successful&rdquo; run is invisible to loop health, to the
              same-day guard, and to the scheduler&rsquo;s retry.
            </p>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-5">
            <div className="text-xs uppercase tracking-wide text-adv-gray mb-1">Failures on record</div>
            <p className="text-3xl font-bold text-adv-off-white">{summary.total}</p>
            <p className="mt-1 text-xs text-adv-gray">
              over {summary.affectedRuns} runs
              {summary.firstSeen && <> since {shortDate(summary.firstSeen)}</>}
            </p>
          </div>
          <div className="rounded-xl border border-adv-card bg-adv-card p-5">
            <div className="text-xs uppercase tracking-wide text-adv-gray mb-1">Most recent</div>
            <p className="text-3xl font-bold text-adv-off-white">
              {summary.lastSeen ? shortDate(summary.lastSeen) : '—'}
            </p>
            <p className="mt-1 text-xs text-adv-gray">
              {summary.byStep[0] ? `${summary.byStep[0].step} leads with ${summary.byStep[0].count}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Grouped by what would actually fix it */}
      {summary && summary.byMode.length > 0 && (
        <div className="rounded-xl border border-adv-card bg-adv-card p-5">
          <h2 className="text-lg font-semibold text-adv-off-white mb-1">By cause</h2>
          <p className="text-sm text-adv-gray mb-4">
            Sorted by what would stop it, not by when it happened. Select one to filter the log.
          </p>
          <div className="space-y-2">
            {summary.byMode.map(({ mode, count, runs, lastSeen }) => {
              const meta = REMEDY_META[mode.remedy];
              const active = modeFilter === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setModeFilter(active ? null : mode.id)}
                  aria-pressed={active}
                  className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                    active ? 'border-adv-teal bg-adv-dark-2' : 'border-adv-dark bg-adv-dark-2 hover:border-adv-teal'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <meta.icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                      <span className="text-sm font-medium text-adv-off-white truncate">{mode.label}</span>
                      <span className={`text-xs shrink-0 ${meta.color}`}>{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs text-adv-gray">last {shortDate(lastSeen)}</span>
                      <span className="text-sm font-semibold text-adv-off-white">{count}</span>
                      <span className="text-xs text-adv-gray">/ {runs} runs</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-adv-gray">{mode.meaning}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* The log */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <h2 className="text-lg font-semibold text-adv-off-white">
            Failure log
            {(modeFilter || hiddenOnly) && (
              <span className="ml-2 text-sm font-normal text-adv-gray">
                {visible.length} of {rows.length}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHiddenOnly((v) => !v)}
              aria-pressed={hiddenOnly}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                hiddenOnly
                  ? 'border-adv-red bg-adv-dark-2 text-adv-red'
                  : 'border-adv-card bg-adv-dark-2 text-adv-gray hover:text-adv-teal'
              }`}
            >
              <EyeOff className="h-3 w-3" /> Hidden failures only
            </button>
            {modeFilter && (
              <button
                onClick={() => setModeFilter(null)}
                className="rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
              >
                Clear cause filter
              </button>
            )}
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <p className="text-sm text-adv-gray">Loading...</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-adv-gray text-center py-6">
            {rows.length === 0
              ? 'No step failures recorded. Every markets workflow step has completed.'
              : 'No failures match the current filters.'}
          </p>
        ) : (
          <div className="space-y-2">
            {visible.map((row) => {
              const hidden = row.run_status === 'completed';
              const meta = REMEDY_META[row.mode.remedy];
              const isOpen = expanded === row.id;
              return (
                <div key={row.id} className="rounded-lg border border-adv-dark bg-adv-dark-2">
                  <button
                    onClick={() => setExpanded(isOpen ? null : row.id)}
                    aria-expanded={isOpen}
                    className="w-full text-left px-4 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-adv-gray transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        />
                        <meta.icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                        <span className="text-sm text-adv-off-white truncate">{row.step_name}</span>
                        {hidden && (
                          <span className="shrink-0 rounded border border-adv-red px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-adv-red">
                            run said completed
                          </span>
                        )}
                        {row.retry_count > 0 && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-adv-gray">
                            retried {row.retry_count}&times;
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-adv-gray">{fullDate(row.created_at)}</span>
                    </div>
                    <p className="mt-1 pl-11 text-xs text-adv-gray truncate">{row.error ?? 'No message recorded'}</p>
                  </button>

                  {isOpen && (
                    <div className="border-t border-adv-dark px-4 py-3 pl-11 space-y-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-adv-gray">Error</div>
                        <p className="text-xs text-adv-off-white break-words">{row.error ?? '—'}</p>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-adv-gray">What this means</div>
                        <p className="text-xs text-adv-gray">{row.mode.meaning}</p>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-adv-gray">
                        <span>
                          Workflow{' '}
                          <span className="text-adv-off-white">
                            {row.workflow_id?.replace('wf_markets_', '').replace(/_/g, ' ') ?? 'unknown'}
                          </span>
                        </span>
                        <span>
                          Run reported{' '}
                          <span className={
                            row.run_status === 'completed' ? 'text-adv-green'
                              : row.run_status === 'failed' ? 'text-adv-red' : 'text-adv-gold'
                          }>{row.run_status ?? 'unknown'}</span>
                        </span>
                        <span className="font-mono text-[10px] text-adv-gray">{row.run_id}</span>
                      </div>
                      {hidden && (
                        <p className="text-xs text-adv-red">
                          This step failed but its run reported success, so nothing downstream treated the day
                          as incomplete — no retry, and loop health counted it as healthy.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Why there is no retry button here */}
      <div className="rounded-xl border border-adv-card bg-adv-card p-5">
        <h2 className="text-sm font-semibold text-adv-off-white mb-2">Recovering a failed cycle</h2>
        <p className="text-sm text-adv-gray">
          There is no per-row retry. A step cannot be re-run on its own — only its whole parent
          workflow can — and re-running a multi-hour, token-spending cycle is not a thing to do by
          accident from a log. Recovery is automatic instead: a scheduled slot whose run failed is
          picked up by the scheduler&rsquo;s catch-up, capped at three attempts. To re-run a cycle
          deliberately, use{' '}
          <button
            onClick={() => navigate('/markets/workflows')}
            className="text-adv-teal hover:underline"
          >
            Market Workflows
          </button>.
        </p>
      </div>
    </div>
  );
}
