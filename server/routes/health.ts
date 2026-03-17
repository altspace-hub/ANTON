import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { isApiKeyConfigured } from '../services/claude-client.js';

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
      queueDepth = row?.c ?? 0;
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
      database: dbOk,
      activeStreams: _activeStreams,
      queueDepth,
      memory,
      version: '0.2.0',
      uptime: Math.round(process.uptime()),
    });
  });

  return router;
}
