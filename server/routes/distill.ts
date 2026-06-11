// ── Distillation routes — Wave 4.8 (Core Experience Review 2026-06) ───────
//
//   POST /api/distill/module-prompt — distill an Open Chat conversation
//        into a purpose-built module system prompt (utility model).
//
// The client (OutputToolbar "Save" panel) shows the distilled prompt for
// EDIT before saving; the actual save still goes through the existing
// POST /api/modules custom-module path. Failure is returned honestly
// ({ status: 'failed', error }) so the UI can fall back to the legacy
// snapshot save — never a fabricated prompt.

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { distillChatToModule, type ChatTurn, type DistillationResult } from '../services/chat-distiller.js';
import { safeError } from '../lib/error-response.js';

export interface DistillRouteDeps {
  /** Test seam — replaces the live utility-model distillation. */
  distill?: (db: DatabaseAdapter, conversation: ChatTurn[]) => Promise<DistillationResult>;
}

const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().min(1).max(200_000),
    }),
  ).min(2).max(200),
}).strict();

export function createDistillRoutes(db: DatabaseAdapter, deps: DistillRouteDeps = {}): Router {
  const router = Router();
  const distill = deps.distill ?? distillChatToModule;

  router.post('/distill/module-prompt', async (req, res) => {
    try {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const result = await distill(db, parsed.data.messages);
      if (result.status !== 'distilled' || !result.distilled) {
        res.json({ success: false, status: 'failed', error: result.error ?? 'distillation failed' });
        return;
      }
      res.json({
        success: true,
        status: 'distilled',
        systemPrompt: result.distilled.systemPrompt,
        suggestedName: result.distilled.suggestedName,
        suggestedDescription: result.distilled.suggestedDescription,
        workedExample: result.distilled.workedExample,
        model: result.model ?? null,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
