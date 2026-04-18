/**
 * aap-rollout-bridge.ts — wire maintain rollouts to Companion App app_checkpoints (Phase 9).
 *
 * The Phase 6 maintain pipeline reserves the `aap-store-and-forward` delivery
 * channel for sending patches via the field operator's paired phone. This
 * bridge fulfils that reservation.
 *
 * For each rollout in a stage targeting that channel, we create one
 * `app_checkpoint` per affected device, addressed to the project owner's
 * connected phone. The operator approves or rejects on the phone; on approve,
 * the rollout transitions to 'queued' (the actual flash is owner-side, often
 * via USB/UART when the device is in hand).
 *
 * Honest scope: device-to-phone pairing today is by project owner only — one
 * paired phone per project. Per-device paired-phone routing is a future
 * extension. The checkpoint's `payload` carries the patch metadata + rollback
 * artefact reference; the actual firmware binary stays in ANTON storage and
 * is fetched by the phone via a deep link to the Companion App download UI.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { createAppCheckpointService, type CheckpointSeverity } from './app-checkpoint-service.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AapDispatchInput {
  project_id: string;
  stage_id: string;
  /** Patch plan + stage metadata for the checkpoint payload */
  plan_title: string;
  stage_title: string;
  rollback_artefact_ref: string | null;
  /** Project owner — used to route the checkpoint to the owner's connected user */
  owner_id: string;
  device_count: number;
  /** Tier 3 + safety-critical → high severity; otherwise normal */
  severity: CheckpointSeverity;
}

export interface AapDispatchResult {
  checkpoint_id: string | null;        // null when no paired phone exists
  reason: string;
  paired_phone_user_id: string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export function createAapRolloutBridge(db: DatabaseAdapter) {
  const checkpoints = createAppCheckpointService(db);

  /**
   * Locate the connected_user record (paired phone) for a given project owner.
   * Today: 1 paired phone per project owner. Returns null if no paired phone
   * exists — caller should fall back to a different delivery channel.
   */
  async function findPairedPhone(ownerId: string): Promise<{ connected_user_id: string; org_id: string } | null> {
    // Match the project owner against either a connected_user id (UUID) or
    // display_name. Honest scope: there is no formal project-owner ↔ connected-
    // user mapping yet, so the lookup is approximate. Production deployments
    // should add an explicit owner_to_paired_user config.
    const r = await db.get(
      `SELECT cu.id AS connected_user_id, cuo.org_id
       FROM connected_users cu
       LEFT JOIN connected_user_orgs cuo ON cuo.connected_user_id = cu.id
       WHERE cu.id = ? OR cu.display_name = ?
       ORDER BY cuo.joined_at DESC NULLS LAST
       LIMIT 1`,
      ownerId, ownerId,
    ) as { connected_user_id: string; org_id: string | null } | undefined;
    if (!r || !r.org_id) return null;
    return { connected_user_id: r.connected_user_id, org_id: r.org_id };
  }

  async function dispatchPatch(input: AapDispatchInput): Promise<AapDispatchResult> {
    const phone = await findPairedPhone(input.owner_id);
    if (!phone) {
      return {
        checkpoint_id: null,
        paired_phone_user_id: null,
        reason: `No paired phone found for owner ${input.owner_id}. Use delivery_channel='manual' or pair a Companion App device.`,
      };
    }

    const checkpoint = await checkpoints.create({
      org_id: phone.org_id,
      connected_user_id: phone.connected_user_id,
      title: `Approve patch rollout: ${input.plan_title}`,
      summary: `Stage "${input.stage_title}" targets ${input.device_count} device(s).`,
      rationale: input.rollback_artefact_ref
        ? `Rollback artefact in place: ${input.rollback_artefact_ref}.`
        : 'WARNING: no rollback artefact recorded — review pre-flight before approving.',
      severity: input.severity,
      payload: {
        kind: 'hardware-patch-rollout',
        project_id: input.project_id,
        stage_id: input.stage_id,
        device_count: input.device_count,
        rollback_artefact_ref: input.rollback_artefact_ref,
        instructions: 'Tap Approve to mark this rollout queued. The actual flash happens on your bench when devices are in hand.',
      },
      source_kind: 'hardware-rollout',
      source_id: input.stage_id,
      deep_link: `/hardware/projects/${input.project_id}/maintain`,
    });

    return {
      checkpoint_id: checkpoint.id,
      paired_phone_user_id: phone.connected_user_id,
      reason: 'Checkpoint dispatched to paired phone.',
    };
  }

  /**
   * Called when the phone-side approval comes back. Idempotent: only flips
   * `queued` rollouts to `sent`; ignores anything else.
   */
  async function applyApprovalDecision(stageId: string, decision: 'approved' | 'rejected'): Promise<{ updated: number }> {
    const targetStatus = decision === 'approved' ? 'sent' : 'rolled_back';
    const r = await db.run(
      `UPDATE hw_patch_rollouts
       SET status = ?, rollout_started = COALESCE(rollout_started, NOW())
       WHERE stage_id = ? AND status = 'queued'`,
      targetStatus, stageId,
    );
    return { updated: r.changes };
  }

  return { dispatchPatch, applyApprovalDecision, findPairedPhone };
}

export type AapRolloutBridge = ReturnType<typeof createAapRolloutBridge>;
