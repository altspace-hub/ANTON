// ── Missions — Checkpoint Helpers (Phase 3) ────────────────────────────────
//
// • Heuristic risk pre-screen (keyword-based) that maps obvious matches onto
//   EU AI Act Annex III categories to gate autonomy ceilings. NOT a legal
//   classification or compliance assessment — see classifyMissionRisk.
// • parallel_review checkpoint — creates a BEEHIVE session for multi-reviewer
//   convergence and stores the session id on the mission task.
//
// The mission resumes when BEEHIVE concludes. Phase 3.5 will add a
// scheduler poll that watches the BEEHIVE session status.

import type { DatabaseAdapter } from '../../db/database.js';
import { randomUUID } from 'crypto';

export type RiskClassification = 'standard' | 'high_risk' | 'prohibited';

const HIGH_RISK_KEYWORDS: Record<string, string[]> = {
  employment: ['recruit', 'hire', 'cv screening', 'cv-screening', 'candidate evaluation', 'job application'],
  credit: ['credit score', 'creditworthiness', 'loan approval', 'credit decision', 'lending'],
  compliance: ['regulatory compliance assessment', 'amlr gap', 'amla submission', 'eba reporting'],
};

export interface RiskAssessment {
  classification: RiskClassification;
  category: string | null;
  reasoning: string;
  matched_terms: string[];
}

/**
 * Heuristic pre-screen (keyword-based) — NOT an EU AI Act compliance
 * assessment. Scans the objective + context for ~14 hardcoded substrings
 * that map onto EU AI Act Annex III high-risk categories (employment,
 * credit, compliance) and uses any match to cap the autonomy ceiling.
 * It cannot catch paraphrased or non-English descriptions, and a match
 * does not constitute a legal classification. A proper (LLM-scored)
 * classifier may replace it later; the `reasoning` strings below are
 * user-visible, so keep them honest about being a keyword heuristic.
 */
export function classifyMissionRisk(objective: string, context: string | null): RiskAssessment {
  const haystack = `${objective} ${context ?? ''}`.toLowerCase();
  for (const [category, terms] of Object.entries(HIGH_RISK_KEYWORDS)) {
    const matched = terms.filter(t => haystack.includes(t));
    if (matched.length > 0) {
      return {
        classification: 'high_risk',
        category,
        reasoning: `Keyword pre-screen matched ${category}-related terms: ${matched.join(', ')}. These map onto an EU AI Act Annex III high-risk category, so autonomy is capped as a precaution. This is a heuristic pre-screen, not a legal assessment.`,
        matched_terms: matched,
      };
    }
  }
  return {
    classification: 'standard',
    category: null,
    reasoning: 'Keyword pre-screen found no high-risk indicators (heuristic — paraphrased or non-English descriptions may not be caught). Standard governance applies.',
    matched_terms: [],
  };
}

/**
 * Persist the risk classification on a mission row. Should be called
 * during createMission and again whenever the brief is updated.
 */
export async function saveRiskClassification(db: DatabaseAdapter, missionId: string, assessment: RiskAssessment): Promise<void> {
  await db.run(
    `UPDATE missions.missions SET risk_classification = ?, ai_act_category = ?, updated_at = NOW() WHERE id = ?`,
    assessment.classification, assessment.category, missionId,
  );
}

/**
 * Validate that the requested autonomy level is permitted for a mission's
 * risk classification. Per spec §11.2: high_risk missions cannot run at
 * full_autonomy. The classification feeding this gate comes from the
 * keyword pre-screen above — the gate itself is deterministic policy.
 */
export function validateAutonomyForRisk(autonomy: 'check_in' | 'briefing' | 'full_autonomy', risk: RiskClassification): { ok: boolean; reason?: string } {
  if (risk === 'prohibited') {
    return { ok: false, reason: 'Mission category was flagged as prohibited (EU AI Act Annex II mapping) — cannot run.' };
  }
  if (risk === 'high_risk' && autonomy === 'full_autonomy') {
    return { ok: false, reason: 'This mission was flagged high-risk by the keyword pre-screen (EU AI Act Annex III mapping) and cannot run at full_autonomy. Maximum: briefing.' };
  }
  return { ok: true };
}

// ── Parallel-review checkpoint (BEEHIVE-backed) ────────────────────────────

export interface ParallelReviewCheckpointInput {
  missionId: string;
  taskId: string;
  reviewers: Array<{ contactHash: string; displayName: string; role: 'queen' | 'worker' | 'scout' | 'observer' }>;
  question: string;
  contextDocument?: string;            // markdown / text shown to reviewers
  consensusMode?: 'unanimous' | 'supermajority' | 'majority';
  slaHours?: number;
}

/**
 * Create a BEEHIVE session of type 'review' linked to a mission checkpoint
 * task. The mission task is set to 'paused' and stores the BEEHIVE session
 * id in beehive_session_id. When the BEEHIVE session concludes, the mission
 * checkpoint is approved (via the existing approveCheckpoint flow).
 *
 * NOTE: this requires the BEEHIVE feature to be present (it is). Importing
 * createBeehiveManager dynamically avoids a hard module-load coupling.
 */
export async function createParallelReviewCheckpoint(
  db: DatabaseAdapter,
  input: ParallelReviewCheckpointInput,
): Promise<{ beehive_session_id: string; status: string }> {
  // Lazy import — BEEHIVE may be on a different code path
  const { createBeehiveManager } = await import('../beehive/beehive-manager.js');
  const { resolveCallerIdentity } = await import('../beehive/beehive-identity.js');
  const manager = createBeehiveManager(db);

  const queen = await resolveCallerIdentity(db, undefined);
  // Find a designated queen reviewer (or use the local identity)
  const queenReviewer = input.reviewers.find(r => r.role === 'queen') ?? {
    contactHash: queen.contact_hash,
    displayName: queen.display_name,
    role: 'queen' as const,
  };

  const hive = await manager.createHive(
    {
      name: `Mission checkpoint review — ${input.taskId}`,
      question: input.question,
      description: input.contextDocument,
      type: 'review',
      governance: {
        consensus_mode: input.consensusMode ?? 'majority',
        round_timeout_minutes: (input.slaHours ?? 48) * 60,
      },
    },
    queenReviewer.contactHash,
    queenReviewer.displayName,
    undefined,
  );

  // Invite the other reviewers
  for (const r of input.reviewers) {
    if (r.contactHash === queenReviewer.contactHash) continue;
    try {
      await manager.inviteParticipant(hive.id, queenReviewer.contactHash, {
        anton_contact_hash: r.contactHash,
        display_name: r.displayName,
        role: r.role,
      });
    } catch (err) {
      console.warn(`[mission-checkpoint] Failed to invite ${r.displayName}:`, err instanceof Error ? err.message : err);
    }
  }

  // Link the mission task to the BEEHIVE session
  await db.run(
    `UPDATE missions.mission_tasks SET beehive_session_id = ?, status = 'paused' WHERE id = ?`,
    hive.id, input.taskId,
  );
  await db.run(
    `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description, details)
     VALUES (?, ?, 'checkpoint_reached', ?, ?)`,
    input.missionId, input.taskId,
    `Parallel-review checkpoint created with ${input.reviewers.length} reviewer(s). BEEHIVE session: ${hive.id}`,
    JSON.stringify({ beehive_session_id: hive.id, reviewers: input.reviewers.map(r => r.displayName) }),
  );

  return { beehive_session_id: hive.id, status: hive.status };
}

/**
 * Attempt to advance a mission whose checkpoint is waiting on a BEEHIVE
 * session. Returns true if the checkpoint was resolved.
 */
export async function pollCheckpointBeehive(db: DatabaseAdapter, missionId: string): Promise<{ resolved: number; pending: number }> {
  interface PendingRow { id: string; beehive_session_id: string }
  const pending = await db.all<PendingRow>(
    `SELECT id, beehive_session_id FROM missions.mission_tasks
     WHERE mission_id = ? AND task_type = 'checkpoint' AND status = 'paused' AND beehive_session_id IS NOT NULL`,
    missionId,
  );
  let resolved = 0;
  for (const t of pending) {
    const hive = await db.get<{ status: string }>(
      `SELECT status FROM beehive_sessions WHERE id = ?`,
      t.beehive_session_id,
    );
    if (hive?.status === 'concluded') {
      // Approve the checkpoint
      await db.run(
        `UPDATE missions.mission_tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`,
        t.id,
      );
      await db.run(
        `INSERT INTO missions.mission_activity (mission_id, task_id, activity_type, description)
         VALUES (?, ?, 'checkpoint_approved', ?)`,
        missionId, t.id, `BEEHIVE session ${t.beehive_session_id} concluded. Checkpoint approved.`,
      );
      resolved++;
    }
  }
  return { resolved, pending: pending.length - resolved };
}
