// ── JobDetailPage.tsx ──────────────────────────────────────────────────────
// Job detail at /jobs/:id. Must show salary range + assessment framework
// (EU AI Act transparency). No hidden weights.

import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Scale, Info } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Job {
  id: string;
  title: string;
  description: string | null;
  organisation: string | null;
  location: string | null;
  salary_min: number | string | null;
  salary_max: number | string | null;
  salary_currency: string | null;
  remote_mode: string | null;
  assessment_framework: unknown;     // JSON; display as table
  questions: unknown;
  created_at: string;
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/jobs/${id}`);
        if (!res.ok) { setError(`HTTP ${res.status}`); return; }
        const json = await res.json() as { job: Job };
        setJob(json.job);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-6 text-adv-gray">Loading…</div>;
  if (error || !job) return (
    <div className="p-6">
      <Link to="/jobs" className="text-adv-teal">← Back</Link>
      <div className="mt-4 text-adv-red">Failed to load job: {error}</div>
    </div>
  );

  const assessment = (job.assessment_framework as { dimensions?: Array<{ name: string; weight: number; description?: string }> } | null) ?? null;
  const questions = Array.isArray(job.questions) ? job.questions as Array<{ number: number; text: string }> : [];

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Link to="/jobs" className="text-sm text-adv-teal inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back to jobs
        </Link>

        <header>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <div className="text-sm text-adv-gray mt-1">
            {job.organisation} · {job.location ?? 'Location TBD'} {job.remote_mode && `· ${job.remote_mode}`}
          </div>
        </header>

        {/* Salary — always visible (EU Pay Transparency Directive) */}
        <section className="rounded-lg border border-adv-teal/40 bg-adv-teal/5 p-4">
          <div className="text-sm font-medium text-adv-teal">Salary range (required disclosure)</div>
          <div className="text-lg mt-1">
            {job.salary_min != null && job.salary_max != null
              ? `${Number(job.salary_min).toLocaleString()} – ${Number(job.salary_max).toLocaleString()} ${job.salary_currency ?? ''}`
              : <span className="text-adv-gold">Not yet published by recruiter — flag this job as non-compliant if it goes live without one.</span>
            }
          </div>
        </section>

        {/* Description */}
        {job.description && (
          <section className="rounded-lg border border-border bg-adv-card p-4 whitespace-pre-wrap text-sm">
            {job.description}
          </section>
        )}

        {/* Assessment Framework — mandatory transparency */}
        <section className="rounded-lg border border-border bg-adv-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <Scale size={16} className="text-adv-teal" /> Published Assessment Framework
          </div>
          {assessment?.dimensions && assessment.dimensions.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {assessment.dimensions.map((d, i) => (
                <li key={i} className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0">
                  <div>
                    <div className="font-medium">{d.name}</div>
                    {d.description && <div className="text-xs text-adv-gray mt-0.5">{d.description}</div>}
                  </div>
                  <div className="text-xs text-adv-teal whitespace-nowrap">weight {d.weight.toFixed(2)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-adv-gray">
              <Info size={14} className="inline mr-1" />
              Recruiter has not published the assessment framework yet. Do not apply until they do — this is required for EU AI Act transparency.
            </div>
          )}
        </section>

        {/* Questions */}
        {questions.length > 0 && (
          <section className="rounded-lg border border-border bg-adv-card p-4">
            <div className="text-sm font-medium mb-3">You'll be asked to answer</div>
            <ol className="list-decimal list-inside space-y-1 text-sm text-adv-off-white">
              {questions.map((q, i) => (
                <li key={i}>{q.text}</li>
              ))}
            </ol>
          </section>
        )}

        <div className="pt-2">
          <button
            onClick={() => navigate(`/jobs/${job.id}/apply`)}
            disabled={!assessment?.dimensions || assessment.dimensions.length === 0}
            className="w-full md:w-auto px-6 py-3 bg-adv-teal text-adv-dark rounded font-medium hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          {(!assessment?.dimensions || assessment.dimensions.length === 0) && (
            <p className="text-xs text-adv-gold mt-2">Apply button disabled until the recruiter publishes the assessment framework.</p>
          )}
        </div>
      </div>
    </div>
  );
}
