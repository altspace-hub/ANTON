import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowLeft, MessageSquare, FolderGit2, Loader2, FileCheck2,
  Play, Square, ClipboardCheck, Download, ListChecks, BookOpen, CircleDot,
  CheckCircle2, XCircle, ShieldAlert, Lightbulb,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import PanelVerdictPanel, { type PanelVerdict } from '@/components/coding/PanelVerdictPanel';
import { fetchWithAuth } from '@/lib/api';
import type { StudioMode } from './CodingLandingPage';

// ── ANTON Studio — the BUILD-LOOP view (Studio P5) ─────────────────────────
// Drives the server-side iterate-to-finish orchestrator: a task list with live
// status, the run controls (start / approve-plan / STOP), the step log, the
// per-gate core-team panel verdicts (with the BLOCKING banner), the "LESSONS
// FROM THIS PROJECT" atom rail, and the .anton blueprint export.

const GATES = ['start', 'build', 'testing', 'finish'] as const;
type Gate = (typeof GATES)[number];

type RunStatus =
  | 'pending' | 'running' | 'awaiting_plan' | 'awaiting_gate'
  | 'blocked' | 'done' | 'stopped' | 'failed';

interface PlanTask {
  taskId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  reviseRounds: number;
}
interface StudioPlanView {
  releaseName: string;
  summary: string;
  tasks: PlanTask[];
}
interface StepLogEntry { at: string; kind: string; message: string; gate?: string | null; taskId?: string | null }
interface RunView {
  id: string;
  status: RunStatus;
  autonomy: 'more' | 'ask';
  revise_cap: number;
  current_task: string | null;
  stop_requested: boolean;
  awaiting_gate: Gate | null;
  last_error: string | null;
  plan: StudioPlanView | null;
  step_log: StepLogEntry[];
}
interface LessonAtom { atom_type?: string; atom_origin?: string; content?: string; created_at?: string }

const STATUS_STYLE: Record<RunStatus, { label: string; chip: string }> = {
  pending:       { label: 'Pending',        chip: 'bg-adv-gray-med/20 text-adv-gray' },
  running:       { label: 'Running',        chip: 'bg-adv-blue/15 text-adv-blue' },
  awaiting_plan: { label: 'Awaiting plan',  chip: 'bg-adv-gold/15 text-adv-gold' },
  awaiting_gate: { label: 'Awaiting gate',  chip: 'bg-adv-gold/15 text-adv-gold' },
  blocked:       { label: 'Blocked',        chip: 'bg-adv-red/15 text-adv-red' },
  done:          { label: 'Done',           chip: 'bg-adv-green/15 text-adv-green' },
  stopped:       { label: 'Stopped',        chip: 'bg-adv-gray-med/20 text-adv-gray' },
  failed:        { label: 'Failed',         chip: 'bg-adv-red/15 text-adv-red' },
};

const TASK_ICON: Record<PlanTask['status'], typeof CircleDot> = {
  pending: CircleDot, in_progress: Loader2, done: CheckCircle2, failed: XCircle,
};
const TASK_COLOR: Record<PlanTask['status'], string> = {
  pending: 'text-adv-gray', in_progress: 'text-adv-blue animate-spin', done: 'text-adv-green', failed: 'text-adv-red',
};

export default function CodingStudioPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawMode = params.get('mode');
  const studioMode: StudioMode = rawMode === 'ask' ? 'ask' : 'project';
  const projectIdFromUrl = params.get('project') ?? '';
  const fromWorkshop = params.get('from') === 'workshop';

  const [projectId, setProjectId] = useState(projectIdFromUrl);
  const [run, setRun] = useState<RunView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autonomy, setAutonomy] = useState<'more' | 'ask'>('more');
  const [reviseCap, setReviseCap] = useState(4);
  const [gateVerdicts, setGateVerdicts] = useState<Partial<Record<Gate, PanelVerdict | null>>>({});
  const [lessons, setLessons] = useState<LessonAtom[]>([]);
  const [exporting, setExporting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async (pid: string) => {
    try {
      const res = await fetchWithAuth(`/api/coding/studio/${encodeURIComponent(pid)}/run/status`);
      const json = (await res.json()) as { run?: RunView | null; error?: string };
      if (res.ok) setRun(json.run ?? null);
    } catch { /* transient — keep last */ }
  }, []);

  const loadGate = useCallback(async (pid: string, gate: Gate) => {
    try {
      const res = await fetchWithAuth(`/api/coding/studio/${encodeURIComponent(pid)}/run/status`); // warm
      void res;
      const r = await fetchWithAuth(`/api/core-team/${encodeURIComponent(pid)}/panel/${gate}`);
      const json = (await r.json()) as { decided?: boolean; verdict?: PanelVerdict | null };
      if (r.ok && json.decided && json.verdict) {
        setGateVerdicts((prev) => ({ ...prev, [gate]: json.verdict ?? null }));
      }
    } catch { /* ignore */ }
  }, []);

  const loadAll = useCallback(async (pid: string) => {
    await loadStatus(pid);
    await Promise.all(GATES.map((g) => loadGate(pid, g)));
    try {
      const res = await fetchWithAuth(`/api/coding/projects/${encodeURIComponent(pid)}/atoms?limit=20`);
      if (res.ok) {
        const json = (await res.json()) as { atoms?: LessonAtom[] };
        if (Array.isArray(json.atoms)) setLessons(json.atoms);
      }
    } catch { /* atoms endpoint optional */ }
  }, [loadStatus, loadGate]);

  // Poll while the run is active.
  useEffect(() => {
    if (!projectId.trim()) return;
    const active = run && ['running'].includes(run.status);
    if (active) {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => { void loadAll(projectId.trim()); }, 2500);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [run, projectId, loadAll]);

  useEffect(() => {
    if (projectIdFromUrl) void loadAll(projectIdFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(path: string, body?: unknown) {
    if (!projectId.trim()) { setError('A coding project id is required.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/coding/studio/${encodeURIComponent(projectId.trim())}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const json = (await res.json()) as { run?: RunView; error?: string };
      if (!res.ok) { setError(json.error ? String(json.error) : `Request failed (HTTP ${res.status}).`); return; }
      if (json.run) setRun(json.run);
      await loadAll(projectId.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  const startRun = () => call('/run', { autonomy, reviseCap });
  const approvePlan = () => call('/run/approve-plan');
  const stopRun = () => call('/run/stop');
  const stepLoop = () => call('/run', { autonomy, reviseCap });

  async function exportBlueprint() {
    if (!projectId.trim()) return;
    setExporting(true); setError(null);
    try {
      const res = await fetchWithAuth(`/api/coding/studio/${encodeURIComponent(projectId.trim())}/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (!res.ok) { setError(`Export failed (HTTP ${res.status}).`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `studio-${projectId.trim()}.anton`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const status = run?.status;
  const statusStyle = status ? STATUS_STYLE[status] : null;
  const blockingGate = run?.awaiting_gate && gateVerdicts[run.awaiting_gate]?.blocking ? run.awaiting_gate : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <CodingBreadcrumb items={[{ label: 'Studio' }]} />

      {/* Header */}
      <div className="rounded-2xl border-2 border-adv-teal bg-adv-card p-6 shadow-lg shadow-adv-teal/10">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-adv-teal-dim p-3"><Sparkles className="h-7 w-7 text-adv-teal" /></div>
          <div>
            <h1 className="text-xl font-bold text-adv-white">ANTON Studio</h1>
            <p className="text-xs text-adv-gray">
              The server-side build loop drives this project from its charter to finish — within your
              autonomy budget. The expert-panel gates and a revise-round cap are always enforced; STOP is always available.
            </p>
          </div>
          <div className="ml-auto inline-flex items-center gap-2 rounded-full bg-adv-dark px-3 py-1.5 text-xs font-medium text-adv-off-white">
            {studioMode === 'ask'
              ? <><MessageSquare className="h-4 w-4 text-adv-teal" /> Ask</>
              : <><FolderGit2 className="h-4 w-4 text-adv-teal" /> Project</>}
          </div>
        </div>
      </div>

      {fromWorkshop && projectId && (
        <div className="flex items-start gap-3 rounded-2xl border border-adv-green/40 bg-adv-green/5 p-4">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-adv-green" />
          <div className="text-sm text-adv-off-white">
            <p className="font-semibold text-adv-green">Charter created — Studio project seeded.</p>
            <p className="mt-0.5 text-xs text-adv-gray">Start the build loop below — it will plan the work and pause for your approval before building.</p>
          </div>
        </div>
      )}

      {/* Run controls */}
      <div className="rounded-2xl border border-border bg-adv-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">Build loop</h2>
          </div>
          {statusStyle && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusStyle.chip}`}>
              {statusStyle.label}{run?.current_task ? ' · task in progress' : ''}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={exportBlueprint} disabled={exporting || !projectId.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs font-medium text-adv-off-white hover:text-adv-teal disabled:opacity-50">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Export .anton
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray">Project id</span>
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="coding project id"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray">Autonomy</span>
            <select value={autonomy} onChange={(e) => setAutonomy(e.target.value as 'more' | 'ask')}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white">
              <option value="more">More autonomous (iterate to green)</option>
              <option value="ask">Ask before each task</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray">Revise-round cap</span>
            <input type="number" min={1} max={20} value={reviseCap}
              onChange={(e) => setReviseCap(Math.max(1, Math.min(20, Number(e.target.value) || 4)))}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white" />
          </label>
        </div>

        {error && <p className="mt-3 text-xs text-adv-red">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {(!status || ['pending', 'stopped', 'failed', 'blocked'].includes(status)) && (
            <button onClick={startRun} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {status === 'pending' || !status ? 'Start build loop' : 'Resume'}
            </button>
          )}
          {status === 'awaiting_plan' && (
            <button onClick={approvePlan} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-adv-green px-4 py-2 text-sm font-semibold text-adv-dark hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Approve plan & build
            </button>
          )}
          {status === 'running' && (
            <button onClick={stepLoop} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-4 py-2 text-sm font-medium text-adv-off-white hover:text-adv-teal disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Advance
            </button>
          )}
          {status && !['done', 'stopped', 'failed'].includes(status) && (
            <button onClick={stopRun} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-adv-red bg-adv-red/10 px-4 py-2 text-sm font-bold text-adv-red hover:bg-adv-red/20 disabled:opacity-50">
              <Square className="h-4 w-4" /> STOP
            </button>
          )}
        </div>

        {run?.last_error && (
          <p className="mt-3 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">{run.last_error}</p>
        )}
      </div>

      {/* Blocking banner (a mandatory-role dissent halted the run) */}
      {status === 'blocked' && blockingGate && gateVerdicts[blockingGate] && (
        <div className="rounded-2xl border-2 border-adv-red bg-adv-red/5 p-4">
          <div className="mb-2 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-adv-red" />
            <h2 className="text-sm font-bold text-adv-red">Run halted at the “{blockingGate}” gate</h2></div>
          <PanelVerdictPanel verdict={gateVerdicts[blockingGate]!} />
        </div>
      )}

      {/* Plan / task list */}
      {run?.plan && (
        <div className="rounded-2xl border border-border bg-adv-card p-5">
          <div className="mb-1 flex items-center gap-2"><ListChecks className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">{run.plan.releaseName}</h2></div>
          {run.plan.summary && <p className="mb-3 text-xs text-adv-gray">{run.plan.summary}</p>}
          <ul className="space-y-2">
            {run.plan.tasks.map((t) => {
              const Icon = TASK_ICON[t.status];
              return (
                <li key={t.taskId} className="flex items-start gap-2 rounded-lg border border-border bg-adv-dark px-3 py-2">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TASK_COLOR[t.status]}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-adv-off-white">{t.title}</p>
                    {t.reviseRounds > 0 && <p className="text-[11px] text-adv-gold">{t.reviseRounds} revise round(s)</p>}
                  </div>
                  <span className="ml-auto text-[11px] uppercase tracking-wider text-adv-gray">{t.status}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Per-gate panel verdicts */}
      {GATES.some((g) => gateVerdicts[g]) && (
        <div className="space-y-3">
          {GATES.filter((g) => gateVerdicts[g]).map((g) => (
            <details key={g} className="rounded-2xl border border-border bg-adv-card p-4" open={g === run?.awaiting_gate}>
              <summary className="cursor-pointer text-sm font-semibold text-adv-off-white">
                {g} gate — {gateVerdicts[g]!.panel_verdict}{gateVerdicts[g]!.blocking ? ' · BLOCKING' : ''}
              </summary>
              <div className="mt-3"><PanelVerdictPanel verdict={gateVerdicts[g]!} /></div>
            </details>
          ))}
        </div>
      )}

      {/* Lessons rail + step log */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-adv-card p-5">
          <div className="mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-adv-gold" />
            <h2 className="text-sm font-semibold text-adv-off-white">Lessons from this project</h2></div>
          {lessons.length === 0 ? (
            <p className="text-xs text-adv-gray">No project lessons yet. The loop mints atoms (test failures, panel flags, CVEs) as it runs — they’re injected into the next revision.</p>
          ) : (
            <ul className="space-y-2">
              {lessons.map((a, i) => (
                <li key={i} className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white">
                  <span className="mr-1 rounded bg-adv-gold/15 px-1.5 py-0.5 text-[10px] font-medium text-adv-gold">{a.atom_origin ?? a.atom_type}</span>
                  {a.content}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-adv-card p-5">
          <div className="mb-3 flex items-center gap-2"><BookOpen className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-off-white">Step log</h2></div>
          {!run || run.step_log.length === 0 ? (
            <p className="text-xs text-adv-gray">The loop’s plan / gate / codegen / apply / test / revise events appear here.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-auto">
              {run.step_log.slice().reverse().map((s, i) => (
                <li key={i} className="text-[11px] text-adv-gray">
                  <span className="mr-1 rounded bg-adv-dark px-1.5 py-0.5 font-mono text-[10px] text-adv-off-white">{s.kind}</span>
                  {s.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <button onClick={() => navigate('/coding')}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-4 py-2 text-sm font-medium text-adv-off-white hover:text-adv-teal">
          <ArrowLeft className="h-4 w-4" /> Back to Coding
        </button>
      </div>
    </div>
  );
}
