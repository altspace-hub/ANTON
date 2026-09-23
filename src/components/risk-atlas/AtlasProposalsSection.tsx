/**
 * AtlasProposalsSection — AI suggestions for this Atlas, each decided by a person.
 *
 * Each suggestion is applied only when a person accepts it, through the same
 * server calls hand entry uses. The model never sets an inherent or residual
 * score: stage 4 proposes exposure/threat/vulnerability and the calculator
 * does the rest.
 *
 * Additions can be accepted together. A change to an existing record, or a
 * removal, rewrites an audited record: it shows what it replaces (or takes
 * with it), is decided on its own, and a removal asks for a second click. The
 * server refuses a change whose record has moved on since it was suggested.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, Check, X, AlertTriangle, Info, Pencil, Trash2 } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type Stage = 'exposures' | 'threat_paths' | 'vulnerabilities' | 'inherent' | 'controls' | 'appetite';
type Status = 'pending' | 'accepted' | 'rejected' | 'skipped' | 'unresolved' | 'failed';
type Action = 'add' | 'edit' | 'remove';

interface Proposal {
  id: string;
  kind: string;
  action?: Action;
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
const KIND_LABEL: Record<string, string> = {
  exposure: 'exposure', threat_path: 'threat path', vulnerability: 'vulnerability', inherent_score: 'inherent scores',
  control: 'control', appetite: 'appetite statement', trigger: 'escalation trigger', bundle: 'cross-domain bundle',
};
const POLL_MS = 3000;
const CLIP = 280;

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

const actionOf = (p: Proposal): Action => p.action ?? 'add';
const shown = (v: unknown): string => (v === null || v === undefined || v === '' ? '(empty)' : String(v));
const clip = (s: string): string => (s.length > CLIP ? `${s.slice(0, CLIP - 1)}…` : s);

/** "exposure 3 → 4 · threat 4" — only the fields that change get an arrow. */
function scoreChanges(before: Record<string, unknown>, after: Record<string, unknown>, fields: Array<[string, string]>): string {
  return fields.map(([key, label]) => (before[key] !== undefined && String(before[key]) !== String(after[key] ?? '')
    ? `${label} ${shown(before[key])} → ${shown(after[key])}`
    : `${label} ${shown(after[key])}`)).join(' · ');
}

/** One line describing what this suggestion would do. */
function summarise(p: Proposal): string {
  const v = p.payload;
  const s = (k: string) => (typeof v[k] === 'string' ? v[k] as string : '');
  const label = s('target_label');
  if (actionOf(p) === 'remove') return `Remove ${KIND_LABEL[p.kind] ?? p.kind} ${label}`;
  if (actionOf(p) === 'edit' && p.kind !== 'inherent_score' && p.kind !== 'appetite') return `${label} · ${s('field')}`;
  switch (p.kind) {
    case 'exposure': return `${s('name')}${v.category ? ` · ${String(v.category)}` : ''}`;
    case 'threat_path': return `${s('path_code')} ${s('name')}${v.fcp_domain ? ` · ${String(v.fcp_domain)}` : ''}`;
    case 'vulnerability': return `${s('vuln_code')} ${s('name')} · severity ${String(v.severity ?? '?')}`;
    case 'inherent_score': {
      const before = (v.before ?? {}) as Record<string, unknown>;
      return `${label ? `${label}: ` : ''}${scoreChanges(before, v, [['exposure_score', 'exposure'], ['threat_score', 'threat'], ['vulnerability_score', 'vulnerability']])} (inherent is computed)`;
    }
    case 'control': return `${s('control_code')} ${s('name')} · ${String(v.type)} · ${String(v.strength)}`;
    case 'appetite': return `${label ? `${label}: ` : ''}${String(v.appetite_position)}${v.required_action ? ` — ${clip(String(v.required_action))}` : ''}`;
    case 'trigger': return `${s('trigger_event')} → ${s('required_action')}`;
    case 'bundle': return `${s('name')} · ${Array.isArray(v.member_path_codes) ? (v.member_path_codes as string[]).join(', ') : ''}`;
    default: return JSON.stringify(v).slice(0, 160);
  }
}

/** The before/after of a change, for the reviewer. */
function ChangeDetail({ p }: { p: Proposal }) {
  const v = p.payload;
  let rows: Array<[string, string, string]> = [];
  if (p.kind === 'appetite') {
    const before = (v.before ?? {}) as Record<string, unknown>;
    rows = ([['appetite_position', 'Position'], ['required_action', 'Required action'], ['target_date', 'Target date'], ['budget_eur', 'Budget (EUR)']] as const)
      .filter(([k]) => String(before[k] ?? '') !== String(v[k] ?? ''))
      .map(([k, l]) => [l, shown(before[k]), shown(v[k])]);
  } else if (p.kind !== 'inherent_score') {
    rows = [[String(v.field ?? ''), shown(v.before), shown(v.new_value)]];
  }
  const approved = p.kind === 'appetite' && (v.before as { approved?: boolean } | undefined)?.approved;
  if (rows.length === 0 && !approved) return null;
  return (
    <div className="mt-2 space-y-1 text-xs">
      {rows.map(([field, before, after]) => (
        <div key={field} className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-0.5">
          <span className="text-adv-gray">{field}: now</span>
          <span className="text-adv-gray line-through decoration-adv-gray/50" title={before}>{clip(before)}</span>
          <span className="text-adv-gray">suggested</span>
          <span className="text-adv-off-white" title={after}>{clip(after)}</span>
        </div>
      ))}
      {approved && <p className="text-adv-gold">This statement is approved; accepting the change withdraws the approval until someone approves it again.</p>}
    </div>
  );
}

export default function AtlasProposalsSection({ atlasId, onApplied }: { atlasId: string; onApplied?: () => void }) {
  const [stage, setStage] = useState<Stage>('exposures');
  const [items, setItems] = useState<Proposal[]>([]);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
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
    setBusy(p.id); setError(null); setConfirming(null);
    try {
      await readJson(await fetchWithAuth(`/api/atlas/${atlasId}/proposals/${p.id}/${decision}`, { method: 'POST', headers: getAuthHeader() }));
      if (decision === 'accept') onApplied?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally {
      setBusy(null);
      // A refused change (the record moved on) is set aside by the server — reload either way.
      await load().catch(() => undefined);
    }
  }

  async function acceptAll(additions: Proposal[]): Promise<void> {
    setBusy('all'); setError(null);
    try {
      const { results } = await readJson<{ results: Array<{ id: string; status: string; error?: string }> }>(await fetchWithAuth(`/api/atlas/${atlasId}/proposals/accept`, {
        method: 'POST', headers: { ...getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: additions.map((p) => p.id) }),
      }));
      const bad = results.filter((r) => r.status !== 'accepted');
      if (bad.length) setError(`${bad.length} of ${results.length} could not be added: ${bad.map((b) => b.error ?? b.status).slice(0, 3).join('; ')}`);
      await load();
      onApplied?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const running = job?.status === 'running';
  const pending = items.filter((p) => p.status === 'pending');
  const additions = pending.filter((p) => actionOf(p) === 'add');
  const changes = pending.filter((p) => actionOf(p) === 'edit');
  const removals = pending.filter((p) => actionOf(p) === 'remove');
  const other = items.filter((p) => p.status !== 'pending');

  const dismissButton = (p: Proposal) => (
    <button
      onClick={() => void decide(p, 'reject')}
      disabled={busy !== null}
      className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white disabled:opacity-60"
    >
      <X className="h-3.5 w-3.5" /> Dismiss
    </button>
  );
  const why = (p: Proposal) => (p.rationale ? <div className="mt-0.5 text-xs text-adv-gray">{p.rationale}</div> : null);

  return (
    <section aria-labelledby="proposals-heading">
      <h2 id="proposals-heading" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-adv-teal">
        <Sparkles className="h-3.5 w-3.5" /> Suggestions from AI
      </h2>
      <div className="rounded-lg border border-border bg-adv-card p-4">
        <p className="text-sm text-adv-gray">
          Asks the stage expert what is missing, wrong or out of date in this Atlas, given your business and the industry pack.
          Nothing is written until you accept it. Additions can be accepted together; a change or a removal is decided on its own,
          and scores stay with the calculator.
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
            {running ? 'Thinking…' : 'Suggest changes'}
          </button>
          {running && <span className="text-sm text-adv-gray" aria-live="polite">{job?.meta.status ?? 'Working'}…</span>}
        </div>
        {error && <p className="mt-3 text-sm text-adv-red" role="alert">{error}</p>}

        {additions.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold text-adv-off-white">Additions ({additions.length})</h3>
              {additions.length > 1 && !running && (
                <button
                  onClick={() => void acceptAll(additions)}
                  disabled={busy !== null}
                  className="ml-auto rounded border border-adv-teal px-3 py-1 text-xs font-medium text-adv-teal hover:bg-adv-teal/10 disabled:opacity-60"
                >
                  {busy === 'all' ? 'Adding…' : `Add all ${additions.length}`}
                </button>
              )}
            </div>
            <ul className="space-y-2">
              {additions.map((p) => (
                <li key={p.id} className="rounded border border-border bg-adv-dark p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-adv-off-white">{summarise(p)}</div>
                      <div className="mt-0.5 text-xs text-adv-gray">{KIND_LABEL[p.kind] ?? p.kind}{p.rationale ? ` · ${p.rationale}` : ''}</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => void decide(p, 'accept')}
                        disabled={busy !== null}
                        className="flex items-center gap-1 rounded border border-adv-green/40 px-2 py-1 text-xs text-adv-green hover:bg-adv-green/10 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" /> {busy === p.id ? 'Adding…' : 'Add to Atlas'}
                      </button>
                      {dismissButton(p)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {changes.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold text-adv-off-white">Changes to existing records ({changes.length}) — one at a time</h3>
            <ul className="space-y-2">
              {changes.map((p) => (
                <li key={p.id} className="rounded border border-adv-gold/30 bg-adv-dark p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm text-adv-off-white"><Pencil className="h-3.5 w-3.5 shrink-0 text-adv-gold" /> {summarise(p)}</div>
                      <ChangeDetail p={p} />
                      {why(p)}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => void decide(p, 'accept')}
                        disabled={busy !== null}
                        className="flex items-center gap-1 rounded border border-adv-gold/50 px-2 py-1 text-xs text-adv-gold hover:bg-adv-gold/10 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" /> {busy === p.id ? 'Applying…' : 'Apply change'}
                      </button>
                      {dismissButton(p)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {removals.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold text-adv-off-white">Removals ({removals.length}) — one at a time</h3>
            <ul className="space-y-2">
              {removals.map((p) => (
                <li key={p.id} className="rounded border border-adv-red/30 bg-adv-dark p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm text-adv-off-white"><Trash2 className="h-3.5 w-3.5 shrink-0 text-adv-red" /> {summarise(p)}</div>
                      {typeof p.payload.impact === 'string' && <div className="mt-1 text-xs text-adv-off-white/80">{p.payload.impact}</div>}
                      {why(p)}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {confirming === p.id ? (
                        <>
                          <button
                            onClick={() => void decide(p, 'accept')}
                            disabled={busy !== null}
                            className="flex items-center gap-1 rounded bg-adv-red px-2 py-1 text-xs font-medium text-white hover:bg-adv-red/90 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> {busy === p.id ? 'Removing…' : 'Confirm removal'}
                          </button>
                          <button onClick={() => setConfirming(null)} className="rounded border border-border px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white">
                            Keep it
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setConfirming(p.id)}
                            disabled={busy !== null}
                            className="flex items-center gap-1 rounded border border-adv-red/50 px-2 py-1 text-xs text-adv-red hover:bg-adv-red/10 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove…
                          </button>
                          {dismissButton(p)}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
