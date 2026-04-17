// ── Missions — Browser Session REST API (Phase 2) ──────────────────────────
//
// Admin / debug endpoints. Mission Controller invokes browser actions via
// the service directly; these routes are for Mission Dashboard "peek" + tests.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createBrowserAutomation } from '../services/missions/mission-browser.js';
import { resolveCallerIdentity } from '../services/missions/mission-identity.js';
import { safeError } from '../lib/error-response.js';

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

export function createBrowserRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const browser = createBrowserAutomation(db);

  // Start cleanup loop for stale sessions
  browser.startCleanupLoop();

  // GET /api/browser-sessions — list sessions (optional mission filter)
  router.get('/browser-sessions', async (req, res) => {
    try {
      const missionId = req.query.mission_id as string | undefined;
      const sessions = await browser.listSessions(missionId);
      res.json({ success: true, sessions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /api/browser-sessions/health — is Playwright available?
  router.get('/browser-sessions/health', async (_req, res) => {
    try {
      const installed = await browser.isPlaywrightInstalled();
      res.json({
        success: true,
        playwright_installed: installed,
        message: installed
          ? 'Playwright is available; browser sessions can be started.'
          : 'Playwright is not installed. Run: pnpm add playwright && npx playwright install chromium',
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /api/browser-sessions — create a new browser session
  router.post('/browser-sessions', async (req, res) => {
    try {
      const schema = z.object({
        mission_id: z.string().min(1),
        task_id: z.string().optional(),
        browser: z.enum(['chromium', 'firefox', 'webkit']).optional(),
        headless: z.boolean().optional(),
        domains_allowed: z.array(z.string()).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const session = await browser.createSession({
        missionId: parsed.data.mission_id,
        taskId: parsed.data.task_id,
        browser: parsed.data.browser,
        headless: parsed.data.headless,
        domainsAllowed: parsed.data.domains_allowed,
      });
      res.status(201).json({ success: true, session });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/browser-sessions/:id/action — execute a single browser action
  router.post('/browser-sessions/:id/action', async (req, res) => {
    try {
      const schema = z.object({
        type: z.enum(['navigate', 'click', 'fill', 'select', 'upload', 'download',
                      'screenshot', 'extract', 'wait', 'scroll', 'evaluate', 'submit_form']),
        selector: z.string().optional(),
        value: z.string().optional(),
        url: z.string().url().optional(),
        waitFor: z.string().optional(),
        llmReasoning: z.string().optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await browser.executeAction(String(req.params.id), parsed.data);
      res.json({ success: result.success, result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // POST /api/browser-sessions/:id/close
  router.post('/browser-sessions/:id/close', async (req, res) => {
    try {
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      await browser.closeSession(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
