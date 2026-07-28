import { Router } from 'express';
import { assertOwned, ownerFilter, type OwnedRequest } from '../middleware/ownership.js';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import type Anthropic from '@anthropic-ai/sdk';
import { createDiscoveryEngine } from '../services/discovery-engine.js';
import type { DiscoveryTier } from '../services/discovery-engine.js';
import { safeError } from '../lib/error-response.js';

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

export async function createDiscoveryRoutes(db: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();
  const engine = await createDiscoveryEngine(db, anthropic);

  // POST /discovery/sessions — Start new session
  router.post('/discovery/sessions', async (req, res) => {
    try {
      const { tier } = req.body as { tier?: string };
      if (!tier || !['lite', 'standard', 'professional', 'expert'].includes(tier)) {
        res.status(400).json({ error: 'Invalid tier. Must be: lite, standard, professional, expert' });
        return;
      }
      const userId = (req as any).user?.id || null;
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
      const userId = (req as any).user?.id || null;
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
  router.put('/discovery/sessions/:id', async (req, res) => {
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
      await engine.updateSessionStatus(req.params.id, status as any);
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
      const { message } = req.body as { message?: string };
      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const result = await engine.processUserResponse(req.params.id, message.trim());
      res.json({
        response: result.response,
        state: result.state,
        phaseChanged: result.phaseChanged,
      });
    } catch (err: unknown) {
      console.error('[discovery] Respond error:', err);
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // GET /discovery/sessions/:id/insights — Get real-time insights
  router.get('/discovery/sessions/:id/insights', async (req, res) => {
    try {
      const insights = await engine.generateInsights(req.params.id);
      res.json(insights);
    } catch (err: unknown) {
      console.error('[discovery] Insights error:', err);
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // POST /discovery/sessions/:id/generate — Generate output document
  router.post('/discovery/sessions/:id/generate', async (req, res) => {
    try {
      const output = await engine.generateOutput(req.params.id);
      res.json(output);
    } catch (err: unknown) {
      console.error('[discovery] Generate error:', err);
      res.status(500).json({ error: errMsg(err) });
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
      const { type, scheduledDate } = req.body as { type?: string; scheduledDate?: string };
      const id = randomUUID();
      await db.run(`
        INSERT INTO discovery_followups (id, session_id, type, scheduled_date, status)
        VALUES (?, ?, ?, ?, 'pending')
      `, id, req.params.id, type || '30_day', scheduledDate || null);
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
      // NOTE: db.get returns ONE row for what the client treats as a list. Left as-is
      // deliberately — changing it to db.all alters the response shape and belongs in
      // its own change, not smuggled into a security fix.
      const scope = ownerFilter(req as OwnedRequest, 'ds.user_id');
      const rows = await db.get(`
        SELECT f.*, ds.tier, ds.state
        FROM discovery_followups f
        JOIN discovery_sessions ds ON f.session_id = ds.id
        WHERE f.status = 'pending'${scope.sql}
        ORDER BY f.scheduled_date ASC
      `, ...scope.params);
      res.json(rows);
    } catch (err: unknown) {
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // PUT /discovery/followups/:id — Update follow-up with progress data
  router.put('/discovery/followups/:id', async (req, res) => {
    try {
      const { status, follow_up_notes, progress_data, modules_tried, user_feedback } = req.body;
      const updates: string[] = [];
      const values: unknown[] = [];

      if (status) { updates.push('status = ?'); values.push(status); }
      if (follow_up_notes) { updates.push('follow_up_notes = ?'); values.push(follow_up_notes); }
      if (progress_data) { updates.push('progress_data = ?'); values.push(JSON.stringify(progress_data)); }
      if (modules_tried) { updates.push('modules_tried = ?'); values.push(JSON.stringify(modules_tried)); }
      if (user_feedback) { updates.push('user_feedback = ?'); values.push(JSON.stringify(user_feedback)); }

      if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      values.push(req.params.id);
      await db.run(`UPDATE discovery_followups SET ${updates.join(', ')} WHERE id = ?`, ...values);
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

      const { response, state } = await engine.startConversation(req.params.id);
      res.json({ response, state });
    } catch (err: unknown) {
      console.error('[discovery] Start error:', err);
      res.status(500).json({ error: errMsg(err) });
    }
  });

  // GET /discovery/packs — List available discovery packs
  router.get('/discovery/packs', async (_req, res) => {
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
      res.json(builtInPacks);
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

      if (!packMeta[packId]) {
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
      const updatedState = { ...session.state, tier: newTier as any };
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
      const { packId } = req.body as { packId?: string };
      if (!packId) {
        res.status(400).json({ error: 'packId is required' });
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
