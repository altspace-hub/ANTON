/**
 * procure-service.ts
 *
 * Service layer for the Procure Pillar — full procurement lifecycle management.
 * Handles cycles, requirements, evaluation criteria, vendors, evaluations,
 * documents (RFI/RFP/RFQ), and contracts.
 */

import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProcureCycle {
  id: string;
  title: string;
  description: string | null;
  phase: string;
  status: string;
  company_size: string | null;
  budget_range: string | null;
  category: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcureRequirement {
  id: string;
  cycle_id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  source: string | null;
  status: string;
  sort_order: number;
  created_at: string;
}

export interface ProcureCriterion {
  id: string;
  cycle_id: string;
  name: string;
  description: string | null;
  category: string;
  weight: number;
  is_must_have: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProcureVendor {
  id: string;
  cycle_id: string;
  name: string;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  status: string;
  notes: string | null;
  overall_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProcureEvaluation {
  id: string;
  cycle_id: string;
  vendor_id: string;
  criterion_id: string;
  score: number;
  notes: string | null;
  evaluated_by: string | null;
  created_at: string;
}

export interface ProcureDocument {
  id: string;
  cycle_id: string;
  doc_type: string;
  title: string;
  content: string | null;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ProcureContract {
  id: string;
  cycle_id: string;
  vendor_id: string | null;
  title: string;
  contract_type: string | null;
  status: string;
  value: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  terms_summary: string | null;
  risk_flags: string | null;
  renewal_date: string | null;
  created_at: string;
  updated_at: string;
}

// ── Service Factory ──────────────────────────────────────────────────────────

export async function createProcureService(db: DatabaseAdapter) {

  // ── Cycles ───────────────────────────────────────────────────────────────

  async function createCycle(data: {
    title: string;
    description?: string;
    phase?: string;
    status?: string;
    company_size?: string;
    budget_range?: string;
    category?: string;
    created_by?: string;
  }): Promise<ProcureCycle> {
    const id = randomUUID();
    await db.run(
      `INSERT INTO procure_cycles (id, title, description, phase, status, company_size, budget_range, category, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.title,
      data.description ?? null,
      data.phase ?? 'prepare',
      data.status ?? 'active',
      data.company_size ?? null,
      data.budget_range ?? null,
      data.category ?? null,
      data.created_by ?? null
    );
    const cycle = await db.get<ProcureCycle>('SELECT * FROM procure_cycles WHERE id = ?', id);
    return cycle!;
  }

  async function getCycle(id: string): Promise<(ProcureCycle & { requirement_count: number; vendor_count: number; document_count: number }) | undefined> {
    const cycle = await db.get<ProcureCycle & { requirement_count: number; vendor_count: number; document_count: number }>(
      `SELECT c.*,
        (SELECT COUNT(*) FROM procure_requirements r WHERE r.cycle_id = c.id) AS requirement_count,
        (SELECT COUNT(*) FROM procure_vendors v WHERE v.cycle_id = c.id) AS vendor_count,
        (SELECT COUNT(*) FROM procure_documents d WHERE d.cycle_id = c.id) AS document_count
       FROM procure_cycles c
       WHERE c.id = ?`,
      id
    );
    return cycle;
  }

  async function listCycles(filters?: { status?: string }): Promise<ProcureCycle[]> {
    if (filters?.status) {
      return await db.all<ProcureCycle>(
        `SELECT c.*,
          (SELECT COUNT(*) FROM procure_requirements r WHERE r.cycle_id = c.id) AS requirement_count,
          (SELECT COUNT(*) FROM procure_vendors v WHERE v.cycle_id = c.id) AS vendor_count,
          (SELECT COUNT(*) FROM procure_documents d WHERE d.cycle_id = c.id) AS document_count
         FROM procure_cycles c
         WHERE c.status = ?
         ORDER BY c.updated_at DESC`,
        filters.status
      );
    }
    return await db.all<ProcureCycle>(
      `SELECT c.*,
        (SELECT COUNT(*) FROM procure_requirements r WHERE r.cycle_id = c.id) AS requirement_count,
        (SELECT COUNT(*) FROM procure_vendors v WHERE v.cycle_id = c.id) AS vendor_count,
        (SELECT COUNT(*) FROM procure_documents d WHERE d.cycle_id = c.id) AS document_count
       FROM procure_cycles c
       ORDER BY c.updated_at DESC`
    );
  }

  async function updateCycle(id: string, data: Partial<{
    title: string;
    description: string;
    phase: string;
    status: string;
    company_size: string;
    budget_range: string;
    category: string;
  }>): Promise<ProcureCycle | undefined> {
    const allowed = ['title', 'description', 'phase', 'status', 'company_size', 'budget_range', 'category'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return await getCycle(id);
    sets.push('updated_at = NOW()');
    vals.push(id);
    await db.run(`UPDATE procure_cycles SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    return await getCycle(id);
  }

  async function archiveCycle(id: string): Promise<ProcureCycle | undefined> {
    await db.run('UPDATE procure_cycles SET status = ?, updated_at = NOW() WHERE id = ?', 'archived', id);
    return await getCycle(id);
  }

  // ── Requirements ─────────────────────────────────────────────────────────

  async function createRequirement(cycleId: string, data: {
    title: string;
    description?: string;
    category?: string;
    priority?: string;
    source?: string;
    sort_order?: number;
  }): Promise<ProcureRequirement> {
    const id = randomUUID();
    await db.run(
      `INSERT INTO procure_requirements (id, cycle_id, title, description, category, priority, source, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      cycleId,
      data.title,
      data.description ?? null,
      data.category ?? null,
      data.priority ?? 'medium',
      data.source ?? null,
      data.sort_order ?? 0
    );
    const req = await db.get<ProcureRequirement>('SELECT * FROM procure_requirements WHERE id = ?', id);
    return req!;
  }

  async function listRequirements(cycleId: string): Promise<ProcureRequirement[]> {
    return await db.all<ProcureRequirement>(
      'SELECT * FROM procure_requirements WHERE cycle_id = ? ORDER BY sort_order, created_at',
      cycleId
    );
  }

  async function updateRequirement(id: string, data: Partial<{
    title: string;
    description: string;
    category: string;
    priority: string;
    source: string;
    status: string;
    sort_order: number;
  }>): Promise<ProcureRequirement | undefined> {
    const allowed = ['title', 'description', 'category', 'priority', 'source', 'status', 'sort_order'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return await db.get<ProcureRequirement>('SELECT * FROM procure_requirements WHERE id = ?', id);
    vals.push(id);
    await db.run(`UPDATE procure_requirements SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    return await db.get<ProcureRequirement>('SELECT * FROM procure_requirements WHERE id = ?', id);
  }

  async function deleteRequirement(id: string): Promise<void> {
    await db.run('DELETE FROM procure_requirements WHERE id = ?', id);
  }

  // ── Evaluation Criteria ──────────────────────────────────────────────────

  async function createCriterion(cycleId: string, data: {
    name: string;
    description?: string;
    weight?: number;
    category?: string;
    is_must_have?: boolean;
    sort_order?: number;
  }): Promise<ProcureCriterion> {
    const id = randomUUID();
    await db.run(
      `INSERT INTO procure_criteria (id, cycle_id, name, description, category, weight, is_must_have, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      cycleId,
      data.name,
      data.description ?? null,
      data.category ?? 'functional',
      data.weight ?? 1.0,
      data.is_must_have ?? false,
      data.sort_order ?? 0
    );
    const criterion = await db.get<ProcureCriterion>('SELECT * FROM procure_criteria WHERE id = ?', id);
    return criterion!;
  }

  async function listCriteria(cycleId: string): Promise<ProcureCriterion[]> {
    return await db.all<ProcureCriterion>(
      'SELECT * FROM procure_criteria WHERE cycle_id = ? ORDER BY sort_order, created_at',
      cycleId
    );
  }

  async function updateCriterion(id: string, data: Partial<{
    name: string;
    description: string;
    weight: number;
    category: string;
    is_must_have: boolean;
    sort_order: number;
  }>): Promise<ProcureCriterion | undefined> {
    const allowed = ['name', 'description', 'weight', 'category', 'is_must_have', 'sort_order'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return await db.get<ProcureCriterion>('SELECT * FROM procure_criteria WHERE id = ?', id);
    vals.push(id);
    await db.run(`UPDATE procure_criteria SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    return await db.get<ProcureCriterion>('SELECT * FROM procure_criteria WHERE id = ?', id);
  }

  // ── Vendors ──────────────────────────────────────────────────────────────

  async function addVendor(cycleId: string, data: {
    name: string;
    contact_name?: string;
    contact_email?: string;
    website?: string;
    status?: string;
    notes?: string;
  }): Promise<ProcureVendor> {
    const id = randomUUID();
    await db.run(
      `INSERT INTO procure_vendors (id, cycle_id, name, contact_name, contact_email, website, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      cycleId,
      data.name,
      data.contact_name ?? null,
      data.contact_email ?? null,
      data.website ?? null,
      data.status ?? 'longlist',
      data.notes ?? null
    );
    const vendor = await db.get<ProcureVendor>('SELECT * FROM procure_vendors WHERE id = ?', id);
    return vendor!;
  }

  async function listVendors(cycleId: string, statusFilter?: string): Promise<ProcureVendor[]> {
    if (statusFilter) {
      return await db.all<ProcureVendor>(
        'SELECT * FROM procure_vendors WHERE cycle_id = ? AND status = ? ORDER BY name',
        cycleId, statusFilter
      );
    }
    return await db.all<ProcureVendor>(
      'SELECT * FROM procure_vendors WHERE cycle_id = ? ORDER BY name',
      cycleId
    );
  }

  async function updateVendor(id: string, data: Partial<{
    name: string;
    contact_name: string;
    contact_email: string;
    website: string;
    status: string;
    overall_score: number;
    notes: string;
  }>): Promise<ProcureVendor | undefined> {
    const allowed = ['name', 'contact_name', 'contact_email', 'website', 'status', 'overall_score', 'notes'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return await db.get<ProcureVendor>('SELECT * FROM procure_vendors WHERE id = ?', id);
    sets.push('updated_at = NOW()');
    vals.push(id);
    await db.run(`UPDATE procure_vendors SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    return await db.get<ProcureVendor>('SELECT * FROM procure_vendors WHERE id = ?', id);
  }

  // ── Evaluations ──────────────────────────────────────────────────────────

  async function saveEvaluation(cycleId: string, vendorId: string, criterionId: string, data: {
    score: number;
    notes?: string;
    evaluated_by?: string;
  }): Promise<ProcureEvaluation> {
    // Upsert: if an evaluation already exists for this vendor+criterion, update it
    const existing = await db.get<ProcureEvaluation>(
      'SELECT * FROM procure_evaluations WHERE cycle_id = ? AND vendor_id = ? AND criterion_id = ?',
      cycleId, vendorId, criterionId
    );

    if (existing) {
      await db.run(
        `UPDATE procure_evaluations SET score = ?, notes = ?, evaluated_by = ? WHERE id = ?`,
        data.score,
        data.notes ?? existing.notes,
        data.evaluated_by ?? existing.evaluated_by,
        existing.id
      );
      const updated = await db.get<ProcureEvaluation>('SELECT * FROM procure_evaluations WHERE id = ?', existing.id);
      return updated!;
    }

    const id = randomUUID();
    await db.run(
      `INSERT INTO procure_evaluations (id, cycle_id, vendor_id, criterion_id, score, notes, evaluated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, cycleId, vendorId, criterionId,
      data.score,
      data.notes ?? null,
      data.evaluated_by ?? null
    );
    const evaluation = await db.get<ProcureEvaluation>('SELECT * FROM procure_evaluations WHERE id = ?', id);
    return evaluation!;
  }

  async function getEvaluationMatrix(cycleId: string): Promise<{
    vendors: ProcureVendor[];
    criteria: ProcureCriterion[];
    evaluations: (ProcureEvaluation & { vendor_name: string; criterion_name: string })[];
  }> {
    const vendors = await listVendors(cycleId);
    const criteria = await listCriteria(cycleId);
    const evaluations = await db.all<ProcureEvaluation & { vendor_name: string; criterion_name: string }>(
      `SELECT e.*, v.name AS vendor_name, c.name AS criterion_name
       FROM procure_evaluations e
       JOIN procure_vendors v ON v.id = e.vendor_id
       JOIN procure_criteria c ON c.id = e.criterion_id
       WHERE e.cycle_id = ?
       ORDER BY v.name, c.sort_order`,
      cycleId
    );
    return { vendors, criteria, evaluations };
  }

  // ── Documents ────────────────────────────────────────────────────────────

  async function createDocument(cycleId: string, data: {
    doc_type: string;
    title: string;
    content?: string;
    status?: string;
    version?: number;
  }): Promise<ProcureDocument> {
    const id = randomUUID();
    await db.run(
      `INSERT INTO procure_documents (id, cycle_id, doc_type, title, content, status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      cycleId,
      data.doc_type,
      data.title,
      data.content ?? null,
      data.status ?? 'draft',
      data.version ?? 1
    );
    const doc = await db.get<ProcureDocument>('SELECT * FROM procure_documents WHERE id = ?', id);
    return doc!;
  }

  async function getDocument(id: string): Promise<ProcureDocument | undefined> {
    return await db.get<ProcureDocument>('SELECT * FROM procure_documents WHERE id = ?', id);
  }

  async function updateDocument(id: string, data: Partial<{
    doc_type: string;
    title: string;
    content: string;
    status: string;
    version: number;
  }>): Promise<ProcureDocument | undefined> {
    const allowed = ['doc_type', 'title', 'content', 'status', 'version'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return await getDocument(id);
    sets.push('updated_at = NOW()');
    vals.push(id);
    await db.run(`UPDATE procure_documents SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    return await getDocument(id);
  }

  async function listDocuments(cycleId: string): Promise<ProcureDocument[]> {
    return await db.all<ProcureDocument>(
      'SELECT * FROM procure_documents WHERE cycle_id = ? ORDER BY created_at DESC',
      cycleId
    );
  }

  // ── Contracts ────────────────────────────────────────────────────────────

  async function createContract(cycleId: string, data: {
    vendor_id?: string;
    title: string;
    contract_type?: string;
    status?: string;
    value?: number;
    currency?: string;
    start_date?: string;
    end_date?: string;
    terms_summary?: string;
    risk_flags?: string;
    renewal_date?: string;
  }): Promise<ProcureContract> {
    const id = randomUUID();
    await db.run(
      `INSERT INTO procure_contracts (id, cycle_id, vendor_id, title, contract_type, status, value, currency, start_date, end_date, terms_summary, risk_flags, renewal_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      cycleId,
      data.vendor_id ?? null,
      data.title,
      data.contract_type ?? null,
      data.status ?? 'draft',
      data.value ?? null,
      data.currency ?? 'USD',
      data.start_date ?? null,
      data.end_date ?? null,
      data.terms_summary ?? null,
      data.risk_flags ?? null,
      data.renewal_date ?? null
    );
    const contract = await db.get<ProcureContract>('SELECT * FROM procure_contracts WHERE id = ?', id);
    return contract!;
  }

  async function getContract(id: string): Promise<ProcureContract | undefined> {
    return await db.get<ProcureContract>('SELECT * FROM procure_contracts WHERE id = ?', id);
  }

  async function updateContract(id: string, data: Partial<{
    vendor_id: string;
    title: string;
    contract_type: string;
    status: string;
    value: number;
    currency: string;
    start_date: string;
    end_date: string;
    terms_summary: string;
    risk_flags: string;
    renewal_date: string;
  }>): Promise<ProcureContract | undefined> {
    const allowed = ['vendor_id', 'title', 'contract_type', 'status', 'value', 'currency', 'start_date', 'end_date', 'terms_summary', 'risk_flags', 'renewal_date'];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (allowed.includes(k)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return await getContract(id);
    sets.push('updated_at = NOW()');
    vals.push(id);
    await db.run(`UPDATE procure_contracts SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    return await getContract(id);
  }

  async function listContracts(cycleId: string): Promise<ProcureContract[]> {
    return await db.all<ProcureContract>(
      'SELECT * FROM procure_contracts WHERE cycle_id = ? ORDER BY created_at DESC',
      cycleId
    );
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    createCycle,
    getCycle,
    listCycles,
    updateCycle,
    archiveCycle,
    createRequirement,
    listRequirements,
    updateRequirement,
    deleteRequirement,
    createCriterion,
    listCriteria,
    updateCriterion,
    addVendor,
    listVendors,
    updateVendor,
    saveEvaluation,
    getEvaluationMatrix,
    createDocument,
    getDocument,
    updateDocument,
    listDocuments,
    createContract,
    getContract,
    updateContract,
    listContracts,
  };
}
