// ── ApplicationFlowPage.tsx ────────────────────────────────────────────────
// /jobs/:id/apply — 5-step candidate application. CV upload OR career-
// profile reuse → answers to the 5 questions → review-before-submit →
// submit. Transparency before send is the design principle.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Upload, FileText, Check } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Question { number: number; text: string }
interface Job {
  id: string; title: string; questions: unknown;
}

export default function ApplicationFlowPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [job, setJob] = useState<Job | null>(null);
  const [cvText, setCvText] = useState('');
  const [useProfileBundle, setUseProfileBundle] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [jobRes, profRes] = await Promise.all([
          fetchWithAuth(`/api/jobs/${id}`),
          fetchWithAuth('/api/jobs/profile'),
        ]);
        if (jobRes.ok) {
          const j = await jobRes.json() as { job: Job };
          setJob(j.job);
        }
        if (profRes.ok) {
          const p = await profRes.json() as { profile: { profile_id?: string } | null };
          if (p.profile?.profile_id) setUseProfileBundle(p.profile.profile_id);
        }
      } catch { /* silent */ }
    })();
  }, [id]);

  const questions = useMemo<Question[]>(() => {
    if (!job) return [];
    return Array.isArray(job.questions) ? job.questions as Question[] : [];
  }, [job]);

  const answersComplete = questions.every(q => (answers[q.number] ?? '').trim().length > 0);

  async function handleCvUpload(file: File) {
    const text = await file.text();
    setCvText(text.slice(0, 32 * 1024));
  }

  async function submit() {
    if (!job) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        answers: questions.map(q => ({ question_number: q.number, text: answers[q.number] ?? '' })),
        cv_text: cvText || undefined,
        career_profile_bundle_id: useProfileBundle || undefined,
      };
      const res = await fetchWithAuth(`/api/jobs/${job.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const j = await res.json() as { application_id: string };
      navigate(`/jobs/applications/${j.application_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!job) return <div className="p-6 text-adv-gray">Loading…</div>;

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Link to={`/jobs/${job.id}`} className="text-sm text-adv-teal inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to job
        </Link>
        <header>
          <h1 className="text-2xl font-semibold">Apply to {job.title}</h1>
          <div className="text-xs text-adv-gray mt-1">Step {step} of 3</div>
        </header>

        {step === 1 && (
          <section className="space-y-4">
            <div className="text-sm font-medium">1. Upload CV or reuse career profile</div>
            {useProfileBundle ? (
              <div className="rounded border border-adv-teal/40 bg-adv-teal/5 p-4 flex items-center gap-3">
                <Check size={18} className="text-adv-teal" />
                <div className="flex-1">
                  <div className="text-sm">Using your ANTON career profile</div>
                  <div className="text-xs text-adv-gray">Profile ID: {useProfileBundle.slice(0, 8)}…</div>
                </div>
                <button onClick={() => setUseProfileBundle(null)} className="text-xs text-adv-gray hover:text-adv-red">Upload CV instead</button>
              </div>
            ) : (
              <label className="rounded border border-dashed border-border bg-adv-card p-6 block cursor-pointer text-center hover:border-adv-teal">
                <Upload size={24} className="text-adv-teal mx-auto mb-2" />
                <div className="text-sm">Click to upload CV (PDF / DOCX / TXT)</div>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleCvUpload(f);
                  }}
                />
                {cvText && <div className="text-xs text-adv-gray mt-2">CV loaded ({cvText.length.toLocaleString()} chars)</div>}
              </label>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!cvText && !useProfileBundle}
                className="px-4 py-2 bg-adv-teal text-adv-dark rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <div className="text-sm font-medium">2. Answer the recruiter's questions</div>
            {questions.map(q => (
              <label key={q.number} className="block space-y-1">
                <div className="text-sm">{q.number}. {q.text}</div>
                <textarea
                  value={answers[q.number] ?? ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.number]: e.target.value.slice(0, 4000) }))}
                  rows={4}
                  className="w-full bg-adv-card border border-border rounded p-3 text-sm outline-none focus:ring-1 focus:ring-adv-teal"
                  placeholder="Your answer…"
                />
                <div className="text-[11px] text-adv-gray">{(answers[q.number] ?? '').length} / 4000 characters</div>
              </label>
            ))}
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!answersComplete}
                className="px-4 py-2 bg-adv-teal text-adv-dark rounded disabled:opacity-50"
              >
                Review
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <div className="text-sm font-medium">3. Review before submitting</div>
            <div className="rounded border border-border bg-adv-card p-4 space-y-3 text-sm">
              <div>
                <div className="text-xs text-adv-gray uppercase tracking-wide">CV / Profile</div>
                <div>{useProfileBundle ? `ANTON career profile (${useProfileBundle.slice(0, 8)}…)` : `Uploaded CV (${cvText.length} chars)`}</div>
              </div>
              <div>
                <div className="text-xs text-adv-gray uppercase tracking-wide">Answers</div>
                <ul className="list-decimal list-inside space-y-2 mt-1">
                  {questions.map(q => (
                    <li key={q.number}>
                      <div className="font-medium">{q.text}</div>
                      <div className="ml-4 mt-0.5 text-adv-gray whitespace-pre-wrap">{answers[q.number]}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-2 border-t border-border text-xs text-adv-gray">
                <FileText size={14} className="inline mr-1" />
                Submitting sends the above to the recruiter. You can withdraw until they open the application.
              </div>
            </div>
            {error && <div className="text-sm text-adv-red">{error}</div>}
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white">Back</button>
              <button
                onClick={submit}
                disabled={submitting}
                className="px-6 py-2 bg-adv-teal text-adv-dark rounded font-medium disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
