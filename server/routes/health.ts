import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { isApiKeyConfigured } from '../services/claude-client.js';
import { isSdkEngineEnabled } from '../services/sdk-engine-store.js';
import { isCodexEngineEnabled } from '../services/codex-engine-store.js';
import { appVersion } from '../lib/app-version.js';

/**
 * Which engines can take a model call right now. `apiKeyConfigured` alone
 * told a subscription-only instance it had no AI at all ("API Not
 * Configured"), although every run worked on the SDK engine.
 */
export function engineStatus(): {
  anthropicApi: boolean; sdk: boolean; codex: boolean; otherProviders: boolean; ready: boolean;
} {
  const anthropicApi = isApiKeyConfigured();
  const sdk = isSdkEngineEnabled();
  const codex = isCodexEngineEnabled();
  const otherProviders = !!(process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.MISTRAL_API_KEY
    || (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY));
  return { anthropicApi, sdk, codex, otherProviders, ready: anthropicApi || sdk || codex || otherProviders };
}

// OBS-04: active SSE stream counter — incremented/decremented in claude.ts
let _activeStreams = 0;
export function incrementActiveStreams(): void { _activeStreams++; }
export function decrementActiveStreams(): void { if (_activeStreams > 0) _activeStreams--; }
export function getActiveStreams(): number { return _activeStreams; }

export async function createHealthRouter(db: DatabaseAdapter) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    // Database check
    let dbOk = false;
    try {
      await db.get('SELECT 1');
      dbOk = true;
    } catch { /* db not ready */ }

    // Pending workflow queue depth
    let queueDepth = 0;
    try {
      const row = await db.get(
        "SELECT COUNT(*) as c FROM workflow_executions WHERE status IN ('pending','running')"
      ) as { c: number } | undefined;
      queueDepth = Number(row?.c ?? 0);   // Postgres returns COUNT(*) as a string
    } catch { /* table may not exist yet */ }

    // Memory usage (MB, rounded)
    const mem = process.memoryUsage();
    const memory = {
      heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb:       Math.round(mem.rss       / 1024 / 1024),
    };

    const status = dbOk ? 'ok' : 'degraded';

    res.status(dbOk ? 200 : 503).json({
      status,
      apiKeyConfigured: isApiKeyConfigured(),
      engines: engineStatus(),
      database: dbOk,
      activeStreams: _activeStreams,
      queueDepth,
      memory,
      version: appVersion(),
      uptime: Math.round(process.uptime()),
    });
  });

  return router;
}
