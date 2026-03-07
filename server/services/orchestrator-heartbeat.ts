/**
 * orchestrator-heartbeat.ts
 *
 * ANTON Orchestrator — Heartbeat Scheduler
 *
 * Runs on a configurable interval (default: 30 min) using node-cron.
 * On each tick: reads all platform signals, assesses significance (Haiku model),
 * and generates a briefing only when signals exceed urgency thresholds.
 *
 * This avoids alert fatigue — the Orchestrator stays silent when nothing needs
 * attention, exactly as the spec describes.
 *
 * Pattern: identical to server/services/scheduler.ts (existing CRON infrastructure).
 */

import * as cron from 'node-cron';
import type Database from 'better-sqlite3';
import AnthropicSDK from '@anthropic-ai/sdk';
import { runHeartbeatCycle, getOrchestratorConfig } from './orchestrator-engine.js';
import { createNotification } from './notification-service.js';

let heartbeatTask: cron.ScheduledTask | null = null;
let dailyBriefingTask: cron.ScheduledTask | null = null;

/** Convert an interval in minutes to a cron expression */
function minutesToCron(minutes: number): string {
  if (minutes < 60) return `*/${Math.max(1, minutes)} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${Math.max(1, hours)} * * *`;
}

export function initOrchestratorHeartbeat(db: Database.Database, anthropic: AnthropicSDK | null): void {
  if (!anthropic) {
    console.log('[orchestrator-heartbeat] Skipping — Anthropic API not configured');
    return;
  }

  const config = getOrchestratorConfig(db);

  if (config.fully_disabled || !config.heartbeat_enabled) {
    console.log('[orchestrator-heartbeat] Skipping — Orchestrator disabled or heartbeat off');
    return;
  }

  // ── Heartbeat: quick signal check every N minutes ──────────────────────────
  const heartbeatCron = minutesToCron(config.heartbeat_interval_minutes);
  if (cron.validate(heartbeatCron)) {
    heartbeatTask = cron.schedule(heartbeatCron, async () => {
      // Re-read config each tick (allows dynamic reconfiguration)
      const currentConfig = getOrchestratorConfig(db);
      if (currentConfig.fully_disabled || currentConfig.orchestrator_paused) return;

      console.log('[orchestrator-heartbeat] Running heartbeat cycle...');
      const result = await runHeartbeatCycle(db, anthropic, 'heartbeat');
      console.log(`[orchestrator-heartbeat] Done — ${result.signalCount} signals, action: ${result.action}`);

      if (result.action === 'briefing_generated' && result.briefingId) {
        createNotification(db, {
          type: 'system',
          title: 'ANTON Orchestrator — Briefing Ready',
          message: `${result.signalCount} platform signals detected. A new briefing has been generated.`,
          link: `/orchestrator?briefing=${result.briefingId}`,
        });
      }
    });
    console.log(`[orchestrator-heartbeat] Heartbeat scheduled: "${heartbeatCron}" (every ${config.heartbeat_interval_minutes} min)`);
  } else {
    console.warn(`[orchestrator-heartbeat] Invalid heartbeat cron: "${heartbeatCron}"`);
  }

  // ── Daily briefing: full briefing at configured time each day ─────────────
  if (config.briefing_schedule === 'daily') {
    const [hour = '8', minute = '0'] = (config.briefing_time || '08:00').split(':');
    const dailyCron = `${minute} ${hour} * * *`;
    if (cron.validate(dailyCron)) {
      dailyBriefingTask = cron.schedule(dailyCron, async () => {
        const currentConfig = getOrchestratorConfig(db);
        if (currentConfig.fully_disabled || currentConfig.orchestrator_paused) return;

        console.log('[orchestrator-heartbeat] Running daily briefing...');
        const result = await runHeartbeatCycle(db, anthropic, 'daily', true);
        console.log(`[orchestrator-heartbeat] Daily briefing complete — ${result.signalCount} signals`);

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
        const currentConfig = getOrchestratorConfig(db);
        if (currentConfig.fully_disabled || currentConfig.orchestrator_paused) return;
        const result = await runHeartbeatCycle(db, anthropic, 'weekly', true);
        console.log(`[orchestrator-heartbeat] Weekly briefing complete — ${result.signalCount} signals`);
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
  console.log('[orchestrator-heartbeat] Stopped all scheduled tasks');
}
