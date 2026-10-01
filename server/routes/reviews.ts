import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import Anthropic from '@anthropic-ai/sdk';
import { streamChat, setSSEHeaders } from '../services/provider-router.js';
import { CLAUDE_LARGE } from '../config/claude-lineup.js';
import { REVIEW_MODES } from '../services/review-engine.js';
import { createReviewOrchestrator, type ReviewContext } from '../services/review-orchestrator.js';
import { safeError, publicErrorMessage } from '../lib/error-response.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { hasAnyModelEngine, NO_MODEL_ENGINE_MESSAGE } from '../services/claude-engine-availability.js';
import { sideRouteModel, modelCallErrorStatus } from '../services/side-route-model.js';
import { createBudgetMiddleware } from '../middleware/budget.js';
import { chargeMonthlyUsage } from '../services/budget-manager.js';

/**
 * The longest text a review reads: well above any one answer (a compat run
 * stops at 16,384 tokens), so only a request that is not an answer is refused.
 */
const REVIEW_MAX_CHARS = 200_000;

export async function createReviewRoutes(db: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();
  const orchestrator = await createReviewOrchestrator(anthropic);
  const checkBudget = createBudgetMiddleware(db);

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
  //
  // The reviewer is the model the body names (`model`, a full id): the Review
  // chip preselects an offered model other than the one that wrote the
  // answer, so a second model checks the first. A demo visitor gets it only
  // when DEMO_OFFERED_MODELS lists it, else the server default
  // (sideRouteModel). It runs through provider-router on any configured
  // engine — the gate used to ask for an Anthropic, Mistral, OpenAI or Google
  // key and refused every review on a server whose engine is an
  // OpenAI-compatible endpoint. Frames: text_delta (and thinking_delta) from
  // the router, then `done`, or `error` with a message the person may read;
  // either way the stream ends with [DONE].
  router.post('/reviews', checkBudget, async (req, res) => {
    if (!hasAnyModelEngine()) {
      res.status(503).json({ error: NO_MODEL_ENGINE_MESSAGE });
      return;
    }

    const { modeId, content, model, sessionId } = req.body as {
      modeId: string;
      content: string;
      model?: unknown;
      sessionId?: string;
    };

    if (!modeId || !content || typeof content !== 'string') {
      res.status(400).json({ error: 'modeId and content are required' });
      return;
    }
    if (content.length > REVIEW_MAX_CHARS) {
      res.status(413).json({ error: `The text is too long to review (${REVIEW_MAX_CHARS.toLocaleString('en-GB')} characters at most).` });
      return;
    }

    const mode = REVIEW_MODES.find((m) => m.id === modeId);
    if (!mode) {
      res.status(400).json({ error: `Unknown review mode: ${modeId}` });
      return;
    }

    let streaming = false;
    try {
      // Decided before streaming starts, so nothing about the session changes what
      // the caller sees — only whether the finished review is stored with it.
      const persistTo = sessionId && (await mayUseSession(req, String(sessionId))) ? String(sessionId) : null;

      const resolvedModel = sideRouteModel(req, model, CLAUDE_LARGE);

      setSSEHeaders(res);
      streaming = true;

      // A review reads one answer and writes a critique: standard reasoning
      // and room for a long one, not the 'investigate' level and 16,000
      // tokens it ran at (a high-effort call for every click of the chip).
      const result = await streamChat({
        model: resolvedModel,
        system: mode.systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Please review the following document:\n\n---\n\n${content}`,
          },
        ],
        maxTokens: 8192,
        thinkingLevel: 'think',
        db,
      }, res);
      await chargeMonthlyUsage(db, req.user, result.inputTokens, result.outputTokens);

      // Send completion event
      res.write(`data: ${JSON.stringify({ type: 'done', model: resolvedModel })}\n\n`);
      res.write('data: [DONE]\n\n');
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
      // After the headers the only way to say it is a frame: without one the
      // stream never ended and the panel waited for ever (a spend-cap refusal,
      // for one).
      const message = publicErrorMessage(error);
      if (!streaming && !res.headersSent) {
        res.status(modelCallErrorStatus(error)).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
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
