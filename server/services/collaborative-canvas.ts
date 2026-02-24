import Database from 'better-sqlite3';

export function createCollaborativeCanvas(db: Database.Database) {

  function assignStep(params: {
    executionId: string;
    workflowId: string;
    stepIndex: number;
    assignedTo: string;
    assignedBy: string;
    slaHours?: number;
    notes?: string;
  }) {
    const dueAt = params.slaHours
      ? new Date(Date.now() + params.slaHours * 3600000).toISOString()
      : null;
    const id = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO step_assignments (id, execution_id, workflow_id, step_index, assigned_to, assigned_by, due_at, sla_hours, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.executionId, params.workflowId, params.stepIndex,
           params.assignedTo, params.assignedBy, dueAt, params.slaHours ?? null, params.notes ?? null);
    return { id, dueAt };
  }

  function getAssignmentsForExecution(executionId: string) {
    return db.prepare('SELECT * FROM step_assignments WHERE execution_id = ? ORDER BY step_index').all(executionId);
  }

  function getMyAssignments(userId: string) {
    return db.prepare(`
      SELECT sa.*, we.workflow_name, we.status as execution_status
      FROM step_assignments sa
      JOIN workflow_executions we ON sa.execution_id = we.id
      WHERE sa.assigned_to = ? AND sa.status NOT IN ('completed','reassigned')
      ORDER BY sa.due_at ASC NULLS LAST
    `).all(userId);
  }

  function updateAssignmentStatus(id: string, status: string) {
    const now = new Date().toISOString();
    if (status === 'in_progress') {
      db.prepare('UPDATE step_assignments SET status = ?, started_at = ? WHERE id = ?').run(status, now, id);
    } else if (status === 'completed') {
      db.prepare('UPDATE step_assignments SET status = ?, completed_at = ? WHERE id = ?').run(status, now, id);
    } else {
      db.prepare('UPDATE step_assignments SET status = ? WHERE id = ?').run(status, id);
    }
  }

  function refreshOverdueAssignments() {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE step_assignments SET status = 'overdue'
      WHERE due_at < ? AND status IN ('pending','in_progress')
    `).run(now);
  }

  function addParallelReviewer(params: {
    executionId: string;
    stepIndex: number;
    reviewer: string;
    requiredForConsensus?: boolean;
  }) {
    const id = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT OR REPLACE INTO parallel_reviews (id, execution_id, step_index, reviewer, required_for_consensus)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, params.executionId, params.stepIndex, params.reviewer, params.requiredForConsensus ? 1 : 0);
    return id;
  }

  function submitReview(params: {
    executionId: string;
    stepIndex: number;
    reviewer: string;
    status: 'approved' | 'rejected' | 'abstained';
    comment?: string;
  }) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE parallel_reviews
      SET review_status = ?, review_comment = ?, reviewed_at = ?
      WHERE execution_id = ? AND step_index = ? AND reviewer = ?
    `).run(params.status, params.comment ?? null, now,
           params.executionId, params.stepIndex, params.reviewer);
    return getConsensus(params.executionId, params.stepIndex);
  }

  function getConsensus(executionId: string, stepIndex: number) {
    const reviews = db.prepare(
      'SELECT * FROM parallel_reviews WHERE execution_id = ? AND step_index = ?'
    ).all(executionId, stepIndex) as Array<{
      id: string;
      reviewer: string;
      review_status: string;
      required_for_consensus: number;
      review_comment: string | null;
      reviewed_at: string | null;
    }>;

    const required = reviews.filter(r => r.required_for_consensus);
    const allResponded = required.every(r => r.review_status !== 'pending');
    const allApproved = required.every(r => r.review_status === 'approved');
    const anyRejected = required.some(r => r.review_status === 'rejected');

    return {
      reviews,
      totalReviewers: reviews.length,
      responded: reviews.filter(r => r.review_status !== 'pending').length,
      approved: reviews.filter(r => r.review_status === 'approved').length,
      rejected: reviews.filter(r => r.review_status === 'rejected').length,
      consensus: allResponded ? (anyRejected ? 'rejected' : 'approved') : 'pending',
      canProceed: allApproved && allResponded,
    };
  }

  function addComment(params: {
    executionId: string;
    stepIndex?: number;
    author: string;
    content: string;
    commentType?: 'comment' | 'suggestion' | 'concern' | 'approval';
  }) {
    const id = `cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO canvas_comments (id, execution_id, step_index, author, content, comment_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, params.executionId, params.stepIndex ?? null,
           params.author, params.content, params.commentType ?? 'comment');
    return id;
  }

  function getComments(executionId: string) {
    return db.prepare(
      'SELECT * FROM canvas_comments WHERE execution_id = ? ORDER BY created_at ASC'
    ).all(executionId);
  }

  function resolveComment(id: string, resolvedBy: string) {
    db.prepare(
      'UPDATE canvas_comments SET resolved = 1, resolved_by = ?, resolved_at = ? WHERE id = ?'
    ).run(resolvedBy, new Date().toISOString(), id);
  }

  return {
    assignStep, getAssignmentsForExecution, getMyAssignments, updateAssignmentStatus,
    refreshOverdueAssignments, addParallelReviewer, submitReview, getConsensus,
    addComment, getComments, resolveComment,
  };
}
