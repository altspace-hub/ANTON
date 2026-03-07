import { useState, useEffect, useCallback } from 'react';
import {
  Users, Clock, CheckCircle, XCircle, MessageSquare, UserCheck,
  Plus, AlertTriangle, ChevronDown, ChevronUp, Send,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface StepConfig {
  id: string;
  label: string;
  type?: string;
}

interface StepAssignment {
  id: string;
  execution_id: string;
  workflow_id: string;
  step_index: number;
  assigned_to: string;
  assigned_by: string;
  assigned_at: string;
  due_at: string | null;
  sla_hours: number | null;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'reassigned';
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

interface ReviewRecord {
  id: string;
  reviewer: string;
  review_status: 'pending' | 'approved' | 'rejected' | 'abstained';
  review_comment: string | null;
  reviewed_at: string | null;
  required_for_consensus: number;
}

interface ConsensusResult {
  reviews: ReviewRecord[];
  totalReviewers: number;
  responded: number;
  approved: number;
  rejected: number;
  consensus: 'pending' | 'approved' | 'rejected';
  canProceed: boolean;
}

interface CanvasComment {
  id: string;
  execution_id: string;
  step_index: number | null;
  author: string;
  content: string;
  comment_type: 'comment' | 'suggestion' | 'concern' | 'approval';
  resolved: number;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface CollaborativeCanvasProps {
  executionId: string;
  workflowId: string;
  steps: StepConfig[];
  currentStepIndex: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDueDate(dueAt: string | null): { label: string; urgent: boolean } {
  if (!dueAt) return { label: 'No deadline', urgent: false };
  const diff = new Date(dueAt).getTime() - Date.now();
  const hours = diff / 3600000;
  if (hours < 0) return { label: 'Overdue', urgent: true };
  if (hours < 1) return { label: `${Math.round(hours * 60)}m left`, urgent: true };
  if (hours < 24) return { label: `${hours.toFixed(1)}h left`, urgent: hours < 4 };
  return { label: `${Math.ceil(hours / 24)}d left`, urgent: false };
}

function statusBadge(status: StepAssignment['status']) {
  const map: Record<StepAssignment['status'], string> = {
    pending:     'bg-adv-gray-med/20 text-adv-gray',
    in_progress: 'bg-adv-blue/20 text-adv-blue',
    completed:   'bg-adv-teal/20 text-adv-teal',
    overdue:     'bg-adv-red/20 text-adv-red',
    reassigned:  'bg-adv-gold/20 text-adv-gold',
  };
  return map[status] ?? 'bg-adv-gray-med/20 text-adv-gray';
}

function commentTypeBadge(type: CanvasComment['comment_type']) {
  const map: Record<CanvasComment['comment_type'], string> = {
    comment:    'bg-adv-blue/10 text-adv-blue',
    suggestion: 'bg-adv-teal/10 text-adv-teal',
    concern:    'bg-adv-gold/10 text-adv-gold',
    approval:   'bg-adv-green/10 text-adv-green',
  };
  return map[type] ?? 'bg-adv-blue/10 text-adv-blue';
}

function apiBase() {
  return '/api/canvas';
}

// ── Sub-components ───────────────────────────────────────────────

function AssignModal({
  executionId,
  workflowId,
  stepIndex,
  onClose,
  onSaved,
}: {
  executionId: string;
  workflowId: string;
  stepIndex: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assignTo, setAssignTo] = useState('');
  const [slaHours, setSlaHours] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!assignTo.trim()) { setError('Assignee is required'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${apiBase()}/executions/${executionId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepIndex,
          workflowId,
          assignedTo: assignTo.trim(),
          slaHours: slaHours ? parseFloat(slaHours) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-adv-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold text-adv-white">Assign Step {stepIndex + 1}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Assign to (name or email)</label>
            <input
              autoFocus
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              placeholder="e.g. jonas@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">SLA hours (optional)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={slaHours}
              onChange={(e) => setSlaHours(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              placeholder="e.g. 24"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              placeholder="Any special instructions..."
            />
          </div>
          {error && <p className="text-xs text-adv-red">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Assign'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function CollaborativeCanvas({
  executionId,
  workflowId,
  steps,
  currentStepIndex,
}: CollaborativeCanvasProps) {
  const [assignments, setAssignments] = useState<StepAssignment[]>([]);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [comments, setComments] = useState<CanvasComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState<number | null>(null);

  // Review panel state
  const [reviewerInput, setReviewerInput] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected' | 'abstained'>('approved');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [addingReviewer, setAddingReviewer] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Comment panel state
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<CanvasComment['comment_type']>('comment');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [assignRes, reviewRes, commentRes] = await Promise.all([
        fetch(`${apiBase()}/executions/${executionId}/assignments`),
        fetch(`${apiBase()}/executions/${executionId}/steps/${currentStepIndex}/reviews`),
        fetch(`${apiBase()}/executions/${executionId}/comments`),
      ]);
      if (assignRes.ok) setAssignments(await assignRes.json());
      if (reviewRes.ok) setConsensus(await reviewRes.json());
      if (commentRes.ok) setComments(await commentRes.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [executionId, currentStepIndex]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleAddReviewer() {
    if (!reviewerInput.trim()) return;
    setAddingReviewer(true);
    try {
      await fetch(`${apiBase()}/executions/${executionId}/steps/${currentStepIndex}/reviewers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer: reviewerInput.trim(), requiredForConsensus: true, workflowId }),
      });
      setReviewerInput('');
      await fetchAll();
    } finally {
      setAddingReviewer(false);
    }
  }

  async function handleSubmitReview() {
    if (!reviewerName.trim()) return;
    setSubmittingReview(true);
    try {
      await fetch(`${apiBase()}/executions/${executionId}/steps/${currentStepIndex}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer: reviewerName.trim(),
          status: reviewStatus,
          comment: reviewComment.trim() || undefined,
        }),
      });
      setReviewComment('');
      await fetchAll();
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await fetch(`${apiBase()}/executions/${executionId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment.trim(),
          author: commentAuthor.trim() || 'You',
          commentType,
          workflowId,
        }),
      });
      setNewComment('');
      await fetchAll();
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleResolveComment(id: string) {
    await fetch(`${apiBase()}/comments/${id}/resolve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolvedBy: commentAuthor.trim() || 'You' }),
    });
    await fetchAll();
  }

  async function handleUpdateAssignmentStatus(id: string, status: string) {
    await fetch(`${apiBase()}/assignments/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await fetchAll();
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-adv-dark-2 p-6 text-center text-sm text-adv-gray">
        Loading collaborative canvas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Step Assignment Panel ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-adv-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-white">Step Assignments</h3>
          <span className="text-xs text-adv-gray">{assignments.length} assigned</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 text-xs font-medium text-adv-gray">Step</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Assigned to</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">SLA</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Status</th>
                <th className="pb-2 text-xs font-medium text-adv-gray">Actions</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, idx) => {
                const assignment = assignments.find((a) => a.step_index === idx);
                const due = assignment ? formatDueDate(assignment.due_at) : null;
                return (
                  <tr
                    key={step.id}
                    className={`border-b border-border/50 transition-colors hover:bg-adv-dark-2/50 ${idx === currentStepIndex ? 'bg-adv-teal-soft/30' : ''}`}
                  >
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-medium ${idx === currentStepIndex ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                        {idx + 1}. {step.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {assignment ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-adv-teal-dim text-xs font-bold text-adv-teal">
                            {assignment.assigned_to.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-adv-off-white">{assignment.assigned_to}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-adv-gray italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {due ? (
                        <div className="flex items-center gap-1">
                          <Clock className={`h-3 w-3 ${due.urgent ? 'text-adv-red' : 'text-adv-gray'}`} />
                          <span className={`text-xs ${due.urgent ? 'text-adv-red font-medium' : 'text-adv-gray'}`}>
                            {due.label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-adv-gray">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      {assignment ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(assignment.status)}`}>
                          {assignment.status.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-adv-gray">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setAssignModal(idx)}
                          className="rounded px-2 py-0.5 text-xs text-adv-teal hover:bg-adv-teal-dim transition-colors"
                        >
                          {assignment ? 'Reassign' : 'Assign'}
                        </button>
                        {assignment && assignment.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateAssignmentStatus(assignment.id, 'in_progress')}
                            className="rounded px-2 py-0.5 text-xs text-adv-blue hover:bg-adv-blue/10 transition-colors"
                          >
                            Start
                          </button>
                        )}
                        {assignment && assignment.status === 'in_progress' && (
                          <button
                            onClick={() => handleUpdateAssignmentStatus(assignment.id, 'completed')}
                            className="rounded px-2 py-0.5 text-xs text-adv-green hover:bg-adv-green/10 transition-colors"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Parallel Review Panel ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-adv-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-white">
            Parallel Reviews — Step {currentStepIndex + 1}
          </h3>
          {consensus && (
            <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
              consensus.consensus === 'approved' ? 'bg-adv-teal/20 text-adv-teal' :
              consensus.consensus === 'rejected' ? 'bg-adv-red/20 text-adv-red' :
              'bg-adv-gold/20 text-adv-gold'
            }`}>
              {consensus.consensus === 'approved' ? 'Consensus: Approved' :
               consensus.consensus === 'rejected' ? 'Consensus: Rejected' : 'Awaiting consensus'}
            </span>
          )}
        </div>

        {/* Consensus meter */}
        {consensus && consensus.totalReviewers > 0 && (
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-adv-gray">
              <span>{consensus.responded}/{consensus.totalReviewers} responded</span>
              <span className="text-adv-teal">{consensus.approved} approved · <span className="text-adv-red">{consensus.rejected} rejected</span></span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-adv-dark-2">
              <div
                className="h-full rounded-full bg-adv-teal transition-all"
                style={{ width: `${consensus.totalReviewers ? (consensus.responded / consensus.totalReviewers) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Reviewer list */}
        {consensus && consensus.reviews.length > 0 && (
          <div className="mb-4 space-y-2">
            {consensus.reviews.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg bg-adv-dark-2 px-3 py-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-adv-teal-dim text-xs font-bold text-adv-teal">
                  {r.reviewer.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 text-xs text-adv-off-white">{r.reviewer}</span>
                {r.review_status === 'pending' ? (
                  <span className="text-xs text-adv-gold">Pending</span>
                ) : r.review_status === 'approved' ? (
                  <CheckCircle className="h-4 w-4 text-adv-teal" />
                ) : r.review_status === 'rejected' ? (
                  <XCircle className="h-4 w-4 text-adv-red" />
                ) : (
                  <span className="text-xs text-adv-gray">Abstained</span>
                )}
                {r.review_comment && (
                  <span className="max-w-[120px] truncate text-xs text-adv-gray" title={r.review_comment}>
                    "{r.review_comment}"
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add reviewer */}
        <div className="mb-3 flex gap-2">
          <input
            value={reviewerInput}
            onChange={(e) => setReviewerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddReviewer(); }}
            placeholder="Add reviewer (name or email)..."
            className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <button
            onClick={handleAddReviewer}
            disabled={addingReviewer || !reviewerInput.trim()}
            className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Submit review */}
        <div className="rounded-lg border border-border/50 bg-adv-dark-2 p-3">
          <p className="mb-2 text-xs font-medium text-adv-gray">Submit your review</p>
          <input
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Your name..."
            className="mb-2 w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <div className="mb-2 flex gap-2">
            {(['approved', 'rejected', 'abstained'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setReviewStatus(s)}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                  reviewStatus === s
                    ? s === 'approved' ? 'border-adv-teal bg-adv-teal/20 text-adv-teal'
                      : s === 'rejected' ? 'border-adv-red bg-adv-red/20 text-adv-red'
                      : 'border-adv-gray-med bg-adv-gray-med/20 text-adv-gray'
                    : 'border-border text-adv-gray hover:border-adv-gray'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Comment (optional)..."
            className="mb-2 w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <button
            onClick={handleSubmitReview}
            disabled={submittingReview || !reviewerName.trim()}
            className="w-full rounded-lg bg-adv-teal py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
          >
            {submittingReview ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>

      {/* ── Live Comment Feed ──────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-adv-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-adv-teal" />
          <h3 className="text-sm font-semibold text-adv-white">Comments</h3>
          <span className="text-xs text-adv-gray">
            {comments.filter((c) => !c.resolved).length} open
          </span>
        </div>

        {/* Comment list */}
        <div className="mb-4 max-h-72 space-y-2 overflow-y-auto pr-1">
          {comments.length === 0 ? (
            <p className="py-4 text-center text-xs text-adv-gray">No comments yet</p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={`rounded-lg border p-3 transition-all ${
                  c.resolved
                    ? 'border-border/30 bg-adv-dark-2/50 opacity-60'
                    : c.comment_type === 'concern'
                    ? 'border-adv-gold/30 bg-adv-gold/5'
                    : 'border-border/50 bg-adv-dark-2'
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-adv-teal-dim text-xs font-bold text-adv-teal">
                    {c.author.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-adv-off-white">{c.author}</span>
                  {c.step_index !== null && (
                    <span className="text-xs text-adv-gray">Step {c.step_index + 1}</span>
                  )}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${commentTypeBadge(c.comment_type)}`}>
                    {c.comment_type}
                  </span>
                  <span className="ml-auto text-xs text-adv-gray">
                    {new Date(c.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!c.resolved && (
                    <button
                      onClick={() => handleResolveComment(c.id)}
                      className="text-xs text-adv-gray hover:text-adv-teal transition-colors"
                      title="Mark resolved"
                    >
                      Resolve
                    </button>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-adv-off-white">{c.content}</p>
                {c.resolved && c.resolved_by && (
                  <p className="mt-1 text-xs text-adv-gray">Resolved by {c.resolved_by}</p>
                )}
              </div>
            ))
          )}
        </div>

        {/* New comment input */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={commentAuthor}
              onChange={(e) => setCommentAuthor(e.target.value)}
              placeholder="Your name..."
              className="w-32 rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <select
              value={commentType}
              onChange={(e) => setCommentType(e.target.value as CanvasComment['comment_type'])}
              className="rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="comment">Comment</option>
              <option value="suggestion">Suggestion</option>
              <option value="concern">Concern</option>
              <option value="approval">Approval</option>
            </select>
          </div>
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleAddComment(); }}
              placeholder="Add a comment... (Ctrl+Enter to send)"
              className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <button
              onClick={handleAddComment}
              disabled={submittingComment || !newComment.trim()}
              className="self-end rounded-lg bg-adv-teal px-3 py-2 text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Assign modal */}
      {assignModal !== null && (
        <AssignModal
          executionId={executionId}
          workflowId={workflowId}
          stepIndex={assignModal}
          onClose={() => setAssignModal(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
