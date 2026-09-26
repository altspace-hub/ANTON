import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import Anthropic from '@anthropic-ai/sdk';
import { streamToResponse, isApiKeyConfigured } from '../services/claude-client.js';
import { streamChat, mapModelToProvider, setSSEHeaders } from '../services/provider-router.js';
import { CLAUDE_LARGE } from '../config/claude-lineup.js';
import { REVIEW_MODES } from '../services/review-engine.js';
import { createReviewOrchestrator, type ReviewContext } from '../services/review-orchestrator.js';
import { safeError } from '../lib/error-response.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';

export async function createReviewRoutes(db: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();
  const orchestrator = await createReviewOrchestrator(anthropic);

  /**
   * Team isolation: may this caller read or add reviews for this session?
   * Checked in SQL before anything keyed on the id. A review quotes and critiques
   * the reviewed output, so listing them by another user's sessionId read their
   * work, and POST planted rows into their session. A session that is not the
   * caller's is treated exactly like a missing one: the list is empty and a review
   * is not persisted (a missing session never was — the FK refuses the insert).
   * Solo mode and admins are not scoped.
   */
  async function mayUseSession(req: OwnedRequest, sessionId: string): Promise<boolean> {
    if (!scopesToOwner(req)) return true;
    const userId = req.user?.id;
    if (!userId) return false;
    const row = await db.get('SELECT 1 AS ok FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId);
    return !!row;
  }

  // GET /api/reviews/modes — list available review modes
  router.get('/reviews/modes', async (_req, res) => {
    res.json(REVIEW_MODES.map(({ id, label, icon, description, color }) => ({ id, label, icon, description, color })));
  });

  // POST /api/reviews — run a review on content, streaming SSE
  router.post('/reviews', async (req, res) => {
    if (!isApiKeyConfigured() && !process.env.MISTRAL_API_KEY && !process.env.OPENAI_API_KEY && !process.env.GOOGLE_API_KEY) {
      res.status(500).json({ error: 'No AI provider API key configured.' });
      return;
    }

    const { modeId, content, model, sessionId } = req.body as {
      modeId: string;
      content: string;
      model?: string;
      sessionId?: string;
    };

    if (!modeId || !content) {
      res.status(400).json({ error: 'modeId and content are required' });
      return;
    }

    const mode = REVIEW_MODES.find((m) => m.id === modeId);
    if (!mode) {
      res.status(400).json({ error: `Unknown review mode: ${modeId}` });
      return;
    }

    try {
      // Decided before streaming starts, so nothing about the session changes what
      // the caller sees — only whether the finished review is stored with it.
      const persistTo = sessionId && (await mayUseSession(req, String(sessionId))) ? String(sessionId) : null;

      const resolvedModel = mapModelToProvider((model as string) || CLAUDE_LARGE);

      setSSEHeaders(res);

      const result = await streamChat({
        model: resolvedModel,
        system: mode.systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Please review the following document:\n\n---\n\n${content}`,
          },
        ],
        maxTokens: 16000,
        thinkingLevel: 'investigate',
      }, res);

      // Send completion event
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();

      // Save review to database (attributed to the reviewer — the column defaulted to 'default')
      if (persistTo) {
        try {
          await db.run(
            `INSERT INTO reviews (id, session_id, review_mode, content, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
          , crypto.randomUUID(), persistTo, modeId, result.text, req.user?.id ?? 'default', new Date().toISOString());
        } catch {
          // Non-fatal
        }
      }
    } catch (error) {
      const message = safeError(error);
      if (!res.headersSent) res.status(500).json({ error: message });
    }
  });

  // GET /api/reviews?sessionId= — list reviews for a session
  router.get('/reviews', async (req, res) => {
    const { sessionId } = req.query as { sessionId?: string };
    if (!sessionId) { res.json([]); return; }
    try {
      // Another user's session lists like a missing one: empty.
      if (!(await mayUseSession(req, String(sessionId)))) { res.json([]); return; }
      const reviews = await db.all(
        `SELECT * FROM reviews WHERE session_id = ? ORDER BY created_at DESC`,
        sessionId,
      );
      res.json(reviews);
    } catch {
      res.json([]);
    }
  });

  /**
   * POST /api/reviews/orchestrate
   * Run all 5 review agents in parallel on output
   * Returns overall score + detailed findings from each agent
   */
  router.post('/reviews/orchestrate', async (req, res) => {
    const { output, context } = req.body as { output: string; context: ReviewContext };

    if (!output || !context) {
      res.status(400).json({ error: 'Missing required fields: output, context' });
      return;
    }

    try {
      const result = await orchestrator.runAllReviewers(output, context);
      res.json(result);
    } catch (error) {
      console.error('[review-orchestrator] Error running review engine:', error);
      res.status(500).json({
        error: 'Review engine failed',
        message: safeError(error),
      });
    }
  });

  return router;
}
