/**
 * engine-guards.ts — the subscription engine's per-day run cap.
 *
 * Wave 5 (2026-09-17). GET /api/settings/engine-guards answers the cap and
 * today's count; POST sets or removes the cap. The guard itself lives in
 * claude-sdk-client.ts (initSdkDailyGuard / sdkDailyCapRefusal), where both
 * engine lanes consult it before taking a slot. The Settings page renders
 * against exactly this contract:
 *
 *   GET  → { sdkDailyRunCap: number | null, sdkRunsToday: number }
 *   POST { sdkDailyRunCap: number | null } → the same shape afterwards
 *
 * The cap is an instance-wide setting (app_settings 'sdk_daily_run_cap',
 * not a secret): reading is open like the other Settings GETs; writing is
 * admin-gated, a no-op gate in solo mode.
 */
import { Router, type Request, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import { safeError } from '../lib/error-response.js';
import {
  initSdkDailyGuard,
  ensureSdkDailyCounterSeeded,
  getSdkDailyRunCap,
  setSdkDailyRunCap,
  sdkRunsToday,
} from '../services/claude-sdk-client.js';

export interface EngineGuardsState {
  /** null = unlimited. */
  sdkDailyRunCap: number | null;
  /** Subscription runs started today (audit-log seed + runs since). */
  sdkRunsToday: number;
}

/** An integer of at least 1, or null to remove the cap. Anything else is a 400. */
function parseCapBody(body: unknown): { ok: true; cap: number | null } | { ok: false } {
  if (typeof body !== 'object' || body === null || !('sdkDailyRunCap' in body)) return { ok: false };
  const value = (body as { sdkDailyRunCap: unknown }).sdkDailyRunCap;
  if (value === null) return { ok: true, cap: null };
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return { ok: true, cap: value };
  return { ok: false };
}

export function createEngineGuardRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  initSdkDailyGuard(db);   // primes the persisted cap; the count seeds on first read

  const state = async (): Promise<EngineGuardsState> => {
    await ensureSdkDailyCounterSeeded();
    return { sdkDailyRunCap: getSdkDailyRunCap(), sdkRunsToday: sdkRunsToday() };
  };

  router.get('/settings/engine-guards', async (_req: Request, res: Response) => {
    try {
      res.json(await state());
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/settings/engine-guards', requireAdminOrSolo, async (req: Request, res: Response) => {
    const parsed = parseCapBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'sdkDailyRunCap must be an integer of at least 1, or null for no cap' });
      return;
    }
    try {
      await setSdkDailyRunCap(db, parsed.cap);
      console.log(`[settings] SDK daily run cap ${parsed.cap === null ? 'removed' : `set to ${parsed.cap}`}`);
      res.json(await state());
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
