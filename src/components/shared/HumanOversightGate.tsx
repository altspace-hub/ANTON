/**
 * HumanOversightGate.tsx
 * EUAI-02: Mandatory human oversight sign-off for high-risk FCP modules.
 *
 * Shows a review banner under the output of gap-analysis, sanctions-advisory,
 * and investigation-support. Captures reviewer name, role, verdict, and notes.
 * Records the attestation in the DB, bound to the answer on screen (Wave 3):
 * the POST names the assistant message; the server verifies it and hashes the
 * prompt and output itself, and the badge shows what was signed. A sign-off
 * on an earlier answer does not cover a later one — the form comes back.
 *
 * Whether an unsigned run can still be exported is the server's decision
 * (services/oversight-status.ts + the oversight_blocks_export setting); this
 * component only warns and records.
 */

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldAlert, ShieldX, ClipboardCheck, ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE, fetchWithAuth } from '@/lib/api';
import { useSessionMetaStore } from '@/stores/useSessionStore';
import { useStreamStore } from '@/stores/useStreamStore';

/**
 * Client mirror of OVERSIGHT_GATED_MODULES in server/services/oversight-status.ts.
 * The client build cannot import from server/, so the two lists are kept in
 * step by tests/services/oversight-status.test.ts (which also checks the mount
 * condition in ModulePage.tsx). Change all three together.
 */
export const OVERSIGHT_GATED_MODULES = [
  'gap-analysis',
  'sanctions-advisory',
  'investigation-support',
] as const;

export interface OversightReview {
  id: number;
  session_id: string;
  module_id: string;
  reviewer_name: string;
  reviewer_role: string | null;
  verdict: 'approved' | 'requires_amendment' | 'rejected';
  notes: string | null;
  /** The answer the sign-off is bound to (null only for rows older than migration 273). */
  message_id: string | null;
  prompt_sha256: string | null;
  output_sha256: string | null;
  evidence_pack_id: string | null;
  created_at: string;
}

interface HumanOversightGateProps {
  sessionId: string;
  moduleId: string;
  /**
   * The assistant message to sign against. When omitted the gate uses the
   * session's last assistant message (the stream store mints it with the id
   * the server persisted, so live and reloaded sessions agree).
   */
  messageId?: string | null;
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

/** First 12 hex chars — enough to compare by eye; the full value is in the title attribute. */
function short(hash: string | null): string {
  return hash ? hash.slice(0, 12) : '—';
}

function ReviewBadge({ review, superseded }: { review: OversightReview; superseded: boolean }) {
  const cfg = VERDICT_CONFIG[review.verdict];
  const Icon = cfg.icon;
  const badgeClass = superseded ? 'border-border bg-adv-dark/40 text-adv-gray' : cfg.className;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${badgeClass} mt-2`}>
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${superseded ? 'text-adv-gray' : cfg.iconClass}`} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{cfg.label}</span>
        <span className="ml-2 text-adv-gray">
          by {review.reviewer_name}{review.reviewer_role ? ` (${review.reviewer_role})` : ''} · {new Date(review.created_at).toLocaleDateString()}
        </span>
        {review.notes && (
          <p className="mt-0.5 text-adv-gray">{review.notes}</p>
        )}
        {review.message_id ? (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-adv-gray" data-testid="oversight-binding">
            <Link2 className="h-3 w-3 flex-shrink-0" />
            <span>
              Signed against run <code className="font-mono" title={review.message_id}>{short(review.message_id)}</code>
            </span>
            <span>· prompt <code className="font-mono" title={review.prompt_sha256 ?? 'no run record for this answer'}>{short(review.prompt_sha256)}</code></span>
            <span>· output <code className="font-mono" title={review.output_sha256 ?? undefined}>{short(review.output_sha256)}</code></span>
            {review.evidence_pack_id && <span>· pack <code className="font-mono">{review.evidence_pack_id}</code></span>}
          </p>
        ) : (
          <p className="mt-1 text-adv-gray">Recorded before sign-offs were bound to a run — covers the session, not a specific answer.</p>
        )}
        {superseded && (
          <p className="mt-1 text-adv-gold">A newer answer has been produced since this sign-off. It needs its own review.</p>
        )}
      </div>
    </div>
  );
}

export default function HumanOversightGate({ sessionId, moduleId, messageId: messageIdProp, onReviewed }: HumanOversightGateProps) {
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

  // The answer on screen: prop → last assistant message of the session → the
  // id the server announced for the live run. ModulePage passes no prop today.
  const messages = useSessionMetaStore((s) => s.messages);
  const frameMessageId = useStreamStore((s) => s.lastContextUsed?.assistantMessageId ?? null);
  const lastAssistantId = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant' && m.sessionId === sessionId)?.id ?? null,
    [messages, sessionId],
  );
  const messageId = messageIdProp ?? lastAssistantId ?? frameMessageId;

  const gated = (OVERSIGHT_GATED_MODULES as readonly string[]).includes(moduleId);

  useEffect(() => {
    if (!sessionId || !gated) return;
    let cancelled = false;
    setLoading(true);
    fetchWithAuth(`${API_BASE}/oversight/sessions/${encodeURIComponent(sessionId)}/review`)
      .then((r) => (r.ok ? r.json() : { review: null }))
      .then((data: { review: OversightReview | null }) => {
        if (cancelled) return;
        setReview(data.review);
        if (data.review) onReviewed?.(data.review.verdict);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, gated, onReviewed]);

  const handleSubmit = async () => {
    if (!reviewerName.trim()) {
      setError('Reviewer name is required');
      return;
    }
    if (!messageId) {
      setError('No answer to sign against yet — wait for the run to finish, or reload the session.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/oversight/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          module_id: moduleId,
          messageId,
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

  if (!gated || loading) return null;

  // A review covers the answer on screen when it is bound to it (or predates
  // binding). Bound to an older answer = superseded: show it, and ask again.
  const superseded = !!review && !!review.message_id && !!messageId && review.message_id !== messageId;

  if (review && !superseded) {
    return <ReviewBadge review={review} superseded={false} />;
  }

  return (
    <>
      {review && superseded && <ReviewBadge review={review} superseded />}
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
              {messageId && (
                <>
                  {' '}The sign-off is bound to answer <code className="font-mono" title={messageId}>{short(messageId)}</code>; the server records the prompt and output hashes.
                </>
              )}
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
              disabled={submitting || !reviewerName.trim() || !messageId}
              className="flex items-center gap-1.5 rounded-md bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {submitting ? 'Recording sign-off...' : 'Record sign-off'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
