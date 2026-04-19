import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ShieldAlert, Loader2, AlertTriangle, CheckCircle2, X,
  Inbox, Sparkles, ShieldCheck, Pencil,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';

type SubmissionKind = 'hkp' | 'diagnostic-case' | 'template' | 'patch-bundle';
type SubmissionStatus = 'pending' | 'in-review' | 'approved' | 'rejected' | 'withdrawn';

interface Submission {
  id: string;
  submission_kind: SubmissionKind;
  source_id: string;
  source_family_id: string | null;
  submitted_by: string;
  submission_summary: string;
  submission_notes: string | null;
  content_hash: string;
  status: SubmissionStatus;
  reviewed_by: string | null;
  review_started_at: string | null;
  review_decision_at: string | null;
  review_decision: 'approved' | 'rejected' | null;
  review_notes: string | null;
  submitted_at: string;
  security_review_required: boolean;
  security_reviewed_by: string | null;
  security_reviewed_at: string | null;
}

const KIND_STYLES: Record<SubmissionKind, string> = {
  hkp: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'diagnostic-case': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  template: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  'patch-bundle': 'bg-amber-500/10 text-amber-400 border-amber-500/30',
};

const STATUS_STYLES: Record<SubmissionStatus, string> = {
  pending: 'bg-adv-card text-adv-gray border-adv-gray/30',
  'in-review': 'bg-adv-teal/10 text-adv-teal border-adv-teal/30',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
  withdrawn: 'bg-adv-card text-adv-gray border-adv-gray/30',
};

export default function HardwareReviewQueuePage() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'queue' | 'mine'>('queue');
  const [list, setList] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<Submission | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = tab === 'queue' ? '/hardware/review-queue' : '/hardware/review-queue/mine';
      const res = await fetchWithAuth(`${API_BASE}${url}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load');
      setList(json.submissions);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [tab]);

  const claim = async (id: string) => {
    setBusy(`claim-${id}`);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/review-queue/${id}/claim`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Claim failed');
      await load();
      setActive(json.submission);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const recordSecurityReview = async (id: string) => {
    setBusy(`sec-${id}`);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/review-queue/${id}/security-review`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Security review failed');
      await load();
      setActive(json.submission);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    if (decision === 'reject' && (!reviewNotes || reviewNotes.trim().length < 10)) {
      setError('Reject requires a reason of at least 10 characters');
      return;
    }
    setBusy(`${decision}-${id}`);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/review-queue/${id}/${decision}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: reviewNotes.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? `${decision} failed`);
      await load();
      setActive(null);
      setReviewNotes('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  const [withdrawTargetId, setWithdrawTargetId] = useState<string | null>(null);

  const withdraw = async (id: string) => {
    setBusy(`withdraw-${id}`);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/review-queue/${id}/withdraw`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Withdraw failed');
      await load();
      setActive(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => nav('/hardware')} className="text-adv-teal flex items-center gap-1 mb-3 text-sm hover:underline">
          <ArrowLeft className="w-4 h-4" />Hardware Build
        </button>

        <header className="mb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-adv-teal" />
            Community Review Queue
          </h1>
          <p className="text-sm text-adv-gray mt-1 max-w-2xl">
            HKPs, diagnostic cases, and templates submitted by the community. Reviewers approve to promote them to authoritative; rejections require an explicit reason. HKP submissions need a separate security review before approval.
          </p>
        </header>

        {error && (
          <div className="mb-3 p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start justify-between gap-2">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</span>
            <button onClick={() => setError(null)} className="hover:underline">dismiss</button>
          </div>
        )}

        <nav className="flex border-b border-adv-gray/20 mb-3">
          <button onClick={() => setTab('queue')} className={`px-4 py-2 text-sm border-b-2 ${tab === 'queue' ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'}`}>
            Pending queue
          </button>
          <button onClick={() => setTab('mine')} className={`px-4 py-2 text-sm border-b-2 ${tab === 'mine' ? 'border-adv-teal text-adv-teal' : 'border-transparent text-adv-gray hover:text-adv-off-white'}`}>
            My submissions
          </button>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ul className="lg:col-span-1 space-y-2">
            {loading ? (
              <li className="text-center text-adv-gray py-6"><Loader2 className="w-5 h-5 animate-spin inline" /></li>
            ) : list.length === 0 ? (
              <li className="text-center text-adv-gray py-6 border border-dashed border-adv-gray/30 rounded text-sm">
                {tab === 'queue' ? 'No pending submissions.' : 'You have no submissions yet.'}
              </li>
            ) : list.map(s => (
              <li key={s.id}>
                <button
                  onClick={() => { setActive(s); setReviewNotes(''); }}
                  className={`w-full text-left p-3 rounded border ${active?.id === s.id ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-gray/20 bg-adv-card hover:border-adv-teal/40'}`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${KIND_STYLES[s.submission_kind]}`}>{s.submission_kind}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                  </div>
                  <div className="text-sm font-medium line-clamp-2">{s.submission_summary}</div>
                  <div className="text-[10px] text-adv-gray mt-1">
                    {s.source_family_id ? `${s.source_family_id} · ` : ''}<code>{s.source_id}</code>
                  </div>
                  <div className="text-[10px] text-adv-gray">
                    by {s.submitted_by} · {new Date(s.submitted_at).toLocaleDateString()}
                  </div>
                  {s.security_review_required && !s.security_reviewed_at && (
                    <div className="mt-1 text-[10px] text-amber-400 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />security review required
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <main className="lg:col-span-2">
            {!active ? (
              <div className="p-6 rounded border border-dashed border-adv-gray/30 text-center text-sm text-adv-gray">
                Select a submission to review or withdraw.
              </div>
            ) : (
              <ActivePanel
                submission={active}
                tab={tab}
                busy={busy}
                reviewNotes={reviewNotes}
                onNotesChange={setReviewNotes}
                onClaim={() => claim(active.id)}
                onSecurityReview={() => recordSecurityReview(active.id)}
                onApprove={() => decide(active.id, 'approve')}
                onReject={() => decide(active.id, 'reject')}
                onWithdraw={() => setWithdrawTargetId(active.id)}
              />
            )}
          </main>
        </div>

        <ConfirmModal
          open={withdrawTargetId !== null}
          title="Withdraw submission?"
          description="The submission moves to status 'withdrawn' and won't appear in the reviewer queue. The history is retained."
          severity="warning"
          confirmLabel="Withdraw"
          onConfirm={async () => {
            const id = withdrawTargetId;
            setWithdrawTargetId(null);
            if (id) await withdraw(id);
          }}
          onCancel={() => setWithdrawTargetId(null)}
        />
      </div>
    </div>
  );
}

function ActivePanel({
  submission, tab, busy, reviewNotes, onNotesChange,
  onClaim, onSecurityReview, onApprove, onReject, onWithdraw,
}: {
  submission: Submission;
  tab: 'queue' | 'mine';
  busy: string | null;
  reviewNotes: string;
  onNotesChange: (s: string) => void;
  onClaim: () => void;
  onSecurityReview: () => void;
  onApprove: () => void;
  onReject: () => void;
  onWithdraw: () => void;
}) {
  const decided = submission.status === 'approved' || submission.status === 'rejected' || submission.status === 'withdrawn';
  return (
    <section className="border border-adv-gray/20 rounded">
      <header className="border-b border-adv-gray/20 p-3 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded border ${KIND_STYLES[submission.submission_kind]}`}>{submission.submission_kind}</span>
          <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_STYLES[submission.status]}`}>{submission.status}</span>
          {submission.security_review_required && (
            <span className={`text-xs px-2 py-0.5 rounded border ${submission.security_reviewed_at ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'} flex items-center gap-1`}>
              {submission.security_reviewed_at ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
              security {submission.security_reviewed_at ? 'reviewed' : 'pending'}
            </span>
          )}
        </div>
        <div className="text-xs text-adv-gray">submission <code>{submission.id.slice(0, 12)}…</code></div>
      </header>

      <div className="p-3 space-y-3 text-sm">
        <section>
          <h3 className="text-xs uppercase tracking-wide text-adv-gray">Source artefact</h3>
          <p>kind <code>{submission.submission_kind}</code> · id <code>{submission.source_id}</code>{submission.source_family_id ? ` · family ${submission.source_family_id}` : ''}</p>
          <p className="text-xs text-adv-gray font-mono">content hash: {submission.content_hash.slice(0, 32)}…</p>
        </section>

        <section>
          <h3 className="text-xs uppercase tracking-wide text-adv-gray">Submitter summary</h3>
          <p>{submission.submission_summary}</p>
          {submission.submission_notes && <p className="text-xs text-adv-gray mt-1 whitespace-pre-wrap">{submission.submission_notes}</p>}
          <p className="text-xs text-adv-gray mt-1">by {submission.submitted_by} on {new Date(submission.submitted_at).toLocaleString()}</p>
        </section>

        {submission.review_decision && (
          <section className={`p-2 rounded border ${submission.review_decision === 'approved' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <h3 className="text-xs uppercase tracking-wide text-adv-gray">Decision</h3>
            <p className="text-sm">
              <strong>{submission.review_decision}</strong> by {submission.reviewed_by} on {submission.review_decision_at && new Date(submission.review_decision_at).toLocaleString()}
            </p>
            {submission.review_notes && <p className="text-xs mt-1 whitespace-pre-wrap">{submission.review_notes}</p>}
          </section>
        )}

        {tab === 'queue' && !decided && (
          <section className="space-y-2 pt-3 border-t border-adv-gray/20">
            <h3 className="text-xs uppercase tracking-wide text-adv-gray">Review actions</h3>

            {submission.status === 'pending' && (
              <button onClick={onClaim} disabled={busy === `claim-${submission.id}`} className="text-xs px-3 py-1.5 rounded border border-adv-teal/40 text-adv-teal hover:bg-adv-teal/10 disabled:opacity-50 flex items-center gap-1">
                {busy === `claim-${submission.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />}Claim for review
              </button>
            )}

            {submission.security_review_required && !submission.security_reviewed_at && (
              <div className="p-2 rounded border border-amber-500/30 bg-amber-500/5 text-xs text-amber-200">
                This is an HKP submission. A separate security review must be recorded before approval.
                <button onClick={onSecurityReview} disabled={busy === `sec-${submission.id}`} className="mt-2 w-full px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-300 flex items-center justify-center gap-1 disabled:opacity-50">
                  {busy === `sec-${submission.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}Record security review (as me)
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs text-adv-gray mb-1">Review notes (mandatory for rejection, optional for approval)</label>
              <textarea value={reviewNotes} onChange={e => onNotesChange(e.target.value)} rows={3} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onApprove}
                disabled={busy === `approve-${submission.id}` || (submission.security_review_required && !submission.security_reviewed_at)}
                className="flex-1 px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {busy === `approve-${submission.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Approve + promote
              </button>
              <button
                onClick={onReject}
                disabled={busy === `reject-${submission.id}` || reviewNotes.trim().length < 10}
                className="flex-1 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {busy === `reject-${submission.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}Reject
              </button>
            </div>
          </section>
        )}

        {tab === 'mine' && (submission.status === 'pending' || submission.status === 'in-review') && (
          <section className="pt-3 border-t border-adv-gray/20">
            <button onClick={onWithdraw} disabled={busy === `withdraw-${submission.id}`} className="text-xs px-3 py-1.5 rounded border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 disabled:opacity-50 flex items-center gap-1">
              {busy === `withdraw-${submission.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}Withdraw submission
            </button>
          </section>
        )}
      </div>

      {/* keep these icon imports referenced */}
      <span className="hidden">{(() => { void Sparkles; void Inbox; return null; })()}</span>
    </section>
  );
}
