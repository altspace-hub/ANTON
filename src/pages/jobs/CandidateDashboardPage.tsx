// ── CandidateDashboardPage.tsx ─────────────────────────────────────────────
// /jobs/applications — list of caller's applications with status + pending
// follow-ups. /jobs/applications/:id is rendered inline via tabs / expand
// to keep scope tight; brief allows merging when useful.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, ChevronRight, MessageSquare } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

type Status = 'submitted' | 'under-review' | 'follow-up' | 'interview' | 'decision' | 'withdrawn';

interface ApplicationRow {
  id: string;
  campaign_id: string;
  status: Status;
  created_at: string;
  campaign_title: string | null;
  organisation: string | null;
}

function StatusPill({ status }: { status: string }) {
  const palette: Record<string, string> = {
    'submitted': 'bg-adv-blue/20 text-adv-blue',
    'under-review': 'bg-adv-gold/20 text-adv-gold',
    'follow-up': 'bg-adv-teal/20 text-adv-teal',
    'interview': 'bg-adv-teal/20 text-adv-teal',
    'decision': 'bg-adv-green/20 text-adv-green',
    'withdrawn': 'bg-adv-gray/20 text-adv-gray',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${palette[status] ?? 'bg-adv-gray/20 text-adv-gray'}`}>
      {status}
    </span>
  );
}

export default function CandidateDashboardPage() {
  const { id: focusId } = useParams<{ id?: string }>();
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [followUps, setFollowUps] = useState<Array<{ id: string; question_number: number; question_text: string; answer_text: string | null; asked_at: string; answered_at: string | null }>>([]);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const res = await fetchWithAuth('/api/jobs/applications/mine');
      if (res.ok) {
        const json = await res.json() as { applications: ApplicationRow[] };
        setApps(json.applications ?? []);
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!focusId) { setDetail(null); setFollowUps([]); return; }
    (async () => {
      const res = await fetchWithAuth(`/api/jobs/applications/${focusId}`);
      if (res.ok) {
        const json = await res.json() as { application: Record<string, unknown>; follow_ups: typeof followUps };
        setDetail(json.application);
        setFollowUps(json.follow_ups);
      }
    })();
  }, [focusId]);

  async function answerFollowUp(fuId: string) {
    const text = answerDrafts[fuId];
    if (!text?.trim()) return;
    const res = await fetchWithAuth(`/api/jobs/follow-ups/${fuId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_text: text.trim() }),
    });
    if (res.ok) {
      setFollowUps(fus => fus.map(f => f.id === fuId ? { ...f, answer_text: text.trim(), answered_at: new Date().toISOString() } : f));
      setAnswerDrafts(d => ({ ...d, [fuId]: '' }));
    }
  }

  async function withdraw(appId: string) {
    if (!window.confirm('Withdraw this application? This cannot be undone.')) return;
    const res = await fetchWithAuth(`/api/jobs/applications/${appId}/withdraw`, { method: 'POST' });
    if (res.ok) {
      setApps(as => as.map(a => a.id === appId ? { ...a, status: 'withdrawn' } : a));
    }
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-3">
          <Briefcase size={22} className="text-adv-teal" />
          <div>
            <h1 className="text-2xl font-semibold">My applications</h1>
            <p className="text-xs text-adv-gray">Transparent status throughout.</p>
          </div>
        </header>

        {loading && <div className="text-adv-gray">Loading…</div>}
        {!loading && apps.length === 0 && (
          <div className="rounded-lg border border-border bg-adv-card p-6 text-center text-adv-gray text-sm">
            No applications yet. <Link to="/jobs" className="text-adv-teal hover:underline">Browse jobs →</Link>
          </div>
        )}

        <ul className="space-y-2">
          {apps.map(a => (
            <li key={a.id}>
              <Link
                to={`/jobs/applications/${a.id}`}
                className={`block rounded border p-3 transition ${focusId === a.id ? 'border-adv-teal bg-adv-card' : 'border-border bg-adv-card/50 hover:border-adv-teal'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.campaign_title ?? a.campaign_id}</div>
                    <div className="text-xs text-adv-gray">{a.organisation} · {new Date(a.created_at).toLocaleDateString()}</div>
                  </div>
                  <StatusPill status={a.status} />
                  <ChevronRight size={14} className="text-adv-gray" />
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {/* Detail pane */}
        {detail && (
          <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
            <div className="text-sm font-medium">Application detail</div>
            <div className="text-xs text-adv-gray">Application {focusId}</div>
            {followUps.length > 0 && (
              <div>
                <div className="text-xs font-medium text-adv-gold flex items-center gap-1 mb-2">
                  <MessageSquare size={14} /> Follow-up questions from the recruiter
                </div>
                {followUps.map(fu => (
                  <div key={fu.id} className="border-l-2 border-adv-gold/40 pl-3 mb-3">
                    <div className="text-sm">{fu.question_number}. {fu.question_text}</div>
                    {fu.answered_at ? (
                      <div className="text-xs text-adv-gray mt-1">
                        ✓ Answered: {fu.answer_text}
                      </div>
                    ) : (
                      <div className="mt-2 space-y-1">
                        <textarea
                          value={answerDrafts[fu.id] ?? ''}
                          onChange={e => setAnswerDrafts(d => ({ ...d, [fu.id]: e.target.value.slice(0, 4000) }))}
                          placeholder="Type your answer…"
                          rows={3}
                          className="w-full bg-adv-dark-2 border border-border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-adv-teal"
                        />
                        <button
                          onClick={() => void answerFollowUp(fu.id)}
                          className="px-3 py-1 bg-adv-teal text-adv-dark rounded text-xs font-medium"
                        >
                          Submit answer
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {focusId && detail.status !== 'withdrawn' && (
              <button
                onClick={() => void withdraw(focusId)}
                className="text-xs text-adv-red hover:underline"
              >
                Withdraw application
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
