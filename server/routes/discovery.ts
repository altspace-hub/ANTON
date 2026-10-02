import { Router, type Request, type Response } from 'express';
import { assertOwned, ownerFilter, scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { createDiscoveryEngine, discoveryPackHiddenForDemo, type DiscoveryCallOptions } from '../services/discovery-engine.js';
import { isDemoMode } from '../middleware/demo-mode.js';
import { isTeamMode } from '../middleware/role-guards.js';
import { SOLO_USER_ID } from '../middleware/user-constants.js';
import { checkBudgetBeforeApiCall, chargeMonthlyUsage } from '../services/budget-manager.js';
import type { DiscoveryTier } from '../services/discovery-engine.js';
import { safeError, publicErrorMessage } from '../lib/error-response.js';

/** A non-admin on a public demo (DEMO_MODE=true). Admins are never held to the demo's rules. */
function isDemoVisitor(req: Request): boolean {
  return isDemoMode() && req.user?.role !== 'admin';
}

/** The built-in discovery packs (GET /discovery/packs lists them; POST …/pack accepts only these). */
export const DISCOVERY_PACK_IDS: readonly string[] = ['fcp', 'legal', 'consulting', 'healthcare', 'education', 'startup'];

/** A message to the interview: at most this many characters (as a Task Agent message). */
const MAX_MESSAGE_CHARS = 10_000;

/**
 * Narrow `unknown` thrown values to a user-safe error message.
 *
 * This used to read `err instanceof Error ? errMsg(err) : String(err)` — it called
 * ITSELF on the same value, so every Error recursed until the stack blew. That threw
 * a RangeError from inside a `catch` block in an async handler, which Express 4 does
 * not route to the error middleware: the response was never sent and the request
 * hung until the client timed out. Every 500 path in this file was affected, so the
 * user saw a spinner forever instead of an error. Delegates to safeError(), the
 * project-standard scrubber, which is what the recursion was presumably reaching for.
 */
function errMsg(err: unknown): string {
  return safeError(err);
}

export async function createDiscoveryRoutes(db: DatabaseAdapter) {
  const router = Router();
  const engine = await createDiscoveryEngine(db);

  /**
   * The engine options for this caller: the demo's interview rules for a
   * visitor, and every model call's tokens charged to the caller's monthly
   * budget (team mode), as the Work route charges a run.
   */
  function callOptions(req: Request): DiscoveryCallOptions {
    return {
      demoVisitor: isDemoVisitor(req),
      onUsage: (inputTokens, outputTokens) => chargeMonthlyUsage(db, req.user, inputTokens, outputTokens),
    };
  }

  /**
   * Refuses (429, as the Work route's budget check does) when the caller's
   * monthly token budget cannot cover a call of about `promptChars` / 3 tokens.
   * Returns true when it answered. Solo mode has no per-user budget.
   */
  async function refusedOverBudget(req: Request, res: Response, promptChars: number): Promise<boolean> {
    const userId = req.user?.id;
    if (!isTeamMode() || !userId || userId === SOLO_USER_ID) return false;
    const check = await checkBudgetBeforeApiCall(db, userId, Math.ceil(promptChars / 3));
    if (check.allowed) return false;
    res.status(429).json({ error: 'Budget limit exceeded', reason: check.reason });
    return true;
  }

  /** What a turn sends besides the new message: the conversation so far and the prompts (about 12,000 characters). */
  async function turnChars(sessionId: string): Promise<number> {
    const session = await engine.getSession(sessionId);
    return 12_000 + (session ? JSON.stringify(session.state.conversationHistory).length : 0);
  }

  // POST /discovery/sessions — Start new session
  router.post('/discovery/sessions', async (req, res) => {
    try {
      const { tier } = req.body as { tier?: string };
      if (!tier || !['lite', 'standard', 'professional', 'expert'].includes(tier)) {
        res.status(400).json({ error: 'Invalid tier. Must be: lite, standard, professional, expert' });
        return;
      }
      const userId = req.user?.id || undefined;
      const session = await engine.createSession(tier as DiscoveryTier, userId);
      res.json({ id: session.id, state: session.state });
    } catch (err: unknown) {
      console.error('[discovery] Create session error:', err);
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // GET /discovery/sessions — List user's sessions
  router.get('/discovery/sessions', async (req, res) => {
    try {
      // Scoped to the caller always (every user sees their own interviews;
      // no id, as when there is no user, would list everyone's).
      const userId = req.user?.id || SOLO_USER_ID;
      const sessions = await engine.listSessions(userId);
      res.json(sessions);
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  /**
   * SECURITY (2026-07-27 survey): the twelve /discovery/sessions/:id routes below —
   * read state, patch status, delete, respond, generate, export, start — all keyed off
   * the id alone, so any authenticated user on a shared instance could read and mutate
   * another tenant's discovery session, including their stated pain points and business
   * case.
   *
   * Guarded ONCE here rather than per-route. Twelve individual checks is how the
   * thirteenth route ships without one; a router.use over the id prefix cannot be
   * forgotten by a later handler. Note this does not match the bare
   * `/discovery/sessions` list (no id segment), which already scopes via
   * engine.listSessions(userId).
   */
  router.use('/discovery/sessions/:id', async (req, res, next) => {
    if (!(await assertOwned(db, req as OwnedRequest, res, {
      table: 'discovery_sessions', ownerColumn: 'user_id', id: req.params.id,
      notFoundMessage: 'Discovery session not found',
    }))) return;
    next();
  });

  // GET /discovery/sessions/:id — Get session state
  router.get('/discovery/sessions/:id', async (req, res) => {
    try {
      const session = await engine.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json(session);
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // PUT /discovery/sessions/:id — Update session state (autosave)
  //
  // Writes whatever state the client sends, the active pack included. The
  // Discover page does not call it; a demo visitor may not (the interview's
  // state is the server's, and a pack the demo keeps off could be set here).
  router.put('/discovery/sessions/:id', async (req, res) => {
    if (isDemoVisitor(req)) {
      res.status(404).json({ error: 'Not available in this demo' });
      return;
    }
    try {
      const session = await engine.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      const { state } = req.body;
      if (state) {
        await engine.updateSessionState(req.params.id, state);
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // PATCH /discovery/sessions/:id/status — Update session status
  router.patch('/discovery/sessions/:id/status', async (req, res) => {
    try {
      const { status } = req.body as { status?: string };
      if (!status || !['active', 'paused', 'completed', 'abandoned'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      await engine.updateSessionStatus(req.params.id, status as 'active' | 'paused' | 'completed' | 'abandoned');
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // DELETE /discovery/sessions/:id — Delete session
  router.delete('/discovery/sessions/:id', async (req, res) => {
    try {
      await engine.deleteSession(req.params.id);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // POST /discovery/sessions/:id/respond — Submit user response
  router.post('/discovery/sessions/:id/respond', async (req, res) => {
    try {
      const { message } = req.body as { message?: unknown };
      if (typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }
      if (message.length > MAX_MESSAGE_CHARS) {
        res.status(400).json({ error: `A message can be at most ${MAX_MESSAGE_CHARS.toLocaleString('en-GB')} characters.` });
        return;
      }
      if (await refusedOverBudget(req, res, (await turnChars(req.params.id)) + message.length)) return;

      const result = await engine.processUserResponse(req.params.id, message.trim(), callOptions(req));
      res.json({
        response: result.response,
        state: result.state,
        phaseChanged: result.phaseChanged,
      });
    } catch (err: unknown) {
      console.error('[discovery] Respond error:', err instanceof Error ? err.message : err);
      // A refusal written for the person (today's budget, a model not offered) is shown.
      res.status(500).json({ error: publicErrorMessage(err) });
    }
  });

  // GET /discovery/sessions/:id/insights — Get real-time insights
  router.get('/discovery/sessions/:id/insights', async (req, res) => {
    try {
      const session = await engine.getSession(req.params.id);
      if (await refusedOverBudget(req, res, JSON.stringify(session?.state ?? {}).length)) return;
      const insights = await engine.generateInsights(req.params.id, callOptions(req));
      res.json(insights);
    } catch (err: unknown) {
      console.error('[discovery] Insights error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // POST /discovery/sessions/:id/generate — Generate output document
  router.post('/discovery/sessions/:id/generate', async (req, res) => {
    try {
      const session = await engine.getSession(req.params.id);
      if (await refusedOverBudget(req, res, 12_000 + JSON.stringify(session?.state ?? {}).length)) return;
      // A demo visitor is never sent to a module or pack the demo keeps off.
      const output = await engine.generateOutput(req.params.id, callOptions(req));
      res.json(output);
    } catch (err: unknown) {
      console.error('[discovery] Generate error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: publicErrorMessage(err) });
    }
  });

  // GET /discovery/sessions/:id/output — Get generated output
  router.get('/discovery/sessions/:id/output', async (req, res) => {
    try {
      const output = await engine.getOutputBySession(req.params.id);
      if (!output) {
        res.status(404).json({ error: 'No output generated yet' });
        return;
      }
      res.json(output);
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // POST /discovery/sessions/:id/followup — Schedule follow-up
  router.post('/discovery/sessions/:id/followup', async (req, res) => {
    try {
      const { type, scheduledDate } = req.body as { type?: unknown; scheduledDate?: unknown };
      const kind = type === undefined || type === null || type === '' ? '30_day' : type;
      if (kind !== '30_day' && kind !== '60_day' && kind !== '90_day') {
        res.status(400).json({ error: 'type must be 30_day, 60_day or 90_day' });
        return;
      }
      if (scheduledDate !== undefined && scheduledDate !== null && scheduledDate !== ''
        && (typeof scheduledDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate))) {
        res.status(400).json({ error: 'scheduledDate must be a date (YYYY-MM-DD)' });
        return;
      }
      const id = randomUUID();
      await db.run(`
        INSERT INTO discovery_followups (id, session_id, type, scheduled_date, status)
        VALUES (?, ?, ?, ?, 'pending')
      `, id, req.params.id, kind, typeof scheduledDate === 'string' && scheduledDate ? scheduledDate : null);
      res.json({ id });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // GET /discovery/followups/pending — Get pending follow-ups
  router.get('/discovery/followups/pending', async (req, res) => {
    try {
      // SECURITY: this returned every tenant's pending follow-ups — the join exposes
      // ds.tier/state alongside another org's follow-up content. Scoped through the
      // joined session's owner.
      // A list (db.all): it used to be db.get, which answered with ONE row (or
      // nothing) where a list of follow-ups was meant.
      const scope = ownerFilter(req as OwnedRequest, 'ds.user_id');
      const rows = await db.all(`
        SELECT f.*, ds.tier, ds.state
        FROM discovery_followups f
        JOIN discovery_sessions ds ON f.session_id = ds.id
        WHERE f.status = 'pending'${scope.sql}
        ORDER BY f.scheduled_date ASC
      `, scope.params);
      res.json(rows);
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // PUT /discovery/followups/:id — Update follow-up with progress data
  //
  // SECURITY: this updated any follow-up by its id alone, so a user on a shared
  // server could rewrite another person's notes and feedback. A follow-up is
  // the caller's when its session is: checked in the same UPDATE, before
  // anything is written, and one that is not answers 404 like a missing one.
  // Solo mode and admins are not scoped.
  router.put('/discovery/followups/:id', async (req, res) => {
    try {
      const { status, follow_up_notes, progress_data, modules_tried, user_feedback } = req.body as Record<string, unknown>;
      const updates: string[] = [];
      const values: unknown[] = [];

      if (status !== undefined && status !== null && status !== '' && !['pending', 'completed', 'skipped'].includes(String(status))) {
        res.status(400).json({ error: 'status must be pending, completed or skipped' });
        return;
      }
      if (status) { updates.push('status = ?'); values.push(status); }
      if (follow_up_notes) { updates.push('follow_up_notes = ?'); values.push(String(follow_up_notes).slice(0, 10_000)); }
      if (progress_data) { updates.push('progress_data = ?'); values.push(JSON.stringify(progress_data)); }
      if (modules_tried) { updates.push('modules_tried = ?'); values.push(JSON.stringify(modules_tried)); }
      if (user_feedback) { updates.push('user_feedback = ?'); values.push(JSON.stringify(user_feedback)); }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      values.push(req.params.id);
      let ownerSql = '';
      if (scopesToOwner(req as OwnedRequest)) {
        if (!req.user?.id) {
          res.status(404).json({ error: 'Follow-up not found' });
          return;
        }
        ownerSql = ' AND session_id IN (SELECT id FROM discovery_sessions WHERE user_id = ?)';
        values.push(req.user.id);
      }
      const result = await db.run(`UPDATE discovery_followups SET ${updates.join(', ')} WHERE id = ?${ownerSql}`, values);
      if (!result.changes) {
        res.status(404).json({ error: 'Follow-up not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // POST /discovery/sessions/:id/export — Export output to format
  router.post('/discovery/sessions/:id/export', async (req, res) => {
    try {
      const { format } = req.body as { format?: string };
      if (!format || !['md', 'docx', 'pdf'].includes(format)) {
        res.status(400).json({ error: 'Invalid format. Must be: md, docx, pdf' });
        return;
      }

      const output = await engine.getOutputBySession(req.params.id);
      if (!output) {
        res.status(404).json({ error: 'No output generated yet. Generate the report first.' });
        return;
      }

      if (format === 'md') {
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="discovery-report.md"`);
        res.send(output.contentMd);
        return;
      }

      if (format === 'docx') {
        // Use existing export infrastructure
        try {
          const { generateDocx: exportToDocx } = await import('../services/export-docx.js');
          const buffer = await exportToDocx(output.contentMd, { title: output.title || 'Discovery Report' });
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="discovery-report.docx"`);
          res.send(buffer);
        } catch (e) {
          // Fallback to markdown if DOCX export not available
          res.setHeader('Content-Type', 'text/markdown');
          res.setHeader('Content-Disposition', `attachment; filename="discovery-report.md"`);
          res.send(output.contentMd);
        }
        return;
      }

      if (format === 'pdf') {
        try {
          const { generatePdf: exportToPdf } = await import('../services/export-pdf.js');
          const buffer = await exportToPdf(output.contentMd, { title: output.title || 'Discovery Report' });
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="discovery-report.pdf"`);
          res.send(buffer);
        } catch (e) {
          // Fallback to markdown if PDF export not available
          res.setHeader('Content-Type', 'text/markdown');
          res.setHeader('Content-Disposition', `attachment; filename="discovery-report.md"`);
          res.send(output.contentMd);
        }
        return;
      }
    } catch (err: unknown) {
      console.error('[discovery] Export error:', err);
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // GET /discovery/sessions/:id/start — Get the initial message (starts the conversation)
  //
  // The opening turn used to be faked here: this route posted the literal string
  // '__START_DISCOVERY__' as the user's first message and then scrubbed it out of the
  // history afterwards. The model still received the token, and the extra history
  // entry suppressed the warm opening question. engine.startConversation() owns that
  // turn now — there is no synthetic user message to send or to clean up.
  router.get('/discovery/sessions/:id/start', async (req, res) => {
    try {
      const session = await engine.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      // The opening turn is a model call only once (a started session returns its opening).
      const started = session.state.conversationHistory.some((m) => m.role === 'assistant');
      if (!started && await refusedOverBudget(req, res, await turnChars(req.params.id))) return;

      const { response, state } = await engine.startConversation(req.params.id, callOptions(req));
      res.json({ response, state });
    } catch (err: unknown) {
      console.error('[discovery] Start error:', err instanceof Error ? err.message : err);
      res.status(500).json({ error: publicErrorMessage(err) });
    }
  });

  // GET /discovery/packs — List available discovery packs (a demo visitor is
  // not shown one the demo keeps off: the healthcare pack invites health data)
  router.get('/discovery/packs', async (req, res) => {
    try {
      // Built-in packs (Phase 4)
      const builtInPacks = [
        {
          id: 'fcp',
          name: 'Financial Crime Prevention',
          description: 'Deep dive into AML, sanctions, fraud prevention, and compliance workflows',
          version: '1.0.0',
          author: 'openEXPERT',
          activationKeywords: ['compliance', 'aml', 'financial crime', 'anti-money laundering', 'sanctions', 'fraud', 'kyc', 'transaction monitoring'],
          activationRoles: ['compliance analyst', 'compliance officer', 'MLRO', 'head of compliance', 'financial crime investigator'],
          activationIndustries: ['banking', 'financial services', 'insurance', 'fintech', 'payments'],
          status: 'active',
        },
        {
          id: 'legal',
          name: 'Legal & Compliance',
          description: 'Contract review, regulatory change management, policy maintenance workflows',
          version: '1.0.0',
          author: 'openEXPERT',
          activationKeywords: ['legal', 'contract', 'regulatory', 'policy', 'litigation'],
          activationRoles: ['legal counsel', 'compliance officer', 'paralegal', 'legal director'],
          activationIndustries: ['legal services', 'financial services', 'healthcare', 'technology'],
          status: 'active',
        },
        {
          id: 'consulting',
          name: 'Consulting & Professional Services',
          description: 'Engagement lifecycle, knowledge management, deliverable production workflows',
          version: '1.0.0',
          author: 'openEXPERT',
          activationKeywords: ['consulting', 'advisory', 'professional services', 'engagement', 'deliverable'],
          activationRoles: ['consultant', 'senior consultant', 'partner', 'manager', 'director'],
          activationIndustries: ['consulting', 'advisory', 'professional services', 'audit'],
          status: 'active',
        },
        {
          id: 'healthcare',
          name: 'Healthcare & Life Sciences',
          description: 'Clinical documentation, regulatory submissions, quality management workflows',
          version: '1.0.0',
          author: 'openEXPERT',
          activationKeywords: ['healthcare', 'clinical', 'pharma', 'medical', 'patient', 'regulatory submission'],
          activationRoles: ['healthcare administrator', 'clinical researcher', 'quality manager', 'regulatory affairs'],
          activationIndustries: ['healthcare', 'pharma', 'life sciences', 'medical devices'],
          status: 'active',
        },
        {
          id: 'education',
          name: 'Education & Academic',
          description: 'Teaching, research workflows, administrative processes, grant applications',
          version: '1.0.0',
          author: 'openEXPERT',
          activationKeywords: ['education', 'academic', 'teaching', 'research', 'university', 'curriculum'],
          activationRoles: ['professor', 'researcher', 'teacher', 'academic', 'administrator'],
          activationIndustries: ['education', 'academic', 'university', 'research'],
          status: 'active',
        },
        {
          id: 'startup',
          name: 'Startup & Entrepreneurship',
          description: 'Founder workflows, scaling considerations, compliance obligations, knowledge capture',
          version: '1.0.0',
          author: 'openEXPERT',
          activationKeywords: ['startup', 'founder', 'entrepreneur', 'scaling', 'venture'],
          activationRoles: ['founder', 'cto', 'ceo', 'co-founder', 'startup employee'],
          activationIndustries: ['technology', 'startup', 'saas', 'e-commerce', 'fintech'],
          status: 'active',
        },
      ];
      const demoVisitor = isDemoVisitor(req);
      res.json(builtInPacks.filter((p) => !demoVisitor || !discoveryPackHiddenForDemo(p.id)));
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // GET /discovery/packs/:id — Get pack details
  router.get('/discovery/packs/:id', async (req, res) => {
    try {
      // Placeholder — full pack details would include question sets and pain patterns
      const packId = req.params.id;
      const packMeta: Record<string, { name: string; questionCount: number; painPatterns: number }> = {
        fcp: { name: 'Financial Crime Prevention', questionCount: 25, painPatterns: 12 },
        legal: { name: 'Legal & Compliance', questionCount: 20, painPatterns: 8 },
        consulting: { name: 'Consulting & Professional Services', questionCount: 18, painPatterns: 10 },
        healthcare: { name: 'Healthcare & Life Sciences', questionCount: 22, painPatterns: 9 },
        education: { name: 'Education & Academic', questionCount: 15, painPatterns: 7 },
        startup: { name: 'Startup & Entrepreneurship', questionCount: 16, painPatterns: 6 },
      };

      if (!packMeta[packId] || (isDemoVisitor(req) && discoveryPackHiddenForDemo(packId))) {
        res.status(404).json({ error: 'Pack not found' });
        return;
      }

      res.json({ id: packId, ...packMeta[packId], status: 'active' });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // PATCH /discovery/sessions/:id/upgrade — Upgrade session tier
  router.patch('/discovery/sessions/:id/upgrade', async (req, res) => {
    try {
      const { newTier } = req.body as { newTier?: string };
      if (!newTier || !['standard', 'professional', 'expert'].includes(newTier)) {
        res.status(400).json({ error: 'Invalid tier. Upgrade to: standard, professional, expert' });
        return;
      }

      const session = await engine.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const tierOrder = ['lite', 'standard', 'professional', 'expert'];
      const currentIdx = tierOrder.indexOf(session.tier);
      const newIdx = tierOrder.indexOf(newTier);

      if (newIdx <= currentIdx) {
        res.status(400).json({ error: 'Can only upgrade to a higher tier' });
        return;
      }

      // Update tier in state and session
      const updatedState = { ...session.state, tier: newTier as DiscoveryTier };
      await engine.updateSessionState(req.params.id, updatedState);
      await db.run('UPDATE discovery_sessions SET tier = ? WHERE id = ?', newTier, req.params.id);

      res.json({ ok: true, tier: newTier });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // POST /discovery/sessions/:id/pack — Activate a discovery pack for this session
  router.post('/discovery/sessions/:id/pack', async (req, res) => {
    try {
      const { packId } = req.body as { packId?: unknown };
      if (typeof packId !== 'string' || !packId) {
        res.status(400).json({ error: 'packId is required' });
        return;
      }
      // Only a built-in pack; for a demo visitor, not one the demo keeps off
      // (answered as an unknown pack).
      if (!DISCOVERY_PACK_IDS.includes(packId) || (isDemoVisitor(req) && discoveryPackHiddenForDemo(packId))) {
        res.status(404).json({ error: 'Pack not found' });
        return;
      }

      const session = await engine.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (session.tier !== 'expert') {
        res.status(400).json({ error: 'Discovery Packs are only available for Expert tier' });
        return;
      }

      // Update state with active pack
      const updatedState = { ...session.state, activePack: packId };
      await engine.updateSessionState(req.params.id, updatedState);

      res.json({ ok: true, activePack: packId });
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  return router;
}
