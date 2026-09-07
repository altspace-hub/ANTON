import { safeError } from '../lib/error-response.js';
import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createTaskDelegationService } from '../services/task-delegation-service.js';

/**
 * The values PATCH /community/connections/:id/delegation may write.
 *
 * delegation_trust_level: the three the contact editor offers
 * (src/pages/community/CommunityContactsPage.tsx:436-438) and the two that
 * task-auto-processor.ts:102 treats as "process without asking".
 * import_policy: the same three the sibling PATCH .../policy route already
 * validates (routes/community.ts:1121) — kept identical on purpose; if one list
 * grows, the other must too, or the two routes disagree about the same column.
 */
const TRUST_LEVELS = ['manual', 'trusted', 'auto'] as const;
type TrustLevel = typeof TRUST_LEVELS[number];
const IMPORT_POLICIES = ['auto_accept', 'ask_first', 'block'] as const;
type ImportPolicy = typeof IMPORT_POLICIES[number];

export async function createTaskDelegationRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createTaskDelegationService(db);

  router.get('/community/tasks', async (req, res) => {
    try {
      const tasks = await service.listTasks({
        direction: req.query.direction as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      });
      res.json(tasks);
    } catch (err) { res.status(500).json({ error: 'Failed to list tasks' }); }
  });

  router.get('/community/tasks/stats', async (_req, res) => {
    try {
      const stats = await service.getTaskStats();
      res.json(stats);
    } catch (err) { res.status(500).json({ error: 'Failed to get task stats' }); }
  });

  router.get('/community/tasks/:id', async (req, res) => {
    try {
      const result = await service.getTask(req.params.id);
      if (!result.task) return res.status(404).json({ error: 'Task not found' });
      res.json(result);
    } catch (err) { res.status(500).json({ error: 'Failed to get task' }); }
  });

  router.post('/community/tasks', async (req, res) => {
    try {
      const { providerHash, title, description, requiredModules, context, urgency, deadline } = req.body;
      if (!providerHash || !title || !description) return res.status(400).json({ error: 'providerHash, title, description required' });
      const result = await service.createTaskRequest({ providerHash, title, description, requiredModules, context, urgency, deadline });
      res.status(201).json(result);
    } catch (err) { res.status(500).json({ error: safeError(err) }); }
  });

  router.post('/community/tasks/:id/accept', async (req, res) => {
    try { await service.acceptTask(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to accept task' }); }
  });

  router.post('/community/tasks/:id/decline', async (req, res) => {
    try { await service.declineTask(req.params.id, req.body.reason); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to decline task' }); }
  });

  router.post('/community/tasks/:id/start', async (req, res) => {
    try { await service.startTask(req.params.id); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to start task' }); }
  });

  router.post('/community/tasks/:id/progress', async (req, res) => {
    try { await service.updateProgress(req.params.id, req.body.percent, req.body.currentStep); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to update progress' }); }
  });

  router.post('/community/tasks/:id/clarify', async (req, res) => {
    try { await service.requestClarification(req.params.id, req.body.question); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to request clarification' }); }
  });

  router.post('/community/tasks/:id/respond', async (req, res) => {
    try { await service.respondToClarification(req.params.id, req.body.answer); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to respond' }); }
  });

  router.post('/community/tasks/:id/complete', async (req, res) => {
    try { await service.completeTask(req.params.id, { content: req.body.content, artifacts: req.body.artifacts }); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to complete task' }); }
  });

  router.post('/community/tasks/:id/cancel', async (req, res) => {
    try { await service.cancelTask(req.params.id, req.body.reason); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: 'Failed to cancel task' }); }
  });

  router.post('/community/tasks/:id/rate', async (req, res) => {
    try {
      const result = await service.rateTask(req.params.id, req.body.qualityScore);
      res.json({ ok: true, ...result });
    } catch (err) { res.status(500).json({ error: 'Failed to rate task' }); }
  });

  router.patch('/community/connections/:id/delegation', async (req, res) => {
    try {
      const { trustLevel, delegation_trust_level, policy, import_policy, endpoint } = req.body;
      const sets: string[] = [];
      const vals: unknown[] = [];
      const trust = trustLevel ?? delegation_trust_level;
      // Both columns are enums that other code branches on, and this handler used to
      // write whatever string arrived. delegation_trust_level decides whether an
      // INBOUND task from that contact is processed without human review
      // (task-auto-processor.ts:101 — 'auto' | 'trusted' auto-process) and import_policy
      // decides whether a peer's pushed knowledge is accepted (p2p.ts:47,
      // structured-message-handler.ts:55). A typo'd or crafted value is stored in a
      // NOT NULL column that every reader then compares against literals, so the
      // contact silently drops to whatever the reader's fallback happens to be —
      // different per reader, and invisible in the UI, which renders only the three
      // known options. Reject instead, the same way the sibling
      // PATCH /community/connections/:id/policy already validates importPolicy.
      // Falsy (absent / null / '') still means "leave unchanged", as the writes below
      // have always done — only a supplied value has to be one of the known ones.
      if (trust && !TRUST_LEVELS.includes(trust as TrustLevel)) {
        return res.status(400).json({ error: `Invalid trust level. Expected one of: ${TRUST_LEVELS.join(', ')}` });
      }
      if (import_policy && !IMPORT_POLICIES.includes(import_policy as ImportPolicy)) {
        return res.status(400).json({ error: `Invalid import policy. Expected one of: ${IMPORT_POLICIES.join(', ')}` });
      }
      if (trust) { sets.push('delegation_trust_level = ?'); vals.push(trust); }
      if (policy) { sets.push('delegation_policy = ?'); vals.push(JSON.stringify(policy)); }
      const importPol = import_policy;
      if (importPol) { sets.push('import_policy = ?'); vals.push(importPol); }
      if (endpoint !== undefined) { sets.push('endpoint = ?'); vals.push(endpoint || null); }
      if (sets.length > 0) { vals.push(req.params.id); await db.run(`UPDATE community_connections SET ${sets.join(', ')} WHERE id = ?`, ...vals); }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update delegation settings' }); }
  });

  return router;
}
