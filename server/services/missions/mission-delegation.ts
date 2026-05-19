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

/**
 * One task in a delegated sub-graph (Phase B1). `dependsOn` holds
 * zero-based indices into the same `tasks` array — the recipient rebuilds
 * the DAG from these when accepting.
 */
export interface SubgraphTask {
  title: string;
  description?: string;
  taskType?: string;                       // mission_tasks.task_type; defaults to 'llm'
  dependsOn?: number[];                    // indices into the tasks array
}

export interface DelegationBrief {
  title: string;
  objective: string;
  context?: Record<string, unknown>;
  requiredModules?: string[];
  expectedOutput?: string;
  deadline?: string;                       // ISO timestamp
  paymentAmountFtc?: number;
  tasks?: SubgraphTask[];                  // Phase B1 — sub-graph delegation
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
  brief_tasks: unknown;
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

/** A connected peer ranked as a delegation target (Phase B2). */
export interface PeerSuggestion {
  contactHash: string;
  displayName: string | null;
  endpoint: string | null;
  trustLevel: string;
  score: number;
  matchedAgents: string[];
}

export async function createMissionDelegation(db: DatabaseAdapter) {
  const { createSigningService } = await import('../community-signing-service.js');
  const signing = await createSigningService(db);

  function newDelegationId(): string { return randomUUID(); }

  /**
   * Canonical JSON serialisation for signing — RECURSIVE deep-sort of object
   * keys, no whitespace, arrays preserve order. Both sides MUST use this
   * exact algorithm to verify. Top-level-only sorting is fragile because
   * nested objects (brief.context, brief) can serialise differently.
   */
  function canonical(value: unknown): string {
    return JSON.stringify(deepSort(value));
  }
  function deepSort(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(deepSort);
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = deepSort((value as Record<string, unknown>)[k]);
    }
    return sorted;
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

  /**
   * Phase 5.5 — notify the originator that an inbound delegation was
   * accepted or declined. Signs a small notice and queues it back over
   * the same community transport (message_type 'mission_delegation_status').
   * `row` is the INBOUND delegation; its peer_contact_hash IS the originator.
   */
  async function notifyOriginator(row: MissionDelegationRow, status: 'accepted' | 'declined', reason?: string | null): Promise<void> {
    const identity = await db.get<{ contact_hash: string; public_key: string; private_key_encrypted: string | null }>(
      `SELECT contact_hash, public_key, private_key_encrypted FROM community_identity LIMIT 1`,
    );
    if (!identity) throw new Error('No local community_identity');
    const canonicalNotice = canonical({ delegationId: row.id, status, reason: reason ?? null });
    const signature = signing.ed25519Sign(canonicalNotice, identity.private_key_encrypted);
    const envelope = {
      payload_json: canonicalNotice, signature_b64: signature,
      signer_contact_hash: identity.contact_hash, signer_public_key: identity.public_key, sig_alg: 'ed25519',
    };
    const mailId = `cm_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, message_type, payload, payload_metadata)
       VALUES (?, ?, ?, ?, ?, 'mission_delegation_status', ?, ?)`,
      mailId, identity.contact_hash, JSON.stringify([row.peer_contact_hash]),
      `[Delegation ${status}] ${row.brief_title}`,
      `The delegated brief "${row.brief_title}" was ${status}.`,
      JSON.stringify(envelope),
      JSON.stringify({ delegation_id: row.id, kind: 'status', status }),
    );
    const queueId = `mq_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO community_message_queue (id, mail_id, recipient_hash, status)
       VALUES (?, ?, ?, 'pending')`,
      queueId, mailId, row.peer_contact_hash,
    );
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
         brief_title, brief_objective, brief_context, required_modules, brief_tasks,
         expected_output, deadline, payment_amount_ftc, status)
       VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      id, input.missionId, input.taskId ?? null,
      input.peerContactHash, conn.display_name, conn.endpoint,
      input.brief.title, input.brief.objective,
      JSON.stringify(input.brief.context ?? {}),
      JSON.stringify(input.brief.requiredModules ?? []),
      input.brief.tasks && input.brief.tasks.length > 0 ? JSON.stringify(input.brief.tasks) : null,
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
        tasks: parseJson<SubgraphTask[] | null>(row.brief_tasks, null),
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
    // 0. Idempotency — same id from same peer should not insert twice
    const existing = await getDelegation(input.delegationId);
    if (existing) {
      if (existing.direction !== 'inbound') throw new Error(`Delegation id collision with outbound record: ${input.delegationId}`);
      return existing;
    }

    // 1. Bind signer_public_key to the stored community_connections.public_key
    //    for the claimed sender. Otherwise an attacker who is an accepted
    //    contact could sign a delegation as a DIFFERENT contact by supplying
    //    their own public key — the raw ed25519Verify only proves "someone
    //    holding *this* private key signed the payload".
    const conn = await db.get<{ public_key: string | null; status: string }>(
      `SELECT public_key, status FROM community_connections WHERE contact_hash = ?`,
      input.fromContactHash,
    );
    const canonicalPayload = canonical({
      delegationId: input.delegationId,
      fromContactHash: input.fromContactHash,
      fromDisplayName: input.fromDisplayName,
      brief: input.brief,
    });
    const keyMatchesPeer = !!conn?.public_key
      && conn.public_key.toLowerCase() === input.signerPublicKey.toLowerCase();
    const peerActive = conn?.status === 'accepted' || conn?.status === 'active';
    const verified = keyMatchesPeer && peerActive
      && signing.ed25519Verify(canonicalPayload, input.signature, input.signerPublicKey);

    // 3. Insert + log
    await db.run(
      `INSERT INTO missions.mission_delegations
        (id, direction, peer_contact_hash, peer_display_name,
         brief_title, brief_objective, brief_context, required_modules, brief_tasks,
         expected_output, deadline, payment_amount_ftc,
         status, signed_payload, signature_verified, signature_verified_at, inbound_mail_id)
       VALUES (?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      input.delegationId, input.fromContactHash, input.fromDisplayName ?? null,
      input.brief.title, input.brief.objective,
      JSON.stringify(input.brief.context ?? {}),
      JSON.stringify(input.brief.requiredModules ?? []),
      input.brief.tasks && input.brief.tasks.length > 0 ? JSON.stringify(input.brief.tasks) : null,
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
      // Create a local sub-mission directly against missions.missions (we
      // bypass createMission because the brief was authored REMOTELY, but
      // the local accepter still owns the row via created_by).
      subMissionId = `mis_${randomUUID()}`;
      const { resolveUserId } = await import('./mission-identity.js');
      const userId = await resolveUserId(db);
      const successCriteria = row.expected_output ?? `Deliver against the delegated brief: ${row.brief_objective.slice(0, 200)}`;
      await db.run(
        `INSERT INTO missions.missions
          (id, title, objective, success_criteria, status, autonomy_level, created_by, origin_delegation_id)
         VALUES (?, ?, ?, ?, 'briefed', 'check_in', ?, ?)`,
        subMissionId,
        `[delegated] ${row.brief_title}`,
        row.brief_objective,
        successCriteria,
        userId,
        delegationId,
      );
      // Link the delegation back to the new sub-mission
      await db.run(
        `UPDATE missions.mission_delegations SET sub_mission_id = ? WHERE id = ?`,
        subMissionId, delegationId,
      );

      // Phase B1 — if the delegation carried a sub-graph, pre-build the
      // sub-mission's tasks + dependency edges so no LLM decomposition is
      // needed: the delegated plan IS the plan. The accepter still approves
      // it before it runs (the sub-mission stays 'briefed').
      const subTasks = parseJson<SubgraphTask[]>(row.brief_tasks, []);
      if (Array.isArray(subTasks) && subTasks.length > 0) {
        const ALLOWED_TYPES = new Set([
          'llm', 'research', 'analysis', 'export', 'review', 'notification',
          'checkpoint', 'conditional', 'parallel_group', 'browser', 'api_call', 'database_query',
        ]);
        const idByIndex: string[] = [];
        for (let i = 0; i < subTasks.length; i++) {
          const t = subTasks[i];
          const taskId = `tsk_${randomUUID()}`;
          idByIndex.push(taskId);
          const taskType = t.taskType && ALLOWED_TYPES.has(t.taskType) ? t.taskType : 'llm';
          await db.run(
            `INSERT INTO missions.mission_tasks
              (id, mission_id, title, description, task_type, status, sort_order)
             VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
            taskId, subMissionId, t.title.slice(0, 200), t.description ?? null, taskType, i,
          );
        }
        for (let i = 0; i < subTasks.length; i++) {
          for (const dep of subTasks[i].dependsOn ?? []) {
            if (dep >= 0 && dep < idByIndex.length && dep !== i) {
              await db.run(
                `INSERT INTO missions.mission_task_dependencies (task_id, depends_on_task_id)
                 VALUES (?, ?) ON CONFLICT DO NOTHING`,
                idByIndex[i], idByIndex[dep],
              );
            }
          }
        }
        await logEvent(delegationId, 'subgraph_built', actor, { task_count: subTasks.length, sub_mission_id: subMissionId });
      }
    }

    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      delegationId,
    );
    await logEvent(delegationId, 'accepted', actor, { sub_mission_id: subMissionId });

    // Phase 5.5 — tell the originator we accepted, so their outbound
    // delegation moves sent → in_progress. Best-effort: the accept itself
    // already stands; a transport failure must not roll it back.
    try {
      await notifyOriginator(row, 'accepted');
      await logEvent(delegationId, 'accept_notified', actor, {});
    } catch (notifyErr) {
      await logEvent(delegationId, 'accept_notify_failed', null, { error: String(notifyErr) });
    }

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

    // Phase 5.5 — tell the originator we declined (with the reason), so
    // their outbound delegation moves sent → declined. Best-effort.
    try {
      await notifyOriginator(row, 'declined', reason ?? null);
      await logEvent(delegationId, 'decline_notified', actor, {});
    } catch (notifyErr) {
      await logEvent(delegationId, 'decline_notify_failed', null, { error: String(notifyErr) });
    }

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
    // Reject `path` references on outbound result files — the originator side
    // would otherwise have a file path supplied by the recipient sitting in
    // its DB. Force inline content. (Filenames are still validated separately
    // by the delivery channel.)
    if (result.files) {
      for (const f of result.files) {
        if (f.path) throw new Error(`File '${f.filename}': only inline content is permitted in delegation results, not local paths`);
      }
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

    // Bind signer key to the recorded peer's stored public_key — same defence
    // as receiveDelegation: a different accepted contact must not be able to
    // forge a result for someone else's delegation.
    const conn = await db.get<{ public_key: string | null }>(
      `SELECT public_key FROM community_connections WHERE contact_hash = ?`,
      row.peer_contact_hash,
    );
    const keyMatchesPeer = conn?.public_key
      && conn.public_key.toLowerCase() === signedResult.signer_public_key.toLowerCase();
    const signerHashMatchesPeer = signedResult.signer_contact_hash === row.peer_contact_hash;
    const sigOk = keyMatchesPeer && signerHashMatchesPeer
      && signing.ed25519Verify(signedResult.payload_json, signedResult.signature_b64, signedResult.signer_public_key);

    if (!sigOk) {
      // Refuse to write the result. Mark delegation as failed so it cannot
      // be approved. Reject any forged result outright.
      await db.run(
        `UPDATE missions.mission_delegations
         SET status = 'failed', result_signature_verified = FALSE,
             rejection_reason = ?, updated_at = NOW()
         WHERE id = ?`,
        'Signature verification failed on returned result', delegationId,
      );
      await logEvent(delegationId, 'signature_failed', row.peer_contact_hash, { kind: 'result' });
      await logEvent(delegationId, 'failed', null, { reason: 'invalid_result_signature' });
      return (await getDelegation(delegationId))!;
    }

    let parsedPayload: unknown = null;
    try { parsedPayload = JSON.parse(signedResult.payload_json); } catch { /* keep null */ }

    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'completed', completed_at = NOW(),
           result_payload = ?, result_files = ?, result_signed_payload = ?,
           result_signature_verified = TRUE, updated_at = NOW()
       WHERE id = ?`,
      JSON.stringify(parsedPayload),
      JSON.stringify(signedResult.files ?? []),
      JSON.stringify(signedResult), delegationId,
    );
    await logEvent(delegationId, 'completed', row.peer_contact_hash, { signature_verified: true });
    if (row.mission_id) {
      await db.run(
        `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
         VALUES (?, ?, 'delegation_result_received', ?, ?)`,
        row.mission_id, row.task_id,
        `Result received from ${row.peer_display_name ?? row.peer_contact_hash.slice(0, 12)} (signature verified)`,
        JSON.stringify({ delegation_id: row.id, signature_verified: true }),
      );
    }
    return (await getDelegation(delegationId))!;
  }

  // ── Outbound side receives an accept / decline notice (Phase 5.5) ───────

  async function receiveStatusUpdate(
    delegationId: string,
    signedNotice: { payload_json: string; signature_b64: string; signer_public_key: string; signer_contact_hash: string },
  ): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Unknown delegation: ${delegationId}`);
    if (row.direction !== 'outbound') throw new Error('Status update received for a non-outbound delegation');

    // Bind the signer to the recorded peer — same defence as
    // receiveDelegationResult: a different accepted contact must not be
    // able to forge an accept/decline for someone else's delegation.
    const conn = await db.get<{ public_key: string | null }>(
      `SELECT public_key FROM community_connections WHERE contact_hash = ?`,
      row.peer_contact_hash,
    );
    const keyMatchesPeer = !!conn?.public_key
      && conn.public_key.toLowerCase() === signedNotice.signer_public_key.toLowerCase();
    const signerHashMatchesPeer = signedNotice.signer_contact_hash === row.peer_contact_hash;
    const sigOk = keyMatchesPeer && signerHashMatchesPeer
      && signing.ed25519Verify(signedNotice.payload_json, signedNotice.signature_b64, signedNotice.signer_public_key);
    if (!sigOk) {
      await logEvent(delegationId, 'signature_failed', row.peer_contact_hash, { kind: 'status' });
      return row;   // forged or altered notice — ignore, do not move state
    }

    let notice: { status?: string; reason?: string | null } = {};
    try { notice = JSON.parse(signedNotice.payload_json) as typeof notice; } catch { /* keep empty */ }
    const peerStatus = notice.status;

    // Only a still-'sent' outbound delegation reacts; anything later already
    // has a definitive state. Idempotent — a repeated notice is a no-op.
    if (row.status !== 'sent') {
      await logEvent(delegationId, 'status_update_ignored', row.peer_contact_hash, { peer_status: peerStatus, current: row.status });
      return row;
    }

    if (peerStatus === 'accepted') {
      await db.run(
        `UPDATE missions.mission_delegations
         SET status = 'in_progress', accepted_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        delegationId,
      );
      await logEvent(delegationId, 'peer_accepted', row.peer_contact_hash, {});
      if (row.mission_id) {
        await db.run(
          `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
           VALUES (?, ?, 'delegation_accepted', ?, ?)`,
          row.mission_id, row.task_id,
          `${row.peer_display_name ?? row.peer_contact_hash.slice(0, 12)} accepted: ${row.brief_title}`,
          JSON.stringify({ delegation_id: row.id }),
        );
      }
    } else if (peerStatus === 'declined') {
      await db.run(
        `UPDATE missions.mission_delegations
         SET status = 'declined', rejection_reason = ?, closed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        notice.reason ?? null, delegationId,
      );
      await logEvent(delegationId, 'peer_declined', row.peer_contact_hash, { reason: notice.reason ?? null });
      if (row.mission_id) {
        await db.run(
          `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
           VALUES (?, ?, 'delegation_declined', ?, ?)`,
          row.mission_id, row.task_id,
          `${row.peer_display_name ?? row.peer_contact_hash.slice(0, 12)} declined: ${row.brief_title}`,
          JSON.stringify({ delegation_id: row.id, reason: notice.reason ?? null }),
        );
      }
    } else {
      await logEvent(delegationId, 'status_update_unknown', row.peer_contact_hash, { peer_status: peerStatus });
      return row;
    }
    return (await getDelegation(delegationId))!;
  }

  // ── Outbound action: approve / reject the result ────────────────────────

  /**
   * Phase D0 — pay-on-approval. Routes the delegation's payment_amount_ftc
   * through the mission payment pipeline (propose → approve → execute).
   * Settlement is stubbed in fc-transaction-service until the FutureChain
   * core is vendored; this wires the full loop so it is testable today.
   * Requires the mission to have a financial budget + wallet configured,
   * and the peer connection to carry an FC payment address.
   */
  async function initiateDelegationPayment(row: MissionDelegationRow, amount: number, approverActor: string): Promise<string> {
    if (!row.mission_id) throw new Error('delegation has no mission to bill the payment against');
    const conn = await db.get<{ payment_address: string | null; agent_wallet_address: string | null; display_name: string | null }>(
      `SELECT payment_address, agent_wallet_address, display_name
       FROM community_connections WHERE contact_hash = ?`,
      row.peer_contact_hash,
    );
    const recipientAddress = String(conn?.payment_address ?? conn?.agent_wallet_address ?? '').trim();
    if (!recipientAddress) throw new Error('peer connection has no FC payment address');

    const { createMissionBudget } = await import('./mission-budget.js');
    const budget = await createMissionBudget(db);
    const payment = await budget.proposePayment({
      missionId: row.mission_id,
      taskId: row.task_id ?? undefined,
      recipientAddress,
      recipientLabel: row.peer_display_name ?? conn?.display_name ?? row.peer_contact_hash.slice(0, 12),
      amountFtc: amount,
      category: 'delegation',
      purpose: `Delegated work: ${row.brief_title}`.slice(0, 200),
    }, 'delegation-system');
    // 'delegation-system' proposed it; the human delegation-approver approves
    // — distinct actors, so the pipeline's separation-of-duties rule holds.
    await budget.approvePayment(payment.id, approverActor);
    return payment.id;
  }

  /**
   * Phase B3 — result ingestion. Folds an approved delegation's result back
   * into the originating mission: the delegated task is marked completed
   * with the peer's result as its output, so the originating mission can
   * advance past it instead of the result sitting inert in result_payload.
   */
  async function ingestDelegationResult(row: MissionDelegationRow): Promise<void> {
    if (!row.task_id || !row.mission_id) return;
    const result = parseJson<Record<string, unknown> | null>(row.result_payload, null);
    const peerLabel = row.peer_display_name ?? row.peer_contact_hash.slice(0, 12);
    const summary = (result && typeof result === 'object' && typeof result.summary === 'string')
      ? result.summary
      : `Delegated to ${peerLabel} — result received and approved`;
    const full = result != null ? JSON.stringify(result, null, 2) : null;
    await db.run(
      `UPDATE missions.mission_tasks
       SET status = 'completed', output_summary = ?, output_full = ?, completed_at = NOW()
       WHERE id = ? AND mission_id = ?`,
      summary.slice(0, 2000), full, row.task_id, row.mission_id,
    );
    await logEvent(row.id, 'result_ingested', null, { task_id: row.task_id });
    await db.run(
      `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
       VALUES (?, ?, 'delegation_result_ingested', ?, ?)`,
      row.mission_id, row.task_id,
      `Delegated result from ${peerLabel} folded into the originating task`,
      JSON.stringify({ delegation_id: row.id }),
    );
  }

  async function approveResult(delegationId: string, actor: string): Promise<MissionDelegationRow> {
    const row = await getDelegation(delegationId);
    if (!row) throw new Error(`Delegation not found: ${delegationId}`);
    if (row.direction !== 'outbound') throw new Error('Only outbound delegations can be approved');
    if (row.status !== 'completed') throw new Error(`Cannot approve from status '${row.status}'`);
    // Belt-and-braces: receiveDelegationResult already gates on signature,
    // but never trust a single check — verify here too.
    if (row.result_signature_verified !== true) {
      throw new Error('Cannot approve a result whose signature did not verify');
    }
    await db.run(
      `UPDATE missions.mission_delegations
       SET status = 'approved', closed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      delegationId,
    );
    await logEvent(delegationId, 'approved', actor, {});

    // Phase D0 — pay-on-approval. If the brief carried a payment amount,
    // route it through the mission payment pipeline. Best-effort: a payment
    // failure (no mission budget / wallet / peer address, category not
    // whitelisted) must never un-approve the result.
    const payAmount = row.payment_amount_ftc != null ? Number(row.payment_amount_ftc) : 0;
    if (payAmount > 0) {
      try {
        const paymentId = await initiateDelegationPayment(row, payAmount, actor);
        await logEvent(delegationId, 'payment_proposed', actor, { payment_id: paymentId, amount_ftc: payAmount });
      } catch (payErr) {
        await logEvent(delegationId, 'payment_skipped', null, { amount_ftc: payAmount, reason: String(payErr) });
      }
    }

    // Phase B3 — fold the peer's result back into the originating mission.
    // Best-effort: a failure here must not un-approve the result.
    if (row.task_id && row.mission_id) {
      try {
        await ingestDelegationResult(row);
      } catch (ingestErr) {
        await logEvent(delegationId, 'result_ingest_failed', null, { reason: String(ingestErr) });
      }
    }

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

  // ── Phase B2 — capability-aware peer selection ──────────────────────────

  /**
   * Rank connected peers as delegation targets. Primary signal is the
   * connection's `delegation_trust_level`; if a query is supplied, peers'
   * advertised agents are matched against it as a bonus (best-effort —
   * offline peers simply fall back to trust-only ranking).
   */
  async function suggestDelegationPeers(query?: string): Promise<PeerSuggestion[]> {
    const peers = await db.all<{
      contact_hash: string; display_name: string | null; endpoint: string | null;
      delegation_trust_level: string; status: string;
    }>(
      `SELECT contact_hash, display_name, endpoint, delegation_trust_level, status
       FROM community_connections WHERE status IN ('accepted', 'active')`,
    );
    const TRUST: Record<string, number> = { pre_approved: 3, self: 3, suggested: 2, manual: 1 };

    const agentsByPeer = new Map<string, string[]>();
    const q = (query ?? '').trim();
    if (q) {
      try {
        const { createRemoteAgentClient } = await import('../remote-agent-client.js');
        const rac = await createRemoteAgentClient(db);
        const agents = await rac.discoverRemoteAgents();
        for (const a of agents as Array<{ peerHash: string; keywords?: unknown }>) {
          const kws = Array.isArray(a.keywords) ? (a.keywords as string[]) : [];
          agentsByPeer.set(a.peerHash, [...(agentsByPeer.get(a.peerHash) ?? []), ...kws]);
        }
      } catch { /* peers offline — trust-only ranking */ }
    }
    const qWords = q.toLowerCase().split(/\s+/).filter(Boolean);

    const ranked: PeerSuggestion[] = peers.map((p) => {
      const trustScore = (TRUST[p.delegation_trust_level] ?? 1) * 10;
      const kws = agentsByPeer.get(p.contact_hash) ?? [];
      const matched = kws.filter((k) =>
        qWords.some((w) => k.toLowerCase().includes(w) || w.includes(k.toLowerCase())));
      return {
        contactHash: p.contact_hash,
        displayName: p.display_name,
        endpoint: p.endpoint,
        trustLevel: p.delegation_trust_level,
        score: trustScore + matched.length * 5,
        matchedAgents: [...new Set(matched)],
      };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  return {
    createOutboundDelegation,
    sendDelegation,
    receiveDelegation,
    acceptInbound,
    declineInbound,
    submitInboundResult,
    receiveDelegationResult,
    receiveStatusUpdate,
    approveResult,
    rejectResult,
    cancelOutbound,
    getDelegation,
    listMissionDelegations,
    listInbound,
    getDelegationLog,
    suggestDelegationPeers,
  };
}

export type MissionDelegationService = Awaited<ReturnType<typeof createMissionDelegation>>;

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
}
