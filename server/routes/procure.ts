/**
 * procure.ts
 *
 * REST API for the Procure Pillar — procurement lifecycle management.
 * Covers cycles, requirements, evaluation criteria, vendors, evaluations,
 * documents (RFI/RFP/RFQ), and contracts.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { createProcureService } from '../services/procure-service.js';
import { safeError } from '../lib/error-response.js';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const createCycleSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  phase: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  budget_min: z.number().nonnegative().optional(),
  budget_max: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  deadline: z.string().max(50).optional(),
  owner: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateCycleSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  phase: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  budget_min: z.number().nonnegative().optional(),
  budget_max: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  deadline: z.string().max(50).optional(),
  owner: z.string().max(200).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createRequirementSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  category: z.string().max(200).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low', 'nice_to_have']).optional(),
  source: z.string().max(200).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

const updateRequirementSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  category: z.string().max(200).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  is_mandatory: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

const createCriterionSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  weight: z.number().min(0).max(100).optional(),
  max_score: z.number().int().min(1).max(1000).optional(),
  category: z.string().max(200).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

const updateCriterionSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  weight: z.number().min(0).max(100).optional(),
  max_score: z.number().int().min(1).max(1000).optional(),
  category: z.string().max(200).optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

const addVendorSchema = z.object({
  name: z.string().min(1).max(500),
  contact_name: z.string().max(300).optional(),
  contact_email: z.string().email().max(500).optional(),
  website: z.string().url().max(1000).optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateVendorSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  contact_name: z.string().max(300).optional(),
  contact_email: z.string().email().max(500).optional(),
  website: z.string().url().max(1000).optional(),
  status: z.string().max(50).optional(),
  total_score: z.number().nonnegative().optional(),
  notes: z.string().max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const saveEvaluationSchema = z.object({
  cycle_id: z.string().uuid(),
  vendor_id: z.string().uuid(),
  criterion_id: z.string().uuid(),
  score: z.number().min(0),
  max_score: z.number().int().min(1).optional(),
  notes: z.string().max(5000).optional(),
  evaluated_by: z.string().max(200).optional(),
});

const createDocumentSchema = z.object({
  doc_type: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  content: z.string().optional(),
  status: z.string().max(50).optional(),
  version: z.number().int().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateDocumentSchema = z.object({
  doc_type: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  status: z.string().max(50).optional(),
  version: z.number().int().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createContractSchema = z.object({
  vendor_id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  contract_type: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  start_date: z.string().max(50).optional(),
  end_date: z.string().max(50).optional(),
  terms: z.string().max(50000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateContractSchema = z.object({
  vendor_id: z.string().uuid().optional(),
  title: z.string().min(1).max(500).optional(),
  contract_type: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  start_date: z.string().max(50).optional(),
  end_date: z.string().max(50).optional(),
  terms: z.string().max(50000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ── Route Factory ────────────────────────────────────────────────────────────

export async function createProcureRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const service = await createProcureService(db);

  // ── Cycles ─────────────────────────────────────────────────────────────────

  // GET /procure/cycles — list cycles (optional ?status= filter)
  router.get('/procure/cycles', async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const cycles = await service.listCycles(status ? { status } : undefined);
      res.json(cycles);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/cycles — create a new procurement cycle
  router.post('/procure/cycles', async (req, res) => {
    try {
      const parsed = createCycleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const cycle = await service.createCycle(parsed.data);
      res.status(201).json(cycle);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /procure/cycles/:id — get cycle detail with counts
  router.get('/procure/cycles/:id', async (req, res) => {
    try {
      const cycle = await service.getCycle(req.params.id);
      if (!cycle) {
        res.status(404).json({ error: 'Cycle not found' });
        return;
      }
      res.json(cycle);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /procure/cycles/:id — update a cycle
  router.put('/procure/cycles/:id', async (req, res) => {
    try {
      const parsed = updateCycleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const cycle = await service.updateCycle(req.params.id, parsed.data);
      if (!cycle) {
        res.status(404).json({ error: 'Cycle not found' });
        return;
      }
      res.json(cycle);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PATCH alias for PUT (frontend uses PATCH for phase advancement)
  router.patch('/procure/cycles/:id', async (req, res) => {
    try {
      const parsed = updateCycleSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const cycle = await service.updateCycle(req.params.id, parsed.data);
      if (!cycle) { res.status(404).json({ error: 'Cycle not found' }); return; }
      res.json(cycle);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/cycles/:id/archive — archive a cycle
  router.post('/procure/cycles/:id/archive', async (req, res) => {
    try {
      const cycle = await service.archiveCycle(req.params.id);
      if (!cycle) {
        res.status(404).json({ error: 'Cycle not found' });
        return;
      }
      res.json(cycle);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Requirements ───────────────────────────────────────────────────────────

  // GET /procure/cycles/:cycleId/requirements — list requirements for a cycle
  router.get('/procure/cycles/:cycleId/requirements', async (req, res) => {
    try {
      const requirements = await service.listRequirements(req.params.cycleId);
      res.json(requirements);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/cycles/:cycleId/requirements — add a requirement
  router.post('/procure/cycles/:cycleId/requirements', async (req, res) => {
    try {
      const parsed = createRequirementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const requirement = await service.createRequirement(req.params.cycleId, parsed.data);
      res.status(201).json(requirement);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /procure/requirements/:id — update a requirement
  router.put('/procure/requirements/:id', async (req, res) => {
    try {
      const parsed = updateRequirementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const requirement = await service.updateRequirement(req.params.id, parsed.data);
      if (!requirement) {
        res.status(404).json({ error: 'Requirement not found' });
        return;
      }
      res.json(requirement);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // DELETE /procure/requirements/:id — delete a requirement
  router.delete('/procure/requirements/:id', async (req, res) => {
    try {
      await service.deleteRequirement(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Criteria ───────────────────────────────────────────────────────────────

  // GET /procure/cycles/:cycleId/criteria — list evaluation criteria
  router.get('/procure/cycles/:cycleId/criteria', async (req, res) => {
    try {
      const criteria = await service.listCriteria(req.params.cycleId);
      res.json(criteria);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/cycles/:cycleId/criteria — add a criterion
  router.post('/procure/cycles/:cycleId/criteria', async (req, res) => {
    try {
      const parsed = createCriterionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const criterion = await service.createCriterion(req.params.cycleId, parsed.data);
      res.status(201).json(criterion);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /procure/criteria/:id — update a criterion
  router.put('/procure/criteria/:id', async (req, res) => {
    try {
      const parsed = updateCriterionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const criterion = await service.updateCriterion(req.params.id, parsed.data);
      if (!criterion) {
        res.status(404).json({ error: 'Criterion not found' });
        return;
      }
      res.json(criterion);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Vendors ────────────────────────────────────────────────────────────────

  // GET /procure/cycles/:cycleId/vendors — list vendors (optional ?status= filter)
  router.get('/procure/cycles/:cycleId/vendors', async (req, res) => {
    try {
      const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
      const vendors = await service.listVendors(req.params.cycleId, statusFilter);
      res.json(vendors);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/cycles/:cycleId/vendors — add a vendor
  router.post('/procure/cycles/:cycleId/vendors', async (req, res) => {
    try {
      const parsed = addVendorSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const vendor = await service.addVendor(req.params.cycleId, parsed.data);
      res.status(201).json(vendor);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /procure/vendors/:id — update a vendor
  router.put('/procure/vendors/:id', async (req, res) => {
    try {
      const parsed = updateVendorSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const vendor = await service.updateVendor(req.params.id, parsed.data);
      if (!vendor) {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }
      res.json(vendor);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Evaluations ────────────────────────────────────────────────────────────

  // GET /procure/cycles/:cycleId/evaluations — get evaluation matrix
  router.get('/procure/cycles/:cycleId/evaluations', async (req, res) => {
    try {
      const matrix = await service.getEvaluationMatrix(req.params.cycleId);
      res.json(matrix);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/evaluations — save/upsert an evaluation score
  router.post('/procure/evaluations', async (req, res) => {
    try {
      const parsed = saveEvaluationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const { cycle_id, vendor_id, criterion_id, ...evalData } = parsed.data;
      const evaluation = await service.saveEvaluation(cycle_id, vendor_id, criterion_id, evalData);
      res.json(evaluation);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Documents ──────────────────────────────────────────────────────────────

  // GET /procure/cycles/:cycleId/documents — list documents for a cycle
  router.get('/procure/cycles/:cycleId/documents', async (req, res) => {
    try {
      const documents = await service.listDocuments(req.params.cycleId);
      res.json(documents);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/cycles/:cycleId/documents — create a document
  router.post('/procure/cycles/:cycleId/documents', async (req, res) => {
    try {
      const parsed = createDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const document = await service.createDocument(req.params.cycleId, parsed.data);
      res.status(201).json(document);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // GET /procure/documents/:id — get a single document
  router.get('/procure/documents/:id', async (req, res) => {
    try {
      const document = await service.getDocument(req.params.id);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json(document);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /procure/documents/:id — update a document
  router.put('/procure/documents/:id', async (req, res) => {
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
      res.json(document);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Contracts ──────────────────────────────────────────────────────────────

  // GET /procure/cycles/:cycleId/contracts — list contracts for a cycle
  router.get('/procure/cycles/:cycleId/contracts', async (req, res) => {
    try {
      const contracts = await service.listContracts(req.params.cycleId);
      res.json(contracts);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // POST /procure/cycles/:cycleId/contracts — create a contract
  router.post('/procure/cycles/:cycleId/contracts', async (req, res) => {
    try {
      const parsed = createContractSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const contract = await service.createContract(req.params.cycleId, parsed.data);
      res.status(201).json(contract);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // PUT /procure/contracts/:id — update a contract
  router.put('/procure/contracts/:id', async (req, res) => {
    try {
      const parsed = updateContractSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
        return;
      }
      const contract = await service.updateContract(req.params.id, parsed.data);
      if (!contract) {
        res.status(404).json({ error: 'Contract not found' });
        return;
      }
      res.json(contract);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── AI Analysis ──────────────────────────────────────────────────────────

  router.post('/procure/ai/analyze', async (req, res) => {
    try {
      const { promptType, context } = req.body;
      const validTypes = ['prepare', 'source', 'select', 'contract', 'manage'];
      if (!validTypes.includes(promptType)) {
        res.status(400).json({ error: `Invalid prompt type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dir = dirname(fileURLToPath(import.meta.url));
      const promptPath = join(__dir, '..', 'prompts', `procure-${promptType}.md`);
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
