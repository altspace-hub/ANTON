/**
 * submissions.ts — GET /v1/portals/submissions/:id/status handler.
 *
 * Owner-side poll endpoint. The submission UUID is treated as a
 * capability token: anyone who knows it can read the current status.
 * The UUID is 122 bits of entropy so guessing is infeasible.
 *
 * Returned fields are deliberately minimal — they're what ANTON Local's
 * walkthrough UI needs to show a status badge and either congratulate
 * (approved), allow edit-and-resubmit (rejected), or show "waiting"
 * (pending / in_review).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { RegistryDb } from '../db.js';
import { json } from '../routes.js';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface StatusRow {
  id: string;
  status: string;
  tier: string;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  proposed_name: string;
  proposed_namespace: string;
}

export async function handleSubmissionStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
  submissionId: string,
): Promise<void> {
  if (!UUID_RE.test(submissionId)) {
    json(res, 400, { error: 'invalid_submission_id', message: 'submissionId must be a UUID' });
    return;
  }

  try {
    const result = await db.query<StatusRow>(
      `SELECT id, status, tier, submitted_at, reviewed_at, rejection_reason,
              proposed_name, proposed_namespace
       FROM portal_submissions
       WHERE id = $1`,
      [submissionId],
    );
    const row = result.rows[0];
    if (!row) {
      json(res, 404, { error: 'not_found', message: 'No submission with that id.' });
      return;
    }

    // When approved, look up the live portal row so the caller can
    // show the canonical address ("name.namespace").
    let portalAddress: string | null = null;
    if (row.status === 'approved') {
      const portal = await db.query<{ name: string; namespace: string }>(
        `SELECT name, namespace FROM portals
         WHERE submission_id = $1 AND revoked_at IS NULL`,
        [submissionId],
      );
      const portalRow = portal.rows[0];
      if (portalRow) {
        portalAddress = `${portalRow.name}.${portalRow.namespace}`;
      }
    }

    json(res, 200, {
      submissionId: row.id,
      status: row.status,
      tier: row.tier,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      rejectionReason: row.rejection_reason,
      proposedName: row.proposed_name,
      proposedNamespace: row.proposed_namespace,
      portalAddress,
    });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'status lookup failed');
    json(res, 500, { error: 'internal_error' });
  }
}
