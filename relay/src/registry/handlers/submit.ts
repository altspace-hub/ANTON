/**
 * submit.ts — POST /v1/portals/submit handler.
 *
 * Receives a portal publication request, verifies the descriptor
 * signature + derived contact hash, and queues it for human review.
 * No portal becomes searchable until the operator endpoints (Step 9)
 * mark it approved.
 *
 * Validation order (cheapest to most expensive):
 *   1. Body JSON parses
 *   2. Field shapes (validate.ts)
 *   3. Contact-hash matches the signing pubkey
 *   4. Signature verifies over canonical(descriptorJson)
 *   5. Name not reserved (or claimable Tier 2)
 *   6. No pending submission for this (name, namespace)
 *   7. INSERT (kyc + submission in a transaction)
 *
 * On the happy path the response is { submissionId, status: 'pending',
 * tier: 'tier3_selfservice' }.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { RegistryDb } from '../db.js';
import { json } from '../routes.js';
import { validateSubmit } from '../validate.js';
import { deriveContactHash, verifyDescriptorSignature } from '../verify.js';

/** Read the request body up to a hard cap. JSON-parses or rejects. */
async function readJsonBody(
  req: IncomingMessage,
  maxBytes = 64 * 1024,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) {
        aborted = true;
        resolve({ ok: false, error: `body exceeds ${maxBytes} bytes` });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf-8');
      try {
        resolve({ ok: true, value: JSON.parse(raw) });
      } catch {
        resolve({ ok: false, error: 'body is not valid JSON' });
      }
    });
    req.on('error', () => {
      if (!aborted) resolve({ ok: false, error: 'request stream error' });
    });
  });
}

/** Default Tier 3 retention: 5 years from submission. */
function tier3RetentionUntil(): string {
  return new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
}

export async function handleSubmit(
  req: IncomingMessage,
  res: ServerResponse,
  db: RegistryDb,
  log: Logger,
): Promise<void> {
  const body = await readJsonBody(req);
  if (!body.ok) {
    json(res, 400, { error: 'invalid_body', message: body.error });
    return;
  }
  const validated = validateSubmit(body.value);
  if (!validated.ok) {
    json(res, 400, { error: 'invalid_body', message: validated.error, field: validated.field });
    return;
  }
  const v = validated.value;

  // Cross-check: the contact hash claimed in the body must match the
  // contact hash derived from the signing pubkey. Without this an
  // attacker could submit "as" someone else even with a valid signature.
  const derived = deriveContactHash(v.signingPubkeyHex);
  if (derived !== v.submitterContactHash) {
    json(res, 400, {
      error: 'contact_hash_mismatch',
      message: 'submitterContactHash does not match the contact hash derived from signingPubkeyHex',
    });
    return;
  }

  // Verify the descriptor signature. This is the proof the submitter
  // actually controls the signing key — required before we accept
  // their proposed-name claim.
  const sigOk = await verifyDescriptorSignature(
    v.descriptorJson,
    v.descriptorSignature,
    v.signingPubkeyHex,
  );
  if (!sigOk) {
    json(res, 400, {
      error: 'invalid_signature',
      message: 'descriptorSignature does not verify against canonicalize(descriptorJson)',
    });
    return;
  }

  // Reserved-name check: if the name is in reserved_names AND not
  // claimable, reject outright. Claimable reservations require the
  // Tier 2 claim flow (Step 17), not the self-service submit flow.
  try {
    const reserved = await db.query<{ claimable: boolean }>(
      'SELECT claimable FROM reserved_names WHERE name = $1 AND namespace = $2',
      [v.proposedName, v.proposedNamespace],
    );
    const reservedRow = reserved.rows[0];
    if (reservedRow) {
      json(res, 409, {
        error: 'name_reserved',
        message: reservedRow.claimable
          ? 'This name is reserved for the rightful trademark holder. Use the Tier 2 claim flow.'
          : 'This name is reserved by the system and cannot be claimed.',
        claimable: reservedRow.claimable,
      });
      return;
    }
  } catch (err) {
    log.error({ err: (err as Error).message }, 'reserved_names lookup failed');
    json(res, 500, { error: 'internal_error', message: 'reserved-name check failed' });
    return;
  }

  // Insert KYC + submission in one transaction. The partial UNIQUE
  // index on portal_submissions enforces "one pending claim per name".
  const idDocHash = createHash('sha256').update(v.kyc.idDocumentNumber).digest('hex');
  try {
    const result = await db.withTransaction(async (client) => {
      const kycInsert = await client.query<{ id: string }>(
        `INSERT INTO kyc_submissions (
           submitter_contact_hash, legal_name,
           id_document_type, id_document_number_hash, id_document_country,
           org_name, org_registration_number,
           contact_email, contact_phone,
           address_country, address_city, address_street,
           retention_until
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          v.submitterContactHash, v.kyc.legalName,
          v.kyc.idDocumentType, idDocHash, v.kyc.idDocumentCountry,
          v.kyc.orgName, v.kyc.orgRegistrationNumber,
          v.kyc.contactEmail, v.kyc.contactPhone,
          v.kyc.addressCountry, v.kyc.addressCity, v.kyc.addressStreet,
          tier3RetentionUntil(),
        ],
      );
      const kycRow = kycInsert.rows[0];
      if (!kycRow) throw new Error('kyc insert returned no row');

      const subInsert = await client.query<{ id: string; submitted_at: string }>(
        `INSERT INTO portal_submissions (
           submitter_contact_hash, signing_pubkey_hex,
           proposed_name, proposed_namespace,
           descriptor_json, descriptor_signature,
           kyc_submission_id, status, tier
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending','tier3_selfservice')
         RETURNING id, submitted_at`,
        [
          v.submitterContactHash, v.signingPubkeyHex,
          v.proposedName, v.proposedNamespace,
          v.descriptorJson, v.descriptorSignature,
          kycRow.id,
        ],
      );
      const subRow = subInsert.rows[0];
      if (!subRow) throw new Error('submission insert returned no row');
      return subRow;
    });

    json(res, 201, {
      submissionId: result.id,
      status: 'pending',
      tier: 'tier3_selfservice',
      submittedAt: result.submitted_at,
      message: 'Submission received. We will review it within 48 hours.',
    });
  } catch (err) {
    // The partial UNIQUE index throws code '23505' (unique_violation)
    // when a second submitter races us for the same name. Translate
    // to a friendly 409.
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === '23505' && pgErr.constraint === 'portal_submissions_pending_name') {
      json(res, 409, {
        error: 'name_collision',
        message: 'Another submission for this name is already pending review.',
      });
      return;
    }
    log.error({ err: (err as Error).message }, 'submit insert failed');
    json(res, 500, { error: 'internal_error', message: 'failed to record submission' });
  }
}
