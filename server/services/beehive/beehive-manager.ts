// ── Beehive Manager — Lifecycle Orchestration ──────────────────────────────
// Sits above beehive-state.ts. Handles: create, invite, join, leave, archive,
// disclosure-policy updates. Round/contribution/synthesis logic lives in
// future modules (Phase 2+).

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../db/database.js';
import { createBeehiveState } from './beehive-state.js';

// Re-export so the transaction body in inviteParticipant can build a
// state object scoped to the tx adapter without circular re-imports.
const createBeehiveStateInTx = createBeehiveState;
import {
  DEFAULT_GOVERNANCE,
  DEFAULT_DISCLOSURE,
  type CreateHiveInput,
  type InviteParticipantInput,
  type JoinHiveInput,
  type DisclosurePolicy,
  type Hive,
  type HiveParticipant,
  type LocalHiveState,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function newHiveId(): string {
  return `hive_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export function createBeehiveManager(db: DatabaseAdapter) {
  const state = createBeehiveState(db);

  /**
   * Create a new hive. The creator (`queenContactHash`) is automatically
   * added as the Queen participant with `joined` status.
   */
  async function createHive(
    input: CreateHiveInput,
    queenContactHash: string,
    queenDisplayName: string,
    queenDisclosurePolicy?: Partial<DisclosurePolicy>,
  ): Promise<Hive> {
    if (!input.name?.trim()) throw new Error('Hive name is required');
    if (!input.question?.trim()) throw new Error('Hive question is required');
    if (!input.type) throw new Error('Hive type is required');
    if (!queenContactHash?.trim()) throw new Error('Queen contact hash is required');

    const id = newHiveId();
    const ts = nowIso();
    const hive: Hive = {
      id,
      name: input.name.trim(),
      question: input.question.trim(),
      description: input.description?.trim() || null,
      type: input.type,
      status: 'forming',
      governance: { ...DEFAULT_GOVERNANCE, ...(input.governance ?? {}) },
      created_by: queenContactHash,
      max_participants: input.max_participants ?? 12,
      ttl_hours: input.ttl_hours ?? null,
      current_round: 0,
      consensus_temperature: 0,
      created_at: ts,
      concluded_at: null,
      updated_at: ts,
    };

    await state.insertHive(hive);

    // Queen joins immediately as part of creation
    await state.addParticipant(id, {
      anton_contact_hash: queenContactHash,
      display_name: queenDisplayName,
      role: 'queen',
      disclosure_policy: { ...DEFAULT_DISCLOSURE, ...(queenDisclosurePolicy ?? {}) },
      invitation_status: 'joined',
      status: 'active',
      joinedAt: ts,
    });

    return hive;
  }

  /**
   * Invite a participant to a hive. Idempotent: if already invited, returns
   * the existing record without changes.
   *
   * The capacity check + insert run inside a transaction so concurrent invites
   * can't both pass the capacity check and exceed the cap.
   */
  async function inviteParticipant(
    hiveId: string,
    invitedBy: string,
    input: InviteParticipantInput,
  ): Promise<HiveParticipant> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    if (hive.status === 'concluded' || hive.status === 'archived') {
      throw new Error(`Cannot invite to a ${hive.status} hive`);
    }
    if (hive.status === 'converging' && !hive.governance.allow_late_join) {
      throw new Error('Hive is in convergence; late joins not permitted');
    }

    const queen = await state.getParticipant(hiveId, hive.created_by);
    if (!queen || queen.role !== 'queen' || queen.anton_contact_hash !== invitedBy) {
      throw new Error('Only the Queen can invite participants');
    }

    return db.transaction(async (txDb) => {
      const txState = createBeehiveStateInTx(txDb);
      const participants = await txState.listParticipants(hiveId);
      const existing = participants.find(p => p.anton_contact_hash === input.anton_contact_hash);
      if (existing) return existing;

      const activeCount = participants.filter(p => p.invitation_status !== 'declined' && p.status !== 'left').length;
      if (activeCount >= hive.max_participants) {
        throw new Error('Hive is at maximum participant capacity');
      }

      return txState.addParticipant(hiveId, {
        anton_contact_hash: input.anton_contact_hash,
        display_name: input.display_name,
        role: input.role,
        disclosure_policy: { ...DEFAULT_DISCLOSURE },
        invitation_status: 'invited',
        status: 'active',
      });
    });
  }

  /**
   * A participant joins a hive they've been invited to. Updates their
   * disclosure policy and marks them as joined.
   *
   * In v1 (local-only) this can also be used to simulate a participant
   * joining without an explicit prior invite — when called for an unknown
   * contact hash on a `forming` hive, an invitation+join is performed in
   * one step. Phase 4 will tighten this to require a real AAP invite.
   */
  async function joinHive(hiveId: string, input: JoinHiveInput): Promise<HiveParticipant> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    if (hive.status === 'concluded' || hive.status === 'archived') {
      throw new Error(`Cannot join a ${hive.status} hive`);
    }
    if (hive.status !== 'forming' && !hive.governance.allow_late_join) {
      throw new Error('Late joins not permitted for this hive');
    }

    const policy: DisclosurePolicy = { ...DEFAULT_DISCLOSURE, ...(input.disclosure_policy ?? {}) };
    const existing = await state.getParticipant(hiveId, input.anton_contact_hash);

    if (existing) {
      if (existing.invitation_status === 'declined' || existing.status === 'left') {
        throw new Error('Cannot rejoin a hive after declining or leaving');
      }
      await state.updateParticipantStatus(hiveId, input.anton_contact_hash, {
        invitation_status: 'joined',
        status: 'active',
        disclosure_policy: policy,
        joined_at: existing.joined_at ?? nowIso(),
      });
      const updated = await state.getParticipant(hiveId, input.anton_contact_hash);
      if (!updated) throw new Error('Participant disappeared after update');
      return updated;
    }

    if (hive.status !== 'forming') {
      throw new Error('Only invited participants can join an active hive');
    }

    return state.addParticipant(hiveId, {
      anton_contact_hash: input.anton_contact_hash,
      display_name: input.display_name,
      role: 'worker',
      disclosure_policy: policy,
      invitation_status: 'joined',
      status: 'active',
      joinedAt: nowIso(),
    });
  }

  async function declineInvitation(hiveId: string, contactHash: string): Promise<void> {
    const participant = await state.getParticipant(hiveId, contactHash);
    if (!participant) throw new Error('No invitation found');
    if (participant.invitation_status === 'joined') {
      throw new Error('Cannot decline after joining; use leave instead');
    }
    await state.updateParticipantStatus(hiveId, contactHash, {
      invitation_status: 'declined',
      status: 'left',
    });
  }

  async function leaveHive(hiveId: string, contactHash: string): Promise<void> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    const participant = await state.getParticipant(hiveId, contactHash);
    if (!participant) throw new Error('Not a participant of this hive');
    if (participant.role === 'queen' && hive.status !== 'concluded' && hive.status !== 'archived') {
      throw new Error('Queen cannot leave an active hive — conclude or archive first');
    }
    await state.updateParticipantStatus(hiveId, contactHash, {
      invitation_status: 'left',
      status: 'left',
    });
  }

  async function updateDisclosurePolicy(
    hiveId: string,
    contactHash: string,
    policyPatch: Partial<DisclosurePolicy>,
  ): Promise<DisclosurePolicy> {
    const participant = await state.getParticipant(hiveId, contactHash);
    if (!participant) throw new Error('Not a participant of this hive');
    const next: DisclosurePolicy = { ...participant.disclosure_policy, ...policyPatch };
    await state.updateParticipantStatus(hiveId, contactHash, { disclosure_policy: next });
    return next;
  }

  async function archiveHive(hiveId: string, requesterHash: string): Promise<void> {
    const hive = await state.getHive(hiveId);
    if (!hive) throw new Error('Hive not found');
    if (hive.created_by !== requesterHash) {
      throw new Error('Only the Queen can archive a hive');
    }
    await state.updateHiveStatus(hiveId, 'archived');
  }

  async function getHiveState(hiveId: string): Promise<LocalHiveState | null> {
    return state.loadFullState(hiveId);
  }

  async function listHives(filter?: Parameters<typeof state.listHives>[0]): Promise<Hive[]> {
    return state.listHives(filter);
  }

  return {
    createHive,
    inviteParticipant,
    joinHive,
    declineInvitation,
    leaveHive,
    updateDisclosurePolicy,
    archiveHive,
    getHiveState,
    listHives,
    state, // expose for downstream services in later phases
  };
}

export type BeehiveManager = ReturnType<typeof createBeehiveManager>;
