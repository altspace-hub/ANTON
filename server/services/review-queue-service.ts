/**
 * review-queue-service.ts — community submission review (Phase 9).
 *
 * Single queue handles 4 submission kinds: hkp, diagnostic-case, template,
 * patch-bundle. On approval, the source artefact is promoted (authoritative
 * flipped to true / template visible). On rejection, the source remains in
 * its current state but the review note is captured.
 *
 * HKP submissions trigger a mandatory security review (per spec §13). The
 * security_reviewed_by + security_reviewed_at fields must be populated
 * before approve() will succeed for an HKP submission.
 */

import { createHash } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { ServiceError } from '../lib/hardware-helpers.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubmissionKind = 'hkp' | 'diagnostic-case' | 'template' | 'patch-bundle';
export type SubmissionStatus = 'pending' | 'in-review' | 'approved' | 'rejected' | 'withdrawn';
export type ReviewDecision = 'approved' | 'rejected';

export interface ReviewSubmission {
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
  review_decision: ReviewDecision | null;
  review_notes: string | null;
  submitted_at: string;
  security_review_required: boolean;
  security_reviewed_by: string | null;
  security_reviewed_at: string | null;
}

export interface SubmitInput {
  kind: SubmissionKind;
  source_id: string;
  source_family_id?: string | null;
  submitted_by: string;
  summary: string;
  notes?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToSubmission(r: Record<string, unknown>): ReviewSubmission {
  return {
    id: r.id as string,
    submission_kind: r.submission_kind as SubmissionKind,
    source_id: r.source_id as string,
    source_family_id: (r.source_family_id as string | null) ?? null,
    submitted_by: r.submitted_by as string,
    submission_summary: r.submission_summary as string,
    submission_notes: (r.submission_notes as string | null) ?? null,
    content_hash: r.content_hash as string,
    status: r.status as SubmissionStatus,
    reviewed_by: (r.reviewed_by as string | null) ?? null,
    review_started_at: (r.review_started_at as string | null) ?? null,
    review_decision_at: (r.review_decision_at as string | null) ?? null,
    review_decision: (r.review_decision as ReviewDecision | null) ?? null,
    review_notes: (r.review_notes as string | null) ?? null,
    submitted_at: r.submitted_at as string,
    security_review_required: Boolean(r.security_review_required),
    security_reviewed_by: (r.security_reviewed_by as string | null) ?? null,
    security_reviewed_at: (r.security_reviewed_at as string | null) ?? null,
  };
}

async function fetchSourceContent(db: DatabaseAdapter, kind: SubmissionKind, sourceId: string): Promise<{ content: string; family_id: string | null }> {
  switch (kind) {
    case 'hkp': {
      const row = await db.get(
        `SELECT family_id, manufacturer, part_number, hkp_version, metadata FROM hardware_knowledge_packs WHERE id = ?`,
        sourceId,
      ) as Record<string, unknown> | undefined;
      if (!row) throw new Error(`HKP ${sourceId} not found`);
      return { content: JSON.stringify(row), family_id: (row.family_id as string | null) ?? null };
    }
    case 'diagnostic-case': {
      const row = await db.get(
        `SELECT family_id, title, case_data FROM diagnostic_cases WHERE case_id = ?`,
        sourceId,
      ) as Record<string, unknown> | undefined;
      if (!row) throw new Error(`Diagnostic case ${sourceId} not found`);
      return { content: JSON.stringify(row), family_id: (row.family_id as string | null) ?? null };
    }
    case 'template': {
      const row = await db.get(
        `SELECT family_id, title, project_blueprint, phase_seed_data FROM hw_templates WHERE id = ?`,
        sourceId,
      ) as Record<string, unknown> | undefined;
      if (!row) throw new Error(`Template ${sourceId} not found`);
      return { content: JSON.stringify(row), family_id: (row.family_id as string | null) ?? null };
    }
    case 'patch-bundle': {
      // Future: bundle file references will live in their own table; for now
      // we just hash the source_id itself.
      return { content: sourceId, family_id: null };
    }
  }
}

async function promoteApproved(db: DatabaseAdapter, kind: SubmissionKind, sourceId: string): Promise<void> {
  switch (kind) {
    case 'hkp': {
      // Promote primary_source if currently 'community' or 'user-generated'
      // to 'community' (visibility unchanged) but mark signing_verified=TRUE.
      await db.run(
        `UPDATE hardware_knowledge_packs SET signing_verified = TRUE, updated_at = NOW() WHERE id = ?`,
        sourceId,
      );
      break;
    }
    case 'diagnostic-case': {
      await db.run(
        `UPDATE diagnostic_cases SET authoritative = TRUE, signing_verified = TRUE, last_updated = NOW() WHERE case_id = ?`,
        sourceId,
      );
      break;
    }
    case 'template': {
      await db.run(
        `UPDATE hw_templates SET authoritative = TRUE, signing_verified = TRUE, updated_at = NOW() WHERE id = ?`,
        sourceId,
      );
      break;
    }
    case 'patch-bundle': {
      // No-op for now — patch bundles are operationally scoped per project.
      break;
    }
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export function createReviewQueueService(db: DatabaseAdapter) {

  async function submit(input: SubmitInput): Promise<ReviewSubmission> {
    const fetched = await fetchSourceContent(db, input.kind, input.source_id);
    const contentHash = createHash('sha256').update(fetched.content).digest('hex');

    // HKP submissions always require a security review per spec §13.
    const securityReviewRequired = input.kind === 'hkp';

    const r = await db.get(
      `INSERT INTO hw_community_review_queue
        (submission_kind, source_id, source_family_id, submitted_by,
         submission_summary, submission_notes, content_hash,
         security_review_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      input.kind, input.source_id,
      input.source_family_id ?? fetched.family_id ?? null,
      input.submitted_by,
      input.summary, input.notes ?? null, contentHash,
      securityReviewRequired,
    );
    if (!r) throw new Error('Failed to submit for review');
    return rowToSubmission(r);
  }

  async function listPending(filters: { kind?: SubmissionKind; family_id?: string } = {}): Promise<ReviewSubmission[]> {
    const where: string[] = ["status IN ('pending', 'in-review')"];
    const params: unknown[] = [];
    if (filters.kind) { where.push('submission_kind = ?'); params.push(filters.kind); }
    if (filters.family_id) { where.push('source_family_id = ?'); params.push(filters.family_id); }
    const rows = await db.all(
      `SELECT * FROM hw_community_review_queue
       WHERE ${where.join(' AND ')}
       ORDER BY submitted_at ASC`,
      ...params,
    ) as Array<Record<string, unknown>>;
    return rows.map(rowToSubmission);
  }

  async function listForSubmitter(submitterId: string, limit = 50): Promise<ReviewSubmission[]> {
    const rows = await db.all(
      `SELECT * FROM hw_community_review_queue
       WHERE submitted_by = ?
       ORDER BY submitted_at DESC LIMIT ?`,
      submitterId, limit,
    ) as Array<Record<string, unknown>>;
    return rows.map(rowToSubmission);
  }

  async function getSubmission(id: string): Promise<ReviewSubmission | null> {
    const r = await db.get('SELECT * FROM hw_community_review_queue WHERE id = ?', id);
    return r ? rowToSubmission(r) : null;
  }

  async function claim(submissionId: string, reviewerId: string): Promise<ReviewSubmission | null> {
    const r = await db.get(
      `UPDATE hw_community_review_queue
       SET status = 'in-review', reviewed_by = ?, review_started_at = NOW()
       WHERE id = ? AND status = 'pending'
       RETURNING *`,
      reviewerId, submissionId,
    );
    return r ? rowToSubmission(r) : null;
  }

  async function recordSecurityReview(submissionId: string, reviewerId: string): Promise<ReviewSubmission> {
    const r = await db.get(
      `UPDATE hw_community_review_queue
       SET security_reviewed_by = ?, security_reviewed_at = NOW()
       WHERE id = ? AND security_review_required = TRUE
       RETURNING *`,
      reviewerId, submissionId,
    );
    if (!r) throw ServiceError.notFound('Submission does not require security review or');
    return rowToSubmission(r);
  }

  async function approve(submissionId: string, reviewerId: string, reviewNotes?: string): Promise<ReviewSubmission> {
    const sub = await getSubmission(submissionId);
    if (!sub) throw ServiceError.notFound('Submission');
    if (sub.security_review_required && !sub.security_reviewed_at) {
      throw new Error('HKP submissions require an explicit security review before approval — record it via recordSecurityReview() first');
    }
    const r = await db.get(
      `UPDATE hw_community_review_queue
       SET status = 'approved', reviewed_by = ?, review_decision = 'approved',
           review_decision_at = NOW(), review_notes = ?
       WHERE id = ? RETURNING *`,
      reviewerId, reviewNotes ?? null, submissionId,
    );
    if (!r) throw new Error('Failed to approve submission');
    await promoteApproved(db, sub.submission_kind, sub.source_id);
    return rowToSubmission(r);
  }

  async function reject(submissionId: string, reviewerId: string, reviewNotes: string): Promise<ReviewSubmission> {
    if (!reviewNotes || reviewNotes.trim().length < 10) {
      throw new Error('Reject reason is mandatory and must be ≥10 characters');
    }
    const r = await db.get(
      `UPDATE hw_community_review_queue
       SET status = 'rejected', reviewed_by = ?, review_decision = 'rejected',
           review_decision_at = NOW(), review_notes = ?
       WHERE id = ? RETURNING *`,
      reviewerId, reviewNotes.trim(), submissionId,
    );
    if (!r) throw new Error('Failed to reject submission');
    return rowToSubmission(r);
  }

  async function withdraw(submissionId: string, submitterId: string): Promise<ReviewSubmission> {
    const r = await db.get(
      `UPDATE hw_community_review_queue
       SET status = 'withdrawn'
       WHERE id = ? AND submitted_by = ? AND status IN ('pending', 'in-review')
       RETURNING *`,
      submissionId, submitterId,
    );
    if (!r) throw new Error('Cannot withdraw — not the submitter, or already decided');
    return rowToSubmission(r);
  }

  return {
    submit,
    listPending,
    listForSubmitter,
    getSubmission,
    claim,
    recordSecurityReview,
    approve,
    reject,
    withdraw,
  };
}

export type ReviewQueueService = ReturnType<typeof createReviewQueueService>;
