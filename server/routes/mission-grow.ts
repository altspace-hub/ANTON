// ── Missions — Grow CRM Bridge REST (spec v2 §13.3) ───────────────────────
//
// Mutating writes are not exposed here — they happen automatically when the
// mission executor sees a structured grow_* block in a task output. This
// route only exposes read-side ("what did this mission produce?") plus a
// manual emit endpoint for ops/testing.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMissionGrowBridge } from '../services/missions/mission-grow-bridge.js';
import { resolveCallerIdentity } from '../services/missions/mission-identity.js';
import { safeError } from '../lib/error-response.js';

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

export function createMissionGrowRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const bridge = createMissionGrowBridge(db);

  router.get('/missions/:id/grow-outputs', async (req, res) => {
    try {
      const outputs = await bridge.listMissionGrowOutputs(String(req.params.id));
      res.json({ success: true, ...outputs });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Manual emission — used by ops, integration tests, and any mission task
  // that wants to write to Grow without going through the LLM block parser.
  router.post('/missions/:id/grow/lead', async (req, res) => {
    try {
      const schema = z.object({
        task_id: z.string().optional(),
        firstName: z.string().min(1).max(120),
        lastName: z.string().min(1).max(120),
        title: z.string().max(200).optional(),
        email: z.string().email().max(200).optional(),
        phone: z.string().max(50).optional(),
        organisation: z.object({
          name: z.string().min(1).max(200),
          industry: z.string().max(120).optional(),
          website: z.string().url().max(500).optional(),
          size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
        }).optional(),
        tags: z.array(z.string().max(60)).max(20).optional(),
        source: z.string().max(120).optional(),
        notes: z.string().max(5000).optional(),
        confidenceScore: z.number().min(0).max(1).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const { task_id, ...rest } = parsed.data;
      const result = await bridge.recordLead(String(req.params.id), task_id ?? null, rest);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/:id/grow/opportunity', async (req, res) => {
    try {
      const schema = z.object({
        task_id: z.string().optional(),
        title: z.string().min(1).max(200),
        contactId: z.string().optional(),
        organisationId: z.string().optional(),
        stageId: z.string().optional(),
        value: z.number().min(0).optional(),
        currency: z.string().length(3).optional(),
        probability: z.number().int().min(0).max(100).optional(),
        expectedCloseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        description: z.string().max(8000).optional(),
        nextAction: z.string().max(500).optional(),
        nextActionDate: z.string().datetime().optional(),
        tags: z.array(z.string().max(60)).max(20).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const { task_id, ...rest } = parsed.data;
      const result = await bridge.recordOpportunity(String(req.params.id), task_id ?? null, rest);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/missions/:id/grow/signal', async (req, res) => {
    try {
      const schema = z.object({
        task_id: z.string().optional(),
        signalType: z.enum(['news', 'regulatory', 'market', 'relationship', 'engagement', 'custom']),
        title: z.string().min(1).max(200),
        description: z.string().max(8000).optional(),
        source: z.string().max(200).optional(),
        sourceUrl: z.string().url().max(500).optional(),
        affectedContacts: z.array(z.string()).max(50).optional(),
        affectedOrganisations: z.array(z.string()).max(50).optional(),
        recommendedAction: z.string().max(2000).optional(),
        priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const { task_id, ...rest } = parsed.data;
      const result = await bridge.recordSignal(String(req.params.id), task_id ?? null, rest);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
