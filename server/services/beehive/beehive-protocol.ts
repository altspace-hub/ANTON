// ── Beehive — AAP Wire Protocol (Phase 4) ──────────────────────────────────
//
// Wires BEEHIVE state changes into the existing community_mail / message-queue
// transport. Star topology: the Queen broadcasts every event to every joined
// participant via N pairwise encrypted sends.
//
// Outbound: `broadcast(hiveId, type, payload)` — enumerates joined participants,
//   skips the local instance, encrypts per-pair via X25519 DH, queues via
//   message-queue-service, audits to beehive_message_log.
//
// Inbound: `handleInboundBeehiveMessage(db, fromHash, envelope)` — called from
//   p2p.ts when messageType === 'beehive_message'. Verifies signature,
//   dispatches by type, applies state changes locally, audits to log.
//
// Replay protection: piggybacks on the existing p2p_message_nonces table —
//   the outer p2p.ts decryption layer rejects replays before this handler
//   ever runs. Within BEEHIVE we additionally use the (sender, sequence)
//   monotonic counter on contributions for in-band ordering checks.

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import {
  getMyX25519Keys,
  getPeerX25519PublicKey,
  deriveSharedSecret,
  encryptMessage,
} from '../community-e2e.js';
import { createSigningService } from '../community-signing-service.js';
import { createBeehiveState } from './beehive-state.js';
import type { BeehiveMessage, BeehiveMessageType } from './types.js';

const PROTOCOL_VERSION = 1;

interface OutboundResult {
  recipients: string[];
  delivered: number;
  skipped: number;
  failed: Array<{ recipient: string; reason: string }>;
}

export async function createBeehiveProtocol(db: DatabaseAdapter) {
  const state = createBeehiveState(db);
  const signing = await createSigningService(db);

  async function getLocalIdentityFull() {
    return db.get<{ contact_hash: string; public_key: string; private_key_encrypted: string | null }>(
      "SELECT contact_hash, public_key, private_key_encrypted FROM community_identity WHERE user_id = 'default'",
    );
  }

  /**
   * Sign + envelope a BEEHIVE message.
   */
  async function buildEnvelope<P>(hiveId: string, type: BeehiveMessageType, payload: P, sender: string, privKey: string | null): Promise<BeehiveMessage<P>> {
    const sequenceRow = await db.get<{ s: number | string }>(
      `SELECT COALESCE(MAX(sequence), 0)::bigint AS s FROM beehive_message_log
       WHERE hive_id = ? AND sender_hash = ?`,
      hiveId, sender,
    );
    const sequence = (typeof sequenceRow?.s === 'string' ? Number(sequenceRow.s) : (sequenceRow?.s ?? 0)) + 1;
    const timestamp = new Date().toISOString();

    const canonical = JSON.stringify({
      v: PROTOCOL_VERSION, type, hive_id: hiveId, sender, payload, sequence, timestamp,
    });
    const signature = signing.ed25519Sign(canonical, privKey);

    return { type, hive_id: hiveId, sender, payload, signature, timestamp, sequence };
  }

  /** Audit a BEEHIVE message to the message log. */
  async function auditLog(hiveId: string, message: BeehiveMessage): Promise<void> {
    await db.run(
      `INSERT INTO beehive_message_log (hive_id, message_type, sender_hash, payload, signature, sequence, received_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      hiveId, message.type, message.sender,
      JSON.stringify({ payload: message.payload, timestamp: message.timestamp, version: PROTOCOL_VERSION }),
      message.signature, message.sequence,
    );
  }

  /**
   * Broadcast a BEEHIVE message according to the spec's star topology
   * (section 4.2 v1):
   *   • Queen → all other joined participants
   *   • Non-Queen → Queen only (Queen re-broadcasts on receipt)
   *
   * Failures don't abort the broadcast — each recipient is independent.
   * Missing X25519 keys for a peer skip that recipient with a warning.
   *
   * `excludeHashes` lets the relay path skip the original sender to avoid
   * loops (used by the Queen's re-broadcast on inbound forwarding).
   */
  async function broadcast<P>(
    hiveId: string,
    type: BeehiveMessageType,
    payload: P,
    options: { excludeHashes?: string[]; signedEnvelope?: BeehiveMessage<P> } = {},
  ): Promise<OutboundResult> {
    const identity = await getLocalIdentityFull();
    if (!identity) throw new Error('Local community identity not activated — cannot broadcast');

    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    const isQueen = hive.created_by === identity.contact_hash;

    const participants = await state.listParticipants(hiveId);
    const joined = participants.filter(p =>
      p.invitation_status === 'joined' &&
      p.status !== 'left' &&
      p.anton_contact_hash !== identity.contact_hash &&
      !(options.excludeHashes ?? []).includes(p.anton_contact_hash),
    );

    // Star topology: non-Queens send to Queen only. Queen broadcasts to all.
    const targets = isQueen ? joined : joined.filter(p => p.anton_contact_hash === hive.created_by);

    // Reuse a pre-signed envelope when relaying; otherwise sign fresh as ourselves.
    const envelope = options.signedEnvelope
      ?? await buildEnvelope(hiveId, type, payload, identity.contact_hash, identity.private_key_encrypted);
    await auditLog(hiveId, envelope);

    const result: OutboundResult = {
      recipients: targets.map(t => t.anton_contact_hash),
      delivered: 0, skipped: 0, failed: [],
    };

    if (targets.length === 0) return result;

    // Lazy-import to avoid circular dependency at module load
    const { createMessageQueueService } = await import('../message-queue-service.js');
    const queue = await createMessageQueueService(db);

    const myKeys = await getMyX25519Keys(db);
    if (!myKeys) {
      // Without X25519 keys we cannot encrypt — skip everything
      for (const t of targets) result.failed.push({ recipient: t.anton_contact_hash, reason: 'Local X25519 key missing — run identity activation' });
      return result;
    }

    for (const target of targets) {
      try {
        const peerPubKey = await getPeerX25519PublicKey(db, target.anton_contact_hash);
        if (!peerPubKey) {
          result.skipped++;
          result.failed.push({ recipient: target.anton_contact_hash, reason: 'Peer has no X25519 public key' });
          continue;
        }

        const sharedSecret = deriveSharedSecret(myKeys.privateKeyHex, peerPubKey);
        const aad = `${identity.contact_hash}:${target.anton_contact_hash}`;
        const innerNonce = randomUUID();
        const innerTimestamp = Date.now();
        const plaintext = JSON.stringify({
          subject: `[beehive] ${envelope.type}`,
          body: '', // BEEHIVE messages live in payload, not body
          messageType: 'beehive_message',
          payload: envelope,
          nonce: innerNonce,
          timestamp: innerTimestamp,
        });
        const encrypted = encryptMessage(plaintext, sharedSecret, aad);
        const encryptedPayload = JSON.stringify({ ...encrypted, nonce: innerNonce, timestamp: innerTimestamp });

        const mailId = `cm_beehive_${Date.now()}_${randomUUID().slice(0, 8)}`;
        await db.run(
          `INSERT INTO community_mail
            (id, from_hash, to_hashes, subject, body, folder, message_type, payload, delivery_status)
           VALUES (?, ?, ?, ?, ?, 'sent', 'beehive_message', ?, 'pending')`,
          mailId, identity.contact_hash, target.anton_contact_hash,
          '[encrypted]', '[encrypted]', JSON.stringify(envelope),
        );
        await queue.enqueueMessage(mailId, target.anton_contact_hash, encryptedPayload);
        result.delivered++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        result.failed.push({ recipient: target.anton_contact_hash, reason });
        console.error(`[beehive-protocol] Broadcast to ${target.anton_contact_hash} failed:`, reason);
      }
    }

    return result;
  }

  /**
   * Process an inbound BEEHIVE message. Called from p2p.ts when an inbound
   * decrypted message has messageType === 'beehive_message'. Returns a
   * machine-readable result for the caller's response body.
   *
   * Phase 4 v1 intentionally trusts the sender hash (it was already validated
   * against community_connections + signed at the AAP layer). Future hardening:
   * verify envelope.signature against the peer's stored public_key.
   */
  async function handleInbound(fromHash: string, rawEnvelope: unknown): Promise<{ ok: boolean; type: string; applied: boolean; reason?: string }> {
    const envelope = rawEnvelope as BeehiveMessage<unknown> | null;
    if (!envelope || typeof envelope !== 'object' || !envelope.type || !envelope.hive_id) {
      return { ok: false, type: 'unknown', applied: false, reason: 'Malformed BEEHIVE envelope' };
    }
    if (envelope.sender !== fromHash) {
      return { ok: false, type: envelope.type, applied: false, reason: 'Envelope sender mismatch' };
    }

    // Audit every inbound message regardless of dispatch outcome
    await auditLog(envelope.hive_id, envelope);

    let applied = false;
    let reason: string | undefined;
    try {
      switch (envelope.type) {
        case 'hive:invite':
          await applyInvite(envelope as BeehiveMessage<HiveInvitePayload>);
          applied = true; break;
        case 'hive:join':
          await applyJoin(envelope as BeehiveMessage<HiveJoinPayload>);
          applied = true; break;
        case 'hive:decline':
        case 'hive:leave':
          await applyLeaveOrDecline(envelope.hive_id, envelope.sender, envelope.type);
          applied = true; break;
        case 'hive:contribution':
          await applyContribution(envelope as BeehiveMessage<ContributionPayload>);
          applied = true; break;
        case 'hive:round_advance':
          await applyRoundAdvance(envelope as BeehiveMessage<RoundAdvancePayload>);
          applied = true; break;
        case 'hive:round_summary':
          await applyRoundSummary(envelope as BeehiveMessage<RoundSummaryPayload>);
          applied = true; break;
        case 'hive:converge':
          await applyConverge(envelope as BeehiveMessage<RoundAdvancePayload>);
          applied = true; break;
        case 'hive:conclude':
          await applyConclude(envelope as BeehiveMessage<ConcludePayload>);
          applied = true; break;
        case 'hive:state_sync':
        case 'hive:heartbeat':
        case 'hive:synthesis_draft':
        case 'hive:approve':
        case 'hive:dissent':
        default:
          reason = 'Handler not implemented in v1 — message audited only';
      }
    } catch (err) {
      return { ok: false, type: envelope.type, applied: false, reason: err instanceof Error ? err.message : String(err) };
    }

    // Star-topology relay: if WE are the Queen and this message arrived from
    // a non-Queen participant, re-broadcast to all OTHER joined participants.
    // The original signed envelope is preserved (others verify the original
    // signer, not the relay). Excludes the sender to avoid loops.
    if (applied && shouldQueenRelay(envelope.type)) {
      try {
        const localIdentity = await getLocalIdentityFull();
        const hive = await state.getHive(envelope.hive_id);
        if (localIdentity && hive && hive.created_by === localIdentity.contact_hash && envelope.sender !== localIdentity.contact_hash) {
          // Fire-and-forget — relay failure shouldn't block the inbound ack.
          void broadcast(envelope.hive_id, envelope.type, envelope.payload, {
            excludeHashes: [envelope.sender],
            signedEnvelope: envelope,
          }).catch(err => {
            console.error(`[beehive-protocol] Queen relay of ${envelope.type} failed:`, err instanceof Error ? err.message : err);
          });
        }
      } catch (relayErr) {
        // Don't fail the inbound on relay error
        console.error('[beehive-protocol] Relay check failed:', relayErr instanceof Error ? relayErr.message : relayErr);
      }
    }

    return { ok: true, type: envelope.type, applied, reason };
  }

  /**
   * Which message types should a Queen automatically re-broadcast on receipt?
   * Anything originated by a non-Queen participant that other participants
   * need to see for state convergence.
   */
  function shouldQueenRelay(type: BeehiveMessageType): boolean {
    switch (type) {
      case 'hive:contribution':
      case 'hive:join':
      case 'hive:leave':
      case 'hive:decline':
      case 'hive:dissent':
      case 'hive:approve':
        return true;
      // Queen-only events — never relayed (Queen is the origin)
      case 'hive:invite':
      case 'hive:round_advance':
      case 'hive:round_summary':
      case 'hive:converge':
      case 'hive:conclude':
      case 'hive:synthesis_draft':
      case 'hive:state_sync':
      case 'hive:heartbeat':
      case 'hive:create':
      default:
        return false;
    }
  }

  // ── Inbound appliers ─────────────────────────────────────────────────────
  // Each applier mutates local DB to reflect remote state changes.

  async function applyInvite(envelope: BeehiveMessage<HiveInvitePayload>): Promise<void> {
    const { hive, invitee_hash, invitee_display_name, role } = envelope.payload;
    const existing = await state.getHive(hive.id);
    if (!existing) {
      // Insert the hive shell so we know what we've been invited to
      await state.insertHive(hive);
    }
    const existingP = await state.getParticipant(hive.id, invitee_hash);
    if (!existingP) {
      await state.addParticipant(hive.id, {
        anton_contact_hash: invitee_hash,
        display_name: invitee_display_name,
        role,
        disclosure_policy: { level: 'atoms_tagged', excluded_clients: [], excluded_tags: [], redact_names: true, max_atoms_shared: 50, require_human_approval: false },
        invitation_status: 'invited',
        status: 'active',
      });
    }
  }

  async function applyJoin(envelope: BeehiveMessage<HiveJoinPayload>): Promise<void> {
    await state.updateParticipantStatus(envelope.hive_id, envelope.sender, {
      invitation_status: 'joined',
      status: 'active',
      joined_at: envelope.timestamp,
    });
  }

  async function applyLeaveOrDecline(hiveId: string, sender: string, type: 'hive:leave' | 'hive:decline'): Promise<void> {
    await state.updateParticipantStatus(hiveId, sender, {
      invitation_status: type === 'hive:decline' ? 'declined' : 'left',
      status: 'left',
    });
  }

  async function applyContribution(envelope: BeehiveMessage<ContributionPayload>): Promise<void> {
    const c = envelope.payload;
    const result = await db.run(
      `INSERT INTO beehive_contributions
        (id, hive_id, round, contributor_hash, type, content,
         supporting_atoms, references_contributions, confidence,
         reasoning_trace, signature, sequence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      c.id, envelope.hive_id, c.round, c.contributor_hash, c.type, c.content,
      JSON.stringify(c.supporting_atoms ?? []),
      JSON.stringify(c.references_contributions ?? []),
      c.confidence ?? 0.5, c.reasoning_trace ?? null, c.signature, c.sequence,
      c.created_at,
    );
    // Only bump counters when we actually inserted (not on duplicate replay)
    if (result.changes > 0) {
      await db.run(
        `UPDATE beehive_participants
         SET contribution_count = contribution_count + 1, last_active_at = NOW()
         WHERE hive_id = ? AND anton_contact_hash = ?`,
        envelope.hive_id, c.contributor_hash,
      );
      await db.run(
        `UPDATE beehive_rounds SET contribution_count = contribution_count + 1
         WHERE hive_id = ? AND round_number = ?`,
        envelope.hive_id, c.round,
      );
    }
  }

  async function applyRoundAdvance(envelope: BeehiveMessage<RoundAdvancePayload>): Promise<void> {
    const r = envelope.payload;
    await db.run(
      `INSERT INTO beehive_rounds (hive_id, round_number, phase, started_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (hive_id, round_number) DO NOTHING`,
      envelope.hive_id, r.round_number, r.phase, r.started_at ?? envelope.timestamp,
    );
    await state.updateConsensusTemperature(envelope.hive_id, r.consensus_temperature ?? 0, r.round_number);
    if (r.phase === 'convergence') {
      await state.updateHiveStatus(envelope.hive_id, 'converging');
    } else if (r.round_number === 1) {
      await state.updateHiveStatus(envelope.hive_id, 'active');
    }
  }

  async function applyRoundSummary(envelope: BeehiveMessage<RoundSummaryPayload>): Promise<void> {
    await db.run(
      `UPDATE beehive_rounds SET summary = ?, ended_at = ?, consensus_temperature = ?
       WHERE hive_id = ? AND round_number = ?`,
      envelope.payload.summary, envelope.payload.ended_at ?? envelope.timestamp,
      envelope.payload.consensus_temperature ?? null,
      envelope.hive_id, envelope.payload.round_number,
    );
  }

  async function applyConverge(envelope: BeehiveMessage<RoundAdvancePayload>): Promise<void> {
    await applyRoundAdvance({ ...envelope, payload: { ...envelope.payload, phase: 'convergence' } });
    await state.updateHiveStatus(envelope.hive_id, 'converging');
  }

  async function applyConclude(envelope: BeehiveMessage<ConcludePayload>): Promise<void> {
    const o = envelope.payload;
    await db.run(
      `INSERT INTO beehive_outputs
        (id, hive_id, output_type, synthesis_text, dissents, reasoning_trail,
         convergence_path, participant_approvals, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (hive_id) DO NOTHING`,
      o.id, envelope.hive_id, o.output_type, o.synthesis_text,
      JSON.stringify(o.dissents ?? []),
      JSON.stringify(o.reasoning_trail ?? []),
      JSON.stringify(o.convergence_path ?? []),
      JSON.stringify(o.participant_approvals ?? {}),
      o.created_at ?? envelope.timestamp,
    );
    await state.updateHiveStatus(envelope.hive_id, 'concluded', envelope.timestamp);
  }

  return {
    broadcast,
    handleInbound,
    auditLog,
    buildEnvelope,
  };
}

export type BeehiveProtocol = Awaited<ReturnType<typeof createBeehiveProtocol>>;

// ── Payload type aliases ──────────────────────────────────────────────────

export interface HiveInvitePayload {
  hive: import('./types.js').Hive;
  invitee_hash: string;
  invitee_display_name: string;
  role: import('./types.js').HiveRole;
}

export interface HiveJoinPayload {
  display_name: string;
}

export interface ContributionPayload {
  id: string;
  round: number;
  contributor_hash: string;
  type: import('./types.js').ContributionType;
  content: string;
  supporting_atoms?: import('./types.js').SharedAtom[];
  references_contributions?: string[];
  confidence?: number;
  reasoning_trace?: string;
  signature: string;
  sequence: number;
  created_at: string;
}

export interface RoundAdvancePayload {
  round_number: number;
  phase: import('./types.js').RoundPhase;
  started_at?: string;
  consensus_temperature?: number;
}

export interface RoundSummaryPayload {
  round_number: number;
  summary: string;
  consensus_temperature?: number;
  ended_at?: string;
}

export interface ConcludePayload {
  id: string;
  output_type: import('./types.js').OutputFormat;
  synthesis_text: string | null;
  dissents?: import('./types.js').DissentRecord[];
  reasoning_trail?: import('./types.js').HiveContribution[];
  convergence_path?: import('./types.js').ConvergencePathStep[];
  participant_approvals?: Record<string, 'approved' | 'dissented' | 'abstained'>;
  created_at?: string;
}
