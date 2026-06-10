// ── Missions — Background Runner (Wave-2 2A.1) ─────────────────────────────
// Makes "autonomous" true: a periodic tick advances every 'active' mission
// via controller.advanceBatch() — previously advance was manual-click only.
//
// Safety model (deliberately conservative):
//   • Only status='active' missions advance. 'briefed' is NEVER auto-started
//     — plan approval is a human step. Paused / review missions wait for the
//     human (checkpoints, autonomy gates and budget pauses all transition
//     away from 'active' synchronously, so the next tick skips them).
//   • Per-mission in-flight lock (in-memory Set — single-process server):
//     a slow LLM task can outlive the tick interval without double-running.
//   • Global concurrency cap (default 3 missions in flight at once): a tick
//     only claims the remaining capacity, so overlapping ticks can't
//     thundering-herd the LLM provider.
//   • The runner never weakens gates: it only calls advanceBatch(), which
//     enforces budgets / checkpoints / approval gates exactly as the manual
//     endpoint does.
//
// Disable entirely with MISSIONS_RUNNER_DISABLED=true (documented in
// .env.example) — missions then advance only via the manual API/UI.

import type { DatabaseAdapter } from '../../db/database.js';
import { createMissionController } from './mission-controller.js';
import type { Mission } from './types.js';

export const RUNNER_TICK_MS = 20_000;
export const RUNNER_MAX_CONCURRENT_MISSIONS = 3;
export const RUNNER_MAX_PARALLEL_TASKS_PER_MISSION = 2;

/**
 * Pure gating predicate — which missions may the runner pick up this tick?
 * Only 'active' missions (briefed/paused/review/draft are human-gated),
 * excluding those already in flight, up to the remaining global capacity.
 * Oldest-created first so long-running missions aren't starved by new ones.
 */
export function selectRunnableMissions(
  missions: Array<Pick<Mission, 'id' | 'status' | 'created_at'>>,
  inFlight: ReadonlySet<string>,
  maxConcurrent: number = RUNNER_MAX_CONCURRENT_MISSIONS,
): string[] {
  const capacity = Math.max(0, maxConcurrent - inFlight.size);
  if (capacity === 0) return [];
  return missions
    .filter(m => m.status === 'active' && !inFlight.has(m.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, capacity)
    .map(m => m.id);
}

export interface RunnerTickResult {
  picked: number;
  advanced: number;
  completed: number;
  paused: number;
  failed: number;
}

export function createMissionRunner(
  db: DatabaseAdapter,
  options?: { maxConcurrent?: number; maxParallelPerMission?: number },
) {
  const controller = createMissionController(db);
  const maxConcurrent = options?.maxConcurrent ?? RUNNER_MAX_CONCURRENT_MISSIONS;
  const maxParallel = options?.maxParallelPerMission ?? RUNNER_MAX_PARALLEL_TASKS_PER_MISSION;
  const inFlight = new Set<string>();

  /**
   * One runner pass. Claims up to the remaining concurrency capacity worth
   * of active missions, runs one advanceBatch() per mission concurrently,
   * and releases each lock when its batch settles. Errors on one mission
   * never abort the others.
   */
  async function tick(): Promise<RunnerTickResult> {
    const result: RunnerTickResult = { picked: 0, advanced: 0, completed: 0, paused: 0, failed: 0 };
    const active = await controller.state.listMissions({ status: 'active' });
    const ids = selectRunnableMissions(active, inFlight, maxConcurrent);
    if (ids.length === 0) return result;
    result.picked = ids.length;
    for (const id of ids) inFlight.add(id);

    await Promise.allSettled(ids.map(async (missionId) => {
      try {
        const batch = await controller.advanceBatch(missionId, maxParallel);
        if (batch.status === 'mission_completed') result.completed++;
        else if (batch.status === 'mission_paused') result.paused++;
        const ok = batch.results.filter(r => r.status === 'task_completed').length;
        const bad = batch.results.filter(r => r.status === 'task_failed').length;
        result.advanced += ok;
        result.failed += bad;
      } catch (err) {
        result.failed++;
        console.error(`[mission-runner] mission=${missionId} tick error:`, err instanceof Error ? err.message : err);
      } finally {
        inFlight.delete(missionId);
      }
    }));
    return result;
  }

  /** Test/observability hook — ids currently being advanced. */
  function inFlightIds(): string[] { return [...inFlight]; }

  return { tick, inFlightIds };
}

export type MissionRunner = ReturnType<typeof createMissionRunner>;
