/**
 * civic.ts
 * REST API for the Civic Pillar — civic engagement lifecycle management.
 * Handles engagements, processes, eligibility checks, documents, submissions,
 * deadlines, and knowledge packs.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createCivicService } from '../services/civic-service.js';
import { safeError } from '../lib/error-response.js';

// ── Zod Schemas ─────────────────────────────────────────────────────────────

const createEngagementSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  goal: z.string().optional(), // Frontend sends 'goal' — mapped to description
  domain: z.string().max(200).optional(),
  jurisdiction: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  phase: z.string().max(50).optional(),
  contact_name: z.string().max(300).optional(),
  contact_email: z.string().email().optional(),
  contact_org: z.string().max(300).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateEngagementSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  domain: z.string().min(1).max(200).optional(),
  jurisdiction: z.string().min(1).max(200).optional(),
  status: z.string().max(50).optional(),
  phase: z.string().max(50).optional(),
  contact_name: z.string().max(300).optional(),
  contact_email: z.string().email().optional(),
  contact_org: z.string().max(300).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createProcessSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  process_type: z.string().min(1).max(100),
  status: z.string().max(50).optional(),
  authority: z.string().max(300).optional(),
  reference_number: z.string().max(200).optional(),
  deadline: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateProcessSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  process_type: z.string().min(1).max(100).optional(),
  status: z.string().max(50).optional(),
  authority: z.string().max(300).optional(),
  reference_number: z.string().max(200).optional(),
  deadline: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createEligibilityCheckSchema = z.object({
  criterion: z.string().min(1).max(500),
  status: z.string().max(50).optional(),
  result: z.string().optional(),
  notes: z.string().optional(),
});

const createDocumentSchema = z.object({
  title: z.string().min(1).max(500),
  document_type: z.string().min(1).max(100),
  status: z.string().max(50).optional(),
  content: z.string().optional(),
  file_path: z.string().max(1000).optional(),
  version: z.number().int().min(1).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  document_type: z.string().min(1).max(100).optional(),
  status: z.string().max(50).optional(),
  content: z.string().optional(),
  file_path: z.string().max(1000).optional(),
  version: z.number().int().min(1).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createSubmissionSchema = z.object({
  title: z.string().min(1).max(500),
  submission_type: z.string().min(1).max(100),
  status: z.string().max(50).optional(),
  target_authority: z.string().max(300).optional(),
  deadline: z.string().optional(),
  reference_number: z.string().max(200).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateSubmissionSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  submission_type: z.string().min(1).max(100).optional(),
  status: z.string().max(50).optional(),
  target_authority: z.string().max(300).optional(),
  deadline: z.string().optional(),
  submitted_at: z.string().optional(),
  reference_number: z.string().max(200).optional(),
  response: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Route Factory ───────────────────────────────────────────────────────────

export async function createCivicRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createCivicService(db);

  // ── Multi-tenant isolation (team mode) ───────────────────────────────────
  // Ownership is rooted at the engagement (civic_engagements.created_by). Solo
  // mode is a single admin user, so these guards are transparent there; in team
  // mode they stop one user reading/mutating another's civic data. Knowledge
  // packs are shared reference data and intentionally stay unguarded.
  function actorOf(req: Request): { id: string; isAdmin: boolean } {
    return { id: req.user?.id ?? 'solo', isAdmin: (req.user?.role ?? 'admin') === 'admin' };
  }

  // 404 (not 403) so a non-owner cannot probe which engagement ids exist.
  async function ensureEngagementAccess(req: Request, res: Response, engagementId: string): Promise<boolean> {
    const row = await db.get<{ created_by: string | null }>(
      'SELECT created_by FROM civic_engagements WHERE id = ?', engagementId,
    );
    if (!row) { res.status(404).json({ error: 'Engagement not found' }); return false; }
    const a = actorOf(req);
    if (!a.isAdmin && row.created_by !== a.id) { res.status(404).json({ error: 'Engagement not found' }); return false; }
    return true;
  }

  // One guard for every /civic/engagements/:engagementId route (detail + children).
  router.use('/civic/engagements/:engagementId', (req: Request, res: Response, next: NextFunction): void => {
    void ensureEngagementAccess(req, res, String(req.params.engagementId)).then((ok) => { if (ok) next(); }).catch(next);
  });

  // Guard child-by-own-id routes by resolving the parent engagement.
  // /civic/processes/:id also covers the nested /civic/processes/:id/eligibility.
  const CHILD_TABLES: Record<string, string> = {
    processes: 'civic_processes',
    documents: 'civic_documents',
    submissions: 'civic_submissions',
  };
  for (const [seg, table] of Object.entries(CHILD_TABLES)) {
    router.use(`/civic/${seg}/:id`, (req: Request, res: Response, next: NextFunction): void => {
      void db.get<{ engagement_id: string }>(`SELECT engagement_id FROM ${table} WHERE id = ?`, req.params.id)
        .then((row) => {
          if (!row) { res.status(404).json({ error: 'Not found' }); return; }
          return ensureEngagementAccess(req, res, row.engagement_id).then((ok) => { if (ok) next(); });
        })
        .catch(next);
    });
  }

  // ── Engagements ─────────────────────────────────────────────────────────

  // GET /civic/engagements — list engagements
  router.get('/civic/engagements', async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const domain = req.query.domain as string | undefined;
      const a = actorOf(req);
      const engagements = await service.listEngagements({ status, domain, ownerId: a.isAdmin ? undefined : a.id });
      res.json({ success: true, engagements });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /civic/engagements — create engagement
  router.post('/civic/engagements', async (req, res) => {
    try {
      const parsed = createEngagementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      // Map frontend 'goal' field to 'description'
      const createData = { ...parsed.data };
      if (createData.goal && !createData.description) {
        createData.description = createData.goal;
      }
      delete (createData as Record<string, unknown>).goal;
      const engagement = await service.createEngagement({ ...createData, created_by: actorOf(req).id });
      res.status(201).json({ success: true, engagement });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /civic/engagements/:id — get engagement detail
  router.get('/civic/engagements/:id', async (req, res) => {
    try {
      const engagement = await service.getEngagement(req.params.id);
      if (!engagement) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      res.json({ success: true, engagement });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /civic/engagements/:id — update engagement
  router.put('/civic/engagements/:id', async (req, res) => {
    try {
      const parsed = updateEngagementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const engagement = await service.updateEngagement(req.params.id, parsed.data);
      if (!engagement) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      res.json({ success: true, engagement });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PATCH alias for PUT (frontend uses PATCH for situation analysis save)
  router.patch('/civic/engagements/:id', async (req, res) => {
    try {
      const parsed = updateEngagementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const engagement = await service.updateEngagement(req.params.id, parsed.data);
      if (!engagement) { res.status(404).json({ error: 'Engagement not found' }); return; }
      res.json({ success: true, engagement });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /civic/engagements/:id/archive — archive engagement
  router.post('/civic/engagements/:id/archive', async (req, res) => {
    try {
      const engagement = await service.archiveEngagement(req.params.id);
      if (!engagement) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }
      res.json({ success: true, engagement });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Processes ───────────────────────────────────────────────────────────

  // GET /civic/engagements/:engagementId/processes — list processes
  router.get('/civic/engagements/:engagementId/processes', async (req, res) => {
    try {
      const processes = await service.listProcesses(req.params.engagementId);
      res.json({ success: true, processes });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /civic/engagements/:engagementId/processes — add process
  router.post('/civic/engagements/:engagementId/processes', async (req, res) => {
    try {
      const parsed = createProcessSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const process = await service.addProcess(req.params.engagementId, parsed.data);
      res.status(201).json({ success: true, process });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /civic/processes/:id — update process
  router.put('/civic/processes/:id', async (req, res) => {
    try {
      const parsed = updateProcessSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const process = await service.updateProcess(req.params.id, parsed.data);
      if (!process) {
        res.status(404).json({ error: 'Process not found' });
        return;
      }
      res.json({ success: true, process });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Eligibility Checks ─────────────────────────────────────────────────

  // GET /civic/processes/:processId/eligibility — list checks
  router.get('/civic/processes/:processId/eligibility', async (req, res) => {
    try {
      const checks = await service.listEligibilityChecks(req.params.processId);
      res.json({ success: true, checks });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /civic/processes/:processId/eligibility — add check
  router.post('/civic/processes/:processId/eligibility', async (req, res) => {
    try {
      const parsed = createEligibilityCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      // Retrieve the process to get its engagement_id
      const processRow = await db.get<{ engagement_id: string }>(
        'SELECT engagement_id FROM civic_processes WHERE id = ?', req.params.processId
      );
      if (!processRow) {
        res.status(404).json({ error: 'Process not found' });
        return;
      }
      const check = await service.addEligibilityCheck(
        processRow.engagement_id,
        req.params.processId,
        parsed.data
      );
      res.status(201).json({ success: true, check });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Documents ───────────────────────────────────────────────────────────

  // GET /civic/engagements/:engagementId/documents — list documents
  router.get('/civic/engagements/:engagementId/documents', async (req, res) => {
    try {
      const documents = await service.listDocuments(req.params.engagementId);
      res.json({ success: true, documents });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /civic/engagements/:engagementId/documents — create document
  router.post('/civic/engagements/:engagementId/documents', async (req, res) => {
    try {
      const parsed = createDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const document = await service.createDocument(req.params.engagementId, parsed.data);
      res.status(201).json({ success: true, document });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /civic/documents/:id — update document
  router.put('/civic/documents/:id', async (req, res) => {
    try {
      const parsed = updateDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const document = await service.updateDocument(req.params.id, parsed.data);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json({ success: true, document });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Submissions ─────────────────────────────────────────────────────────

  // GET /civic/engagements/:engagementId/submissions — list submissions
  router.get('/civic/engagements/:engagementId/submissions', async (req, res) => {
    try {
      const submissions = await service.listSubmissions(req.params.engagementId);
      res.json({ success: true, submissions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /civic/engagements/:engagementId/submissions — create submission
  router.post('/civic/engagements/:engagementId/submissions', async (req, res) => {
    try {
      const parsed = createSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const submission = await service.createSubmission(req.params.engagementId, parsed.data);
      res.status(201).json({ success: true, submission });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /civic/submissions/:id — update submission
  router.put('/civic/submissions/:id', async (req, res) => {
    try {
      const parsed = updateSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const submission = await service.updateSubmission(req.params.id, parsed.data);
      if (!submission) {
        res.status(404).json({ error: 'Submission not found' });
        return;
      }
      res.json({ success: true, submission });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /civic/deadlines — get upcoming deadlines
  router.get('/civic/deadlines', async (req, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
      if (isNaN(days) || days < 1) {
        res.status(400).json({ error: 'Invalid days parameter' });
        return;
      }
      const a = actorOf(req);
      const submissions = await service.getUpcomingDeadlines(days, a.isAdmin ? undefined : a.id);
      res.json({ success: true, submissions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Knowledge Packs ─────────────────────────────────────────────────────

  // GET /civic/knowledge-packs — list knowledge packs
  router.get('/civic/knowledge-packs', async (req, res) => {
    try {
      const jurisdiction = req.query.jurisdiction as string | undefined;
      const domain = req.query.domain as string | undefined;
      const packs = await service.listKnowledgePacks(jurisdiction, domain);
      res.json({ success: true, packs });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /civic/knowledge-packs/:id — get knowledge pack detail
  router.get('/civic/knowledge-packs/:id', async (req, res) => {
    try {
      const pack = await service.getKnowledgePack(req.params.id);
      if (!pack) {
        res.status(404).json({ error: 'Knowledge pack not found' });
        return;
      }
      res.json({ success: true, pack });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── AI Analysis ──────────────────────────────────────────────────────────

  router.post('/civic/ai/analyze', async (req, res) => {
    try {
      const { promptType, context } = req.body;
      const validTypes = ['situation', 'eligibility', 'gap', 'documents', 'tracking'];
      if (!validTypes.includes(promptType)) {
        res.status(400).json({ error: `Invalid prompt type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dir = dirname(fileURLToPath(import.meta.url));
      const promptPath = join(__dir, '..', 'prompts', `civic-${promptType}.md`);
      const systemPrompt = readFileSync(promptPath, 'utf-8');

      const { streamToResponse } = await import('../services/unified-llm-client.js');

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      await streamToResponse(
        {
          model: 'claude-sonnet-4-5-20250929' as import('../../src/lib/types.js').ModelId,
          thinking: 'think' as import('../../src/lib/types.js').ThinkingLevel,
          system: systemPrompt,
          messages: [{ role: 'user', content: typeof context === 'string' ? context : JSON.stringify(context) }],
          maxTokens: 4096,
        },
        res
      );
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: safeError(err) });
      }
    }
  });

  return router;
}
