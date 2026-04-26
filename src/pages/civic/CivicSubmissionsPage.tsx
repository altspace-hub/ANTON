/**
 * CivicSubmissionsPage — track submitted government applications.
 * Phase B.1 build-out. Reads civic_submissions (mig 092) across all engagements.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Send, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface Submission {
  id: string;
  engagement_id: string;
  process_id: string;
  process_name: string;
  authority: string | null;
  jurisdiction: string | null;
  submitted_at: string;
  channel: string | null;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';
  reference: string | null;
}

const STATUS_META: Record<Submission['status'], { label: string; className: string; icon: JSX.Element }> = {
  pending:    { label: 'Pending',     className: 'bg-adv-gray/20 text-adv-gray',   icon: <Clock size={14} /> },
  in_review:  { label: 'In review',   className: 'bg-adv-gold/20 text-adv-gold',   icon: <Clock size={14} /> },
  approved:   { label: 'Approved',    className: 'bg-adv-green/20 text-adv-green', icon: <CheckCircle2 size={14} /> },
  rejected:   { label: 'Rejected',    className: 'bg-adv-red/20 text-adv-red',     icon: <XCircle size={14} /> },
  withdrawn:  { label: 'Withdrawn',   className: 'bg-adv-gray/20 text-adv-gray',   icon: <XCircle size={14} /> },
};

export default function CivicSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState<Submission['status'] | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/civic/submissions', { headers: getAuthHeader() })
      .then(r => r.json())
      .then((data: { submissions?: Submission[] }) => setSubmissions(data.submissions ?? []))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load submissions'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = submissions.filter(s => filter === 'all' || s.status === filter);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/civic" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Send className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Submissions</h1>
            <p className="text-adv-gray text-sm">Track every application you've submitted to a government authority across all your engagements.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'pending', 'in_review', 'approved', 'rejected', 'withdrawn'] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded text-sm ${filter === t ? 'bg-adv-teal/20 text-adv-teal' : 'bg-adv-card text-adv-gray'}`}>
              {t === 'all' ? 'All' : STATUS_META[t].label}
            </button>
          ))}
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-center text-adv-gray">
            No submissions match. Submissions are created automatically when you complete a process within an engagement.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(s => {
              const meta = STATUS_META[s.status];
              return (
                <li key={s.id} className="bg-adv-card rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${meta.className}`}>
                          {meta.icon} {meta.label}
                        </span>
                        {s.jurisdiction && <code className="text-adv-teal text-xs">{s.jurisdiction}</code>}
                        {s.channel && <span className="text-xs text-adv-gray">via {s.channel}</span>}
                      </div>
                      <div className="font-medium truncate">{s.process_name}</div>
                      {s.authority && <div className="text-sm text-adv-gray">{s.authority}</div>}
                      {s.reference && <div className="text-xs text-adv-gray mt-1">Ref: <code>{s.reference}</code></div>}
                    </div>
                    <div className="text-xs text-adv-gray whitespace-nowrap">
                      {new Date(s.submitted_at).toLocaleDateString()}
                      <Link to={`/civic/engagement/${s.engagement_id}`} className="block text-adv-teal hover:underline mt-1">
                        engagement →
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
