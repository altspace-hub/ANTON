// ── Missions — Delivery + Checkpoint REST API (Phase 3) ────────────────────

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createMissionDelivery } from '../services/missions/mission-delivery.js';
import {
  classifyMissionRisk,
  createParallelReviewCheckpoint,
  pollCheckpointBeehive,
} from '../services/missions/mission-checkpoint.js';
import { resolveCallerIdentity } from '../services/missions/mission-identity.js';
import { safeError } from '../lib/error-response.js';

function sendIdentityError(res: import('express').Response, err: unknown): void {
  const msg = safeError(err);
  if (/not activated/i.test(msg)) { res.status(409).json({ error: msg }); return; }
  if (/does not match/i.test(msg)) { res.status(403).json({ error: msg }); return; }
  res.status(400).json({ error: msg });
}

export function createMissionDeliveryRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const delivery = createMissionDelivery(db);

  const deliverySchema = z.object({
    // Only implemented channels are accepted. email / slack / google_drive /
    // sharepoint return here when their dispatch is actually implemented
    // (they were selectable throw-stubs before).
    channel: z.enum(['in_app', 'webhook', 'filesystem']),
    destination: z.record(z.string(), z.unknown()).optional(),
    output_files: z.array(z.object({
      filename: z.string(),
      content: z.string().optional(),
      path: z.string().optional(),
      mime_type: z.string().optional(),
    })).optional(),
    body: z.string().max(50_000).optional(),
    subject: z.string().max(500).optional(),
    task_id: z.string().optional(),
  }).strict();

  router.post('/missions/:id/deliver', async (req, res) => {
    try {
      const parsed = deliverySchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await delivery.deliver({
        missionId: String(req.params.id),
        taskId: parsed.data.task_id,
        channel: parsed.data.channel,
        destination: parsed.data.destination ?? {},
        outputFiles: parsed.data.output_files,
        body: parsed.data.body,
        subject: parsed.data.subject,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/missions/:id/deliveries', async (req, res) => {
    try {
      const items = await delivery.listDeliveries(String(req.params.id));
      res.json({ success: true, deliveries: items });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/missions/deliveries/retry', async (_req, res) => {
    try {
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await delivery.retryPending();
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Risk classification preview (no persistence) ───────────────────────
  router.post('/missions/classify-risk', async (req, res) => {
    try {
      const schema = z.object({
        objective: z.string().min(1).max(8000),
        context: z.string().max(8000).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const assessment = classifyMissionRisk(parsed.data.objective, parsed.data.context ?? null);
      res.json({ success: true, assessment });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Parallel-review checkpoint (BEEHIVE-backed) ────────────────────────
  router.post('/missions/:id/tasks/:taskId/parallel-review', async (req, res) => {
    try {
      const schema = z.object({
        question: z.string().min(1).max(4000),
        context_document: z.string().max(50_000).optional(),
        reviewers: z.array(z.object({
          contact_hash: z.string().min(1),
          display_name: z.string().min(1).max(200),
          role: z.enum(['queen', 'worker', 'scout', 'observer']).optional(),
        })).min(2).max(20),
        consensus_mode: z.enum(['unanimous', 'supermajority', 'majority']).optional(),
        sla_hours: z.number().int().min(1).max(720).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await createParallelReviewCheckpoint(db, {
        missionId: String(req.params.id),
        taskId: String(req.params.taskId),
        question: parsed.data.question,
        contextDocument: parsed.data.context_document,
        reviewers: parsed.data.reviewers.map(r => ({
          contactHash: r.contact_hash,
          displayName: r.display_name,
          role: r.role ?? 'worker',
        })),
        consensusMode: parsed.data.consensus_mode,
        slaHours: parsed.data.sla_hours,
      });
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Poll BEEHIVE-backed checkpoints for resolution ─────────────────────
  router.post('/missions/:id/tasks/poll-checkpoints', async (req, res) => {
    try {
      try { await resolveCallerIdentity(db, undefined); }
      catch (err) { sendIdentityError(res, err); return; }
      const result = await pollCheckpointBeehive(db, String(req.params.id));
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
