// RiskAtlasSetupPage — onboarding wizard.
// Three steps: pick pack → describe business → choose mode → create.
// Defaults to the SME General pack so users always have a working start.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertCircle, Sparkles, ShieldAlert, Loader2 } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type Mode = 'socratic' | 'draft' | 'expert' | 'autonomous';

interface PackRow {
  id: string;
  name: string;
  description: string | null;
  source: 'builtin' | 'community' | 'certified' | 'sovereign';
  amlr_obliged: boolean;
}

const MODE_META: Record<Mode, { label: string; description: string }> = {
  socratic:   { label: 'Socratic',  description: 'Guided question-by-question. Best if you have not built a risk assessment before.' },
  draft:      { label: 'Draft & challenge', description: 'ANTON drafts a full Atlas from your description; you review and edit each entry.' },
  expert:     { label: 'Expert',    description: 'Skip the explainers. Treat me as a senior risk officer who knows the methodology.' },
  autonomous: { label: 'Autonomous (later)', description: 'Earned mode for trusted, well-maintained Atlases. Available after your first review cycle.' },
};

export default function RiskAtlasSetupPage() {
  const [packs, setPacks] = useState<PackRow[]>([]);
  const [packId, setPackId] = useState<string>('sme-general');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [mode, setMode] = useState<Mode>('socratic');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithAuth('/api/atlas/packs', { headers: getAuthHeader() });
        const data = await res.json();
        if (res.ok) setPacks(data.packs ?? []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  async function submit(): Promise<void> {
    setError(null); setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/atlas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          name: name.trim() || 'Untitled Atlas',
          description: description.trim() || undefined,
          business_description: businessDescription.trim() || undefined,
          industry_pack_id: packId,
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // Seed the atlas's Stage 1-3 causal chain from the chosen industry pack
      // (2026-07-17). Best-effort: if it fails, the atlas still exists and the
      // user can build it manually — never strand them on a seeding hiccup.
      if (packId) {
        try {
          await fetchWithAuth(`/api/atlas/${data.atlas.id}/seed-from-pack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ packId }),
          });
        } catch { /* non-fatal — atlas is created; seed can be retried in the workspace */ }
      }
      navigate(`/atlas/${data.atlas.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-5">
      <Link to="/atlas" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Risk Atlas
      </Link>

      <header>
        <h1 className="text-xl font-semibold text-adv-off-white inline-flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-adv-teal" />
          New Risk Atlas
        </h1>
        <p className="mt-1 text-xs text-adv-gray">Three quick steps and ANTON has the foundation it needs to draft Stages 1-3 with you.</p>
      </header>

      <div className="flex items-center gap-1 text-[11px] text-adv-gray">
        {[1, 2, 3].map(n => (
          <span key={n} className={`px-2 py-0.5 rounded ${n === step ? 'bg-adv-teal text-adv-dark font-medium' : n < step ? 'text-adv-teal' : ''}`}>
            Step {n}
          </span>
        ))}
      </div>

      {error && (
        <div className="rounded border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-[12px] text-adv-red flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {step === 1 && (
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-adv-off-white">1. Pick an industry pack</h2>
          <p className="text-[11px] text-adv-gray">Defaults to <strong>SME General</strong> — safe for any business. Pick a more specific pack if one fits.</p>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {packs.map(p => (
              <label
                key={p.id}
                className={`flex items-start gap-3 rounded border px-3 py-2 cursor-pointer transition-colors ${
                  packId === p.id ? 'border-adv-teal bg-adv-teal/5' : 'border-border bg-adv-dark hover:border-adv-gray'
                }`}
              >
                <input
                  type="radio"
                  name="pack"
                  value={p.id}
                  checked={packId === p.id}
                  onChange={() => setPackId(p.id)}
                  className="mt-1 accent-adv-teal"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-adv-off-white">{p.name}</span>
                    {p.amlr_obliged && (
                      <span className="text-[9px] uppercase tracking-wider rounded border border-adv-gold/40 bg-adv-gold/10 text-adv-gold px-1.5 py-0.5">
                        AMLR obliged
                      </span>
                    )}
                    {p.source !== 'builtin' && (
                      <span className="text-[9px] uppercase tracking-wider text-adv-gray">{p.source}</span>
                    )}
                  </div>
                  {p.description && (
                    <p className="mt-1 text-[11px] text-adv-gray">{p.description}</p>
                  )}
                </div>
              </label>
            ))}
            {packs.length === 0 && (
              <p className="text-[11px] text-adv-gray italic">No packs installed yet. SME General will be created on first server boot.</p>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(2)} className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark">
              Next →
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-adv-off-white">2. Describe the business</h2>
          <p className="text-[11px] text-adv-gray">A short Atlas name + a 1-2 paragraph description. ANTON uses this to draft the exposure map.</p>

          <label className="block text-[11px] text-adv-gray">
            Atlas name
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Byggfirma AB Q2 2026"
              className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
            />
          </label>

          <label className="block text-[11px] text-adv-gray">
            Short description (optional)
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              placeholder="One-line note for the atlas list"
              className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
            />
          </label>

          <label className="block text-[11px] text-adv-gray">
            Business description (1-2 paragraphs)
            <textarea
              value={businessDescription}
              onChange={e => setBusinessDescription(e.target.value)}
              maxLength={20000}
              rows={6}
              placeholder="What you sell, who you sell to, and how. Suppliers and customer types matter. Rough numbers (employees, revenue band, geographies) sharpen the draft."
              className="mt-1 w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white"
            />
          </label>

          <div className="flex items-center justify-between">
            <button onClick={() => setStep(1)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white">
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!name.trim()}
              className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-adv-off-white">3. Choose a working mode</h2>
          <p className="text-[11px] text-adv-gray">You can change this later from the Atlas dashboard.</p>

          <div className="space-y-2">
            {(Object.keys(MODE_META) as Mode[]).map(m => {
              const meta = MODE_META[m];
              const disabled = m === 'autonomous';
              return (
                <label
                  key={m}
                  className={`flex items-start gap-3 rounded border px-3 py-2 cursor-pointer transition-colors ${
                    mode === m
                      ? 'border-adv-teal bg-adv-teal/5'
                      : disabled
                        ? 'border-border bg-adv-dark opacity-50 cursor-not-allowed'
                        : 'border-border bg-adv-dark hover:border-adv-gray'
                  }`}
                >
                  <input
                    type="radio" name="mode" value={m}
                    checked={mode === m}
                    onChange={() => !disabled && setMode(m)}
                    disabled={disabled}
                    className="mt-1 accent-adv-teal"
                  />
                  <div>
                    <div className="text-xs font-medium text-adv-off-white">{meta.label}</div>
                    <div className="text-[11px] text-adv-gray">{meta.description}</div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(2)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white">
              ← Back
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {submitting ? 'Creating…' : 'Create Atlas'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
