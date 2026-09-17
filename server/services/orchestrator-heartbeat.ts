/**
 * orchestrator-heartbeat.ts
 *
 * ANTON Orchestrator — Heartbeat Scheduler
 *
 * Runs on a configurable interval (default: 30 min) using node-cron.
 * On each tick: reads all platform signals, assesses significance, and
 * generates a briefing only when signals exceed urgency thresholds.
 *
 * The heartbeat is EARNED, not assumed (Wave 5 track D, 2026-09-16). Live
 * numbers: orchestrator_stage had been 1 since 2026-03-16 with 2,606 briefings,
 * 1,977 proposals, 0 rated, 0 executions — promotion arithmetically impossible
 * — and the 30-minute heartbeat had written a paused no-op every cycle since
 * September. A scheduled cycle now runs only when
 *
 *   heartbeat_enabled = 1  AND  heartbeatEarned(db)
 *
 * where earned means at least one proposal was rated within the last
 * HEARTBEAT_EARNED_WINDOW_DAYS, or app_settings 'orchestrator_heartbeat_force'
 * is 'true'. The timer stays registered either way, so rating a proposal (or
 * setting the key) takes effect on the next tick without a restart. While not
 * earned, one log line per idle episode says why — never one per tick.
 *
 * Pattern: identical to server/services/scheduler.ts (existing CRON infrastructure).
 */

import * as cron from 'node-cron';
import type { DatabaseAdapter } from '../db/database.js';

import AnthropicSDK from '@anthropic-ai/sdk';
import { runHeartbeatCycle, getOrchestratorConfig, ORCHESTRATOR_HARD_LIMITS } from './orchestrator-engine.js';
import type { HeartbeatCycleResult } from './orchestrator-engine.js';
import { createNotification } from './notification-service.js';
import { isSdkEngineEnabled } from './sdk-engine-store.js';

/** app_settings key; the value 'true' (or '1') runs the heartbeat without a rated proposal. */
export const HEARTBEAT_FORCE_KEY = 'orchestrator_heartbeat_force';
/** A proposal rated inside this window earns the heartbeat. */
export const HEARTBEAT_EARNED_WINDOW_DAYS = 90;

let heartbeatTask: cron.ScheduledTask | null = null;
let dailyBriefingTask: cron.ScheduledTask | null = null;
/** The clamped interval the heartbeat timer was registered with this boot. */
let scheduledIntervalMinutes: number | null = null;
/** True once the idle line has been logged for the current idle episode. */
let idleLogged = false;

// ── Earned rule ───────────────────────────────────────────────────────────────

export interface HeartbeatEarnedState {
  earned: boolean;
  /** The force key is set — earned regardless of ratings. */
  forced: boolean;
  /** Proposals rated within the window. */
  ratedInWindow: number;
  windowDays: number;
  reason: string;
}

/** Pure: the earned rule over the two inputs. */
export function evaluateHeartbeatEarned(
  ratedInWindow: number,
  forced: boolean,
  windowDays: number = HEARTBEAT_EARNED_WINDOW_DAYS,
): HeartbeatEarnedState {
  const rated = Number.isFinite(ratedInWindow) && ratedInWindow > 0 ? Math.floor(ratedInWindow) : 0;
  if (forced) {
    return {
      earned: true, forced: true, ratedInWindow: rated, windowDays,
      reason: `Forced: app_settings.${HEARTBEAT_FORCE_KEY} is set (${rated} proposal(s) rated in the last ${windowDays} days)`,
    };
  }
  if (rated > 0) {
    return {
      earned: true, forced: false, ratedInWindow: rated, windowDays,
      reason: `Earned: ${rated} proposal(s) rated in the last ${windowDays} days`,
    };
  }
  return {
    earned: false, forced: false, ratedInWindow: 0, windowDays,
    reason: `Idle: no rated proposal in ${windowDays} days; rate a proposal or set ${HEARTBEAT_FORCE_KEY}`,
  };
}

/** Proposals with a human rating decided inside the window (decided_at is TEXT; created_at backs it). */
export async function countRatedProposalsInWindow(
  db: DatabaseAdapter,
  windowDays: number = HEARTBEAT_EARNED_WINDOW_DAYS,
): Promise<number> {
  const row = await db.get(
    `SELECT COUNT(*) AS c FROM orchestrator_proposals
     WHERE human_rating IS NOT NULL
       AND COALESCE(decided_at::timestamptz, created_at) >= NOW() - make_interval(days => ?)`,
    Math.max(1, Math.floor(windowDays)),
  ) as { c: number | string } | undefined;
  return Number(row?.c ?? 0);
}

/** app_settings 'orchestrator_heartbeat_force' — 'true' or '1' forces the heartbeat on. */
export async function readHeartbeatForce(db: DatabaseAdapter): Promise<boolean> {
  try {
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', HEARTBEAT_FORCE_KEY) as { value: string } | undefined;
    const v = String(row?.value ?? '').trim().toLowerCase();
    return v === 'true' || v === '1';
  } catch {
    return false; // table missing on a fresh install — never forced by accident
  }
}

/**
 * The live earned state. A failed ratings query fails CLOSED (not earned):
 * the heartbeat spends model calls, and "could not tell" must not spend.
 */
export async function getHeartbeatEarnedState(db: DatabaseAdapter): Promise<HeartbeatEarnedState> {
  const forced = await readHeartbeatForce(db);
  try {
    const rated = await countRatedProposalsInWindow(db);
    return evaluateHeartbeatEarned(rated, forced);
  } catch (err) {
    if (forced) return evaluateHeartbeatEarned(0, true);
    const state = evaluateHeartbeatEarned(0, false);
    return { ...state, reason: `${state.reason} (ratings could not be read: ${err instanceof Error ? err.message : String(err)})` };
  }
}

/** heartbeat_enabled = 1 is necessary; this is the other half of the rule. */
export async function heartbeatEarned(db: DatabaseAdapter): Promise<boolean> {
  return (await getHeartbeatEarnedState(db)).earned;
}

// ── Limits enforced here ──────────────────────────────────────────────────────

/** MIN_HEARTBEAT_INTERVAL_MINUTES: the configured interval, clamped up; a non-number falls back to 30. */
export function effectiveHeartbeatIntervalMinutes(configured: number | null | undefined): number {
  const n = typeof configured === 'number' && Number.isFinite(configured) ? Math.floor(configured) : 30;
  return Math.max(ORCHESTRATOR_HARD_LIMITS.MIN_HEARTBEAT_INTERVAL_MINUTES, n);
}

/** Cycles recorded in orchestrator_heartbeats during the last hour (every cycle, any trigger, writes one row). */
export async function countHeartbeatsInLastHour(db: DatabaseAdapter): Promise<number> {
  try {
    const row = await db.get(
      "SELECT COUNT(*) AS c FROM orchestrator_heartbeats WHERE ran_at >= NOW() - INTERVAL '1 hour'",
    ) as { c: number | string } | undefined;
    return Number(row?.c ?? 0);
  } catch (err) {
    console.warn('[orchestrator-heartbeat] could not count recent cycles (treating as 0):', err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/** Convert an interval in minutes to a cron expression */
function minutesToCron(minutes: number): string {
  if (minutes < 60) return `*/${Math.max(1, minutes)} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${Math.max(1, hours)} * * *`;
}

// ── The scheduled tick ────────────────────────────────────────────────────────

/**
 * What every scheduled timer runs. Returns null when the tick did not run a
 * cycle, and says why in the log — once per idle episode for the earned gate,
 * every time for the per-hour cap (that one is rare and worth seeing).
 */
export async function scheduledTick(
  db: DatabaseAdapter,
  anthropic: AnthropicSDK | null | undefined,
  kind: 'heartbeat' | 'daily' | 'weekly',
): Promise<HeartbeatCycleResult | null> {
  // Re-read config each tick (allows dynamic reconfiguration without restart)
  const config = await getOrchestratorConfig(db);
  if (config.fully_disabled || config.orchestrator_paused || !config.heartbeat_enabled) return null;

  const earned = await getHeartbeatEarnedState(db);
  if (!earned.earned) {
    if (!idleLogged) {
      idleLogged = true;
      console.info(`[orchestrator-heartbeat] orchestrator heartbeat idle: no rated proposal in ${earned.windowDays} days; rate a proposal or set ${HEARTBEAT_FORCE_KEY} (timer stays registered; this line is logged once per idle episode, not per tick)`);
    }
    return null;
  }
  idleLogged = false;

  // MAX_HEARTBEATS_PER_HOUR — the runaway-scheduling guard.
  const recent = await countHeartbeatsInLastHour(db);
  if (recent >= ORCHESTRATOR_HARD_LIMITS.MAX_HEARTBEATS_PER_HOUR) {
    console.warn(`[orchestrator-heartbeat] ${kind} tick skipped: ${recent} cycle(s) in the last hour reached MAX_HEARTBEATS_PER_HOUR=${ORCHESTRATOR_HARD_LIMITS.MAX_HEARTBEATS_PER_HOUR}`);
    return null;
  }

  return runHeartbeatCycle(db, anthropic, kind, kind !== 'heartbeat');
}

function describeCost(result: HeartbeatCycleResult): string {
  return `cost $${result.costUsd.toFixed(4)}${result.unpricedCalls > 0 ? ` (+${result.unpricedCalls} unpriced call(s) counted as $0)` : ''}`;
}

export async function initOrchestratorHeartbeat(db: DatabaseAdapter, anthropic: AnthropicSDK | null | undefined): Promise<void> {
  // The client object is never used for an LLM call — every orchestrator call
  // goes through provider-router.callChat, which follows the configured default
  // engine. Gate on "some Claude path exists", not on the API client alone.
  if (!anthropic && !isSdkEngineEnabled()) {
    console.log('[orchestrator-heartbeat] Skipping — no Anthropic API key and the SDK engine is disabled');
    return;
  }

  const config = await getOrchestratorConfig(db);

  if (config.fully_disabled) {
    console.log('[orchestrator-heartbeat] Skipping — Orchestrator fully disabled');
    return;
  }

  // ── Heartbeat: quick signal check every N minutes ──────────────────────────
  // The timer is registered even while heartbeat_enabled = 0 or the heartbeat
  // is not yet earned: each tick re-reads both, so enabling it in Settings or
  // rating a proposal takes effect without a restart.
  const intervalMinutes = effectiveHeartbeatIntervalMinutes(config.heartbeat_interval_minutes);
  if (intervalMinutes !== config.heartbeat_interval_minutes) {
    console.warn(`[orchestrator-heartbeat] Configured interval ${config.heartbeat_interval_minutes} min is below MIN_HEARTBEAT_INTERVAL_MINUTES=${ORCHESTRATOR_HARD_LIMITS.MIN_HEARTBEAT_INTERVAL_MINUTES} — scheduling every ${intervalMinutes} min`);
  }
  const heartbeatCron = minutesToCron(intervalMinutes);
  if (cron.validate(heartbeatCron)) {
    heartbeatTask = cron.schedule(heartbeatCron, async () => {
      const result = await scheduledTick(db, anthropic, 'heartbeat');
      if (!result) return;
      console.log(`[orchestrator-heartbeat] Done — ${result.signalCount} signals, action: ${result.action}, ${describeCost(result)}`);

      if (result.action === 'briefing_generated' && result.briefingId) {
        createNotification(db, {
          type: 'system',
          title: 'ANTON Orchestrator — Briefing Ready',
          message: `${result.signalCount} platform signals detected. A new briefing has been generated.`,
          link: `/orchestrator?briefing=${result.briefingId}`,
        });
      }
    });
    scheduledIntervalMinutes = intervalMinutes;
    const state = config.heartbeat_enabled
      ? 'ticks run once earned (a rated proposal in the last 90 days, or the force key)'
      : 'heartbeat_enabled = 0 — ticks idle until enabled in Settings';
    console.log(`[orchestrator-heartbeat] Heartbeat scheduled: "${heartbeatCron}" (every ${intervalMinutes} min); ${state}`);
  } else {
    console.warn(`[orchestrator-heartbeat] Invalid heartbeat cron: "${heartbeatCron}"`);
  }

  // ── Daily briefing: full briefing at configured time each day ─────────────
  if (config.briefing_schedule === 'daily') {
    const [hour = '8', minute = '0'] = (config.briefing_time || '08:00').split(':');
    const dailyCron = `${minute} ${hour} * * *`;
    if (cron.validate(dailyCron)) {
      dailyBriefingTask = cron.schedule(dailyCron, async () => {
        const result = await scheduledTick(db, anthropic, 'daily');
        if (!result) return;
        console.log(`[orchestrator-heartbeat] Daily briefing complete — ${result.signalCount} signals, ${describeCost(result)}`);

        createNotification(db, {
          type: 'system',
          title: 'ANTON Orchestrator — Daily Briefing',
          message: `Your daily compliance briefing is ready. ${result.signalCount} signals reviewed.`,
          link: `/orchestrator${result.briefingId ? `?briefing=${result.briefingId}` : ''}`,
        });
      });
      console.log(`[orchestrator-heartbeat] Daily briefing scheduled: "${dailyCron}"`);
    }
  }

  if (config.briefing_schedule === 'weekly') {
    const [hour = '8', minute = '0'] = (config.briefing_time || '08:00').split(':');
    const weeklyCron = `${minute} ${hour} * * 1`; // Monday
    if (cron.validate(weeklyCron)) {
      dailyBriefingTask = cron.schedule(weeklyCron, async () => {
        const result = await scheduledTick(db, anthropic, 'weekly');
        if (!result) return;
        console.log(`[orchestrator-heartbeat] Weekly briefing complete — ${result.signalCount} signals, ${describeCost(result)}`);
        createNotification(db, {
          type: 'system',
          title: 'ANTON Orchestrator — Weekly Briefing',
          message: `Your weekly compliance briefing is ready.`,
          link: `/orchestrator${result.briefingId ? `?briefing=${result.briefingId}` : ''}`,
        });
      });
      console.log(`[orchestrator-heartbeat] Weekly briefing scheduled: "${weeklyCron}"`);
    }
  }
}

export function stopOrchestratorHeartbeat(): void {
  heartbeatTask?.stop();
  dailyBriefingTask?.stop();
  heartbeatTask = null;
  dailyBriefingTask = null;
  scheduledIntervalMinutes = null;
  idleLogged = false;
  console.log('[orchestrator-heartbeat] Stopped all scheduled tasks');
}

// ── Status surface ────────────────────────────────────────────────────────────

/** True while the heartbeat timer is registered in this process. */
export function isHeartbeatScheduled(): boolean {
  return heartbeatTask !== null;
}

export interface HeartbeatStatus {
  /** orchestrator_config.heartbeat_enabled = 1 */
  enabled: boolean;
  /** The timer is registered in this process (registration happens at boot). */
  scheduled: boolean;
  /** The clamped interval the timer runs on; null when not scheduled. */
  intervalMinutes: number | null;
  fullyDisabled: boolean;
  paused: boolean;
  earned: HeartbeatEarnedState;
  /** All of the above line up: a tick right now would run a cycle. */
  running: boolean;
  lastCycleAt: string | null;
  cyclesLastHour: number;
  forceKey: string;
  limits: typeof ORCHESTRATOR_HARD_LIMITS;
}

/** Everything the dashboard needs to say what the heartbeat is doing, and why. */
export async function getHeartbeatStatus(db: DatabaseAdapter): Promise<HeartbeatStatus> {
  const config = await getOrchestratorConfig(db);
  const earned = await getHeartbeatEarnedState(db);
  const cyclesLastHour = await countHeartbeatsInLastHour(db);
  let lastCycleAt: string | null = null;
  try {
    const row = await db.get('SELECT ran_at FROM orchestrator_heartbeats ORDER BY ran_at DESC LIMIT 1') as { ran_at: string | Date } | undefined;
    if (row?.ran_at) lastCycleAt = row.ran_at instanceof Date ? row.ran_at.toISOString() : String(row.ran_at);
  } catch { /* table missing on a fresh install */ }

  const enabled = config.heartbeat_enabled === 1;
  const fullyDisabled = config.fully_disabled === 1;
  const paused = config.orchestrator_paused === 1;
  const scheduled = isHeartbeatScheduled();
  return {
    enabled,
    scheduled,
    intervalMinutes: scheduledIntervalMinutes,
    fullyDisabled,
    paused,
    earned,
    running: enabled && scheduled && earned.earned && !fullyDisabled && !paused,
    lastCycleAt,
    cyclesLastHour,
    forceKey: HEARTBEAT_FORCE_KEY,
    limits: ORCHESTRATOR_HARD_LIMITS,
  };
}
