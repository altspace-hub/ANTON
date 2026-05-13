/**
 * admin-submissions.ts — operator review API.
 *
 *   GET  /v1/admin/submissions?status=pending&tier=tier3_selfservice
 *        List the review queue. Includes descriptor + KYC summary so
 *        the operator UI can render the review screen without extra
 *        round-trips.
 *
 *   GET  /v1/admin/submissions/:id
 *        Single-submission detail. Same shape as the list rows.
 *
 *   POST /v1/admin/submissions/:id/approve  { internalNotes? }
 *        Move pending → approved. INSERT a row into portals with
 *        computed capability_summary. Single transaction so a partial
 *        failure leaves the queue + portals tables consistent.
 *
 *   POST /v1/admin/submissions/:id/reject  { reason, internalNotes? }
 *        Move pending → rejected. reason is shown to the submitter;
 *        internalNotes stays operator-side.
 *
 * All four routes are gated by an Authorization: Bearer <jwt> header
 * verified against RELAY_OPERATOR_JWT_SECRET. requireOperator() writes
 * a 401 and returns null on failure so handlers short-circuit cleanly.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { RegistryDb } from '../db.js';
import { json } from '../routes.js';
import { operatorFromAuthHeader, type OperatorClaims } from '../jwt.js';
import { summarizeDescriptor } from '../summarize.js';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const STATUS_FILTERS = new Set(['pending','in_review','approved','rejected','withdrawn']);
const TIER_FILTERS = new Set(['tier2_claimed','tier3_selfservice']);

export function requireOperator(req: IncomingMessage, res: ServerResponse): OperatorClaims | null {
  const secret = process.env.RELAY_OPERATOR_JWT_SECRET;
  if (!secret) {
    json(res, 503, { error: 'admin_not_configured' });
    return null;
  }
  const auth = req.headers.authorization;
  const claims = operatorFromAuthHeader(auth, secret);
  if (!claims) {
    json(res, 401, { error: 'unauthenticated', message: 'Authorization: Bearer <token> required' });
    return null;
  }
  return claims;
}

async function readJsonBody(req: IncomingMessage, maxBytes = 16 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) {
        aborted = true; req.destroy();
        reject(new Error(`body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (raw.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('body is not valid JSON')); }
    });
    req.on('error', () => { if (!aborted) reject(new Error('stream error')); });
  });
}

// ── List ─────────────────────────────────────────────────────────────

interface SubmissionListRow {
  id: string;
  submitted_at: string;
  reviewed_at: string | null;
  submitter_contact_hash: string;
  signing_pubkey_hex: string;
  proposed_name: string;
  proposed_namespace: string;
  descriptor_json: Record<string, unknown>;
  status: string;
  tier: string;
  reviewer_id: string | null;
  rejection_reason: string | null;
  total_count: string;
}

export async function handleAdminList(
  req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
): Promise<void> {
  const op = requireOperator(req, res);
  if (!op) return;

  const url = new URL(req.url ?? '/', 'http://relay');
  const params = url.searchParams;
  const status = params.get('status') ?? 'pending';
  const tier = params.get('tier');
  const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(params.get('offset') ?? '0', 10) || 0, 0);

  if (!STATUS_FILTERS.has(status)) {
    json(res, 400, { error: 'invalid_query', field: 'status' });
    return;
  }
  if (tier !== null && !TIER_FILTERS.has(tier)) {
    json(res, 400, { error: 'invalid_query', field: 'tier' });
    return;
  }

  const where: string[] = ['status = $1'];
  const args: unknown[] = [status];
  if (tier) { where.push(`tier = $${args.length + 1}`); args.push(tier); }
  const sql = `
    SELECT id, submitted_at, reviewed_at,
           submitter_contact_hash, signing_pubkey_hex,
           proposed_name, proposed_namespace,
           descriptor_json, status, tier,
           reviewer_id, rejection_reason,
           COUNT(*) OVER() AS total_count
    FROM portal_submissions
    WHERE ${where.join(' AND ')}
    ORDER BY submitted_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  try {
    const result = await db.query<SubmissionListRow>(sql, args);
    const first = result.rows[0];
    const total = first ? parseInt(first.total_count, 10) : 0;
    const submissions = result.rows.map((r) => ({
      submissionId: r.id,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      submitterContactHash: r.submitter_contact_hash,
      signingPubkeyHex: r.signing_pubkey_hex,
      proposedName: r.proposed_name,
      proposedNamespace: r.proposed_namespace,
      descriptor: r.descriptor_json,
      status: r.status,
      tier: r.tier,
      reviewerId: r.reviewer_id,
      rejectionReason: r.rejection_reason,
    }));
    json(res, 200, { submissions, total });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'admin list failed');
    json(res, 500, { error: 'internal_error' });
  }
}

// ── Detail (with KYC) ────────────────────────────────────────────────

interface DetailRow extends SubmissionListRow {
  kyc_submission_id: string | null;
  internal_notes: string | null;
  // KYC joined fields:
  legal_name: string | null;
  id_document_type: string | null;
  id_document_country: string | null;
  org_name: string | null;
  org_registration_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_country: string | null;
  address_city: string | null;
  address_street: string | null;
}

export async function handleAdminDetail(
  req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
  submissionId: string,
): Promise<void> {
  const op = requireOperator(req, res);
  if (!op) return;
  if (!UUID_RE.test(submissionId)) {
    json(res, 400, { error: 'invalid_submission_id' });
    return;
  }
  try {
    const result = await db.query<DetailRow>(
      `SELECT s.id, s.submitted_at, s.reviewed_at,
              s.submitter_contact_hash, s.signing_pubkey_hex,
              s.proposed_name, s.proposed_namespace,
              s.descriptor_json, s.status, s.tier,
              s.reviewer_id, s.rejection_reason, s.internal_notes,
              s.kyc_submission_id,
              k.legal_name, k.id_document_type, k.id_document_country,
              k.org_name, k.org_registration_number,
              k.contact_email, k.contact_phone,
              k.address_country, k.address_city, k.address_street,
              0 AS total_count
       FROM portal_submissions s
       LEFT JOIN kyc_submissions k ON s.kyc_submission_id = k.id
       WHERE s.id = $1`,
      [submissionId],
    );
    const r = result.rows[0];
    if (!r) { json(res, 404, { error: 'not_found' }); return; }
    json(res, 200, {
      submissionId: r.id,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      submitterContactHash: r.submitter_contact_hash,
      signingPubkeyHex: r.signing_pubkey_hex,
      proposedName: r.proposed_name,
      proposedNamespace: r.proposed_namespace,
      descriptor: r.descriptor_json,
      status: r.status,
      tier: r.tier,
      reviewerId: r.reviewer_id,
      rejectionReason: r.rejection_reason,
      internalNotes: r.internal_notes,
      kyc: r.kyc_submission_id ? {
        kycId: r.kyc_submission_id,
        legalName: r.legal_name,
        idDocumentType: r.id_document_type,
        idDocumentCountry: r.id_document_country,
        orgName: r.org_name,
        orgRegistrationNumber: r.org_registration_number,
        contactEmail: r.contact_email,
        contactPhone: r.contact_phone,
        addressCountry: r.address_country,
        addressCity: r.address_city,
        addressStreet: r.address_street,
      } : null,
    });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'admin detail failed');
    json(res, 500, { error: 'internal_error' });
  }
}

// ── Approve ──────────────────────────────────────────────────────────

interface ApproveBody { internalNotes?: string }

export async function handleAdminApprove(
  req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
  submissionId: string,
): Promise<void> {
  const op = requireOperator(req, res);
  if (!op) return;
  if (!UUID_RE.test(submissionId)) {
    json(res, 400, { error: 'invalid_submission_id' });
    return;
  }
  let body: ApproveBody = {};
  try {
    const raw = await readJsonBody(req);
    if (raw && typeof raw === 'object') body = raw as ApproveBody;
  } catch (err) {
    json(res, 400, { error: 'invalid_body', message: (err as Error).message });
    return;
  }

  try {
    const result = await db.withTransaction(async (client) => {
      // Load + lock the submission row so two operators can't approve
      // the same submission in parallel.
      const subRes = await client.query<{
        id: string;
        status: string;
        proposed_name: string;
        proposed_namespace: string;
        descriptor_json: Record<string, unknown>;
        submitter_contact_hash: string;
        signing_pubkey_hex: string;
        tier: string;
      }>(
        `SELECT id, status, proposed_name, proposed_namespace,
                descriptor_json, submitter_contact_hash, signing_pubkey_hex, tier
         FROM portal_submissions WHERE id = $1 FOR UPDATE`,
        [submissionId],
      );
      const sub = subRes.rows[0];
      if (!sub) return { kind: 'not_found' } as const;
      if (sub.status !== 'pending' && sub.status !== 'in_review') {
        return { kind: 'wrong_status', current: sub.status } as const;
      }

      // Reserved-name check at approve time too — a name could have
      // been reserved after the submission was queued.
      const reserved = await client.query<{ claimable: boolean }>(
        `SELECT claimable FROM reserved_names WHERE name = $1 AND namespace = $2`,
        [sub.proposed_name, sub.proposed_namespace],
      );
      const reservedRow = reserved.rows[0];
      if (reservedRow && !reservedRow.claimable && sub.tier === 'tier3_selfservice') {
        return { kind: 'name_reserved' } as const;
      }

      const summary = summarizeDescriptor(sub.descriptor_json);

      await client.query(
        `UPDATE portal_submissions
         SET status = 'approved',
             reviewer_id = $1,
             reviewed_at = now(),
             internal_notes = COALESCE($2, internal_notes)
         WHERE id = $3`,
        [op.sub, body.internalNotes ?? null, submissionId],
      );

      const portalInsert = await client.query<{ id: string }>(
        `INSERT INTO portals
         (submission_id, name, namespace, contact_hash, signing_pubkey_hex,
          descriptor_json, capability_summary, tier)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          sub.id, sub.proposed_name, sub.proposed_namespace,
          sub.submitter_contact_hash, sub.signing_pubkey_hex,
          sub.descriptor_json, summary, sub.tier,
        ],
      );
      const portalRow = portalInsert.rows[0];
      if (!portalRow) throw new Error('portal insert returned no row');

      return {
        kind: 'approved' as const,
        portalId: portalRow.id,
        portalAddress: `${sub.proposed_name}.${sub.proposed_namespace}`,
      };
    });

    switch (result.kind) {
      case 'not_found':
        json(res, 404, { error: 'not_found' }); return;
      case 'wrong_status':
        json(res, 409, { error: 'wrong_status', current: result.current });
        return;
      case 'name_reserved':
        json(res, 409, { error: 'name_reserved' }); return;
      case 'approved':
        log.info({ submissionId, operatorId: op.sub, portalAddress: result.portalAddress }, 'submission approved');
        json(res, 200, {
          approved: true,
          submissionId,
          portalId: result.portalId,
          portalAddress: result.portalAddress,
          approvedBy: op.sub,
        });
        return;
    }
  } catch (err) {
    // Conflict on the partial-unique live-name index → another portal
    // with the same name was approved between FOR UPDATE and INSERT.
    // Vanishingly rare in practice but let's be explicit.
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === '23505' && pgErr.constraint === 'portals_live_name') {
      json(res, 409, { error: 'name_already_live' });
      return;
    }
    log.error({ err: (err as Error).message }, 'admin approve failed');
    json(res, 500, { error: 'internal_error' });
  }
}

// ── Reject ───────────────────────────────────────────────────────────

interface RejectBody { reason?: string; internalNotes?: string }

export async function handleAdminReject(
  req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
  submissionId: string,
): Promise<void> {
  const op = requireOperator(req, res);
  if (!op) return;
  if (!UUID_RE.test(submissionId)) {
    json(res, 400, { error: 'invalid_submission_id' });
    return;
  }
  let body: RejectBody = {};
  try {
    const raw = await readJsonBody(req);
    if (raw && typeof raw === 'object') body = raw as RejectBody;
  } catch (err) {
    json(res, 400, { error: 'invalid_body', message: (err as Error).message });
    return;
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length === 0) {
    json(res, 400, { error: 'invalid_body', message: 'reason is required and shown to the submitter' });
    return;
  }
  if (reason.length > 2000) {
    json(res, 400, { error: 'invalid_body', message: 'reason exceeds 2000 chars' });
    return;
  }
  try {
    const updateRes = await db.query<{ id: string; previous_status: string }>(
      `UPDATE portal_submissions
       SET status = 'rejected',
           reviewer_id = $1,
           reviewed_at = now(),
           rejection_reason = $2,
           internal_notes = COALESCE($3, internal_notes)
       WHERE id = $4
         AND status IN ('pending','in_review')
       RETURNING id, (SELECT status FROM portal_submissions WHERE id = $4) AS previous_status`,
      [op.sub, reason, body.internalNotes ?? null, submissionId],
    );
    const updated = updateRes.rows[0];
    if (!updated) {
      // Two paths: row doesn't exist (404) vs row exists in wrong status (409).
      const check = await db.query<{ status: string }>(
        `SELECT status FROM portal_submissions WHERE id = $1`,
        [submissionId],
      );
      const row = check.rows[0];
      if (!row) { json(res, 404, { error: 'not_found' }); return; }
      json(res, 409, { error: 'wrong_status', current: row.status });
      return;
    }
    log.info({ submissionId, operatorId: op.sub }, 'submission rejected');
    json(res, 200, { rejected: true, submissionId, rejectedBy: op.sub });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'admin reject failed');
    json(res, 500, { error: 'internal_error' });
  }
}
