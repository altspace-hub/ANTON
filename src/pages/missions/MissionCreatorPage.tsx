/**
 * MissionCreatorPage — brief form. Pick a template (or none), fill in the
 * objective + success criteria + budget, create. Caller is then taken to
 * the mission dashboard to decompose / approve / start.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Target, ChevronLeft, AlertCircle, Sparkles } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type AutonomyLevel = 'check_in' | 'briefing' | 'full_autonomy';

interface TemplateParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'boolean' | 'textarea';
  required?: boolean;
  default?: string | number | boolean;
  options?: string[];
  help?: string;
}

interface MissionTemplate {
  id: string;
  name: string;
  description: string | null;
  pillar: 'work' | 'life' | 'school';
  category: string | null;
  parameters_schema?: TemplateParameter[];
  default_autonomy_level: AutonomyLevel;
  default_budget: { token_budget_max?: number; time_budget_max_seconds?: number; time_active_max_seconds?: number };
}

type ParamValues = Record<string, string | number | boolean>;

/** Seed form values from the schema defaults when a template is selected. */
function defaultParamValues(schema: TemplateParameter[]): ParamValues {
  const out: ParamValues = {};
  for (const p of schema) {
    if (p.default !== undefined) out[p.key] = p.default;
    else if (p.type === 'boolean') out[p.key] = false;
  }
  return out;
}

const AUTONOMY_OPTIONS: Array<{ id: AutonomyLevel; label: string; hint: string }> = [
  { id: 'check_in',      label: 'Check-in',      hint: 'Approve every step' },
  { id: 'briefing',      label: 'Briefing',      hint: 'Approve at checkpoints' },
  { id: 'full_autonomy', label: 'Full Autonomy', hint: 'Review final output only' },
];

export default function MissionCreatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [templates, setTemplates] = useState<MissionTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>(() => searchParams.get('template') ?? '');
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [context, setContext] = useState('');
  const [autonomy, setAutonomy] = useState<AutonomyLevel>('check_in');
  const [tokenBudget, setTokenBudget] = useState(250_000);
  const [paramValues, setParamValues] = useState<ParamValues>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find(t => t.id === templateId);
  const paramSchema = (templateId && selectedTemplate?.parameters_schema) || [];

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/mission-templates', { headers: getAuthHeader() });
      const data = await res.json();
      if (res.ok) setTemplates(data.templates ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  // Apply template defaults when selected
  useEffect(() => {
    if (!templateId) { setParamValues({}); return; }
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setAutonomy(tmpl.default_autonomy_level);
    if (tmpl.default_budget?.token_budget_max) setTokenBudget(tmpl.default_budget.token_budget_max);
    if (!title.trim()) setTitle(tmpl.name);
    setParamValues(defaultParamValues(tmpl.parameters_schema ?? []));
  }, [templateId, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  function setParam(key: string, value: string | number | boolean) {
    setParamValues(prev => ({ ...prev, [key]: value }));
  }

  /** Required template parameters with no value yet (drives validation). */
  const missingRequired = paramSchema.filter(p => {
    if (!p.required) return false;
    const v = paramValues[p.key];
    if (v === undefined) return true;
    return typeof v === 'string' && !v.trim();
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !objective.trim() || !successCriteria.trim()) {
      setError('Title, objective, and success criteria are required.');
      return;
    }
    if (missingRequired.length > 0) {
      setError(`Template parameter${missingRequired.length === 1 ? '' : 's'} required: ${missingRequired.map(p => p.label).join(', ')}.`);
      return;
    }
    // Send only parameters that carry a value (trimmed strings; numbers and
    // booleans as-is) — the server fills schema defaults for the rest.
    const templateParameters: ParamValues = {};
    for (const p of paramSchema) {
      const v = paramValues[p.key];
      if (v === undefined) continue;
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed) templateParameters[p.key] = trimmed;
      } else {
        templateParameters[p.key] = v;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          title: title.trim(),
          objective: objective.trim(),
          success_criteria: successCriteria.trim(),
          context: context.trim() || undefined,
          autonomy_level: autonomy,
          budget: { token_budget_max: tokenBudget },
          template_id: templateId || undefined,
          template_parameters: templateId && Object.keys(templateParameters).length > 0 ? templateParameters : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      navigate(`/missions/${data.mission.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-5">
      <Link to="/missions" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Missions
      </Link>

      <div className="flex items-center gap-3">
        <Target className="h-7 w-7 text-adv-teal" />
        <h1 className="text-2xl font-semibold text-adv-off-white">New Mission</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Template picker */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-teal mb-2">Template (optional)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTemplateId('')}
              className={`rounded-lg border p-3 text-left transition-colors ${!templateId ? 'border-adv-teal bg-adv-teal/10' : 'border-border bg-adv-card hover:border-adv-gray'}`}
            >
              <div className="text-sm font-medium text-adv-off-white">Custom mission</div>
              <div className="mt-0.5 text-[11px] text-adv-gray">Write your own objective from scratch.</div>
            </button>
            {templates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${templateId === t.id ? 'border-adv-teal bg-adv-teal/10' : 'border-border bg-adv-card hover:border-adv-gray'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-adv-teal" />
                  <span className="text-sm font-medium text-adv-off-white">{t.name}</span>
                </div>
                {t.description && (
                  <div className="mt-0.5 text-[11px] text-adv-gray line-clamp-2">{t.description}</div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Template parameters (3A.1 — typed form from parameters_schema) */}
        {paramSchema.length > 0 && (
          <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-adv-teal">Template parameters</h2>
            {paramSchema.map(p => {
              const value = paramValues[p.key];
              const baseInputClass = 'w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none';
              return (
                <div key={p.key}>
                  {p.type !== 'boolean' && (
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
                      {p.label} {p.required && <span className="text-adv-red">*</span>}
                    </label>
                  )}
                  {p.type === 'select' && (
                    <select
                      value={typeof value === 'string' ? value : ''}
                      onChange={e => setParam(p.key, e.target.value)}
                      className={baseInputClass}
                    >
                      {!p.required && <option value="">(none)</option>}
                      {p.required && value === undefined && <option value="">Select…</option>}
                      {(p.options ?? []).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  )}
                  {p.type === 'textarea' && (
                    <textarea
                      value={typeof value === 'string' ? value : ''}
                      onChange={e => setParam(p.key, e.target.value)}
                      rows={3}
                      maxLength={4000}
                      className={baseInputClass}
                    />
                  )}
                  {p.type === 'string' && (
                    <input
                      type="text"
                      value={typeof value === 'string' ? value : ''}
                      onChange={e => setParam(p.key, e.target.value)}
                      maxLength={2000}
                      className={baseInputClass}
                    />
                  )}
                  {p.type === 'number' && (
                    <input
                      type="number"
                      value={typeof value === 'number' ? value : ''}
                      onChange={e => {
                        const n = e.target.value === '' ? undefined : Number(e.target.value);
                        if (n === undefined) {
                          setParamValues(prev => { const next = { ...prev }; delete next[p.key]; return next; });
                        } else if (Number.isFinite(n)) {
                          setParam(p.key, n);
                        }
                      }}
                      className={baseInputClass}
                    />
                  )}
                  {p.type === 'boolean' && (
                    <label className="flex items-center gap-2 text-sm text-adv-off-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={e => setParam(p.key, e.target.checked)}
                        className="h-4 w-4 rounded border-border bg-adv-dark accent-[var(--adv-teal,#2DD4A8)]"
                      />
                      {p.label} {p.required && <span className="text-adv-red">*</span>}
                    </label>
                  )}
                  {p.help && <p className="mt-1 text-[11px] text-adv-gray">{p.help}</p>}
                </div>
              );
            })}
          </section>
        )}

        {/* Brief */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. AMLR readiness assessment for Bank X"
            maxLength={200}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
            Objective <span className="text-adv-red">*</span>
          </label>
          <textarea
            value={objective}
            onChange={e => setObjective(e.target.value)}
            placeholder="What should ANTON achieve?"
            rows={4}
            maxLength={8000}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
            Success criteria <span className="text-adv-red">*</span>
          </label>
          <textarea
            value={successCriteria}
            onChange={e => setSuccessCriteria(e.target.value)}
            placeholder="How will completion be measured?"
            rows={2}
            maxLength={4000}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
            Context <span className="text-adv-gray/60 font-normal normal-case">(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Background, constraints, preferences"
            rows={2}
            maxLength={8000}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray/60 focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* Autonomy + budget */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">Autonomy</label>
            <select
              value={autonomy}
              onChange={e => setAutonomy(e.target.value as AutonomyLevel)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              {AUTONOMY_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{o.label} — {o.hint}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Token budget
            </label>
            <select
              value={tokenBudget}
              onChange={e => setTokenBudget(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            >
              <option value={100_000}>100k — small (research / quick analysis)</option>
              <option value={250_000}>250k — medium (typical mission)</option>
              <option value={1_000_000}>1M — large (multi-stage analysis)</option>
              <option value={5_000_000}>5M — very large (full deliverable suite)</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-xs text-adv-red flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Link to="/missions" className="rounded-lg border border-border px-3 py-1.5 text-sm text-adv-gray hover:text-adv-off-white">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !objective.trim() || !successCriteria.trim()}
            className="rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create Mission'}
          </button>
        </div>
      </form>
    </div>
  );
}
