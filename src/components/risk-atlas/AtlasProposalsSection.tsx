/**
 * AtlasProposalsSection — AI suggestions for this Atlas, accepted one by one.
 *
 * Each suggestion is applied only when a person accepts it, through the same
 * server calls hand entry uses. The model never sets an inherent or residual
 * score: stage 4 proposes exposure/threat/vulnerability and the calculator
 * does the rest.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, Check, X, AlertTriangle, Info } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type Stage = 'exposures' | 'threat_paths' | 'vulnerabilities' | 'inherent' | 'controls' | 'appetite';
type Status = 'pending' | 'accepted' | 'rejected' | 'skipped' | 'unresolved' | 'failed';

interface Proposal {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  rationale: string | null;
  status: Status;
  error: string | null;
  created_at: string;
}
interface JobSummary { status: 'running' | 'done' | 'failed'; meta: { status?: string; stage?: Stage; pending?: number }; error?: string }

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'exposures', label: '1 · Exposures' },
  { id: 'threat_paths', label: '2 · Threat paths' },
  { id: 'vulnerabilities', label: '3 · Vulnerabilities' },
  { id: 'inherent', label: '4 · Inherent scores' },
  { id: 'controls', label: '5 · Controls' },
  { id: 'appetite', label: '7 · Appetite' },
];
const POLL_MS = 3000;

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/** One line describing what this suggestion would add. */
function summarise(p: Proposal): string {
  const v = p.payload;
  const s = (k: string) => (typeof v[k] === 'string' ? v[k] as string : '');
  switch (p.kind) {
    case 'exposure': return `${s('name')}${v.category ? ` · ${String(v.category)}` : ''}`;
    case 'threat_path': return `${s('path_code')} ${s('name')}${v.fcp_domain ? ` · ${String(v.fcp_domain)}` : ''}`;
    case 'vulnerability': return `${s('vuln_code')} ${s('name')} · severity ${String(v.severity ?? '?')}`;
    case 'inherent_score': return `Exposure ${String(v.exposure_score)} · threat ${String(v.threat_score)} · vulnerability ${String(v.vulnerability_score)} (inherent is computed)`;
    case 'control': return `${s('control_code')} ${s('name')} · ${String(v.type)} · ${String(v.strength)}`;
    case 'appetite': return `${String(v.appetite_position)}${v.required_action ? ` — ${String(v.required_action)}` : ''}`;
    case 'trigger': return `${s('trigger_event')} → ${s('required_action')}`;
    default: return JSON.stringify(v).slice(0, 160);
  }
}

export default function AtlasProposalsSection({ atlasId, onApplied }: { atlasId: string; onApplied?: () => void }) {
  const [stage, setStage] = useState<Stage>('exposures');
  const [items, setItems] = useState<Proposal[]>([]);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { proposals } = await readJson<{ proposals: Proposal[] }>(await fetchWithAuth(`/api/atlas/${atlasId}/proposals`, { headers: getAuthHeader() }));
    setItems(proposals);
  }, [atlasId]);

  const stopPolling = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };

  const poll = useCallback(async () => {
    try {
      const { job: j } = await readJson<{ job: JobSummary | null }>(await fetchWithAuth(`/api/atlas/${atlasId}/proposals/job`, { headers: getAuthHeader() }));
      setJob(j);
      if (j?.status === 'running') { timer.current = window.setTimeout(() => { void poll(); }, POLL_MS); return; }
      if (j?.status === 'done') await load();
      if (j?.status === 'failed') setError(j.error || 'The suggestions could not be produced.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [atlasId, load]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    void poll();
    return stopPolling;
  }, [load, poll]);

  async function generate(): Promise<void> {
    setError(null); stopPolling();
    try {
      const { job: j } = await readJson<{ job: JobSummary }>(await fetchWithAuth(`/api/atlas/${atlasId}/proposals`, {
        method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }),
      }));
      setJob(j);
      timer.current = window.setTimeout(() => { void poll(); }, POLL_MS);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function decide(p: Proposal, decision: 'accept' | 'reject'): Promise<void> {
    setBusy(p.id); setError(null);
    try {
      await readJson(await fetchWithAuth(`/api/atlas/${atlasId}/proposals/${p.id}/${decision}`, { method: 'POST', headers: getAuthHeader() }));
      await load();
      if (decision === 'accept') onApplied?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  async function acceptAll(pending: Proposal[]): Promise<void> {
    setBusy('all'); setError(null);
    try {
      const { results } = await readJson<{ results: Array<{ id: string; status: string; error?: string }> }>(await fetchWithAuth(`/api/atlas/${atlasId}/proposals/accept`, {
        method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: pending.map((p) => p.id) }),
      }));
      const bad = results.filter((r) => r.status !== 'accepted');
      if (bad.length) setError(`${bad.length} of ${results.length} could not be added: ${bad.map((b) => b.error ?? b.status).slice(0, 3).join('; ')}`);
      await load();
      onApplied?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const running = job?.status === 'running';
  const pending = items.filter((p) => p.status === 'pending');
  const other = items.filter((p) => p.status !== 'pending');

  return (
    <section aria-labelledby="proposals-heading">
      <h2 id="proposals-heading" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-adv-teal">
        <Sparkles className="h-3.5 w-3.5" /> Suggestions from AI
      </h2>
      <div className="rounded-lg border border-border bg-adv-card p-4">
        <p className="text-sm text-adv-gray">
          Asks the stage expert what is missing from this Atlas, given your business and the industry pack. Nothing is written until
          you accept it, and scores stay with the calculator — stage 4 suggests exposure, threat and vulnerability only.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-adv-gray" htmlFor="proposal-stage">Stage</label>
          <select
            id="proposal-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
            disabled={running}
            className="rounded border border-border bg-adv-dark px-2 py-1.5 text-sm text-adv-off-white"
          >
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button
            onClick={() => void generate()}
            disabled={running}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {running ? 'Thinking…' : 'Suggest additions'}
          </button>
          {running && <span className="text-sm text-adv-gray" aria-live="polite">{job?.meta.status ?? 'Working'}…</span>}
          {pending.length > 1 && !running && (
            <button
              onClick={() => void acceptAll(pending)}
              disabled={busy !== null}
              className="ml-auto rounded border border-adv-teal px-3 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/10 disabled:opacity-60"
            >
              {busy === 'all' ? 'Accepting…' : `Accept all ${pending.length}`}
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-adv-red" role="alert">{error}</p>}

        {pending.length > 0 && (
          <ul className="mt-4 space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="rounded border border-border bg-adv-dark p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-adv-off-white">{summarise(p)}</div>
                    <div className="mt-0.5 text-xs text-adv-gray">{p.kind.replace('_', ' ')}{p.rationale ? ` · ${p.rationale}` : ''}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => void decide(p, 'accept')}
                      disabled={busy !== null}
                      className="flex items-center gap-1 rounded border border-adv-green/40 px-2 py-1 text-xs text-adv-green hover:bg-adv-green/10 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" /> {busy === p.id ? 'Adding…' : 'Add to Atlas'}
                    </button>
                    <button
                      onClick={() => void decide(p, 'reject')}
                      disabled={busy !== null}
                      className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-60"
                    >
                      <X className="h-3.5 w-3.5" /> Dismiss
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pending.length === 0 && !running && items.length > 0 && (
          <p className="mt-4 text-sm text-adv-gray">Nothing waiting for review.</p>
        )}

        {other.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowOther(!showOther)} className="text-xs text-adv-gray underline hover:text-adv-off-white">
              {showOther ? 'Hide' : 'Show'} {other.length} decided and set-aside suggestion(s)
            </button>
            {showOther && (
              <ul className="mt-2 space-y-1 text-xs">
                {other.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 text-adv-gray">
                    {p.status === 'accepted' ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-adv-green" />
                      : p.status === 'rejected' ? <X className="mt-0.5 h-3 w-3 shrink-0" />
                      : p.status === 'failed' ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-adv-red" />
                      : <Info className="mt-0.5 h-3 w-3 shrink-0 text-adv-gold" />}
                    <span className="min-w-0"><span className="text-adv-off-white">{summarise(p)}</span> — {p.status}{p.error ? `: ${p.error}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
