/**
 * PathfinderCalibrationPage — search-mode inference calibration view.
 *
 * Shows per-mode accuracy: how often the system inferred the right
 * search mode (local / knowledge / news / etc) vs how often the user
 * had to correct it. Surfaces the inference engine's confusion matrix
 * so improvements can be targeted.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Compass, Target, AlertTriangle } from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

interface ModeCalibration {
  inferred_mode: string;
  total_inferences: number;
  user_accepted: number;
  user_corrected: number;
  accuracy_pct: number | null;
  most_common_correction: string | null;
  last_updated: string;
}

interface QualityFeedback {
  id: string;
  search_id: string;
  rated_at: string;
  rating: 'helpful' | 'partial' | 'not_helpful' | 'misleading';
  feedback_kind: string | null;
  feedback_text: string | null;
}

const RATING_META: Record<QualityFeedback['rating'], { label: string; classes: string }> = {
  helpful:     { label: 'Helpful',     classes: 'text-adv-green' },
  partial:     { label: 'Partial',     classes: 'text-adv-blue' },
  not_helpful: { label: 'Not helpful', classes: 'text-adv-gold' },
  misleading:  { label: 'Misleading',  classes: 'text-adv-red' },
};

export default function PathfinderCalibrationPage() {
  const [calibration, setCalibration] = useState<ModeCalibration[]>([]);
  const [feedback, setFeedback] = useState<QualityFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/pathfinder/calibration', { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ modes: [] })),
      fetch('/api/pathfinder/feedback', { headers: getAuthHeader() }).then(r => r.json()).catch(() => ({ feedback: [] })),
    ])
      .then(([c, f]: [{ modes?: ModeCalibration[] }, { feedback?: QualityFeedback[] }]) => {
        setCalibration(c.modes ?? []);
        setFeedback(f.feedback ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load calibration'))
      .finally(() => setLoading(false));
  }, []);

  const overallAccuracy = useMemo(() => {
    if (calibration.length === 0) return null;
    const totalInferences = calibration.reduce((sum, m) => sum + m.total_inferences, 0);
    const totalAccepted = calibration.reduce((sum, m) => sum + m.user_accepted, 0);
    if (totalInferences === 0) return null;
    return (totalAccepted / totalInferences) * 100;
  }, [calibration]);

  const recentRatings = useMemo(() => {
    return [...feedback]
      .sort((a, b) => new Date(b.rated_at).getTime() - new Date(a.rated_at).getTime())
      .slice(0, 20);
  }, [feedback]);

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/pathfinder" className="text-adv-gray hover:text-adv-teal" aria-label="Back"><ChevronLeft size={20} /></Link>
          <Target className="text-adv-teal" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Calibration</h1>
            <p className="text-adv-gray text-sm">Mode-inference accuracy + result-quality feedback. Drives the inference engine's learning loop.</p>
          </div>
        </div>

        {error && <div className="bg-adv-red/10 text-adv-red p-3 rounded mb-3">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-adv-card rounded-lg p-4">
            <div className="text-xs text-adv-gray">Overall mode accuracy</div>
            <div className="text-3xl font-bold text-adv-teal mt-1">
              {overallAccuracy != null ? `${overallAccuracy.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="bg-adv-card rounded-lg p-4">
            <div className="text-xs text-adv-gray">Modes tracked</div>
            <div className="text-3xl font-bold text-adv-off-white mt-1">{calibration.length}</div>
          </div>
          <div className="bg-adv-card rounded-lg p-4">
            <div className="text-xs text-adv-gray">Recent feedback</div>
            <div className="text-3xl font-bold text-adv-off-white mt-1">{feedback.length}</div>
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-2">Per-mode accuracy</h2>
        {loading ? (
          <div className="text-center text-adv-gray py-12">Loading…</div>
        ) : calibration.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-6 text-center text-adv-gray text-sm mb-6">
            <Compass className="mx-auto mb-2 text-adv-gray/40" size={32} />
            No calibration data yet. Run more searches and (occasionally) correct the inferred mode to populate.
          </div>
        ) : (
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-adv-card text-adv-gray">
                <tr>
                  <th className="text-left p-2">Mode</th>
                  <th className="text-right p-2">Inferences</th>
                  <th className="text-right p-2">Accepted</th>
                  <th className="text-right p-2">Corrected</th>
                  <th className="text-right p-2">Accuracy</th>
                  <th className="text-left p-2">Most-common correction</th>
                </tr>
              </thead>
              <tbody>
                {calibration.map(m => (
                  <tr key={m.inferred_mode} className="border-b border-adv-card hover:bg-adv-card/40">
                    <td className="p-2"><code className="text-adv-teal">{m.inferred_mode}</code></td>
                    <td className="p-2 text-right">{m.total_inferences}</td>
                    <td className="p-2 text-right text-adv-green">{m.user_accepted}</td>
                    <td className="p-2 text-right text-adv-gold">{m.user_corrected}</td>
                    <td className="p-2 text-right font-medium">
                      {m.accuracy_pct != null ? `${m.accuracy_pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="p-2 text-xs text-adv-gray">
                      {m.most_common_correction ? (
                        <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-adv-gold" />→ <code>{m.most_common_correction}</code></span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="text-lg font-semibold mb-2">Recent quality feedback</h2>
        {recentRatings.length === 0 ? (
          <div className="bg-adv-card rounded-lg p-6 text-center text-adv-gray text-sm">
            No quality ratings yet. Use thumbs-up / thumbs-down on a search result to provide feedback.
          </div>
        ) : (
          <ul className="space-y-2">
            {recentRatings.map(f => {
              const m = RATING_META[f.rating];
              return (
                <li key={f.id} className="bg-adv-card rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${m.classes}`}>{m.label}</span>
                    {f.feedback_kind && <code className="text-xs text-adv-gray">{f.feedback_kind}</code>}
                    <span className="text-xs text-adv-gray">{new Date(f.rated_at).toLocaleString()}</span>
                  </div>
                  {f.feedback_text && <p className="text-xs text-adv-gray">{f.feedback_text}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
