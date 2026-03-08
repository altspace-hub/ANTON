/**
 * HumanOversightGate.tsx
 * EUAI-02: Mandatory human oversight sign-off for high-risk FCP modules.
 *
 * Shows a review banner under the output of gap-analysis, sanctions-advisory,
 * and investigation-support. Captures reviewer name, role, verdict, and notes.
 * Records the attestation in the DB. Does not technically block export (users
 * are adults) but visually gates the ExportBar with a warning until signed.
 */

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, ClipboardCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface OversightReview {
  id: number;
  session_id: string;
  module_id: string;
  reviewer_name: string;
  reviewer_role: string | null;
  verdict: 'approved' | 'requires_amendment' | 'rejected';
  notes: string | null;
  created_at: string;
}

interface HumanOversightGateProps {
  sessionId: string;
  moduleId: string;
  /** Called after a review is recorded, passing the verdict */
  onReviewed?: (verdict: OversightReview['verdict']) => void;
}

const VERDICT_CONFIG = {
  approved: {
    label: 'Approved for use',
    icon: ShieldCheck,
    className: 'border-adv-green/40 bg-adv-green/10 text-adv-green',
    iconClass: 'text-adv-green',
  },
  requires_amendment: {
    label: 'Requires amendment',
    icon: ShieldAlert,
    className: 'border-adv-gold/40 bg-adv-gold/10 text-adv-gold',
    iconClass: 'text-adv-gold',
  },
  rejected: {
    label: 'Rejected — do not use',
    icon: ShieldX,
    className: 'border-adv-red/40 bg-adv-red/10 text-adv-red',
    iconClass: 'text-adv-red',
  },
} as const;

export default function HumanOversightGate({ sessionId, moduleId, onReviewed }: HumanOversightGateProps) {
  const { t } = useTranslation();
  const [review, setReview] = useState<OversightReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerRole, setReviewerRole] = useState('');
  const [verdict, setVerdict] = useState<OversightReview['verdict']>('approved');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/oversight/sessions/${sessionId}/review`)
      .then((r) => r.json())
      .then((data: { review: OversightReview | null }) => {
        setReview(data.review);
        if (data.review) onReviewed?.(data.review.verdict);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId, onReviewed]);

  const handleSubmit = async () => {
    if (!reviewerName.trim()) {
      setError('Reviewer name is required');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/oversight/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          module_id: moduleId,
          reviewer_name: reviewerName.trim(),
          reviewer_role: reviewerRole.trim() || undefined,
          verdict,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json() as { error?: string };
        throw new Error(e.error ?? 'Failed to record review');
      }
      const data = await res.json() as { review: OversightReview };
      setReview(data.review);
      setExpanded(false);
      onReviewed?.(data.review.verdict);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  // If already reviewed — show compact badge
  if (review) {
    const cfg = VERDICT_CONFIG[review.verdict];
    const Icon = cfg.icon;
    return (
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${cfg.className} mt-2`}>
        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${cfg.iconClass}`} />
        <div className="flex-1 min-w-0">
          <span className="font-medium">{cfg.label}</span>
          <span className="ml-2 text-adv-gray">
            by {review.reviewer_name}{review.reviewer_role ? ` (${review.reviewer_role})` : ''} · {new Date(review.created_at).toLocaleDateString()}
          </span>
          {review.notes && (
            <p className="mt-0.5 text-adv-gray">{review.notes}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-adv-gold/40 bg-adv-gold/5">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ShieldAlert className="h-4 w-4 flex-shrink-0 text-adv-gold" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-adv-gold">
            {t('oversight.reviewRequired', 'Professional Review Required')}
          </span>
          <p className="text-xs text-adv-gray mt-0.5">
            {t('oversight.reviewRequiredDesc', 'This AI analysis requires professional sign-off before use in compliance decisions. EU AI Act Art. 14.')}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-adv-gray flex-shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-adv-gray flex-shrink-0" />
        }
      </button>

      {/* Expandable review form */}
      {expanded && (
        <div className="border-t border-adv-gold/20 px-3 pb-3 pt-2.5 space-y-3">
          <p className="text-xs text-adv-gray leading-relaxed">
            By signing off, you confirm you have reviewed this AI-generated analysis and accept professional responsibility for any compliance decisions made based on it.
          </p>

          {/* Reviewer details */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-adv-gray mb-1">
                Your name <span className="text-adv-red">*</span>
              </label>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Full name"
                maxLength={200}
                className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-adv-gray mb-1">Your role</label>
              <input
                type="text"
                value={reviewerRole}
                onChange={(e) => setReviewerRole(e.target.value)}
                placeholder="e.g. Chief Compliance Officer"
                maxLength={200}
                className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
              />
            </div>
          </div>

          {/* Verdict selector */}
          <div>
            <label className="block text-xs text-adv-gray mb-1">Verdict</label>
            <div className="flex gap-2">
              {(['approved', 'requires_amendment', 'rejected'] as const).map((v) => {
                const cfg = VERDICT_CONFIG[v];
                const Icon = cfg.icon;
                const selected = verdict === v;
                return (
                  <button
                    key={v}
                    onClick={() => setVerdict(v)}
                    className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition-colors ${
                      selected
                        ? cfg.className
                        : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-adv-gray mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any observations, caveats, or conditions on this analysis..."
              maxLength={2000}
              rows={2}
              className="w-full rounded border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-adv-red">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !reviewerName.trim()}
            className="flex items-center gap-1.5 rounded-md bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            {submitting ? 'Recording sign-off...' : 'Record sign-off'}
          </button>
        </div>
      )}
    </div>
  );
}
