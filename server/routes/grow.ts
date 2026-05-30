import { Router, Request, Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createGrowService } from '../services/grow-service.js';
import { safeError } from '../lib/error-response.js';

// ── Zod Schemas ─────────────────────────────────────────────────────────────

const createContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  organisationId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

const updateContactSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  title: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  organisationId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  lastContactedAt: z.string().optional(),
});

const createOrgSchema = z.object({
  name: z.string().min(1),
  industry: z.string().optional(),
  size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
  website: z.string().optional(),
  headquarters: z.string().optional(),
  regulatoryContext: z.string().optional(),
  painPoints: z.string().optional(),
  annualRevenue: z.string().optional(),
  employeeCount: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().optional(),
  size: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
  website: z.string().optional(),
  headquarters: z.string().optional(),
  regulatoryContext: z.string().optional(),
  painPoints: z.string().optional(),
  annualRevenue: z.string().optional(),
  employeeCount: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const createRelationshipSchema = z.object({
  fromType: z.enum(['contact', 'organisation']),
  fromId: z.string().min(1),
  toType: z.enum(['contact', 'organisation']),
  toId: z.string().min(1),
  relationshipType: z.string().min(1),
  strength: z.enum(['weak', 'medium', 'strong']).optional(),
  notes: z.string().optional(),
});

const createInteractionSchema = z.object({
  contactId: z.string().optional(),
  organisationId: z.string().optional(),
  interactionType: z.enum(['meeting', 'call', 'email', 'event', 'note', 'other']),
  subject: z.string().optional(),
  notes: z.string().optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  followUpDate: z.string().optional(),
  followUpAction: z.string().optional(),
  interactionDate: z.string().optional(),
});

const createOpportunitySchema = z.object({
  title: z.string().min(1),
  contactId: z.string().optional(),
  organisationId: z.string().optional(),
  stageId: z.string().optional(),
  value: z.number().min(0).optional(),
  currency: z.string().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
  nextAction: z.string().optional(),
  nextActionDate: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateOpportunitySchema = z.object({
  title: z.string().min(1).optional(),
  contactId: z.string().nullable().optional(),
  organisationId: z.string().nullable().optional(),
  stageId: z.string().optional(),
  value: z.number().min(0).nullable().optional(),
  currency: z.string().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().nullable().optional(),
  nextAction: z.string().nullable().optional(),
  nextActionDate: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  wonLostReason: z.string().optional(),
});

const moveOpportunitySchema = z.object({
  stageId: z.string().min(1),
});

const createActivitySchema = z.object({
  opportunityId: z.string().optional(),
  contactId: z.string().optional(),
  activityType: z.enum(['follow_up', 'proposal', 'meeting', 'demo', 'negotiation', 'other']),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

const updateActivitySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  activityType: z.enum(['follow_up', 'proposal', 'meeting', 'demo', 'negotiation', 'other']).optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(['pending', 'completed', 'cancelled', 'overdue']).optional(),
});

const createSignalSchema = z.object({
  signalType: z.enum(['news', 'regulatory', 'market', 'relationship', 'engagement', 'custom']),
  title: z.string().min(1),
  description: z.string().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  affectedContacts: z.array(z.string()).optional(),
  affectedOrganisations: z.array(z.string()).optional(),
  recommendedAction: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});

const updateSignalSchema = z.object({
  status: z.enum(['new', 'reviewed', 'actioned', 'dismissed']).optional(),
  recommendedAction: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
});

const createBriefingSchema = z.object({
  briefingType: z.enum(['daily', 'weekly', 'custom']),
  title: z.string().min(1),
  content: z.string().min(1),
  signalsIncluded: z.array(z.string()).optional(),
});

// ── Routes ──────────────────────────────────────────────────────────────────

export async function createGrowRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const svc = await createGrowService(db);

  // ── Multi-tenant isolation (team mode) ───────────────────────────────────
  // Contacts and opportunities carry created_by; in team mode these guards stop
  // one user reading/mutating another's. Solo mode is a single admin user, so
  // they are transparent. NOTE: organisations / interactions / activities /
  // signals / briefings have no created_by yet — full isolation there needs a
  // follow-up migration (see docs/IMPROVEMENT_ROADMAP.md Phase 3).
  function actorOf(req: Request): { id: string; isAdmin: boolean } {
    return { id: req.user?.id ?? 'solo', isAdmin: (req.user?.role ?? 'admin') === 'admin' };
  }
  function ownerScope(req: Request): string | undefined {
    const a = actorOf(req);
    return a.isAdmin ? undefined : a.id;
  }
  // 404 (not 403) so a non-owner cannot probe which ids exist.
  function makeOwnerGuard(table: string, label: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      void db.get<{ created_by: string | null }>(`SELECT created_by FROM ${table} WHERE id = ?`, req.params.id)
        .then((row) => {
          if (!row) { res.status(404).json({ error: `${label} not found` }); return; }
          const a = actorOf(req);
          if (!a.isAdmin && row.created_by !== a.id) { res.status(404).json({ error: `${label} not found` }); return; }
          next();
        })
        .catch(next);
    };
  }
  router.use('/grow/contacts/:id', makeOwnerGuard('grow_contacts', 'Contact'));
  router.use('/grow/opportunities/:id', makeOwnerGuard('grow_opportunities', 'Opportunity'));
  router.use('/grow/organisations/:id', makeOwnerGuard('grow_organisations', 'Organisation'));
  router.use('/grow/signals/:id', makeOwnerGuard('grow_signals', 'Signal'));
  router.use('/grow/briefings/:id', makeOwnerGuard('grow_briefings', 'Briefing'));

  // ── Contacts ──────────────────────────────────────────────────────────

  router.get('/grow/contacts', async (req: Request, res: Response) => {
    try {
      const contacts = await svc.listContacts({
        search: req.query.search as string | undefined,
        orgId: req.query.orgId as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        ownerId: ownerScope(req),
      });
      res.json(contacts);
    } catch (err) {
      console.error('[grow] List contacts error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/contacts', async (req: Request, res: Response) => {
    try {
      const data = createContactSchema.parse(req.body);
      const id = await svc.createContact({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create contact error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/grow/contacts/:id', async (req: Request, res: Response) => {
    try {
      const contact = await svc.getContact(String(req.params.id));
      if (!contact) return res.status(404).json({ error: 'Contact not found' });
      res.json(contact);
    } catch (err) {
      console.error('[grow] Get contact error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/grow/contacts/:id', async (req: Request, res: Response) => {
    try {
      const data = updateContactSchema.parse(req.body);
      await svc.updateContact(String(req.params.id), data);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Update contact error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/grow/contacts/:id', async (req: Request, res: Response) => {
    try {
      await svc.deleteContact(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error('[grow] Delete contact error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Organisations ─────────────────────────────────────────────────────

  router.get('/grow/organisations', async (req: Request, res: Response) => {
    try {
      const orgs = await svc.listOrganisations({
        search: req.query.search as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        ownerId: ownerScope(req),
      });
      res.json(orgs);
    } catch (err) {
      console.error('[grow] List organisations error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/organisations', async (req: Request, res: Response) => {
    try {
      const data = createOrgSchema.parse(req.body);
      const id = await svc.createOrganisation({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create organisation error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/grow/organisations/:id', async (req: Request, res: Response) => {
    try {
      const org = await svc.getOrganisation(String(req.params.id));
      if (!org) return res.status(404).json({ error: 'Organisation not found' });
      res.json(org);
    } catch (err) {
      console.error('[grow] Get organisation error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/grow/organisations/:id', async (req: Request, res: Response) => {
    try {
      const data = updateOrgSchema.parse(req.body);
      await svc.updateOrganisation(String(req.params.id), data);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Update organisation error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/grow/organisations/:id', async (req: Request, res: Response) => {
    try {
      await svc.deleteOrganisation(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error('[grow] Delete organisation error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Relationships ─────────────────────────────────────────────────────

  router.get('/grow/relationships/:entityType/:entityId', async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.params;
      const relationships = await svc.listRelationships(String(entityType), String(entityId));
      res.json(relationships);
    } catch (err) {
      console.error('[grow] List relationships error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/relationships', async (req: Request, res: Response) => {
    try {
      const data = createRelationshipSchema.parse(req.body);
      const id = await svc.createRelationship({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create relationship error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/grow/relationships/:id', async (req: Request, res: Response) => {
    try {
      await svc.deleteRelationship(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error('[grow] Delete relationship error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Interactions ──────────────────────────────────────────────────────

  router.get('/grow/interactions', async (req: Request, res: Response) => {
    try {
      const interactions = await svc.listInteractions(
        req.query.contactId as string | undefined,
        req.query.orgId as string | undefined,
      );
      res.json(interactions);
    } catch (err) {
      console.error('[grow] List interactions error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/interactions', async (req: Request, res: Response) => {
    try {
      const data = createInteractionSchema.parse(req.body);
      const id = await svc.createInteraction({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create interaction error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Pipeline ──────────────────────────────────────────────────────────

  router.get('/grow/pipeline/stages', async (_req: Request, res: Response) => {
    try {
      const stages = await svc.listPipelineStages();
      res.json(stages);
    } catch (err) {
      console.error('[grow] List pipeline stages error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/grow/pipeline/summary', async (_req: Request, res: Response) => {
    try {
      const summary = await svc.getPipelineSummary();
      res.json(summary);
    } catch (err) {
      console.error('[grow] Pipeline summary error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/grow/opportunities', async (req: Request, res: Response) => {
    try {
      const opportunities = await svc.listOpportunities({
        stageId: req.query.stageId as string | undefined,
        search: req.query.search as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        ownerId: ownerScope(req),
      });
      res.json(opportunities);
    } catch (err) {
      console.error('[grow] List opportunities error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/opportunities', async (req: Request, res: Response) => {
    try {
      const data = createOpportunitySchema.parse(req.body);
      const id = await svc.createOpportunity({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create opportunity error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/grow/opportunities/:id', async (req: Request, res: Response) => {
    try {
      const opportunity = await svc.getOpportunity(String(req.params.id));
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });
      res.json(opportunity);
    } catch (err) {
      console.error('[grow] Get opportunity error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/grow/opportunities/:id', async (req: Request, res: Response) => {
    try {
      const data = updateOpportunitySchema.parse(req.body);
      await svc.updateOpportunity(String(req.params.id), data);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Update opportunity error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/opportunities/:id/move', async (req: Request, res: Response) => {
    try {
      const { stageId } = moveOpportunitySchema.parse(req.body);
      await svc.moveOpportunity(String(req.params.id), stageId);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Move opportunity error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Activities ────────────────────────────────────────────────────────

  router.get('/grow/activities', async (req: Request, res: Response) => {
    try {
      const activities = await svc.listActivities(
        req.query.opportunityId as string | undefined,
        {
          status: req.query.status as string | undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        }
      );
      res.json(activities);
    } catch (err) {
      console.error('[grow] List activities error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/activities', async (req: Request, res: Response) => {
    try {
      const data = createActivitySchema.parse(req.body);
      const id = await svc.createActivity({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create activity error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/grow/activities/:id', async (req: Request, res: Response) => {
    try {
      const data = updateActivitySchema.parse(req.body);
      await svc.updateActivity(String(req.params.id), data);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Update activity error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/activities/:id/complete', async (req: Request, res: Response) => {
    try {
      await svc.completeActivity(String(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error('[grow] Complete activity error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Intelligence: Signals ─────────────────────────────────────────────

  router.get('/grow/signals', async (req: Request, res: Response) => {
    try {
      const signals = await svc.listSignals({
        type: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        ownerId: ownerScope(req),
      });
      res.json(signals);
    } catch (err) {
      console.error('[grow] List signals error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/signals', async (req: Request, res: Response) => {
    try {
      const data = createSignalSchema.parse(req.body);
      const id = await svc.createSignal({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create signal error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/grow/signals/:id', async (req: Request, res: Response) => {
    try {
      const data = updateSignalSchema.parse(req.body);
      await svc.updateSignal(String(req.params.id), data);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Update signal error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Intelligence: Briefings ───────────────────────────────────────────

  router.get('/grow/briefings', async (req: Request, res: Response) => {
    try {
      const briefings = await svc.listBriefings(req.query.type as string | undefined, ownerScope(req));
      res.json(briefings);
    } catch (err) {
      console.error('[grow] List briefings error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/grow/briefings', async (req: Request, res: Response) => {
    try {
      const data = createBriefingSchema.parse(req.body);
      const id = await svc.createBriefing({ ...data, createdBy: actorOf(req).id });
      res.status(201).json({ id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }
      console.error('[grow] Create briefing error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/grow/briefings/:id', async (req: Request, res: Response) => {
    try {
      const briefing = await svc.getBriefing(String(req.params.id));
      if (!briefing) return res.status(404).json({ error: 'Briefing not found' });
      res.json(briefing);
    } catch (err) {
      console.error('[grow] Get briefing error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Dashboard ─────────────────────────────────────────────────────────

  router.get('/grow/dashboard', async (_req: Request, res: Response) => {
    try {
      const stats = await svc.getDashboardStats();
      res.json(stats);
    } catch (err) {
      console.error('[grow] Dashboard stats error:', err);
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── AI Analysis ──────────────────────────────────────────────────────────

  router.post('/grow/ai/analyze', async (req: Request, res: Response) => {
    try {
      const { promptType, context } = req.body;
      const validTypes = ['relationships', 'signals', 'pipeline', 'briefings', 'activities'];
      if (!validTypes.includes(promptType)) {
        res.status(400).json({ error: `Invalid prompt type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dir = dirname(fileURLToPath(import.meta.url));
      const promptPath = join(__dir, '..', 'prompts', `grow-${promptType}.md`);
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
