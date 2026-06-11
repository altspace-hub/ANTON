// ── AI Council routes — Wave 4.2 (Core Experience Review 2026-06) ─────────
//
//   POST /api/council/:sessionId/dissent-ledger — run the background
//        dissent-ledger extraction over the persisted deliberation record
//        and store the result in the council session's config
//        (config.dissentLedger), so the archive view and exports carry it.
//   GET  /api/council/:sessionId/dissent-ledger — read the persisted ledger.
//
// The deliberation record is read SERVER-SIDE from the session's first
// user message (the chair's input — full rounds + vote table), so the
// client never re-uploads the transcript. Ownership follows the same
// pattern as routes/renderers.ts: admins see everything, everyone else
// only their own sessions.
//
// Honesty: extraction failure returns { status: 'failed' } and persists
// NOTHING — the UI shows "ledger unavailable"; a later retry stays possible.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { extractDissentLedger, type DissentExtractionResult, type DissentLedger } from '../services/council-dissent.js';
import { safeError } from '../lib/error-response.js';

const COUNCIL_MODULE_ID = 'ai-council';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

export interface CouncilRouteDeps {
  /** Test seam — replaces the live utility-model extraction. */
  extract?: (db: DatabaseAdapter, input: { topic: string; deliberation: string }) => Promise<DissentExtractionResult>;
}

interface SessionRow {
  id: string;
  module_id: string;
  title: string;
  config: string | null;
}

async function loadOwnedSession(
  db: DatabaseAdapter,
  req: AuthedRequest,
  sessionId: string,
  res: import('express').Response,
): Promise<SessionRow | null> {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  const row = await db.get<SessionRow>(
    userRole === 'admin'
      ? `SELECT id, module_id, title, config FROM sessions WHERE id = ?`
      : `SELECT id, module_id, title, config FROM sessions WHERE id = ? AND user_id = ?`,
    ...(userRole === 'admin' ? [sessionId] : [sessionId, userId]),
  );
  if (!row) { res.status(404).json({ error: 'Session not found or access denied' }); return null; }
  return row;
}

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Persisted shape under sessions.config.dissentLedger */
export interface PersistedDissentLedger {
  ledger: DissentLedger;
  extractedAt: string;
  model: string | null;
}

export function createCouncilRoutes(db: DatabaseAdapter, deps: CouncilRouteDeps = {}): Router {
  const router = Router();
  const extract = deps.extract ?? extractDissentLedger;

  // ── POST /council/:sessionId/dissent-ledger ────────────────────────────
  router.post('/council/:sessionId/dissent-ledger', async (req, res) => {
    try {
      const params = z.object({ sessionId: z.string().min(1) }).safeParse(req.params);
      if (!params.success) { res.status(400).json({ error: 'sessionId is required' }); return; }
      const sessionId = params.data.sessionId;

      const session = await loadOwnedSession(db, req as AuthedRequest, sessionId, res);
      if (!session) return;
      if (session.module_id !== COUNCIL_MODULE_ID) {
        res.status(400).json({ error: 'Not an AI Council session' });
        return;
      }

      // The deliberation record = the first user message (the chair's input:
      // topic + all rounds + vote table). Member streams are not persisted.
      const userMsg = await db.get<{ content: string }>(
        `SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`,
        sessionId,
      );
      if (!userMsg?.content || userMsg.content.trim().length < 50) {
        res.status(404).json({ error: 'No deliberation record was persisted for this council session' });
        return;
      }

      // Topic comes from the optional body (live run) or the session title.
      const body = z.object({ topic: z.string().max(4_000).optional() }).safeParse(req.body ?? {});
      const topic = (body.success && body.data.topic?.trim())
        || session.title.replace(/^Council:\s*/i, '')
        || 'Council deliberation';

      const result = await extract(db, { topic, deliberation: userMsg.content });

      if (result.status !== 'extracted' || !result.ledger) {
        // Honest failure — nothing persisted, nothing faked.
        res.json({ success: false, status: 'failed', ledger: null, error: result.error ?? 'extraction failed' });
        return;
      }

      const persisted: PersistedDissentLedger = {
        ledger: result.ledger,
        extractedAt: new Date().toISOString(),
        model: result.model ?? null,
      };
      // Read-merge-write on config (TEXT JSON). The chair-run config snapshot
      // write in routes/claude.ts completes before the client even starts
      // this extraction (multi-second LLM call), so the merge is safe.
      const fresh = await db.get<{ config: string | null }>(
        'SELECT config FROM sessions WHERE id = ?', sessionId,
      );
      const config = parseConfig(fresh?.config ?? session.config);
      config.dissentLedger = persisted;
      await db.run(
        'UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?',
        JSON.stringify(config), new Date().toISOString(), sessionId,
      );

      res.json({ success: true, status: 'extracted', ledger: result.ledger, extractedAt: persisted.extractedAt, model: persisted.model });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /council/:sessionId/dissent-ledger ─────────────────────────────
  router.get('/council/:sessionId/dissent-ledger', async (req, res) => {
    try {
      const params = z.object({ sessionId: z.string().min(1) }).safeParse(req.params);
      if (!params.success) { res.status(400).json({ error: 'sessionId is required' }); return; }
      const session = await loadOwnedSession(db, req as AuthedRequest, params.data.sessionId, res);
      if (!session) return;
      const config = parseConfig(session.config);
      const persisted = (config.dissentLedger ?? null) as PersistedDissentLedger | null;
      res.json({ success: true, dissentLedger: persisted });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
