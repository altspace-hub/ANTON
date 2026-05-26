/**
 * PortalBuilderPage — /portals/build/:templateId
 *
 * 8-phase walkthrough UI. Left column: phase stepper. Right: current phase form.
 * For v0.7.x the phase forms are direct-input (the user fills the structured
 * output by hand). LLM-driven population is a Phase 11+ enhancement that
 * reuses generatePhasePrompt + the existing unified-llm-client.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, AlertCircle, CheckCircle2, X, Sparkles, Smartphone, Monitor } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { wrapForSandbox } from '../../comm/lib/portal-sandbox';
import RegistryStatusBadge from '@/components/portals/RegistryStatusBadge';

const PHASES = [
  { id: 'intent', label: 'Intent' },
  { id: 'identity', label: 'Identity' },
  { id: 'content_structure', label: 'Pages' },
  { id: 'content_generation', label: 'Content' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'aesthetics', label: 'Aesthetics' },
  { id: 'review', label: 'Review' },
  { id: 'publish', label: 'Publish' },
] as const;

type PhaseId = typeof PHASES[number]['id'];

interface SessionState {
  id: string;
  templateId: string;
  template: { id: string; label: string; description: string; defaultCapabilities: Array<{ id: string; verb: string; title: string; description: string; aapEndpoint: string }>; seedPages: Array<{ path: string; title: string; sortOrder: number }> };
  currentPhase: PhaseId;
  phasesCompleted: PhaseId[];
  accumulatedState: Record<string, unknown>;
  status: string;
  portalId: string | null;
}

interface CostState {
  costUsdCents: number;
  callsUsed: number;
  callLimit: number;
}

export default function PortalBuilderPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [streamProgress, setStreamProgress] = useState<{ chars: number; thinking: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [cost, setCost] = useState<CostState | null>(null);

  // Bootstrap session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Default ownerId is the local user — use 'local-owner' for v0.7.x.
        const res = await fetchWithAuth('/api/portals/walkthroughs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerId: 'local-owner', templateId }),
        });
        if (!res.ok) throw new Error(`Failed to start session (${res.status})`);
        const json = await res.json();
        if (!cancelled) setSession(json.session);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  // When phase changes, seed draft from accumulatedState if present.
  useEffect(() => {
    if (!session) return;
    setDraft(buildDraftFor(session));
  }, [session]);

  // Debounced auto-save of the in-flight draft so users don't lose work
  // when they navigate away mid-phase (e.g. accidental sidebar click).
  // Saves to accumulated_state.__drafts.<currentPhase> on the server.
  useEffect(() => {
    if (!session || advancing) return;
    const t = setTimeout(() => {
      void fetchWithAuth(`/api/portals/walkthroughs/${session.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [draft, session, advancing]);

  // Warn the user if they try to close the tab mid-phase with unsaved changes.
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (!session || session.status !== 'active') return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [session]);

  async function advance() {
    if (!session) return;
    // Quality Ratchet: at the review phase, if AI scored <6/10 the user has
    // to actively confirm. This isn't a hard block — they can override —
    // but it surfaces "this draft has problems" before they publish.
    if (session.currentPhase === 'review' && typeof draft.quality_score === 'number' && draft.quality_score < 6) {
      const score = draft.quality_score;
      const issueCount = Array.isArray(draft.flagged_issues) ? (draft.flagged_issues as unknown[]).length : 0;
      const ok = window.confirm(
        `Quality score is ${score}/10` + (issueCount > 0 ? ` with ${issueCount} flagged issue${issueCount === 1 ? '' : 's'}` : '')
        + '. Publishing now means visitors see a portal you flagged as below quality threshold. Proceed anyway?',
      );
      if (!ok) return;
    }
    setError(null);
    setAdvancing(true);
    try {
      const res = await fetchWithAuth(`/api/portals/walkthroughs/${session.id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serialiseDraft(session.currentPhase, draft)),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Advance failed (${res.status})`);
      }
      const json = await res.json();
      setSession(json.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancing(false);
    }
  }

  async function finalize() {
    if (!session) return;
    setError(null);
    setAdvancing(true);
    try {
      const res = await fetchWithAuth(`/api/portals/walkthroughs/${session.id}/finalize`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Finalize failed (${res.status})`);
      }
      const json = await res.json();
      navigate(`/portals/${json.portalId}/manage`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAdvancing(false);
    }
  }

  async function abandon() {
    if (!session) return;
    await fetchWithAuth(`/api/portals/walkthroughs/${session.id}/abandon`, { method: 'POST' });
    navigate('/portals');
  }

  // Refresh the cost chip. Called once per session bootstrap and after every
  // suggest call. Soft-fails — a missing cost endpoint shouldn't block the UI.
  const refreshCost = useCallback(async (sid: string) => {
    try {
      const res = await fetchWithAuth(`/api/portals/walkthroughs/${sid}/cost`);
      if (res.ok) setCost(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (session) void refreshCost(session.id);
  }, [session?.id, refreshCost]);

  // POST /llm-suggest — server picks the model based on session.depth, calls
  // the LLM, validates against the phase schema, persists as draft. On 200 we
  // copy the suggestion into the live draft so the user sees it in the form.
  // For content_generation we use the streaming variant — the LLM output is
  // long enough that a 30-second blank loader is poor UX.
  async function suggestWithAI() {
    if (!session) return;
    setError(null);
    setSuggesting(true);
    setStreamProgress(null);
    try {
      const useStream = session.currentPhase === 'content_generation';
      const result = useStream
        ? await suggestStreaming(session.id, setStreamProgress)
        : await suggestSync(session.id);
      if (result.kind === 'ok' && result.suggestion) {
        setDraft(result.suggestion);
      } else if (result.kind === 'error') {
        setError(result.message);
      }
      await refreshCost(session.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
      setStreamProgress(null);
    }
  }

  if (loading) {
    return <CenterMsg><Loader2 className="h-5 w-5 animate-spin" /> Starting walkthrough…</CenterMsg>;
  }
  if (error && !session) {
    return <CenterMsg><AlertCircle className="h-5 w-5 text-adv-red" /> {error} <button className="ml-3 text-adv-teal underline" onClick={() => navigate('/portals')}>Back</button></CenterMsg>;
  }
  if (!session) return null;

  const phaseDone = session.phasesCompleted.includes(session.currentPhase);
  const allComplete = session.phasesCompleted.length === PHASES.length;
  const phaseIndex = PHASES.findIndex((p) => p.id === session.currentPhase);
  const validation = validatePhase(session.currentPhase, draft);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-adv-teal mb-1">
              Phase {phaseIndex + 1} of {PHASES.length}
            </div>
            <h1 className="text-xl font-semibold">{session.template.label} portal</h1>
            <p className="text-sm text-adv-gray mt-1">{session.template.description}</p>
          </div>
          <div className="flex items-center gap-3">
            {cost && (
              <div
                className="hidden sm:flex items-center gap-2 text-xs text-adv-gray bg-adv-card border border-border rounded-lg px-3 py-1.5"
                title={`${cost.callsUsed} of ${cost.callLimit} LLM calls used`}
              >
                <Sparkles className="h-3.5 w-3.5 text-adv-teal" />
                <span>{formatCents(cost.costUsdCents)}</span>
                <span className="text-adv-gray/60">·</span>
                <span>{cost.callsUsed}/{cost.callLimit}</span>
              </div>
            )}
            <button
              onClick={abandon}
              aria-label="Abandon walkthrough and discard the draft"
              className="text-sm text-adv-gray hover:text-adv-red transition flex items-center gap-1"
            >
              <X className="h-4 w-4" /> Abandon
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          {/* Stepper */}
          <nav aria-label="Walkthrough phases" className="space-y-1">
            {PHASES.map((p, i) => {
              const completed = session.phasesCompleted.includes(p.id);
              const current = session.currentPhase === p.id;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${current ? 'bg-adv-teal/10 border border-adv-teal/30' : 'border border-transparent'}`}
                >
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs ${completed ? 'bg-adv-green text-adv-dark' : current ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card text-adv-gray'}`}>
                    {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={`text-sm ${current ? 'text-adv-off-white' : completed ? 'text-adv-gray' : 'text-adv-gray'}`}>{p.label}</span>
                </div>
              );
            })}
          </nav>

          {/* Phase form */}
          <main className="rounded-xl border border-border bg-adv-card p-6">
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-adv-red/40 bg-adv-red/10 p-3 text-sm">
                <AlertCircle className="h-4 w-4 text-adv-red flex-shrink-0 mt-0.5" />{error}
              </div>
            )}
            <PhaseForm
              phase={session.currentPhase}
              draft={draft}
              setDraft={setDraft}
              template={session.template}
              sessionId={session.id}
              accumulatedState={session.accumulatedState}
            />
            {/* Validation hint when the form is incomplete. */}
            {!validation.valid && validation.missing.length > 0 && (
              <div className="mt-4 text-xs text-adv-gray">
                <span className="text-adv-red">*</span> Required: {validation.missing.join(', ')}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-2 flex-wrap">
              {!allComplete && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={suggestWithAI}
                    disabled={suggesting || advancing || phaseDone || (cost ? cost.callsUsed >= cost.callLimit : false)}
                    title={cost && cost.callsUsed >= cost.callLimit
                      ? `LLM call cap reached (${cost.callLimit}/walkthrough)`
                      : 'Have ANTON draft this phase for you'}
                    className="px-3 py-2 rounded-lg border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    aria-label="Suggest this phase with AI"
                  >
                    {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {suggesting ? 'ANTON is drafting…' : 'Suggest with AI'}
                  </button>
                  {streamProgress && (
                    <span className="text-xs text-adv-gray" aria-live="polite">
                      {streamProgress.thinking ? 'thinking…' : `${streamProgress.chars.toLocaleString()} chars`}
                    </span>
                  )}
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                {allComplete ? (
                  <button
                    onClick={finalize}
                    disabled={advancing}
                    className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark font-medium hover:bg-adv-teal-dark transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Publish portal
                  </button>
                ) : (
                  <button
                    onClick={advance}
                    disabled={advancing || phaseDone || !validation.valid}
                    title={!validation.valid ? `Fill required fields: ${validation.missing.join(', ')}` : undefined}
                    className="px-4 py-2 rounded-lg bg-adv-teal text-adv-dark font-medium hover:bg-adv-teal-dark transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {phaseDone ? 'Phase recorded' : 'Save & continue'}
                  </button>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Per-phase forms ─────────────────────────────────────────────────────────

function PhaseForm({
  phase, draft, setDraft, template, sessionId, accumulatedState,
}: {
  phase: PhaseId;
  draft: Record<string, unknown>;
  setDraft: (d: Record<string, unknown>) => void;
  template: SessionState['template'];
  sessionId: string;
  accumulatedState: Record<string, unknown>;
}) {
  const update = (patch: Record<string, unknown>) => setDraft({ ...draft, ...patch });

  if (phase === 'intent') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Who is this portal for?</h2>
        <Field label="Audience" value={(draft.audience as string) ?? ''} onChange={(v) => update({ audience: v })} multi />
        <Field label="Problem solved" value={(draft.problem_solved as string) ?? ''} onChange={(v) => update({ problem_solved: v })} multi />
        <Field label="Visitor actions (one per line)" value={Array.isArray(draft.visitor_actions) ? (draft.visitor_actions as string[]).join('\n') : ''}
          onChange={(v) => update({ visitor_actions: v.split('\n').map(s => s.trim()).filter(Boolean) })} multi />
      </div>
    );
  }
  if (phase === 'identity') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Identity</h2>
        <Field label="Portal name (lowercase, dots/dashes OK)" value={(draft.name as string) ?? ''} onChange={(v) => update({ name: v.toLowerCase() })} />
        <Field label="Namespace" value={(draft.namespace as string) ?? 'futurechain'} onChange={(v) => update({ namespace: v })} />
        <Field label="Display title" value={(draft.display_title as string) ?? ''} onChange={(v) => update({ display_title: v })} />
        <Field label="Tagline" value={(draft.tagline as string) ?? ''} onChange={(v) => update({ tagline: v })} />
        <Field label="Description" value={(draft.description as string) ?? ''} onChange={(v) => update({ description: v })} multi />
        <Select
          label="Category"
          value={(draft.category as string) ?? template?.id ?? 'personal'}
          options={['personal','business','community','commerce','team','creator','bulletin','classroom','teacher','organisation','other']}
          onChange={(v) => update({ category: v })}
        />
      </div>
    );
  }
  if (phase === 'content_structure') {
    const pages = (draft.pages as Array<{ path: string; title: string; sort_order: number }>) ?? [];
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Pages</h2>
        <p className="text-sm text-adv-gray">Three pages cover most cases. Edit the seeds from the template:</p>
        {pages.map((p, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input className={inputCls + ' col-span-4'} value={p.path} onChange={(e) => {
              const np = [...pages]; np[i] = { ...p, path: e.target.value }; update({ pages: np });
            }} />
            <input className={inputCls + ' col-span-6'} value={p.title} onChange={(e) => {
              const np = [...pages]; np[i] = { ...p, title: e.target.value }; update({ pages: np });
            }} />
            <input type="number" min={0} className={inputCls + ' col-span-2'} value={p.sort_order} onChange={(e) => {
              const np = [...pages]; np[i] = { ...p, sort_order: Number(e.target.value) }; update({ pages: np });
            }} />
          </div>
        ))}
        <button
          type="button" onClick={() => update({ pages: [...pages, { path: '/' + (pages.length + 1), title: 'New page', sort_order: pages.length }] })}
          className="text-sm text-adv-teal hover:underline"
        >+ Add page</button>
      </div>
    );
  }
  if (phase === 'content_generation') {
    const pages = (draft.pages as Array<{ path: string; html: string }>) ?? [];
    const identity = (accumulatedState.identity ?? {}) as { display_title?: string };
    const previewPages = pages.map((p) => ({ path: p.path, title: null }));
    const previewCaps = ((accumulatedState.capabilities as { capabilities?: Array<{ id: string; verb: string; title: string }> } | undefined)?.capabilities) ?? [];
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Content</h2>
        <p className="text-sm text-adv-gray">Edit the HTML for each page. Use <code>{'{{title}}'}</code>, <code>{'{{portal.displayTitle}}'}</code>, <code>{'{{data.<key>}}'}</code>, <code>{'{{#each kind}}…{{/each}}'}</code>.</p>
        {pages.map((p, i) => (
          <div key={i}>
            <div className="text-xs text-adv-gray mb-1">{p.path}</div>
            <textarea
              className={inputCls + ' h-32 font-mono text-xs'}
              value={p.html}
              onChange={(e) => {
                const np = [...pages]; np[i] = { ...p, html: e.target.value }; update({ pages: np });
              }}
            />
          </div>
        ))}
        {previewPages.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-adv-gray mb-1.5 mt-2">Live preview</div>
            <PortalPreview
              sessionId={sessionId}
              pages={previewPages}
              displayTitle={identity.display_title ?? null}
              capabilities={previewCaps}
            />
          </div>
        )}
      </div>
    );
  }
  if (phase === 'capabilities') {
    return <CapabilitiesForm draft={draft} update={update} sessionId={sessionId} />;
  }
  if (phase === 'aesthetics') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Aesthetics</h2>
        <Field label="Palette (free-form)" value={(draft.palette as string) ?? 'minimal'} onChange={(v) => update({ palette: v })} />
        <Field label="Font family" value={(draft.font_family as string) ?? 'system-ui'} onChange={(v) => update({ font_family: v })} />
        <Field label="Custom CSS (optional, max 20 KB)" value={(draft.custom_css as string) ?? ''} onChange={(v) => update({ custom_css: v })} multi />
      </div>
    );
  }
  if (phase === 'review') {
    const score = typeof draft.quality_score === 'number' ? draft.quality_score : null;
    const issues = (draft.flagged_issues as string[] | undefined) ?? [];
    const generationPages = ((accumulatedState.content_generation as { pages?: Array<{ path: string }> } | undefined)?.pages) ?? [];
    const identity = (accumulatedState.identity ?? {}) as { display_title?: string };
    const previewCaps = ((accumulatedState.capabilities as { capabilities?: Array<{ id: string; verb: string; title: string }> } | undefined)?.capabilities) ?? [];
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Review</h2>
        <p className="text-sm text-adv-gray">
          Confirm the portal looks right before publishing.
          {' '}Click <span className="text-adv-teal">Suggest with AI</span> for an honest critique.
        </p>
        <PortalPreview
          sessionId={sessionId}
          pages={generationPages}
          displayTitle={identity.display_title ?? null}
          capabilities={previewCaps}
        />
        {score !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-adv-gray">Quality score:</span>
            <span className={`px-2 py-0.5 rounded font-medium ${
              score >= 8 ? 'bg-adv-green/20 text-adv-green'
              : score >= 6 ? 'bg-adv-teal/20 text-adv-teal'
              : 'bg-adv-gold/20 text-adv-gold'
            }`}>{score}/10</span>
            {score < 6 && (
              <span className="text-xs text-adv-gold">
                Below threshold — fix flagged issues before publishing.
              </span>
            )}
          </div>
        )}
        {issues.length > 0 && (
          <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/5 p-3">
            <div className="text-xs font-medium text-adv-gold mb-2">Flagged issues to address:</div>
            <ul className="text-sm text-adv-off-white space-y-1 list-disc list-inside">
              {issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          </div>
        )}
        <Checkbox label="Approved" value={!!draft.approved} onChange={(v) => update({ approved: v })} />
        <Field label="Reviewer notes" value={(draft.reviewer_notes as string) ?? ''} onChange={(v) => update({ reviewer_notes: v })} multi />
      </div>
    );
  }
  if (phase === 'publish') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Publish</h2>

        {/* Registry state — decisive banner so the user knows whether this
            publish will hit the federated registry, stay local-only, or
            queue for retry during a registry outage. */}
        <div>
          <div className="text-xs uppercase tracking-wide text-adv-gray mb-2">Where this portal will be visible</div>
          <RegistryStatusBadge variant="detailed" />
        </div>

        <Checkbox label="Public index (discoverable via anton-portal search)" value={!!draft.public_index} onChange={(v) => update({ public_index: v })} />
        <Checkbox label="Ready to register" value={draft.ready_to_register === true} onChange={(v) => update({ ready_to_register: v })} />
        <p className="text-sm text-adv-gray">When you click "Publish portal" the local portal is created (status=active) and its descriptor is cached. Registry submission happens separately when the registry server is available.</p>
      </div>
    );
  }
  return null;
}

// ── Capabilities form ────────────────────────────────────────────────────────
// Phase 5 is the highest-friction step because users have to define inputSchema
// + outputSchema. This component layers an LLM "describe what you collect" UX
// per capability so non-technical users skip the JSON Schema rabbit hole.

interface CapDraft {
  id: string;
  verb: string;
  title: string;
  description: string;
  aap_endpoint: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

const VERB_OPTIONS = ['contact','inquire','request','order','pay','book','subscribe','join','query','publish','delegate','authenticate','custom'] as const;

function CapabilitiesForm({
  draft, update, sessionId,
}: {
  draft: Record<string, unknown>;
  update: (patch: Record<string, unknown>) => void;
  sessionId: string;
}) {
  const caps: CapDraft[] = (draft.capabilities as CapDraft[]) ?? [];
  const [schemaEditorIdx, setSchemaEditorIdx] = useState<number | null>(null);
  const [collectionText, setCollectionText] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  function setCap(i: number, patch: Partial<CapDraft>) {
    const nc = [...caps];
    nc[i] = { ...caps[i], ...patch };
    update({ capabilities: nc });
  }

  function addCap() {
    update({
      capabilities: [
        ...caps,
        { id: 'cap-' + (caps.length + 1), verb: 'contact', title: 'New capability', description: '', aap_endpoint: 'messages' },
      ],
    });
  }

  function deleteCap(i: number) {
    update({ capabilities: caps.filter((_, idx) => idx !== i) });
    if (schemaEditorIdx === i) {
      setSchemaEditorIdx(null);
      setCollectionText('');
    }
  }

  async function generateSchema(i: number) {
    if (!collectionText.trim() || collectionText.trim().length < 5) {
      setSuggestError('Describe what visitors send (at least a few words)');
      return;
    }
    setSuggesting(true);
    setSuggestError(null);
    try {
      const cap = caps[i];
      const res = await fetchWithAuth(`/api/portals/walkthroughs/${sessionId}/capability-schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verb: cap.verb,
          capabilityTitle: cap.title,
          capabilityDescription: cap.description,
          collectionDescription: collectionText.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSuggestError(json.error?.message ?? json.error?.reason ?? `Request failed (${res.status})`);
        return;
      }
      setCap(i, { inputSchema: json.inputSchema, outputSchema: json.outputSchema });
      setSchemaEditorIdx(null);
      setCollectionText('');
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Capabilities</h2>
      <p className="text-sm text-adv-gray">
        What can visitors do? Each capability becomes a button in their ANTON.
        Click <span className="text-adv-teal">Generate schema from description</span> on any capability and ANTON drafts the inputSchema + outputSchema for you — no JSON Schema knowledge needed.
      </p>
      {caps.map((c, i) => {
        const fieldCount = c.inputSchema?.properties
          ? Object.keys((c.inputSchema.properties as Record<string, unknown>) ?? {}).length
          : 0;
        const isEditing = schemaEditorIdx === i;
        return (
          <div key={i} className="rounded-lg border border-border bg-adv-dark p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input className={inputCls + ' col-span-3'} value={c.id} onChange={(e) => setCap(i, { id: e.target.value })} placeholder="id (slug)" />
              <select className={inputCls + ' col-span-3'} value={c.verb} onChange={(e) => setCap(i, { verb: e.target.value })}>
                {VERB_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <input className={inputCls + ' col-span-3'} value={c.title} onChange={(e) => setCap(i, { title: e.target.value })} placeholder="title" />
              <input className={inputCls + ' col-span-3'} value={c.aap_endpoint} onChange={(e) => setCap(i, { aap_endpoint: e.target.value })} placeholder="endpoint" />
            </div>
            <input className={inputCls} value={c.description} onChange={(e) => setCap(i, { description: e.target.value })} placeholder="description (shown to visitors)" />

            {/* Schema status + actions */}
            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              <div className="text-xs text-adv-gray">
                {fieldCount > 0 ? (
                  <span className="text-adv-green">✓ Schema set — {fieldCount} input field{fieldCount === 1 ? '' : 's'}</span>
                ) : (
                  <span className="text-adv-gold">No schema yet — visitors will see a single message field by default</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {fieldCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCap(i, { inputSchema: undefined, outputSchema: undefined })}
                    className="text-xs text-adv-gray hover:text-adv-red transition"
                  >
                    Clear schema
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSchemaEditorIdx(i); setCollectionText(''); setSuggestError(null); }}
                  className="text-xs text-adv-teal hover:underline flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" /> {fieldCount > 0 ? 'Regenerate' : 'Generate schema from description'}
                </button>
                <button
                  type="button"
                  onClick={() => deleteCap(i)}
                  className="text-xs text-adv-gray hover:text-adv-red transition"
                  aria-label="Remove capability"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Inline schema generator */}
            {isEditing && (
              <div className="mt-2 rounded-lg border border-adv-teal/40 bg-adv-teal/5 p-3 space-y-2">
                <label className="block">
                  <span className="block text-xs font-medium text-adv-teal mb-1">Describe what visitors send you</span>
                  <textarea
                    autoFocus
                    className={inputCls + ' h-24'}
                    value={collectionText}
                    onChange={(e) => setCollectionText(e.target.value)}
                    placeholder={`e.g. for a ${c.verb} capability — "Their name, dog's name and breed, preferred date and time, any allergies, contact email or phone"`}
                  />
                </label>
                {suggestError && (
                  <div className="flex items-start gap-1.5 text-xs text-adv-red">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    {suggestError}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => generateSchema(i)}
                    disabled={suggesting || collectionText.trim().length < 5}
                    className="px-3 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {suggesting ? 'ANTON is drafting…' : 'Generate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSchemaEditorIdx(null); setCollectionText(''); setSuggestError(null); }}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs hover:border-adv-gray"
                  >
                    Cancel
                  </button>
                  <span className="text-[10px] text-adv-gray ml-2">Costs one walkthrough call slot.</span>
                </div>
              </div>
            )}

            {/* Compact schema preview */}
            {fieldCount > 0 && !isEditing && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] text-adv-gray hover:text-adv-teal select-none">View generated schema</summary>
                <pre className="mt-2 rounded bg-adv-card border border-border p-2 text-[10px] font-mono text-adv-gray overflow-x-auto whitespace-pre-wrap break-words max-h-64">
{JSON.stringify({ inputSchema: c.inputSchema, outputSchema: c.outputSchema }, null, 2)}
                </pre>
              </details>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addCap}
        className="text-sm text-adv-teal hover:underline"
      >+ Add capability</button>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none';

function Field({ label, value, onChange, multi }: { label: string; value: string; onChange: (v: string) => void; multi?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-adv-off-white mb-1">{label}</span>
      {multi
        ? <textarea className={inputCls + ' h-20'} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-adv-off-white mb-1">{label}</span>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Checkbox({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-adv-teal" />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function CenterMsg({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-sm text-adv-gray gap-2">{children}</div>;
}

// Sandboxed live preview of the in-flight portal. Iframe srcdoc'd from the
// /preview endpoint — the renderer pulls draft pages from the session, runs
// only the simple substitution pass (no DB lookups), and returns HTML.
// Auth tokens are embedded into the URL via the existing fetchWithAuth flow:
// since iframe.src can't carry headers, we fetch the HTML ourselves and
// stuff it into srcdoc.
interface PortalPreviewCapability {
  id: string;
  verb: string;
  title: string;
}

function PortalPreview({
  sessionId,
  pages,
  displayTitle,
  capabilities,
  initialMode,
}: {
  sessionId: string;
  pages: Array<{ path: string; title?: string | null }>;
  /** Portal display title to mock into the phone-frame header. */
  displayTitle?: string | null;
  /** Capabilities to mock into the phone-frame action bar. */
  capabilities?: PortalPreviewCapability[];
  /** Default view mode. Defaults to 'mobile' since this is what visitors see. */
  initialMode?: 'desktop' | 'mobile';
}) {
  const [activePath, setActivePath] = useState(pages[0]?.path ?? '/');
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>(initialMode ?? 'mobile');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setErr(null);
      try {
        const res = await fetchWithAuth(`/api/portals/walkthroughs/${sessionId}/preview?path=${encodeURIComponent(activePath)}`);
        if (!res.ok) throw new Error(`Preview failed (${res.status})`);
        const text = await res.text();
        if (!cancelled) setHtml(text);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [sessionId, activePath]);

  // Mobile mode wraps the page body in the Comm App's mobile CSS reset
  // (wrapForSandbox from src/comm/lib/portal-sandbox). The /preview endpoint
  // returns a full HTML document with desktop styling — we strip the body
  // out and re-wrap with the mobile reset to get an apples-to-apples view
  // of how the Comm App's PortalPageScreen will render this content.
  const mobileSrcDoc = useMemo(() => {
    if (viewMode !== 'mobile' || !html) return '';
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : html;
    return wrapForSandbox(bodyContent ?? '', { title: displayTitle ?? 'Preview' });
  }, [html, viewMode, displayTitle]);

  if (pages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-adv-card p-4 text-xs text-adv-gray">
        No content yet — complete the Content phase to enable preview.
      </div>
    );
  }

  const toolbar = (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-adv-dark/40 overflow-x-auto">
      <span className="text-xs text-adv-gray pr-2">Preview:</span>
      {pages.map((p) => (
        <button
          key={p.path}
          onClick={() => setActivePath(p.path)}
          className={`px-2 py-1 rounded text-xs font-mono transition ${
            p.path === activePath ? 'bg-adv-teal/20 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >{p.path}</button>
      ))}
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-gray ml-2" aria-label="Loading preview" />}
      <div className="flex-1" />
      <div className="inline-flex rounded border border-border overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setViewMode('mobile')}
          className={`px-2 py-1 flex items-center gap-1 ${
            viewMode === 'mobile' ? 'bg-adv-teal/20 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={viewMode === 'mobile'}
          title="See it the way Comm App users will"
        >
          <Smartphone className="h-3 w-3" /> Mobile
        </button>
        <button
          type="button"
          onClick={() => setViewMode('desktop')}
          className={`px-2 py-1 flex items-center gap-1 ${
            viewMode === 'desktop' ? 'bg-adv-teal/20 text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
          aria-pressed={viewMode === 'desktop'}
          title="Raw page as rendered by the desktop preview endpoint"
        >
          <Monitor className="h-3 w-3" /> Desktop
        </button>
      </div>
    </div>
  );

  if (err) {
    return (
      <div className="rounded-lg border border-border bg-adv-card overflow-hidden">
        {toolbar}
        <div className="p-4 text-xs text-adv-red flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {err}
        </div>
      </div>
    );
  }

  if (viewMode === 'desktop') {
    return (
      <div className="rounded-lg border border-border bg-adv-card overflow-hidden">
        {toolbar}
        <iframe
          title="Portal preview (desktop)"
          sandbox=""
          srcDoc={html}
          className="w-full bg-white"
          style={{ height: 360 }}
        />
      </div>
    );
  }

  // Mobile preview — mocks the Comm App's PortalPageScreen chrome around the
  // iframe so publishers see the EXACT visitor experience (header + page tabs
  // + sandboxed page body + capability action bar) before publishing.
  const showTabs = pages.length > 1;
  const phoneTitle = displayTitle ?? 'Portal';
  const caps = capabilities ?? [];

  // Phone body height is iframe area = total - header - (tabs?) - capability bar.
  const PHONE_HEIGHT = 600;
  const HEADER_H = 36;
  const TABS_H = showTabs ? 36 : 0;
  const BAR_H = caps.length > 0 ? 52 : 0;
  const IFRAME_H = PHONE_HEIGHT - HEADER_H - TABS_H - BAR_H;

  return (
    <div className="rounded-lg border border-border bg-adv-card overflow-hidden">
      {toolbar}
      <div className="flex justify-center bg-adv-dark/40 p-6">
        <div
          className="rounded-[2rem] border-[10px] border-gray-900 shadow-2xl overflow-hidden bg-[#F5F3EF] flex flex-col"
          style={{ width: 320, height: PHONE_HEIGHT }}
        >
          {/* Mock Comm App header */}
          <div className="h-9 px-3 flex items-center justify-between bg-white border-b border-gray-200 flex-shrink-0">
            <span className="text-xs text-gray-500">← Back</span>
            <span className="text-xs font-semibold text-gray-900 truncate">{phoneTitle}</span>
            <span className="w-8" />
          </div>

          {/* Mock page-tab rail (only when >1 page) */}
          {showTabs && (
            <div className="h-9 px-2 py-1.5 flex items-center gap-1 bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0">
              {pages.map((p) => (
                <span
                  key={p.path}
                  className={`flex-shrink-0 px-2 py-0.5 text-[10px] rounded-full ${
                    p.path === activePath ? 'bg-[#0D7D6C] text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {p.title ?? p.path}
                </span>
              ))}
            </div>
          )}

          {/* Iframe body — wrapped with Comm App's wrapForSandbox */}
          <iframe
            title="Portal preview (mobile)"
            sandbox=""
            srcDoc={mobileSrcDoc}
            className="w-full bg-[#F5F3EF] border-0 flex-1"
            style={{ height: IFRAME_H }}
          />

          {/* Mock capability bar */}
          {caps.length > 0 && (
            <div className="h-13 px-2 py-2 flex items-center gap-1.5 bg-white border-t border-gray-200 overflow-x-auto flex-shrink-0" style={{ height: BAR_H }}>
              {caps.map((c) => (
                <span
                  key={c.id}
                  className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: '#0D7D6C', color: '#FFFFFF' }}
                >
                  {c.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="px-3 py-1.5 text-[10px] text-adv-gray border-t border-border">
        Mobile preview · 320×{PHONE_HEIGHT} viewport · Comm App CSS reset applied
      </div>
    </div>
  );
}

// Render a USD-cent count as a money string. Sub-cent values (which are
// common for haiku-cheap phases) collapse to "<$0.01" so the chip never
// shows a misleading "$0.00".
function formatCents(cents: number): string {
  if (!cents || cents <= 0) return '$0.00';
  if (cents < 1) return '<$0.01';
  return `$${(cents / 100).toFixed(cents < 100 ? 3 : 2)}`;
}

// ── LLM suggest helpers ───────────────────────────────────────────────────
// Two transport variants: sync (JSON) for short phases, streaming (SSE) for
// content_generation where the wait would otherwise be 15-30 seconds.

type SuggestOutcome =
  | { kind: 'ok'; suggestion: Record<string, unknown> }
  | { kind: 'error'; message: string };

async function suggestSync(sessionId: string): Promise<SuggestOutcome> {
  const res = await fetchWithAuth(`/api/portals/walkthroughs/${sessionId}/llm-suggest`, {
    method: 'POST',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 200 && json?.suggestion) {
    return { kind: 'ok', suggestion: json.suggestion as Record<string, unknown> };
  }
  return { kind: 'error', message: messageForError(json?.error ?? {}) };
}

async function suggestStreaming(
  sessionId: string,
  onProgress: (p: { chars: number; thinking: boolean } | null) => void,
): Promise<SuggestOutcome> {
  const res = await fetchWithAuth(`/api/portals/walkthroughs/${sessionId}/llm-suggest/stream`, {
    method: 'POST',
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    return { kind: 'error', message: messageForError(j?.error ?? { kind: 'transport_error' }) };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chars = 0;
  let thinking = false;
  let outcome: SuggestOutcome = { kind: 'error', message: 'Stream ended without a complete event' };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by \n\n. Process every complete frame.
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseSseFrame(frame);
      if (!parsed) continue;
      if (parsed.event === 'complete') {
        const data = parsed.data as { suggestion?: Record<string, unknown> };
        if (data?.suggestion) outcome = { kind: 'ok', suggestion: data.suggestion };
      } else if (parsed.event === 'error' || parsed.event === 'aborted') {
        outcome = { kind: 'error', message: messageForError(parsed.data ?? {}) };
      } else {
        // Default 'message' frames from streamChat: text_delta / thinking_delta.
        const d = parsed.data as { type?: string; content?: string };
        if (d?.type === 'text_delta' && d.content) {
          chars += d.content.length;
          thinking = false;
          onProgress({ chars, thinking });
        } else if (d?.type === 'thinking_delta' && d.content) {
          thinking = true;
          onProgress({ chars, thinking });
        }
      }
    }
  }
  return outcome;
}

// Parses one SSE frame ("event: name\ndata: {…}" or just "data: {…}") into
// {event, data}. Default event name per SSE spec is "message".
function parseSseFrame(frame: string): { event: string; data: unknown } | null {
  const lines = frame.split('\n');
  let event = 'message';
  let dataText = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) dataText += line.slice(6);
  }
  if (!dataText || dataText === '[DONE]') return null;
  try { return { event, data: JSON.parse(dataText) }; }
  catch { return null; }
}

function messageForError(e: { kind?: string; limit?: number; reason?: string; retryable?: boolean; message?: string; status?: string; zodErrors?: Array<{ path: string; message: string }> }): string {
  if (e.kind === 'cap_exceeded') return `LLM call cap reached (${e.limit}/walkthrough). Fill the rest manually.`;
  if (e.kind === 'no_provider') return 'No LLM provider configured. Set ANTHROPIC_API_KEY in .env.';
  if (e.kind === 'parse_error') return `Model returned non-JSON output. ${e.retryable ? 'Try again.' : ''}`;
  if (e.kind === 'shape_error') {
    const issues = e.zodErrors?.slice(0, 2).map(z => `${z.path}: ${z.message}`).join('; ');
    return `Model output didn't match schema. ${issues ?? ''}`;
  }
  if (e.kind === 'provider_error') return `Provider error: ${e.message ?? 'unknown'}`;
  if (e.kind === 'session_inactive') return `Session is ${e.status}; cannot suggest.`;
  if (e.kind === 'internal_error') return `Internal error: ${e.message ?? 'unknown'}`;
  return 'AI suggestion failed';
}

// ── Draft seeding ───────────────────────────────────────────────────────────

// ── Per-phase validation ────────────────────────────────────────────────────
// Returns { valid, missing[] } so the UI can disable Save & continue and
// show the user exactly what's needed.

function validatePhase(phase: PhaseId, draft: Record<string, unknown>): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  switch (phase) {
    case 'intent':
      if (!stringFilled(draft.audience, 3)) missing.push('audience');
      if (!stringFilled(draft.problem_solved, 3)) missing.push('problem_solved');
      if (!Array.isArray(draft.visitor_actions) || (draft.visitor_actions as string[]).length === 0) missing.push('visitor_actions');
      break;
    case 'identity':
      if (!stringFilled(draft.name, 1) || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test((draft.name as string) ?? '')) missing.push('name (lowercase slug)');
      if (!stringFilled(draft.namespace, 3)) missing.push('namespace');
      if (!stringFilled(draft.display_title, 1)) missing.push('display_title');
      if (!stringFilled(draft.category, 1)) missing.push('category');
      break;
    case 'content_structure':
      if (!Array.isArray(draft.pages) || (draft.pages as unknown[]).length === 0) missing.push('at least one page');
      break;
    case 'content_generation': {
      const pages = (draft.pages as Array<{ html?: string }> | undefined) ?? [];
      if (pages.length === 0 || pages.some(p => !stringFilled(p.html, 1))) missing.push('html for every page');
      break;
    }
    case 'capabilities':
      if (!Array.isArray(draft.capabilities) || (draft.capabilities as unknown[]).length === 0) missing.push('at least one capability');
      break;
    case 'aesthetics':
      // All optional.
      break;
    case 'review':
      if (draft.approved !== true) missing.push('approved (check the box)');
      break;
    case 'publish':
      if (draft.ready_to_register !== true) missing.push('ready_to_register');
      break;
  }
  return { valid: missing.length === 0, missing };
}

function stringFilled(v: unknown, minLen: number): boolean {
  return typeof v === 'string' && v.trim().length >= minLen;
}

function buildDraftFor(session: SessionState): Record<string, unknown> {
  const phase = session.currentPhase;
  const existing = session.accumulatedState[phase] as Record<string, unknown> | undefined;
  if (existing) return existing;
  // Seed sensible defaults from the template.
  if (phase === 'identity') {
    return { namespace: 'futurechain', category: session.template?.id ?? 'personal' };
  }
  if (phase === 'content_structure') {
    return { pages: session.template.seedPages.map(s => ({ path: s.path, title: s.title, sort_order: s.sortOrder })) };
  }
  if (phase === 'content_generation') {
    // Pre-fill the textareas with the template's seed HTML so users see
    // what they're editing instead of a blank slate. The renderer's
    // {{title}}, {{portal.*}}, {{data.*}}, {{#each kind}} placeholders
    // are visible — users can adjust copy without losing the structure.
    return { pages: session.template.seedPages.map(s => ({ path: s.path, html: (s as { html?: string }).html ?? '' })) };
  }
  if (phase === 'capabilities') {
    return {
      capabilities: session.template.defaultCapabilities.map(c => ({
        id: c.id, verb: c.verb, title: c.title, description: c.description, aap_endpoint: c.aapEndpoint,
      })),
    };
  }
  if (phase === 'review') return { approved: true };
  if (phase === 'publish') return { public_index: false, ready_to_register: true };
  return {};
}

function serialiseDraft(_phase: PhaseId, draft: Record<string, unknown>): Record<string, unknown> {
  return draft;
}
