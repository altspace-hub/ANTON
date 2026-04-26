/**
 * LearningEvidencePage — guardian-visible feed of evidence per student.
 * Teacher-editable; guardian-readable.
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.3.
 * Backed by table `learning_evidence_log` (mig 168).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, BookOpen, Eye, EyeOff } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

type EvidenceType = 'work-sample' | 'quiz-result' | 'observation' | 'portfolio-item';

interface EvidenceRow {
  id: string;
  student_user_id: string;
  evidence_type: EvidenceType;
  subject: string | null;
  learning_objective_id: string | null;
  ai_assessment_summary: string | null;
  guardian_visible: boolean;
  teacher_notes: string | null;
  study_pack_bundle_ref: string | null;
  attachments: unknown;
  created_at: string;
}

const TYPE_LABEL: Record<EvidenceType, string> = {
  'work-sample': 'Work sample',
  'quiz-result': 'Quiz result',
  observation: 'Observation',
  'portfolio-item': 'Portfolio item',
};

export default function LearningEvidencePage() {
  const [rows, setRows] = useState<EvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EvidenceType | 'all'>('all');
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/school/evidence', { headers: getAuthHeader() })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { entries: EvidenceRow[] }) => {
        if (cancelled) return;
        setRows(data.entries ?? []);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = rows
    .filter(r => filter === 'all' || r.evidence_type === filter)
    .filter(r => showHidden || r.guardian_visible);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/school" className="text-adv-gray hover:text-adv-teal" aria-label="Back">
            <ChevronLeft size={20} />
          </Link>
          <BookOpen className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Learning Evidence Log</h1>
            <p className="text-adv-gray text-sm">
              Guardian-visible feed of work samples, quiz results, observations, and portfolio items.
              Teacher-editable; never auto-published without consent.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'work-sample', 'quiz-result', 'observation', 'portfolio-item'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded text-sm ${
                filter === t ? 'bg-adv-teal/20 text-adv-teal' : 'bg-adv-card text-adv-gray'
              }`}
            >
              {t === 'all' ? 'All' : TYPE_LABEL[t]}
            </button>
          ))}
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="ml-auto inline-flex items-center gap-1 px-3 py-1 rounded text-sm bg-adv-card text-adv-gray"
          >
            {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {showHidden ? 'Showing all' : 'Guardian-visible only'}
          </button>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}
        {loading ? (
          <div className="text-adv-gray text-center py-12">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-8 text-adv-gray text-center">
            No evidence entries yet. Teachers add evidence via student session detail or via the
            <code className="text-adv-off-white"> POST /api/school/evidence </code> endpoint.
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map(r => (
              <li key={r.id} className="bg-adv-card rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 text-sm">
                      <span className="px-2 py-0.5 rounded bg-adv-teal/20 text-adv-teal text-xs">
                        {TYPE_LABEL[r.evidence_type]}
                      </span>
                      {r.subject && <span className="text-adv-gray">{r.subject}</span>}
                      {!r.guardian_visible && (
                        <span className="text-xs text-adv-gold">guardian-hidden</span>
                      )}
                    </div>
                    {r.ai_assessment_summary && (
                      <p className="text-adv-off-white mb-1">{r.ai_assessment_summary}</p>
                    )}
                    {r.teacher_notes && (
                      <p className="text-sm text-adv-gray italic">Teacher: {r.teacher_notes}</p>
                    )}
                    {r.learning_objective_id && (
                      <p className="text-xs text-adv-gray mt-1">
                        Objective: <code className="text-adv-off-white">{r.learning_objective_id}</code>
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-adv-gray whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 text-xs text-adv-gray">
          Backend table: <code>learning_evidence_log</code> (mig 168). Curriculum mapping:
          <Link to="/school/curriculum" className="text-adv-teal hover:underline ml-1">
            Curriculum Registry →
          </Link>
        </div>
      </div>
    </div>
  );
}
