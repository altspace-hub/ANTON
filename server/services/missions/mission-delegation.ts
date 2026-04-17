// ── Missions — AAP Delegation across ANTON instances (Phase 5) ────────────
//
// Delegation is "ANTON A asks ANTON B to do a sub-mission". It uses:
//   • community_connections   — to resolve peer endpoint
//   • community_message_queue — for transport (HTTP P2P + relay fallback)
//   • Ed25519 signatures      — so the recipient can verify origin before accept
//
// The transport uses a dedicated message_type = 'mission_delegation' on the
// community_mail row so the inbound /api/p2p/receive handler can route it
// to the mission delegation processor (vs treating it as plain mail).
//
// Outbound state machine:    draft → sent → (in_progress) → completed → approved/rejected
// Inbound  state machine:    received → accepted → in_progress → completed (sent back)
//
// Sub-mission creation: when an inbound delegation is accepted we create a
// brand-new local mission (with origin_delegation_id reference) and pass the
// brief through to the existing decomposition + execution path.

import type { DatabaseAdapter } from '../../db/database.js';
import { randomUUID } from 'crypto';

export type DelegationDirection = 'outbound' | 'inbound';
export type DelegationStatus =
  | 'draft' | 'sent' | 'received' | 'accepted' | 'declined'
  | 'in_progress' | 'completed' | 'approved' | 'rejected'
  | 'cancelled' | 'failed';

export interface DelegationBrief {
  title: string;
  objective: string;
  context?: Record<string, unknown>;
  requiredModules?: string[];
  expectedOutput?: string;
  deadline?: string;                       // ISO timestamp
  paymentAmountFtc?: number;
}

export interface OutboundDelegationInput {
  missionId: string;
  taskId?: string;
  peerContactHash: string;
  brief: DelegationBrief;
}

export interface InboundDelegationPayload {
  delegationId: string;                    // originator-assigned UUID
  fromContactHash: string;
  fromDisplayName?: string;
  brief: DelegationBrief;
  signature: string;                       // hex Ed25519 over canonical(payload)
  signerPublicKey: string;                 // hex DER public key (sender's pubkey)
}

export interface MissionDelegationRow {
  id: string;
  direction: DelegationDirection;
  mission_id: string | null;
  task_id: string | null;
  sub_mission_id: string | null;
  peer_contact_hash: string;
  peer_display_name: string | null;
  peer_endpoint: string | null;
  brief_title: string;
  brief_objective: string;
  brief_context: unknown;
  required_modules: unknown;
  expected_output: string | null;
  deadline: string | null;
  payment_amount_ftc: string | number | null;
  status: DelegationStatus;
  signed_payload: unknown;
  signature_verified: boolean | null;
  signature_verified_at: string | null;
  result_payload: unknown;
  result_files: unknown;
  result_signed_payload: unknown;
  result_signature_verified: boolean | null;
  rejection_reason: string | null;
  outbound_mail_id: string | null;
  outbound_queue_id: string | null;
  inbound_mail_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
}

export async function createMissionDelegation(db: DatabaseAdapter) {
  const { createSigningService } = await import('../community-signing-service.js');
  const signing = await createSigningService(db);

  function newDelegationId(): string { return randomUUID(); }

  /**
   * Canonical JSON serialisation for signing — keys sorted, no whitespace.
   * Both sides MUST use the exact same algorithm to verify.
   */
  function canonical(obj: Record<string, unknown>): string {
    const sortedKeys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of sortedKeys) out[k] = obj[k];
    return JSON.stringify(out);
  }

  async function logEvent(delegationId: string, event: string, actor: string | null, details: Record<string, unknown> = {}): Promise<void> {
    await db.run(
      `INSERT INTO missions.mission_delegation_log (delegation_id, event, actor, details)
       VALUES (?, ?, ?, ?)`,
      delegationId, event, actor ?? 'system', JSON.stringify(details),
    );
  }

  async function getDelegation(id: string): Promise<MissionDelegationRow | null> {
    return (await db.get<MissionDelegationRow>(
      `SELECT * FROM missions.mission_delegations WHERE id = ?`, id,
    )) ?? null;
  }

  // ── Outbound: create + sign + queue for delivery ────────────────────────

  async function createOutboundDelegation(input: OutboundDelegationInput): Promise<MissionDelegationRow> {
    const identity = await db.get<{ contact_hash: string; display_name: string; public_key: string; private_key_encrypted: string | null }>(
      `SELECT contact_hash, display_name, public_key, private_key_encrypted FROM community_identity LIMIT 1`,
    );
    if (!identity) throw new Error('No local community_identity — activate identity before delegating');

    const conn = await db.get<{ endpoint: string | null; display_name: string | null; status: string }>(
      `SELECT endpoint, display_name, status FROM community_connections WHERE contact_hash = ?`,
      input.peerContactHash,
    );
    if (!conn) throw new Error(`No community connection with ${input.peerContactHash}`);
    if (conn.status !== 'accepted' && conn.status !== 'active') {
      throw new Error(`Connection with ${input.peerContactHash} is in status '${conn.status}' — must be accepted/active`);
    }

    const id = newDelegationId();
    await db.run(
      `INSERT INTO missions.mission_delegations
        (id, direction, mission_id, task_id, peer_contact_hash, peer_display_name, peer_endpoint,
         brief_title, brief_objective, brief_context, required_modules,
         expected_output, deadline, payment_amount_ftc, status)
       VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      id, input.missionId, input.taskId ?? null,
      input.peerContactHash, conn.display_name, conn.endpoint,
      input.brief.title, input.brief.objective,
      JSON.stringify(input.brief.context ?? {}),
      JSON.stringify(input.brief.requiredModules ?? []),
      input.brief.expectedOutput ?? null,
      input.brief.deadline ?? null,
      input.brief.paymentAmountFtc ?? null,
    );
    await logEvent(id, 'created', identity.contact_hash, { peer: input.peerContactHash, title: input.brief.title });
    const row = await getDelegation(id);
    if (!row) throw new Error('Delegation row missing after insert');
    return row;
  }

  async function sendDelegation(delegationId: string): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'outbound') throw new Error('Cannot send an inbound delegation');
    if (row.status !== 'draft') throw new Error(`Cannot send from status '${row.status}'`);

    const identity = await db.get<{ contact_hash: string; display_name: string; public_key: string; private_key_encrypted: string | null }>(
      `SELECT contact_hash, display_name, public_key, private_key_encrypted FROM community_identity LIMIT 1`,
    );
    if (!identity) throw new Error('No local community_identity');

    // Build the canonical payload + sign
    const payload: Record<string, unknown> = {
      delegationId: row.id,
      fromContactHash: identity.contact_hash,
      fromDisplayName: identity.display_name,
      brief: {
        title: row.brief_title,
        objective: row.brief_objective,
        context: parseJson(row.brief_context, {}),
        requiredModules: parseJson(row.required_modules, [] as string[]),
        expectedOutput: row.expected_output,
        deadline: row.deadline,
        paymentAmountFtc: row.payment_amount_ftc != null ? Number(row.payment_amount_ftc) : null,
      },
    };
    const canonicalPayload = canonical(payload);
    const signature = signing.ed25519Sign(canonicalPayload, identity.private_key_encrypted);
    const signedPayload = { payload_json: canonicalPayload, signature_b64: signature, signer_contact_hash: identity.contact_hash, signer_public_key: identity.public_key, sig_alg: 'ed25519' };

    // Mark as signed; transport uses the existing community_message_queue
    // We write a community_mail row of type 'mission_delegation' and queue it.
    const mailId = `cm_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, message_type, payload, payload_metadata)
       VALUES (?, ?, ?, ?, ?, 'mission_delegation', ?, ?)`,
      mailId, identity.contact_hash, JSON.stringify([row.peer_contact_hash]),
      `[Mission Delegation] ${row.brief_title}`,
      row.brief_objective.slice(0, 1000),
      JSON.stringify(signedPayload),
      JSON.stringify({ delegation_id: row.id, mission_id: row.mission_id, task_id: row.task_id }),
    );
    const queueId = `mq_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO community_message_queue (id, mail_id, recipient_hash, status)
       VALUES (?, ?, ?, 'pending')`,
      queueId, mailId, row.peer_contact_hash,
    );

    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'sent', signed_payload = ?, outbound_mail_id = ?, outbound_queue_id = ?, sent_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      JSON.stringify(signedPayload), mailId, queueId, delegationId,
    );
    await logEvent(delegationId, 'sent', identity.contact_hash, { mail_id: mailId, queue_id: queueId });
    if (row.mission_id) {
      await db.run(
        `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
         VALUES (?, ?, 'delegation_sent', ?, ?)`,
        row.mission_id, row.task_id,
        `Delegated to ${row.peer_display_name ?? row.peer_contact_hash.slice(0, 12)}: ${row.brief_title}`,
        JSON.stringify({ delegation_id: row.id, peer: row.peer_contact_hash }),
      );
    }
    const updated = await getDelegation(delegationId);
    return updated!;
  }

  // ── Inbound: receive a delegation from a peer (called by /api/p2p/receive) ─

  async function receiveDelegation(input: InboundDelegationPayload, inboundMailId: string | null): Promise<MissionDelegationRow> {
    // 1. Verify signature
    const canonicalPayload = canonical({
      delegationId: input.delegationId,
      fromContactHash: input.fromContactHash,
      fromDisplayName: input.fromDisplayName,
      brief: input.brief,
    });
    const verified = signing.ed25519Verify(canonicalPayload, input.signature, input.signerPublicKey);

    // 2. Avoid duplicates — same id from same peer is idempotent
    const existing = await getDelegation(input.delegationId);
    if (existing) {
      // Already received — just update verification result if it changed
      if (existing.direction !== 'inbound') throw new Error(`Delegation id collision with outbound record: ${input.delegationId}`);
      return existing;
    }

    // 3. Insert + log
    await db.run(
      `INSERT INTO missions.mission_delegations
        (id, direction, peer_contact_hash, peer_display_name,
         brief_title, brief_objective, brief_context, required_modules,
         expected_output, deadline, payment_amount_ftc,
         status, signed_payload, signature_verified, signature_verified_at, inbound_mail_id)
       VALUES (?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      input.delegationId, input.fromContactHash, input.fromDisplayName ?? null,
      input.brief.title, input.brief.objective,
      JSON.stringify(input.brief.context ?? {}),
      JSON.stringify(input.brief.requiredModules ?? []),
      input.brief.expectedOutput ?? null,
      input.brief.deadline ?? null,
      input.brief.paymentAmountFtc ?? null,
      verified ? 'received' : 'failed',
      JSON.stringify({ payload_json: canonicalPayload, signature_b64: input.signature, signer_contact_hash: input.fromContactHash, signer_public_key: input.signerPublicKey, sig_alg: 'ed25519' }),
      verified, inboundMailId,
    );
    await logEvent(input.delegationId, verified ? 'received' : 'signature_failed', input.fromContactHash, { signature_verified: verified });
    if (!verified) {
      await logEvent(input.delegationId, 'failed', null, { reason: 'invalid_signature' });
    }
    const row = await getDelegation(input.delegationId);
    return row!;
  }

  // ── Inbound action: accept / decline ────────────────────────────────────

  async function acceptInbound(delegationId: string, actor: string, opts: { createSubMission?: boolean } = {}): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'inbound') throw new Error('Only inbound delegations can be accepted');
    if (row.status !== 'received') throw new Error(`Cannot accept from status '${row.status}'`);
    if (row.signature_verified !== true) throw new Error('Cannot accept a delegation with an invalid signature');

    let subMissionId: string | null = null;
    if (opts.createSubMission !== false) {
      // Create a local sub-mission. We use the missions.missions table directly
      // to avoid a hard dependency on createMission's full pipeline (which
      // requires identity binding to the LOCAL user, not the remote peer).
      subMissionId = `mis_${randomUUID()}`;
      const localIdentity = await db.get<{ contact_hash: string; user_id: string }>(
        `SELECT contact_hash, user_id FROM community_identity WHERE contact_hash = ?`,
        actor,
      );
      const userId = localIdentity?.user_id ?? null;
      await db.run(
        `INSERT INTO missions.missions
          (id, name, objective, status, created_by, autonomy_level, brief_status, mission_type, origin_delegation_id)
         VALUES (?, ?, ?, 'briefed', ?, 'check_in', 'approved', 'inbound_delegation', ?)`,
        subMissionId,
        `[delegated] ${row.brief_title}`,
        row.brief_objective,
        userId,
        delegationId,
      );
      // Link the delegation back to the new sub-mission
      await db.run(
        `UPDATE missions.mission_delegations SET sub_mission_id = ? WHERE id = ?`,
        subMissionId, delegationId,
      );
    }

    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      delegationId,
    );
    await logEvent(delegationId, 'accepted', actor, { sub_mission_id: subMissionId });

    // TODO: send accept notification back via AAP (Phase 5.5)

    const updated = await getDelegation(delegationId);
    return updated!;
  }

  async function declineInbound(delegationId: string, actor: string, reason?: string): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'inbound') throw new Error('Only inbound delegations can be declined');
    if (row.status !== 'received') throw new Error(`Cannot decline from status '${row.status}'`);
    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'declined', rejection_reason = ?, closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      reason ?? null, delegationId,
    );
    await logEvent(delegationId, 'declined', actor, { reason });
    return (await getDelegation(delegationId))!;
  }

  // ── Inbound action: submit result back to originator ────────────────────

  async function submitInboundResult(delegationId: string, actor: string, result: { payload: Record<string, unknown>; files?: Array<{ filename: string; content?: string; path?: string }> }): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'inbound') throw new Error('Only inbound delegations can submit results');
    if (row.status !== 'accepted' && row.status !== 'in_progress') {
      throw new Error(`Cannot submit result from status '${row.status}'`);
    }

    const identity = await db.get<{ contact_hash: string; public_key: string; private_key_encrypted: string | null }>(
      `SELECT contact_hash, public_key, private_key_encrypted FROM community_identity LIMIT 1`,
    );
    if (!identity) throw new Error('No local community_identity');

    // Sign the result so the originator can verify the work came from us
    const canonicalResult = canonical({ delegationId, payload: result.payload, files: result.files ?? [] });
    const signature = signing.ed25519Sign(canonicalResult, identity.private_key_encrypted);
    const signedResult = { payload_json: canonicalResult, signature_b64: signature, signer_contact_hash: identity.contact_hash, signer_public_key: identity.public_key, sig_alg: 'ed25519' };

    // Queue the result back to the originator
    const mailId = `cm_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, message_type, payload, payload_metadata)
       VALUES (?, ?, ?, ?, ?, 'mission_delegation_result', ?, ?)`,
      mailId, identity.contact_hash, JSON.stringify([row.peer_contact_hash]),
      `[Delegation Result] ${row.brief_title}`,
      'See attached payload',
      JSON.stringify({ ...signedResult, files: result.files ?? [] }),
      JSON.stringify({ delegation_id: row.id, kind: 'result' }),
    );
    const queueId = `mq_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO community_message_queue (id, mail_id, recipient_hash, status)
       VALUES (?, ?, ?, 'pending')`,
      queueId, mailId, row.peer_contact_hash,
    );

    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'completed', completed_at = NOW(),
           result_payload = ?, result_files = ?, result_signed_payload = ?, updated_at = NOW()
       WHERE id = ?`,
      JSON.stringify(result.payload), JSON.stringify(result.files ?? []),
      JSON.stringify(signedResult), delegationId,
    );
    await logEvent(delegationId, 'completed', actor, { mail_id: mailId, queue_id: queueId });
    return (await getDelegation(delegationId))!;
  }

  // ── Outbound side receives the result back ──────────────────────────────

  async function receiveDelegationResult(delegationId: string, signedResult: { payload_json: string; signature_b64: string; signer_public_key: string; signer_contact_hash: string; files?: Array<{ filename: string; content?: string; path?: string }> }): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Unknown delegation: ${delegationId}`);
    if (row.direction !== 'outbound') throw new Error('Result received for a non-outbound delegation');

    const verified = signing.ed25519Verify(signedResult.payload_json, signedResult.signature_b64, signedResult.signer_public_key);
    let parsedPayload: unknown = null;
    try { parsedPayload = JSON.parse(signedResult.payload_json); } catch { /* keep null */ }

    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'completed', completed_at = NOW(),
           result_payload = ?, result_files = ?, result_signed_payload = ?,
           result_signature_verified = ?, updated_at = NOW()
       WHERE id = ?`,
      JSON.stringify(parsedPayload),
      JSON.stringify(signedResult.files ?? []),
      JSON.stringify(signedResult),
      verified, delegationId,
    );
    await logEvent(delegationId, verified ? 'completed' : 'signature_failed', row.peer_contact_hash, { signature_verified: verified });
    if (row.mission_id) {
      await db.run(
        `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
         VALUES (?, ?, 'delegation_result_received', ?, ?)`,
        row.mission_id, row.task_id,
        `Result received from ${row.peer_display_name ?? row.peer_contact_hash.slice(0, 12)} (signed: ${verified})`,
        JSON.stringify({ delegation_id: row.id, signature_verified: verified }),
      );
    }
    return (await getDelegation(delegationId))!;
  }

  // ── Outbound action: approve / reject the result ────────────────────────

  async function approveResult(delegationId: string, actor: string): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'outbound') throw new Error('Only outbound delegations can be approved');
    if (row.status !== 'completed') throw new Error(`Cannot approve from status '${row.status}'`);
    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'approved', closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      delegationId,
    );
    await logEvent(delegationId, 'approved', actor, {});
    return (await getDelegation(delegationId))!;
  }

  async function rejectResult(delegationId: string, actor: string, reason: string): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'outbound') throw new Error('Only outbound delegations can be rejected');
    if (row.status !== 'completed') throw new Error(`Cannot reject from status '${row.status}'`);
    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'rejected', rejection_reason = ?, closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      reason, delegationId,
    );
    await logEvent(delegationId, 'rejected', actor, { reason });
    return (await getDelegation(delegationId))!;
  }

  async function cancelOutbound(delegationId: string, actor: string, reason?: string): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'outbound') throw new Error('Only outbound delegations can be cancelled');
    if (row.status === 'approved' || row.status === 'rejected' || row.status === 'cancelled') {
      throw new Error(`Cannot cancel from terminal status '${row.status}'`);
    }
    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'cancelled', rejection_reason = ?, closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      reason ?? null, delegationId,
    );
    await logEvent(delegationId, 'cancelled', actor, { reason });
    return (await getDelegation(delegationId))!;
  }

  // ── Listings + log access ──────────────────────────────────────────────

  async function listMissionDelegations(missionId: string): Promise<MissionDelegationRow[]> {
    return db.all<MissionDelegationRow>(
      `SELECT * FROM missions.mission_delegations WHERE mission_id = ? OR sub_mission_id = ? ORDER BY created_at DESC`,
      missionId, missionId,
    );
  }

  async function listInbound(): Promise<MissionDelegationRow[]> {
    return db.all<MissionDelegationRow>(
      `SELECT * FROM missions.mission_delegations
       WHERE direction = 'inbound' AND status IN ('received', 'accepted', 'in_progress')
       ORDER BY created_at DESC LIMIT 100`,
    );
  }

  async function getDelegationLog(delegationId: string): Promise<Array<{ id: number; event: string; actor: string | null; details: unknown; created_at: string }>> {
    return db.all(
      `SELECT id, event, actor, details, created_at
       FROM missions.mission_delegation_log WHERE delegation_id = ? ORDER BY created_at ASC`,
      delegationId,
    );
  }

  return {
    createOutboundDelegation,
    sendDelegation,
    receiveDelegation,
    acceptInbound,
    declineInbound,
    submitInboundResult,
    receiveDelegationResult,
    approveResult,
    rejectResult,
    cancelOutbound,
    getDelegation,
    listMissionDelegations,
    listInbound,
    getDelegationLog,
  };
}

export type MissionDelegationService = Awaited<ReturnType<typeof createMissionDelegation>>;

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
}
