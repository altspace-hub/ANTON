import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CivicEngagement {
  id: string;
  title: string;
  description: string | null;
  domain: string;
  jurisdiction: string;
  status: string;
  phase: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_org: string | null;
  notes: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface CivicEngagementDetail extends CivicEngagement {
  process_count: number;
  document_count: number;
  submission_count: number;
}

export interface CivicProcess {
  id: string;
  engagement_id: string;
  title: string;
  description: string | null;
  process_type: string;
  status: string;
  authority: string | null;
  reference_number: string | null;
  deadline: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface CivicProcessWithCounts extends CivicProcess {
  eligibility_check_count: number;
}

export interface CivicEligibilityCheck {
  id: string;
  engagement_id: string;
  process_id: string;
  criterion: string;
  status: string;
  result: string | null;
  notes: string | null;
  checked_at: string | null;
  created_at: string;
}

export interface CivicDocument {
  id: string;
  engagement_id: string;
  title: string;
  document_type: string;
  status: string;
  content: string | null;
  file_path: string | null;
  version: number;
  notes: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface CivicSubmission {
  id: string;
  engagement_id: string;
  title: string;
  submission_type: string;
  status: string;
  target_authority: string | null;
  deadline: string | null;
  submitted_at: string | null;
  reference_number: string | null;
  response: string | null;
  notes: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface CivicKnowledgePack {
  id: string;
  name: string;
  description: string | null;
  jurisdiction: string;
  domain: string;
  version: string;
  content: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createCivicService(db: DatabaseAdapter) {

  // ── Engagements ────────────────────────────────────────────────────────────

  async function createEngagement(data: {
    title: string;
    description?: string;
    domain?: string;
    jurisdiction?: string;
    status?: string;
    phase?: string;
    contact_name?: string;
    contact_email?: string;
    contact_org?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicEngagement> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO civic_engagements
        (id, title, description, domain, jurisdiction, status, phase,
         contact_name, contact_email, contact_org, notes, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      data.title,
      data.description ?? null,
      data.domain,
      data.jurisdiction,
      data.status ?? 'draft',
      data.phase ?? 'intake',
      data.contact_name ?? null,
      data.contact_email ?? null,
      data.contact_org ?? null,
      data.notes ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    );

    const row = await db.get<CivicEngagement>(
      'SELECT * FROM civic_engagements WHERE id = ?', id
    );
    return row!;
  }

  async function getEngagement(id: string): Promise<CivicEngagementDetail | undefined> {
    const engagement = await db.get<CivicEngagement>(
      'SELECT * FROM civic_engagements WHERE id = ?', id
    );
    if (!engagement) return undefined;

    const processCnt = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM civic_processes WHERE engagement_id = ?', id
    );
    const docCnt = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM civic_documents WHERE engagement_id = ?', id
    );
    const subCnt = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM civic_submissions WHERE engagement_id = ?', id
    );

    return {
      ...engagement,
      process_count: processCnt?.count ?? 0,
      document_count: docCnt?.count ?? 0,
      submission_count: subCnt?.count ?? 0,
    };
  }

  async function listEngagements(filters?: {
    status?: string;
    domain?: string;
  }): Promise<CivicEngagement[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters?.domain) {
      conditions.push('domain = ?');
      params.push(filters.domain);
    }

    const where = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    return await db.all<CivicEngagement>(
      `SELECT * FROM civic_engagements ${where} ORDER BY updated_at DESC`,
      ...params
    );
  }

  async function updateEngagement(id: string, data: {
    title?: string;
    description?: string;
    domain?: string;
    jurisdiction?: string;
    status?: string;
    phase?: string;
    contact_name?: string;
    contact_email?: string;
    contact_org?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicEngagement | undefined> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.domain !== undefined) { fields.push('domain = ?'); params.push(data.domain); }
    if (data.jurisdiction !== undefined) { fields.push('jurisdiction = ?'); params.push(data.jurisdiction); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.phase !== undefined) { fields.push('phase = ?'); params.push(data.phase); }
    if (data.contact_name !== undefined) { fields.push('contact_name = ?'); params.push(data.contact_name); }
    if (data.contact_email !== undefined) { fields.push('contact_email = ?'); params.push(data.contact_email); }
    if (data.contact_org !== undefined) { fields.push('contact_org = ?'); params.push(data.contact_org); }
    if (data.notes !== undefined) { fields.push('notes = ?'); params.push(data.notes); }
    if (data.metadata !== undefined) { fields.push('metadata = ?'); params.push(JSON.stringify(data.metadata)); }

    if (fields.length === 0) {
      return await db.get<CivicEngagement>('SELECT * FROM civic_engagements WHERE id = ?', id);
    }

    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await db.run(
      `UPDATE civic_engagements SET ${fields.join(', ')} WHERE id = ?`,
      ...params
    );

    return await db.get<CivicEngagement>('SELECT * FROM civic_engagements WHERE id = ?', id);
  }

  async function archiveEngagement(id: string): Promise<CivicEngagement | undefined> {
    await db.run(
      'UPDATE civic_engagements SET status = ?, updated_at = ? WHERE id = ?',
      'archived', new Date().toISOString(), id
    );
    return await db.get<CivicEngagement>('SELECT * FROM civic_engagements WHERE id = ?', id);
  }

  // ── Processes ──────────────────────────────────────────────────────────────

  async function addProcess(engagementId: string, data: {
    title: string;
    description?: string;
    process_type: string;
    status?: string;
    authority?: string;
    reference_number?: string;
    deadline?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicProcess> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO civic_processes
        (id, engagement_id, title, description, process_type, status,
         authority, reference_number, deadline, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      engagementId,
      data.title,
      data.description ?? null,
      data.process_type,
      data.status ?? 'pending',
      data.authority ?? null,
      data.reference_number ?? null,
      data.deadline ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    );

    const row = await db.get<CivicProcess>(
      'SELECT * FROM civic_processes WHERE id = ?', id
    );
    return row!;
  }

  async function listProcesses(engagementId: string): Promise<CivicProcessWithCounts[]> {
    const processes = await db.all<CivicProcess>(
      'SELECT * FROM civic_processes WHERE engagement_id = ? ORDER BY created_at DESC',
      engagementId
    );

    const results: CivicProcessWithCounts[] = [];
    for (const proc of processes) {
      const cnt = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM civic_eligibility_checks WHERE process_id = ?',
        proc.id
      );
      results.push({
        ...proc,
        eligibility_check_count: cnt?.count ?? 0,
      });
    }

    return results;
  }

  async function updateProcess(id: string, data: {
    title?: string;
    description?: string;
    process_type?: string;
    status?: string;
    authority?: string;
    reference_number?: string;
    deadline?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicProcess | undefined> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.process_type !== undefined) { fields.push('process_type = ?'); params.push(data.process_type); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.authority !== undefined) { fields.push('authority = ?'); params.push(data.authority); }
    if (data.reference_number !== undefined) { fields.push('reference_number = ?'); params.push(data.reference_number); }
    if (data.deadline !== undefined) { fields.push('deadline = ?'); params.push(data.deadline); }
    if (data.metadata !== undefined) { fields.push('metadata = ?'); params.push(JSON.stringify(data.metadata)); }

    if (fields.length === 0) {
      return await db.get<CivicProcess>('SELECT * FROM civic_processes WHERE id = ?', id);
    }

    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await db.run(
      `UPDATE civic_processes SET ${fields.join(', ')} WHERE id = ?`,
      ...params
    );

    return await db.get<CivicProcess>('SELECT * FROM civic_processes WHERE id = ?', id);
  }

  // ── Eligibility Checks ────────────────────────────────────────────────────

  async function addEligibilityCheck(engagementId: string, processId: string, data: {
    criterion: string;
    status?: string;
    result?: string;
    notes?: string;
  }): Promise<CivicEligibilityCheck> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO civic_eligibility_checks
        (id, engagement_id, process_id, criterion, status, result, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      engagementId,
      processId,
      data.criterion,
      data.status ?? 'pending',
      data.result ?? null,
      data.notes ?? null,
      now
    );

    const row = await db.get<CivicEligibilityCheck>(
      'SELECT * FROM civic_eligibility_checks WHERE id = ?', id
    );
    return row!;
  }

  async function listEligibilityChecks(processId: string): Promise<CivicEligibilityCheck[]> {
    return await db.all<CivicEligibilityCheck>(
      'SELECT * FROM civic_eligibility_checks WHERE process_id = ? ORDER BY created_at DESC',
      processId
    );
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  async function createDocument(engagementId: string, data: {
    title: string;
    document_type: string;
    status?: string;
    content?: string;
    file_path?: string;
    version?: number;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicDocument> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO civic_documents
        (id, engagement_id, title, document_type, status, content, file_path,
         version, notes, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      engagementId,
      data.title,
      data.document_type,
      data.status ?? 'draft',
      data.content ?? null,
      data.file_path ?? null,
      data.version ?? 1,
      data.notes ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    );

    const row = await db.get<CivicDocument>(
      'SELECT * FROM civic_documents WHERE id = ?', id
    );
    return row!;
  }

  async function listDocuments(engagementId: string): Promise<CivicDocument[]> {
    return await db.all<CivicDocument>(
      'SELECT * FROM civic_documents WHERE engagement_id = ? ORDER BY updated_at DESC',
      engagementId
    );
  }

  async function updateDocument(id: string, data: {
    title?: string;
    document_type?: string;
    status?: string;
    content?: string;
    file_path?: string;
    version?: number;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicDocument | undefined> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
    if (data.document_type !== undefined) { fields.push('document_type = ?'); params.push(data.document_type); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.content !== undefined) { fields.push('content = ?'); params.push(data.content); }
    if (data.file_path !== undefined) { fields.push('file_path = ?'); params.push(data.file_path); }
    if (data.version !== undefined) { fields.push('version = ?'); params.push(data.version); }
    if (data.notes !== undefined) { fields.push('notes = ?'); params.push(data.notes); }
    if (data.metadata !== undefined) { fields.push('metadata = ?'); params.push(JSON.stringify(data.metadata)); }

    if (fields.length === 0) {
      return await db.get<CivicDocument>('SELECT * FROM civic_documents WHERE id = ?', id);
    }

    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await db.run(
      `UPDATE civic_documents SET ${fields.join(', ')} WHERE id = ?`,
      ...params
    );

    return await db.get<CivicDocument>('SELECT * FROM civic_documents WHERE id = ?', id);
  }

  // ── Submissions ────────────────────────────────────────────────────────────

  async function createSubmission(engagementId: string, data: {
    title: string;
    submission_type: string;
    status?: string;
    target_authority?: string;
    deadline?: string;
    reference_number?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicSubmission> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO civic_submissions
        (id, engagement_id, title, submission_type, status, target_authority,
         deadline, reference_number, notes, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      engagementId,
      data.title,
      data.submission_type,
      data.status ?? 'draft',
      data.target_authority ?? null,
      data.deadline ?? null,
      data.reference_number ?? null,
      data.notes ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
      now
    );

    const row = await db.get<CivicSubmission>(
      'SELECT * FROM civic_submissions WHERE id = ?', id
    );
    return row!;
  }

  async function listSubmissions(engagementId: string): Promise<CivicSubmission[]> {
    return await db.all<CivicSubmission>(
      'SELECT * FROM civic_submissions WHERE engagement_id = ? ORDER BY updated_at DESC',
      engagementId
    );
  }

  async function updateSubmission(id: string, data: {
    title?: string;
    submission_type?: string;
    status?: string;
    target_authority?: string;
    deadline?: string;
    submitted_at?: string;
    reference_number?: string;
    response?: string;
    notes?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CivicSubmission | undefined> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { fields.push('title = ?'); params.push(data.title); }
    if (data.submission_type !== undefined) { fields.push('submission_type = ?'); params.push(data.submission_type); }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status); }
    if (data.target_authority !== undefined) { fields.push('target_authority = ?'); params.push(data.target_authority); }
    if (data.deadline !== undefined) { fields.push('deadline = ?'); params.push(data.deadline); }
    if (data.submitted_at !== undefined) { fields.push('submitted_at = ?'); params.push(data.submitted_at); }
    if (data.reference_number !== undefined) { fields.push('reference_number = ?'); params.push(data.reference_number); }
    if (data.response !== undefined) { fields.push('response = ?'); params.push(data.response); }
    if (data.notes !== undefined) { fields.push('notes = ?'); params.push(data.notes); }
    if (data.metadata !== undefined) { fields.push('metadata = ?'); params.push(JSON.stringify(data.metadata)); }

    if (fields.length === 0) {
      return await db.get<CivicSubmission>('SELECT * FROM civic_submissions WHERE id = ?', id);
    }

    fields.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await db.run(
      `UPDATE civic_submissions SET ${fields.join(', ')} WHERE id = ?`,
      ...params
    );

    return await db.get<CivicSubmission>('SELECT * FROM civic_submissions WHERE id = ?', id);
  }

  async function getUpcomingDeadlines(days: number = 30): Promise<CivicSubmission[]> {
    const now = new Date().toISOString();
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    return await db.all<CivicSubmission>(
      `SELECT * FROM civic_submissions
       WHERE deadline IS NOT NULL
         AND deadline >= ?
         AND deadline <= ?
         AND status NOT IN ('submitted', 'accepted', 'rejected', 'cancelled')
       ORDER BY deadline ASC`,
      now, future
    );
  }

  // ── Knowledge Packs ────────────────────────────────────────────────────────

  async function listKnowledgePacks(jurisdiction?: string, domain?: string): Promise<CivicKnowledgePack[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (jurisdiction) {
      conditions.push('jurisdiction = ?');
      params.push(jurisdiction);
    }
    if (domain) {
      conditions.push('domain = ?');
      params.push(domain);
    }

    const where = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    return await db.all<CivicKnowledgePack>(
      `SELECT * FROM civic_knowledge_packs ${where} ORDER BY name ASC`,
      ...params
    );
  }

  async function getKnowledgePack(id: string): Promise<CivicKnowledgePack | undefined> {
    return await db.get<CivicKnowledgePack>(
      'SELECT * FROM civic_knowledge_packs WHERE id = ?', id
    );
  }

  // ── Return public API ──────────────────────────────────────────────────────

  return {
    createEngagement,
    getEngagement,
    listEngagements,
    updateEngagement,
    archiveEngagement,
    addProcess,
    listProcesses,
    updateProcess,
    addEligibilityCheck,
    listEligibilityChecks,
    createDocument,
    listDocuments,
    updateDocument,
    createSubmission,
    listSubmissions,
    updateSubmission,
    getUpcomingDeadlines,
    listKnowledgePacks,
    getKnowledgePack,
  };
}

export type CivicService = Awaited<ReturnType<typeof createCivicService>>;
