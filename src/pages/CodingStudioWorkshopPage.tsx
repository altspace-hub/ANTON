import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sparkles, Send, Loader2, CheckCircle2, Circle, ArrowLeft, ArrowRight,
  Target, ListChecks, Globe, ShieldCheck, BookOpen, Code2, Users, AlertTriangle, FileCheck2,
  Paperclip, X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import { useFileUpload } from '@/hooks/useFileUpload';
import { fetchWithAuth } from '@/lib/api';
import type { StudioMode } from './CodingLandingPage';

// ── ANTON Studio — Kickoff Workshop (Studio P1) ────────────────────────────
// The guided "talk before any code" 3-pane shell (progress rail / chat / charter
// insight rail), cloned in spirit from DiscoverPage. It drives the workshop
// engine through 8 phases on Mistral Large (the PM/lead), then FINALIZES into a
// Project Charter that seeds a Studio project and hands off to CodingStudioPage.

const PHASES = [
  { id: 'problem_vision', label: 'Problem & Vision', icon: Target },
  { id: 'scope_mvp', label: 'Scope & MVP', icon: ListChecks },
  { id: 'context_constraints', label: 'Context & Constraints', icon: Globe },
  { id: 'guidelines', label: 'Guidelines to Lean On', icon: ShieldCheck },
  { id: 'references', label: 'References', icon: BookOpen },
  { id: 'tech_stack', label: 'Tech Stack & Language', icon: Code2 },
  { id: 'expert_panel', label: 'Expert Panel', icon: Users },
  { id: 'risks_review', label: 'Risks & Charter Review', icon: AlertTriangle },
] as const;

type PhaseId = (typeof PHASES)[number]['id'];

interface ChosenFramework { id: string; name: string; reference?: string; origin: string }
interface CharterReference { id: string; kind: string; value: string; note?: string }
interface CharterRisk { id: string; description: string; severity: string; mitigation?: string }
interface CharterGoal { id: string; statement: string; priority: string }

interface WorkshopState {
  tier: string;
  mode: string;
  phase: PhaseId;
  title: string;
  problemStatement: string;
  vision: string;
  scope: string;
  mvp: string;
  goals: CharterGoal[];
  constraints: string;
  jurisdiction: string;
  chosenFrameworks: ChosenFramework[];
  references: CharterReference[];
  techStack: string[];
  language: string;
  expertPanel: string[];
  risks: CharterRisk[];
  summary: string;
  suggestedFrameworks: ChosenFramework[];
  completedPhases: string[];
  currentPhaseProgress: number;
  canFinalize: boolean;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export default function CodingStudioWorkshopPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawMode = params.get('mode');
  const studioMode: StudioMode = rawMode === 'ask' ? 'ask' : 'project';
  const resumeId = params.get('session') ?? '';

  const [sessionId, setSessionId] = useState(resumeId);
  const [state, setState] = useState<WorkshopState | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { files, upload, remove } = useFileUpload();

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  // ── Boot: create or resume a session, then fetch the opening turn ──────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let id = resumeId;
        if (!id) {
          const res = await fetchWithAuth('/api/coding/workshop/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier: 'standard', mode: studioMode }),
          });
          const json = (await res.json()) as { id?: string; error?: string };
          if (!res.ok || !json.id) throw new Error(json.error ?? 'Could not start the workshop.');
          id = json.id;
        }
        if (cancelled) return;
        setSessionId(id);

        const startRes = await fetchWithAuth(`/api/coding/workshop/sessions/${id}/start`);
        const startJson = (await startRes.json()) as { response?: string; state?: WorkshopState; error?: string };
        if (!startRes.ok || !startJson.state) throw new Error(startJson.error ?? 'Could not open the workshop.');
        if (cancelled) return;
        setState(startJson.state);
        setMessages(buildMessages(startJson.state, startJson.response));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not start the workshop.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  async function send() {
    const text = input.trim();
    if (!text || loading || !sessionId) return;
    const attachmentIds = files.filter((f) => f.status === 'done').map((f) => f.id);
    const attachedNames = files.filter((f) => f.status === 'done').map((f) => f.name);
    setInput('');
    setError(null);
    setMessages((m) => [...m, {
      role: 'user',
      content: attachedNames.length ? `${text}\n\n📎 ${attachedNames.join(', ')}` : text,
    }]);
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/coding/workshop/sessions/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, attachmentIds }),
      });
      const json = (await res.json()) as { response?: string; state?: WorkshopState; error?: string };
      if (!res.ok || !json.state) throw new Error(json.error ?? 'The facilitator could not respond.');
      setState(json.state);
      setMessages((m) => [...m, { role: 'assistant', content: json.response ?? '' }]);
      files.forEach((f) => remove(f.id)); // consumed this turn
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The facilitator could not respond.');
    } finally {
      setLoading(false);
    }
  }

  async function finalize() {
    if (!sessionId || finalizing) return;
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/coding/workshop/sessions/${sessionId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { codingProjectId?: string; error?: string };
      if (!res.ok || !json.codingProjectId) throw new Error(json.error ?? 'Could not seed the project.');
      // Hand the charter off to the Studio project shell (P2 panel reads the id).
      navigate(`/coding/studio?mode=${studioMode}&project=${encodeURIComponent(json.codingProjectId)}&from=workshop`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not seed the project.');
    } finally {
      setFinalizing(false);
    }
  }

  const currentIdx = state ? PHASES.findIndex((p) => p.id === state.phase) : 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-6">
      <CodingBreadcrumb items={[{ label: 'Studio' }, { label: 'Kickoff Workshop' }]} />

      <div className="rounded-2xl border-2 border-adv-teal bg-adv-card p-5 shadow-lg shadow-adv-teal/10">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-adv-teal-dim p-3">
            <Sparkles className="h-6 w-6 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-adv-white">ANTON Studio — Kickoff Workshop</h1>
            <p className="text-xs text-adv-gray">
              A guided talk before any code: we start with the problem, not the solution, and end with a
              Project Charter that seeds your build.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
        {/* ── Progress rail ─────────────────────────────────────────────── */}
        <aside className="rounded-2xl border border-border bg-adv-card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-adv-gray">Phases</h2>
          <ol className="space-y-1.5">
            {PHASES.map((p, i) => {
              const Icon = p.icon;
              const done = state?.completedPhases.includes(p.id) ?? false;
              const active = i === currentIdx;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                    active ? 'bg-adv-teal-dim text-adv-teal' : done ? 'text-adv-off-white' : 'text-adv-gray'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-adv-green" />
                  ) : active ? (
                    <Icon className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{p.label}</span>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* ── Chat ──────────────────────────────────────────────────────── */}
        <section className="flex min-h-[68vh] flex-col rounded-2xl border border-border bg-adv-card">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {booting && (
              <div className="flex items-center gap-2 text-sm text-adv-gray">
                <Loader2 className="h-4 w-4 animate-spin" /> Opening the workshop…
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-adv-teal text-adv-dark'
                      : 'bg-adv-dark text-adv-off-white'
                  }`}
                >
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-adv-gray">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>

          {error && <p className="px-4 pb-1 text-xs text-adv-red">{error}</p>}

          <div className="border-t border-border p-3">
            {/* Attached-file chips */}
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-adv-dark px-2 py-0.5 text-[11px] text-adv-off-white"
                  >
                    {f.status === 'uploading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3 text-adv-teal" />}
                    <span className="max-w-[160px] truncate">{f.name}</span>
                    {f.status === 'error' && <span className="text-adv-red">failed</span>}
                    <button onClick={() => remove(f.id)} className="text-adv-gray hover:text-adv-red" title="Remove">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.txt,.pdf,.docx,.doc,.xlsx,.xls,.md,.json"
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files;
                  if (list) Array.from(list).forEach((file) => void upload(file));
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={booting || loading}
                title="Attach files (CSV samples, regulation PDFs, docs) for context"
                className="inline-flex h-[42px] items-center justify-center rounded-lg border border-border bg-adv-dark px-3 text-adv-gray transition-colors hover:text-adv-teal disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                rows={2}
                placeholder="Answer the facilitator… (or attach files for context)"
                disabled={booting || loading}
                className="flex-1 resize-none rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white disabled:opacity-50"
              />
              <button
                onClick={() => void send()}
                disabled={booting || loading || !input.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> Send
              </button>
            </div>
          </div>
        </section>

        {/* ── Charter insight rail ──────────────────────────────────────── */}
        <aside className="space-y-3">
          <div className="rounded-2xl border border-border bg-adv-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-adv-teal" />
              <h2 className="text-sm font-semibold text-adv-off-white">Project Charter</h2>
            </div>
            {!state ? (
              <p className="text-xs text-adv-gray">The charter fills in as you talk.</p>
            ) : (
              <dl className="space-y-2 text-xs">
                <CharterField label="Problem" value={state.problemStatement} />
                <CharterField label="Scope" value={state.scope} />
                <CharterField label="MVP" value={state.mvp} />
                {state.goals && state.goals.length > 0 && (
                  <CharterChips label="Goals" items={state.goals.map((g) => `[${g.priority}] ${g.statement}`)} />
                )}
                <CharterField label="Jurisdiction" value={state.jurisdiction} />
                <CharterField label="Language" value={state.language} />
                {state.techStack.length > 0 && (
                  <CharterChips label="Stack" items={state.techStack} />
                )}
                {state.chosenFrameworks.length > 0 && (
                  <CharterChips label="Guidelines" items={state.chosenFrameworks.map((f) => f.name)} />
                )}
                {state.references.length > 0 && (
                  <CharterChips label="References" items={state.references.map((r) => `${r.kind}: ${r.value}`)} />
                )}
                {state.expertPanel.length > 0 && (
                  <CharterChips label="Panel" items={state.expertPanel} />
                )}
                {state.risks.length > 0 && (
                  <CharterChips label="Risks" items={state.risks.map((r) => `[${r.severity}] ${r.description}`)} />
                )}
              </dl>
            )}
          </div>

          {state && state.suggestedFrameworks.length > 0 && (
            <div className="rounded-2xl border border-adv-blue/40 bg-adv-blue/5 p-4">
              <h3 className="mb-1.5 text-xs font-semibold text-adv-blue">Auto-suggested guidelines</h3>
              <ul className="space-y-1 text-xs text-adv-off-white">
                {state.suggestedFrameworks.map((f) => (
                  <li key={f.id}>• {f.name}{f.reference ? ` (${f.reference})` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={() => void finalize()}
            disabled={(!state?.canFinalize && !(state?.problemStatement?.trim() && (state?.scope?.trim() || state?.mvp?.trim()))) || finalizing}
            title={canFinalizeNow(state) ? 'Seed a Studio project from this charter' : 'Capture the problem and scope first'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {finalizing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Seeding project…</>
            ) : (
              <>Create the Studio project <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </aside>
      </div>

      <div>
        <button
          onClick={() => navigate('/coding')}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-4 py-2 text-sm font-medium text-adv-off-white transition-colors hover:text-adv-teal"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Coding
        </button>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Belt-and-suspenders: the charter is finalize-ready if the backend opened the
 *  gate OR it already carries a problem + scope/mvp (so an imperfect model that
 *  never emitted canFinalize can't trap the user). Mirrors the engine's derive. */
function canFinalizeNow(state: WorkshopState | null): boolean {
  if (!state) return false;
  return state.canFinalize || (!!state.problemStatement?.trim() && (!!state.scope?.trim() || !!state.mvp?.trim()));
}

function buildMessages(
  state: WorkshopState,
  opening?: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (state.conversationHistory.length > 0) {
    return state.conversationHistory.map((m) => ({ role: m.role, content: m.content }));
  }
  return opening ? [{ role: 'assistant', content: opening }] : [];
}

function CharterField({ label, value }: { label: string; value: string }) {
  if (!value || !value.trim()) {
    return (
      <div>
        <dt className="text-[10px] font-medium uppercase tracking-wider text-adv-gray">{label}</dt>
        <dd className="text-adv-gray/60">—</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-adv-gray">{label}</dt>
      <dd className="text-adv-off-white">{value}</dd>
    </div>
  );
}

function CharterChips({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-adv-gray">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap gap-1">
        {items.map((it, i) => (
          <span key={i} className="rounded-full bg-adv-dark px-2 py-0.5 text-[11px] text-adv-off-white">
            {it}
          </span>
        ))}
      </dd>
    </div>
  );
}
