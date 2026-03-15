/**
 * engagements.ts
 * REST API for the Engagement Task lifecycle manager (8th interaction mode).
 * Handles CRUD for engagements, documents, scope items, resources, workstreams,
 * iterations, client intelligence, and changelog.
 */

import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { indexFolder } from '../services/rag/indexer.js';
import { retrieveChunks } from '../services/rag/retriever.js';
import { streamChat, callChat, mapModelToProvider } from '../services/provider-router.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const engagementStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage: engagementStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const IS_TEAM = process.env.DEPLOYMENT_MODE === 'team';

function getUserId(req: Request): string { return (req as unknown as { user?: { id?: string } }).user?.id ?? 'solo'; }
function getUserRole(req: Request): string { return (req as unknown as { user?: { role?: string } }).user?.role ?? 'admin'; }

function canView(db: Database.Database, engagementId: string, userId: string, userRole: string): boolean {
  if (!IS_TEAM || userRole === 'admin') return true;
  const e = db.prepare('SELECT user_id, project_id FROM engagements WHERE id = ?').get(engagementId) as { user_id: string; project_id: string | null } | undefined;
  if (!e) return false;
  if (e.user_id === userId) return true;
  if (e.project_id) {
    const mem = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(e.project_id, userId);
    if (mem) return true;
  }
  return false;
}

function canEdit(db: Database.Database, engagementId: string, userId: string, userRole: string): boolean {
  if (!IS_TEAM || userRole === 'admin') return true;
  const e = db.prepare('SELECT user_id, project_id FROM engagements WHERE id = ?').get(engagementId) as { user_id: string; project_id: string | null } | undefined;
  if (!e) return false;
  if (e.user_id === userId) return true;
  if (e.project_id) {
    const mem = db.prepare(
      `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`
    ).get(e.project_id, userId) as { role: string } | undefined;
    if (mem && mem.role !== 'viewer') return true;
  }
  return false;
}

export function createEngagementsRoutes(db: Database.Database): Router {
  const router = Router();

  // ── Helper ──────────────────────────────────────────────────────────────────

  function logChange(engagementId: string, phase: string, action: string, description: string, prev?: unknown, next?: unknown) {
    db.prepare(`INSERT INTO engagement_changelog (id, engagement_id, phase, action, description, previous_value, new_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), engagementId, phase, action, description,
      prev ? JSON.stringify(prev) : null,
      next ? JSON.stringify(next) : null
    );
  }

  // ── Engagements CRUD ────────────────────────────────────────────────────────

  // GET /api/engagements — list all engagements
  router.get('/', (req: Request, res: Response) => {
    try {
      if (IS_TEAM && getUserRole(req) !== 'admin') {
        const userId = getUserId(req);
        const engagements = db.prepare(`
          SELECT e.*,
            (SELECT COUNT(*) FROM engagement_scope_items si WHERE si.engagement_id = e.id) as scope_count,
            (SELECT COUNT(*) FROM engagement_resources r WHERE r.engagement_id = e.id) as resource_count,
            (SELECT COUNT(*) FROM engagement_iterations it WHERE it.engagement_id = e.id) as iteration_count
          FROM engagements e
          WHERE e.status != 'archived'
            AND (
              e.user_id = ?
              OR e.project_id IN (
                SELECT pm.project_id FROM project_members pm WHERE pm.user_id = ?
              )
            )
          ORDER BY e.updated_at DESC
        `).all(userId, userId);
        return res.json(engagements);
      }
      const engagements = db.prepare(`
        SELECT e.*,
          (SELECT COUNT(*) FROM engagement_scope_items si WHERE si.engagement_id = e.id) as scope_count,
          (SELECT COUNT(*) FROM engagement_resources r WHERE r.engagement_id = e.id) as resource_count,
          (SELECT COUNT(*) FROM engagement_iterations it WHERE it.engagement_id = e.id) as iteration_count
        FROM engagements e
        WHERE e.status != 'archived'
        ORDER BY e.updated_at DESC
      `).all();
      res.json(engagements);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/engagements — create new engagement
  router.post('/', (req: Request, res: Response) => {
    try {
      const { title, engagement_type = 'full', your_organisation, client_name, domain_areas = [] } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const id = randomUUID();
      const userId = getUserId(req);
      db.prepare(`INSERT INTO engagements (id, title, engagement_type, your_organisation, client_name, domain_areas, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, title, engagement_type, your_organisation || null, client_name || null, JSON.stringify(domain_areas), userId);
      const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(id);
      logChange(id, 'setup', 'engagement_created', `Engagement "${title}" created`);
      res.json(engagement);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/engagements/peer-library — anonymised list of completed engagements for benchmarking
  // NOTE: This route must be defined BEFORE /:id routes to avoid conflict
  router.get('/peer-library', (req: Request, res: Response) => {
    try {
      const completed = db.prepare(`
        SELECT e.id, e.title, e.your_organisation, e.domain_areas, e.updated_at,
          qg.overall_score, qg.scope_completeness, qg.status as qg_status
        FROM engagements e
        LEFT JOIN engagement_quality_gates qg ON qg.engagement_id = e.id
        WHERE e.status IN ('review', 'completed') AND e.enable_as_benchmark = 1
        ORDER BY e.updated_at DESC
        LIMIT 50
      `).all() as Array<Record<string, unknown>>;

      // Anonymise: replace real title/client names with "Peer Institution A", "B", etc.
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const anonymised = completed.map((e, idx) => ({
        id: e.id,
        anonymized_label: `Peer Institution ${letters[idx] || idx + 1}`,
        domain: (() => { try { const d = JSON.parse(String(e.domain_areas || '[]')); return Array.isArray(d) ? d.join(', ') : ''; } catch { return ''; } })(),
        overall_score: e.overall_score,
        qg_status: e.qg_status,
        updated_at: e.updated_at,
      }));
      res.json(anonymised);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/engagements/:id — get engagement with all related data
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id));
      if (!engagement) return res.status(404).json({ error: 'Not found' });
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      if (!canView(db, String(req.params.id), userId, userRole))
        return res.status(403).json({ error: 'Access denied' });
      const documents = db.prepare('SELECT * FROM engagement_documents WHERE engagement_id = ? ORDER BY uploaded_at').all(String(req.params.id));
      const scope_items = db.prepare('SELECT * FROM engagement_scope_items WHERE engagement_id = ? ORDER BY sort_order').all(String(req.params.id));
      const workstreams = db.prepare('SELECT * FROM engagement_workstreams WHERE engagement_id = ? ORDER BY sort_order').all(String(req.params.id));
      const resources = db.prepare('SELECT * FROM engagement_resources WHERE engagement_id = ? ORDER BY category, uploaded_at').all(String(req.params.id));
      const deliverables = db.prepare('SELECT * FROM engagement_deliverables WHERE engagement_id = ?').all(String(req.params.id));
      const boundaries = db.prepare('SELECT * FROM engagement_boundaries WHERE engagement_id = ? AND status = ?').all(String(req.params.id), 'active');
      const client_intelligence = db.prepare('SELECT * FROM engagement_client_intelligence WHERE engagement_id = ?').get(String(req.params.id));
      const iterations = db.prepare('SELECT * FROM engagement_iterations WHERE engagement_id = ? ORDER BY iteration_number DESC').all(String(req.params.id));
      const stakeholders = db.prepare('SELECT * FROM engagement_stakeholders WHERE engagement_id = ?').all(String(req.params.id));
      const peer_benchmarks = db.prepare('SELECT id, benchmark_type, anonymized_label, domain, scope_similarity, maturity_data, key_findings, search_query, created_at FROM engagement_peer_benchmarks WHERE engagement_id = ? ORDER BY created_at DESC').all(String(req.params.id));
      const quality_gate = db.prepare('SELECT * FROM engagement_quality_gates WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1').get(String(req.params.id)) || null;
      res.json({ ...engagement, documents, scope_items, workstreams, resources, deliverables, boundaries, client_intelligence, iterations, stakeholders, peer_benchmarks, quality_gate });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /api/engagements/:id — update engagement
  router.patch('/:id', (req: Request, res: Response) => {
    try {
      const { status, your_organisation, client_name, domain_areas, engagement_brief, quality_blueprint,
        thinking_level, expert_panel, review_modes, knowledge_config, scope_confirmed_at, title } = req.body;
      const existing = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id)) as Record<string, unknown>;
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      if (!canEdit(db, String(req.params.id), userId, userRole))
        return res.status(403).json({ error: 'Access denied' });
      const updates: string[] = ['updated_at = datetime(\'now\')'];
      const values: unknown[] = [];
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (title !== undefined) { updates.push('title = ?'); values.push(title); }
      if (your_organisation !== undefined) { updates.push('your_organisation = ?'); values.push(your_organisation); }
      if (client_name !== undefined) { updates.push('client_name = ?'); values.push(client_name); }
      if (domain_areas !== undefined) { updates.push('domain_areas = ?'); values.push(JSON.stringify(domain_areas)); }
      if (engagement_brief !== undefined) { updates.push('engagement_brief = ?'); values.push(JSON.stringify(engagement_brief)); }
      if (quality_blueprint !== undefined) { updates.push('quality_blueprint = ?'); values.push(JSON.stringify(quality_blueprint)); }
      if (thinking_level !== undefined) { updates.push('thinking_level = ?'); values.push(thinking_level); }
      if (expert_panel !== undefined) { updates.push('expert_panel = ?'); values.push(JSON.stringify(expert_panel)); }
      if (review_modes !== undefined) { updates.push('review_modes = ?'); values.push(JSON.stringify(review_modes)); }
      if (knowledge_config !== undefined) { updates.push('knowledge_config = ?'); values.push(JSON.stringify(knowledge_config)); }
      if (scope_confirmed_at !== undefined) { updates.push('scope_confirmed_at = ?'); values.push(scope_confirmed_at); }
      values.push(String(req.params.id));
      db.prepare(`UPDATE engagements SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      if (status && status !== existing.status) {
        logChange(String(req.params.id), status, 'status_changed', `Status changed from ${existing.status} to ${status}`, existing.status, status);
      }
      const updated = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id));
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/engagements/:id — archive engagement
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      if (!canEdit(db, String(req.params.id), userId, userRole))
        return res.status(403).json({ error: 'Access denied' });
      db.prepare("UPDATE engagements SET status = 'archived', updated_at = datetime('now') WHERE id = ?").run(String(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /api/engagements/:id/project — link/unlink engagement to a project
  router.patch('/:id/project', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      // Only engagement owner or admin can link/unlink
      const existing = db.prepare('SELECT user_id FROM engagements WHERE id = ?').get(String(req.params.id)) as { user_id: string } | undefined;
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (IS_TEAM && userRole !== 'admin' && existing.user_id !== userId)
        return res.status(403).json({ error: 'Only the engagement owner can link to a project' });
      const { project_id } = req.body as { project_id: string | null };
      // Validate project exists if provided
      if (project_id) {
        const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
        if (!project) return res.status(404).json({ error: 'Project not found' });
      }
      db.prepare("UPDATE engagements SET project_id = ?, updated_at = datetime('now') WHERE id = ?").run(project_id || null, String(req.params.id));
      logChange(String(req.params.id), 'setup', project_id ? 'project_linked' : 'project_unlinked',
        project_id ? `Linked to project ${project_id}` : 'Unlinked from project');
      const updated = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id));
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Document upload + extraction ────────────────────────────────────────────

  // POST /api/engagements/:id/documents — upload engagement letter, project plan, or good example
  router.post('/:id/documents', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { document_type = 'engagement_letter' } = req.body;
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const id = randomUUID();
      db.prepare(`INSERT INTO engagement_documents (id, engagement_id, document_type, file_path, file_name)
        VALUES (?, ?, ?, ?, ?)`).run(id, String(req.params.id), document_type, req.file.path, req.file.originalname);
      db.prepare("UPDATE engagements SET updated_at = datetime('now') WHERE id = ?").run(String(req.params.id));
      logChange(String(req.params.id), 'resource_collection', 'document_uploaded', `Uploaded ${document_type}: ${req.file.originalname}`);
      const doc = db.prepare('SELECT * FROM engagement_documents WHERE id = ?').get(id);
      res.json(doc);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/engagements/:id/documents/:docId/extract — trigger Claude extraction
  router.post('/:id/documents/:docId/extract', async (req: Request, res: Response) => {
    try {
      const doc = db.prepare('SELECT * FROM engagement_documents WHERE id = ? AND engagement_id = ?').get(String(req.params.docId), String(req.params.id)) as Record<string, unknown> | undefined;
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      // Read file content — if file on disk has no extension, rename it using original file_name
      let filePath = doc.file_path as string;
      if (filePath && !path.extname(filePath) && doc.file_name) {
        const ext = path.extname(String(doc.file_name));
        if (ext) {
          const newPath = filePath + ext;
          try { await fs.rename(filePath, newPath); filePath = newPath;
            db.prepare('UPDATE engagement_documents SET file_path = ? WHERE id = ?').run(newPath, String(req.params.docId));
          } catch { /* keep original path */ }
        }
      }
      let fileContent = '';
      try {
        const { extractTextFromFile } = await import('../services/text-extractor.js');
        fileContent = (await extractTextFromFile(filePath)) ?? '';
      } catch {
        fileContent = 'Could not extract text from file.';
      }

      const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id)) as Record<string, unknown>;

      // Build extraction prompt based on document type
      let extractionPrompt = '';
      if (doc.document_type === 'engagement_letter' || doc.document_type === 'project_plan') {
        extractionPrompt = `You are analysing a professional engagement document. Extract structured information from the following text.

Document type: ${doc.document_type}
Client: ${engagement.client_name || 'unknown'}
Organisation: ${engagement.your_organisation || 'unknown'}

Extract and return a JSON object with these fields:
{
  "parties": { "service_provider": "", "client": "", "contacts": [] },
  "scope_items": [{ "title": "", "description": "", "category": "", "methodology": [] }],
  "deliverables": [{ "title": "", "format": "", "description": "", "delivery_date": "" }],
  "methodology": [],
  "workstreams": [{ "title": "", "description": "", "timeline_start": "", "timeline_end": "" }],
  "assumptions": [],
  "exclusions": [],
  "governance": { "steering_committee": "", "reporting_cadence": "", "escalation_path": "" },
  "dependencies": [],
  "pricing": { "total": "", "notes": "" }
}

Document content:
${fileContent.slice(0, 40000)}

Return ONLY valid JSON, no explanation.`;
      } else if (doc.document_type === 'good_example') {
        extractionPrompt = `You are analysing a professional consulting deliverable to extract quality patterns.

Extract and return a JSON object representing a "Quality Blueprint":
{
  "document_structure": {
    "sections": [],
    "heading_hierarchy": "",
    "executive_summary_approach": "",
    "appendix_usage": ""
  },
  "language_tone": {
    "formality_level": "",
    "sentence_style": "",
    "confidence_language": "",
    "technical_jargon_level": ""
  },
  "finding_format": {
    "structure": "",
    "severity_scale": "",
    "detail_level": "",
    "root_cause_included": false
  },
  "recommendation_style": {
    "specificity": "",
    "prioritisation": "",
    "includes_timeline": false,
    "includes_owner": false
  },
  "citation_depth": {
    "regulatory_citation_style": "",
    "citation_frequency": "",
    "article_granularity": ""
  },
  "visual_conventions": {
    "tables": "",
    "colour_coding": "",
    "scoring_matrices": ""
  },
  "quality_instructions": []
}

Document content:
${fileContent.slice(0, 40000)}

Return ONLY valid JSON, no explanation.`;
      }

      // Call Claude for extraction
      try {
        const result = await callChat({
          model: mapModelToProvider('claude-haiku-4-5-20251001'),
          system: 'You are a document extraction assistant. Return only valid JSON.',
          messages: [{ role: 'user', content: extractionPrompt }],
          maxTokens: 4096,
        });
        const rawText = result.text;
        let extracted: unknown = {};
        try {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        } catch { extracted = {}; }
        // Save extraction results
        db.prepare(`UPDATE engagement_documents SET extracted_content = ?, extraction_summary = ? WHERE id = ?`)
          .run(fileContent.slice(0, 50000), JSON.stringify(extracted), String(req.params.docId));
        // For engagement_letter/project_plan: auto-populate scope items, workstreams, deliverables, boundaries
        if ((doc.document_type === 'engagement_letter' || doc.document_type === 'project_plan') && extracted && typeof extracted === 'object') {
          const ex = extracted as Record<string, unknown>;
          const existing = db.prepare('SELECT id FROM engagement_scope_items WHERE engagement_id = ?').all(String(req.params.id));
          if (existing.length === 0 && Array.isArray(ex.scope_items)) {
            (ex.scope_items as Array<Record<string, unknown>>).forEach((si, idx) => {
              db.prepare(`INSERT INTO engagement_scope_items (id, engagement_id, title, description, category, methodology, sort_order, status, original_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`).run(
                randomUUID(), String(req.params.id),
                String(si.title || ''), String(si.description || ''), String(si.category || 'analysis'),
                JSON.stringify(si.methodology || []), idx, String(si.description || '')
              );
            });
          }
          if (Array.isArray(ex.workstreams)) {
            const existingWs = db.prepare('SELECT id FROM engagement_workstreams WHERE engagement_id = ?').all(String(req.params.id));
            if (existingWs.length === 0) {
              (ex.workstreams as Array<Record<string, unknown>>).forEach((ws, idx) => {
                db.prepare(`INSERT INTO engagement_workstreams (id, engagement_id, title, description, timeline_start, timeline_end, sort_order)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
                  randomUUID(), String(req.params.id), String(ws.title || ''), String(ws.description || ''),
                  String(ws.timeline_start || ''), String(ws.timeline_end || ''), idx
                );
              });
            }
          }
          if (Array.isArray(ex.deliverables)) {
            const existingDel = db.prepare('SELECT id FROM engagement_deliverables WHERE engagement_id = ?').all(String(req.params.id));
            if (existingDel.length === 0) {
              (ex.deliverables as Array<Record<string, unknown>>).forEach((d) => {
                db.prepare(`INSERT INTO engagement_deliverables (id, engagement_id, title, format, description, delivery_date)
                  VALUES (?, ?, ?, ?, ?, ?)`).run(
                  randomUUID(), String(req.params.id), String(d.title || ''), String(d.format || 'docx'),
                  String(d.description || ''), String(d.delivery_date || '')
                );
              });
            }
          }
          // Add boundaries (assumptions + exclusions)
          if (Array.isArray(ex.assumptions)) {
            (ex.assumptions as string[]).forEach((a) => {
              if (a) db.prepare(`INSERT INTO engagement_boundaries (id, engagement_id, boundary_type, description, source)
                VALUES (?, ?, 'assumption', ?, 'engagement_letter')`).run(randomUUID(), String(req.params.id), String(a));
            });
          }
          if (Array.isArray(ex.exclusions)) {
            (ex.exclusions as string[]).forEach((e2) => {
              if (e2) db.prepare(`INSERT INTO engagement_boundaries (id, engagement_id, boundary_type, description, source)
                VALUES (?, ?, 'exclusion', ?, 'engagement_letter')`).run(randomUUID(), String(req.params.id), String(e2));
            });
          }
          // Auto-populate stakeholders from parties.contacts (only if none exist yet)
          const existingTeam = db.prepare('SELECT id FROM engagement_stakeholders WHERE engagement_id = ?').all(String(req.params.id));
          if (existingTeam.length === 0 && ex.parties && typeof ex.parties === 'object') {
            const parties = ex.parties as Record<string, unknown>;
            const contacts = Array.isArray(parties.contacts) ? parties.contacts as Array<Record<string, unknown>> : [];
            contacts.forEach((c) => {
              if (c.name) {
                db.prepare(`INSERT INTO engagement_stakeholders (id, engagement_id, name, role, organisation, stakeholder_type, expertise_areas)
                  VALUES (?, ?, ?, ?, ?, 'client_contact', '[]')`).run(
                  randomUUID(), String(req.params.id), String(c.name), String(c.role || ''), String(c.organisation || '')
                );
              }
            });
          }
          // Update engagement_brief
          db.prepare("UPDATE engagements SET engagement_brief = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(extracted), String(req.params.id));
        }
        // For good_example: update quality_blueprint
        if (doc.document_type === 'good_example') {
          db.prepare("UPDATE engagements SET quality_blueprint = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(extracted), String(req.params.id));
        }
        logChange(String(req.params.id), 'setup', 'document_extracted', `Extracted ${doc.document_type}: ${doc.file_name}`);
        res.json({ ok: true, extracted });
      } catch (claudeErr) {
        res.status(500).json({ error: `Claude extraction failed: ${String(claudeErr)}` });
      }
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Scope Items ─────────────────────────────────────────────────────────────

  router.post('/:id/scope-items', (req: Request, res: Response) => {
    try {
      const { title, description, category, methodology = [], sort_order = 0 } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const id = randomUUID();
      db.prepare(`INSERT INTO engagement_scope_items (id, engagement_id, title, description, category, methodology, sort_order, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'added')`).run(id, String(req.params.id), title, description || null, category || null, JSON.stringify(methodology), sort_order);
      logChange(String(req.params.id), 'scope_agreement', 'scope_item_added', `Added scope item: ${title}`);
      res.json(db.prepare('SELECT * FROM engagement_scope_items WHERE id = ?').get(id));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.patch('/:id/scope-items/:itemId', (req: Request, res: Response) => {
    try {
      const { title, description, category, status, methodology, workstream_id } = req.body;
      const existing = db.prepare('SELECT * FROM engagement_scope_items WHERE id = ? AND engagement_id = ?').get(String(req.params.itemId), String(req.params.id));
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const updates: string[] = [];
      const values: unknown[] = [];
      if (title !== undefined) { updates.push('title = ?'); values.push(title); }
      if (description !== undefined) { updates.push('description = ?'); values.push(description); }
      if (category !== undefined) { updates.push('category = ?'); values.push(category); }
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (methodology !== undefined) { updates.push('methodology = ?'); values.push(JSON.stringify(methodology)); }
      if (workstream_id !== undefined) { updates.push('workstream_id = ?'); values.push(workstream_id); }
      if (updates.length === 0) return res.json(existing);
      values.push(String(req.params.itemId));
      db.prepare(`UPDATE engagement_scope_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      logChange(String(req.params.id), 'scope_agreement', 'scope_item_modified', `Modified scope item`);
      res.json(db.prepare('SELECT * FROM engagement_scope_items WHERE id = ?').get(String(req.params.itemId)));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Resources ───────────────────────────────────────────────────────────────

  router.post('/:id/resources', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { category = 'documents', title, url, workstream_id, text_content } = req.body;
      const resourceTitle = title || req.file?.originalname || url || 'Untitled';
      const id = randomUUID();

      // text_content: inline text note — store directly as extracted_content, no file/url needed
      const isTextNote = !!text_content && !req.file && !url;

      db.prepare(`INSERT INTO engagement_resources (id, engagement_id, workstream_id, category, title, file_path, url, status, extracted_content)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, String(req.params.id), workstream_id || null, category, resourceTitle,
        req.file ? req.file.path : null, url || null,
        isTextNote ? 'reviewed' : 'uploaded',
        isTextNote ? String(text_content).slice(0, 50000) : null
      );
      db.prepare("UPDATE engagements SET updated_at = datetime('now') WHERE id = ?").run(String(req.params.id));
      logChange(String(req.params.id), 'resource_collection', 'resource_added', `Added ${category} resource: ${resourceTitle}`);
      // Auto-extract text if file uploaded
      if (req.file) {
        try {
          const { extractTextFromFile } = await import('../services/text-extractor.js');
          const extracted = await extractTextFromFile(req.file.path);
          db.prepare("UPDATE engagement_resources SET extracted_content = ?, status = 'reviewed' WHERE id = ?").run((extracted ?? '').slice(0, 50000), id);
        } catch { /* non-fatal */ }
      }
      res.json(db.prepare('SELECT * FROM engagement_resources WHERE id = ?').get(id));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.patch('/:id/resources/:resId', (req: Request, res: Response) => {
    try {
      const { status, relevance_tags } = req.body;
      const updates: string[] = [];
      const values: unknown[] = [];
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (relevance_tags !== undefined) { updates.push('relevance_tags = ?'); values.push(JSON.stringify(relevance_tags)); }
      if (updates.length) {
        values.push(String(req.params.resId));
        db.prepare(`UPDATE engagement_resources SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      }
      res.json(db.prepare('SELECT * FROM engagement_resources WHERE id = ?').get(String(req.params.resId)));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH resource category status
  router.patch('/:id/resource-categories', (req: Request, res: Response) => {
    try {
      const { category, workstream_id, status, notes } = req.body;
      const existing = db.prepare('SELECT * FROM engagement_resource_categories WHERE engagement_id = ? AND category = ?').get(String(req.params.id), category);
      if (existing) {
        db.prepare("UPDATE engagement_resource_categories SET status = ?, notes = ?, updated_at = datetime('now') WHERE engagement_id = ? AND category = ?")
          .run(status, notes || null, String(req.params.id), category);
      } else {
        db.prepare(`INSERT INTO engagement_resource_categories (id, engagement_id, workstream_id, category, status, notes)
          VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), String(req.params.id), workstream_id || null, category, status, notes || null);
      }
      logChange(String(req.params.id), 'resource_collection', 'category_status_changed', `Category ${category} status: ${status}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── RAG Knowledge Directory ──────────────────────────────────────────────────
  // Separate from normal uploads: a local folder indexed with BM25 for retrieval
  // at execution time. Designed for large document sets (20+ files) that would
  // exceed the context window if injected in full.

  // POST /:id/rag-directory — set folder path and trigger BM25 indexing
  router.post('/:id/rag-directory', async (req: Request, res: Response) => {
    try {
      const { folderPath } = req.body as { folderPath: string };
      if (!folderPath || typeof folderPath !== 'string') {
        res.status(400).json({ error: 'folderPath required' }); return;
      }
      const normalised = path.normalize(folderPath);
      if (!path.isAbsolute(normalised) || folderPath.includes('..')) {
        res.status(400).json({ error: 'Absolute path without traversal required' }); return;
      }
      if (!fs.existsSync(normalised)) {
        res.status(400).json({ error: 'Folder does not exist' }); return;
      }

      const result = await indexFolder(db, normalised);
      db.prepare(`UPDATE engagements SET rag_directory_path = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(normalised, String(req.params.id));
      logChange(String(req.params.id), 'resource_collection', 'rag_directory_set', `RAG directory: ${normalised}`);
      res.json({ ok: true, folderPath: normalised, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /:id/rag-directory — remove RAG directory from this engagement
  router.delete('/:id/rag-directory', (req: Request, res: Response) => {
    try {
      db.prepare(`UPDATE engagements SET rag_directory_path = NULL, updated_at = datetime('now') WHERE id = ?`)
        .run(String(req.params.id));
      logChange(String(req.params.id), 'resource_collection', 'rag_directory_removed', 'RAG directory removed');
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /:id/rag-directory/reindex — re-run BM25 indexing on the configured folder
  router.post('/:id/rag-directory/reindex', async (req: Request, res: Response) => {
    try {
      const engagement = db.prepare('SELECT rag_directory_path FROM engagements WHERE id = ?')
        .get(String(req.params.id)) as { rag_directory_path: string | null } | undefined;
      if (!engagement?.rag_directory_path) {
        res.status(400).json({ error: 'No RAG directory configured for this engagement' }); return;
      }
      const result = await indexFolder(db, engagement.rag_directory_path);
      logChange(String(req.params.id), 'resource_collection', 'rag_directory_reindexed', `Re-indexed: ${engagement.rag_directory_path}`);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Client Intelligence ─────────────────────────────────────────────────────

  router.put('/:id/client-intelligence', (req: Request, res: Response) => {
    try {
      const existing = db.prepare('SELECT * FROM engagement_client_intelligence WHERE engagement_id = ?').get(String(req.params.id));
      const data = req.body;
      if (existing) {
        db.prepare(`UPDATE engagement_client_intelligence SET
          client_name = ?, division_department = ?, region_jurisdiction = ?, products_in_scope = ?,
          scale_indicators = ?, regulatory_supervisors = ?, recent_regulatory_history = ?,
          peer_comparators = ?, business_model_description = ?, technology_landscape = ?,
          organisational_context = ?, engagement_trigger = ?, client_maturity_signal = ?,
          sensitivities = ?, online_research_authorised = ?, source_channels = ?, updated_at = datetime('now')
          WHERE engagement_id = ?`).run(
          data.client_name, data.division_department, data.region_jurisdiction,
          JSON.stringify(data.products_in_scope || []), JSON.stringify(data.scale_indicators || {}),
          JSON.stringify(data.regulatory_supervisors || []), JSON.stringify(data.recent_regulatory_history || []),
          JSON.stringify(data.peer_comparators || []), data.business_model_description, JSON.stringify(data.technology_landscape || {}),
          data.organisational_context, data.engagement_trigger, data.client_maturity_signal,
          data.sensitivities, data.online_research_authorised ? 1 : 0, JSON.stringify(data.source_channels || []),
          String(req.params.id)
        );
      } else {
        db.prepare(`INSERT INTO engagement_client_intelligence (id, engagement_id, client_name, division_department, region_jurisdiction,
          products_in_scope, scale_indicators, regulatory_supervisors, recent_regulatory_history, peer_comparators,
          business_model_description, technology_landscape, organisational_context, engagement_trigger,
          client_maturity_signal, sensitivities, online_research_authorised, source_channels)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          randomUUID(), String(req.params.id), data.client_name, data.division_department, data.region_jurisdiction,
          JSON.stringify(data.products_in_scope || []), JSON.stringify(data.scale_indicators || {}),
          JSON.stringify(data.regulatory_supervisors || []), JSON.stringify(data.recent_regulatory_history || []),
          JSON.stringify(data.peer_comparators || []), data.business_model_description, JSON.stringify(data.technology_landscape || {}),
          data.organisational_context, data.engagement_trigger, data.client_maturity_signal,
          data.sensitivities, data.online_research_authorised ? 1 : 0, JSON.stringify(data.source_channels || [])
        );
      }
      logChange(String(req.params.id), 'client_intelligence', 'intelligence_updated', 'Client intelligence updated');
      res.json(db.prepare('SELECT * FROM engagement_client_intelligence WHERE engagement_id = ?').get(String(req.params.id)));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Workstreams ─────────────────────────────────────────────────────────────

  router.post('/:id/workstreams', (req: Request, res: Response) => {
    try {
      const { title, description, expert_panel = [], thinking_level, timeline_start, timeline_end, sort_order = 0 } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const id = randomUUID();
      db.prepare(`INSERT INTO engagement_workstreams (id, engagement_id, title, description, expert_panel, thinking_level, timeline_start, timeline_end, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, String(req.params.id), title, description || null, JSON.stringify(expert_panel), thinking_level || null, timeline_start || null, timeline_end || null, sort_order);
      logChange(String(req.params.id), 'workstream_planning', 'workstream_added', `Added workstream: ${title}`);
      res.json(db.prepare('SELECT * FROM engagement_workstreams WHERE id = ?').get(id));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.patch('/:id/workstreams/:wsId', (req: Request, res: Response) => {
    try {
      const { title, description, execution_status, expert_panel, thinking_level, timeline_start, timeline_end } = req.body;
      const updates: string[] = [];
      const values: unknown[] = [];
      if (title !== undefined) { updates.push('title = ?'); values.push(title); }
      if (description !== undefined) { updates.push('description = ?'); values.push(description); }
      if (execution_status !== undefined) { updates.push('execution_status = ?'); values.push(execution_status); }
      if (expert_panel !== undefined) { updates.push('expert_panel = ?'); values.push(JSON.stringify(expert_panel)); }
      if (thinking_level !== undefined) { updates.push('thinking_level = ?'); values.push(thinking_level); }
      if (timeline_start !== undefined) { updates.push('timeline_start = ?'); values.push(timeline_start); }
      if (timeline_end !== undefined) { updates.push('timeline_end = ?'); values.push(timeline_end); }
      if (updates.length) { values.push(String(req.params.wsId)); db.prepare(`UPDATE engagement_workstreams SET ${updates.join(', ')} WHERE id = ?`).run(...values); }
      res.json(db.prepare('SELECT * FROM engagement_workstreams WHERE id = ?').get(String(req.params.wsId)));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Execution (Phase 6) ─────────────────────────────────────────────────────

  router.post('/:id/execute', async (req: Request, res: Response) => {
    try {
      const { workstream_id } = req.body;
      const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id)) as Record<string, unknown>;
      if (!engagement) return res.status(404).json({ error: 'Engagement not found' });

      const workstream = workstream_id ? db.prepare('SELECT * FROM engagement_workstreams WHERE id = ?').get(workstream_id) as Record<string, unknown> : null;
      const scope_items = db.prepare('SELECT * FROM engagement_scope_items WHERE engagement_id = ? AND status != ?').all(String(req.params.id), 'removed') as Array<Record<string, unknown>>;
      const resources = db.prepare('SELECT id, category, title, extracted_content, url FROM engagement_resources WHERE engagement_id = ? AND status NOT IN (?, ?)').all(String(req.params.id), 'not_available', 'coming_later') as Array<Record<string, unknown>>;
      const client_intel = db.prepare('SELECT * FROM engagement_client_intelligence WHERE engagement_id = ?').get(String(req.params.id)) as Record<string, unknown> | undefined;
      const deliverables = db.prepare('SELECT * FROM engagement_deliverables WHERE engagement_id = ?').all(String(req.params.id)) as Array<Record<string, unknown>>;
      const team_members = db.prepare(`SELECT * FROM engagement_stakeholders WHERE engagement_id = ? ORDER BY stakeholder_type, created_at ASC`).all(String(req.params.id)) as Array<Record<string, unknown>>;

      let qualityBlueprint: Record<string, unknown> = {};
      try { qualityBlueprint = JSON.parse(String(engagement.quality_blueprint || '{}')); } catch { /**/ }

      // Build execution context
      const scopeSummary = scope_items.map((si, i) => `${i + 1}. ${si.title}: ${si.description || ''}`).join('\n');
      const deliverableSummary = deliverables.map(d => `- ${d.title} (${d.format || 'docx'})`).join('\n');
      const clientContext = client_intel ? `
CLIENT CONTEXT:
- Client: ${client_intel.client_name}
- Division: ${client_intel.division_department || 'Not specified'}
- Jurisdiction: ${client_intel.region_jurisdiction || 'Not specified'}
- Business model: ${client_intel.business_model_description || 'Not specified'}
- Engagement trigger: ${client_intel.engagement_trigger || 'Not specified'}` : '';

      const deliveryTeam = team_members.filter(m => m.stakeholder_type === 'delivery_team');
      const teamContext = deliveryTeam.length > 0 ? `
DELIVERY TEAM:
${deliveryTeam.map(m => {
  const expertise = (() => { try { return JSON.parse(String(m.expertise_areas || '[]')); } catch { return []; } })();
  return `- ${m.name} (${m.role || 'Consultant'})${expertise.length ? `: ${expertise.join(', ')}` : ''}`;
}).join('\n')}` : '';

      const resourceContext = resources.slice(0, 10).map(r =>
        `### ${r.category}: ${r.title}${r.url ? ` [${r.url}]` : ''}\n${String(r.extracted_content || '').slice(0, 5000)}`
      ).join('\n\n');

      // RAG directory: if configured, retrieve the most relevant chunks using BM25
      // on the engagement scope as query. These supplement (not replace) direct uploads.
      let ragDirectoryContext = '';
      const ragDirPath = (engagement as Record<string, unknown>).rag_directory_path as string | null;
      if (ragDirPath) {
        try {
          const scopeQuery = scope_items.slice(0, 5).map(si => si.title).join(' ');
          const ragChunks = retrieveChunks(db, scopeQuery || String(engagement.engagement_brief || ''), [ragDirPath], 15, 0.05);
          if (ragChunks.length > 0) {
            ragDirectoryContext = `\n\nRAG KNOWLEDGE DIRECTORY (${ragChunks.length} retrieved passages from: ${path.basename(ragDirPath)}):\n` +
              ragChunks.map((c) => `[${c.documentName}]\n${c.text}`).join('\n\n---\n\n');
          }
        } catch { /* RAG retrieval is non-fatal */ }
      }

      const qualityInstructions = qualityBlueprint && (qualityBlueprint as Record<string, unknown>).quality_instructions
        ? `\n\nQUALITY BLUEPRINT:\n${((qualityBlueprint as Record<string, unknown>).quality_instructions as string[] || []).join('\n')}` : '';

      const peerBenchmarks = db.prepare('SELECT * FROM engagement_peer_benchmarks WHERE engagement_id = ?').all(String(req.params.id)) as Array<Record<string, unknown>>;
      const peerContext = peerBenchmarks.length > 0 ? `

PEER BENCHMARKS (for comparative context — institution identities are confidential):
${peerBenchmarks.map(pb => {
  const maturity = (() => { try { return JSON.parse(String(pb.maturity_data || '{}')); } catch { return {}; } })();
  const findings = (() => { try { return JSON.parse(String(pb.key_findings || '[]')); } catch { return []; } })();
  return `\n${pb.anonymized_label} (${pb.domain || 'peer institution'}):
  ${maturity.overall_maturity ? `Maturity: ${maturity.overall_maturity}` : ''}
  ${maturity.common_gaps?.length ? `Common gaps: ${(maturity.common_gaps as string[]).join(', ')}` : ''}
  ${findings.length ? `Key findings: ${(findings as string[]).slice(0, 3).join('; ')}` : ''}`;
}).join('\n')}

Use these benchmarks to position the client relative to industry peers where relevant.` : '';

      // ── Knowledge Sources (web search, indexed KB, knowledge packs) ──
      let knowledgeConfig: Record<string, unknown> = {};
      try { knowledgeConfig = JSON.parse(String(engagement.knowledge_config || '{}')); } catch { /**/ }

      let knowledgeContext = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools: any[] = [];

      // Web search
      if (knowledgeConfig.webSearchEnabled) {
        tools.push({ type: 'web_search_20250305', name: 'web_search' });
        knowledgeContext += `\n\nWEB SEARCH ENABLED — use web search for latest regulatory texts and publications.`;
        if (knowledgeConfig.webSearchFocus) {
          knowledgeContext += ` Focus: ${knowledgeConfig.webSearchFocus}. Cite all web sources.`;
        }
      }

      // Knowledge Packs (Mode 6) — inject active pack entities
      if (knowledgeConfig.knowledgePacksEnabled) {
        try {
          const packRows = db.prepare(`
            SELECT kp.name, kp.jurisdiction, en.label, en.entity_type, en.description
            FROM knowledge_packs kp
            JOIN entity_nodes en ON en.pack_id = kp.pack_id
            WHERE kp.is_active = 1
            ORDER BY kp.name, en.entity_type
            LIMIT 200
          `).all() as Array<{ name: string; jurisdiction: string; label: string; entity_type: string; description: string }>;
          if (packRows.length > 0) {
            const grouped = new Map<string, string[]>();
            for (const r of packRows) {
              const key = `${r.name} (${r.jurisdiction})`;
              if (!grouped.has(key)) grouped.set(key, []);
              grouped.get(key)!.push(`- ${r.label} [${r.entity_type}]: ${(r.description || '').slice(0, 200)}`);
            }
            knowledgeContext += '\n\nREGULATORY KNOWLEDGE PACKS (curated entity graph):\n';
            for (const [packName, entities] of grouped) {
              knowledgeContext += `\n### ${packName}\n${entities.slice(0, 40).join('\n')}\n`;
            }
          }
        } catch { /* non-fatal */ }
      }

      // Indexed KB (Mode 5a) — semantic search using scope as query
      if (knowledgeConfig.indexedKBEnabled) {
        try {
          const scopeQuery = scope_items.slice(0, 5).map(si => si.title).join(' ');
          const kbChunks = retrieveChunks(db, scopeQuery || String(engagement.title), [], 15, 0.05);
          if (kbChunks.length > 0) {
            knowledgeContext += `\n\nINDEXED KNOWLEDGE BASE (${kbChunks.length} relevant passages):\n` +
              kbChunks.map(c => `[${c.documentName}]\n${c.text}`).join('\n\n---\n\n');
          }
        } catch { /* non-fatal */ }
      }

      const systemPrompt = `You are ANTON, an expert engagement manager and compliance analyst. You are executing a professional consulting engagement with maximum quality.

ENGAGEMENT: ${engagement.title}
Service Provider: ${engagement.your_organisation || 'The consulting team'}
Client: ${engagement.client_name || 'The client'}
${workstream ? `WORKSTREAM: ${workstream.title}\n${workstream.description || ''}` : ''}

CONFIRMED SCOPE:
${scopeSummary}

DELIVERABLES TO PRODUCE:
${deliverableSummary}
${clientContext}
${teamContext}
${qualityInstructions}
${peerContext}

EXECUTION INSTRUCTIONS:
1. Produce professional, complete output structured according to the confirmed scope
2. Reference specific findings from the uploaded documents where available
3. Maintain the quality standard from the quality blueprint if provided
4. Clearly identify areas where additional information would improve the assessment
5. Flag any scope questions or ambiguities without making assumptions

Format your output as professional consulting deliverables. Use clear headings, structured findings, and actionable recommendations.${knowledgeContext}`;

      // Stream the response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Map thinking level to model + thinking config
      const thinkingLevel = String(engagement.thinking_level || 'think_hard');
      const isQuick = thinkingLevel === 'quick';
      const execModel = mapModelToProvider(isQuick ? 'claude-haiku-4-5-20251001' : 'claude-opus-4-6');

      // Plan First mode: prepend planning instructions
      const planFirstInstr = thinkingLevel === 'plan_first'
        ? '\n\nBEFORE WRITING: Create an explicit plan (sections, order, depth, assumptions, gaps). Present your plan first as a brief outline, then execute it systematically.\n'
        : '';

      const streamResult = await streamChat({
        model: execModel,
        maxTokens: isQuick ? 32_000 : 128_000,
        system: systemPrompt + planFirstInstr,
        messages: [{ role: 'user', content: `Execute the ${workstream ? workstream.title + ' workstream' : 'engagement'} analysis. Produce a complete, professional draft deliverable.\n\n${resourceContext ? `UPLOADED DOCUMENTS:\n${resourceContext}` : 'Note: No documents have been uploaded. Base analysis on scope and general expertise.'}${ragDirectoryContext}` }],
        thinkingLevel: isQuick ? undefined : thinkingLevel,
        tools: tools.length > 0 ? tools : undefined,
      }, res);

      const fullContent = streamResult.text;
      const fullThinking = streamResult.thinking;

      // Save iteration
      const iterationNumber = (db.prepare('SELECT MAX(iteration_number) as max FROM engagement_iterations WHERE engagement_id = ?').get(String(req.params.id)) as { max: number | null })?.max ?? 0;
      const iterationId = randomUUID();
      db.prepare(`INSERT INTO engagement_iterations (id, engagement_id, workstream_id, iteration_number, output_content, thinking_content, status, resources_used)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`).run(
        iterationId, String(req.params.id), workstream_id || null, iterationNumber + 1,
        fullContent, fullThinking || null, JSON.stringify(resources.map(r => r.id))
      );
      db.prepare("UPDATE engagements SET status = 'review', updated_at = datetime('now') WHERE id = ?").run(String(req.params.id));
      if (workstream_id) {
        db.prepare("UPDATE engagement_workstreams SET execution_status = 'review' WHERE id = ?").run(workstream_id);
      }
      logChange(String(req.params.id), 'execution', 'iteration_created', `Iteration ${iterationNumber + 1} created for ${workstream ? workstream.title : 'engagement'}`);
      res.write(`data: ${JSON.stringify({ type: 'done', iterationId })}\n\n`);
      res.end();
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(e) })}\n\n`);
      res.end();
    }
  });

  // ── Iterations ──────────────────────────────────────────────────────────────

  router.get('/:id/iterations', (req: Request, res: Response) => {
    try {
      const iterations = db.prepare('SELECT * FROM engagement_iterations WHERE engagement_id = ? ORDER BY iteration_number DESC').all(String(req.params.id));
      res.json(iterations);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.patch('/:id/iterations/:itId', (req: Request, res: Response) => {
    try {
      const { status, gap_analysis, quality_scores, expert_reviews } = req.body;
      const updates: string[] = [];
      const values: unknown[] = [];
      if (status !== undefined) { updates.push('status = ?'); values.push(status); }
      if (gap_analysis !== undefined) { updates.push('gap_analysis = ?'); values.push(JSON.stringify(gap_analysis)); }
      if (quality_scores !== undefined) { updates.push('quality_scores = ?'); values.push(JSON.stringify(quality_scores)); }
      if (expert_reviews !== undefined) { updates.push('expert_reviews = ?'); values.push(JSON.stringify(expert_reviews)); }
      if (updates.length) { values.push(String(req.params.itId)); db.prepare(`UPDATE engagement_iterations SET ${updates.join(', ')} WHERE id = ?`).run(...values); }
      res.json(db.prepare('SELECT * FROM engagement_iterations WHERE id = ?').get(String(req.params.itId)));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/engagements/:id/iterations/:itId/gap-analysis — lens-aware gap analysis
  router.post('/:id/iterations/:itId/gap-analysis', async (req: Request, res: Response) => {
    try {
      const iteration = db.prepare('SELECT * FROM engagement_iterations WHERE id = ? AND engagement_id = ?').get(String(req.params.itId), String(req.params.id)) as Record<string, unknown> | undefined;
      if (!iteration) return res.status(404).json({ error: 'Iteration not found' });

      const { lens = 'scope', custom_instruction = '' } = req.body as { lens?: string; custom_instruction?: string };

      const engagement = db.prepare('SELECT * FROM engagement_tasks WHERE id = ?').get(String(req.params.id)) as Record<string, unknown> | undefined;
      const scope_items = db.prepare('SELECT * FROM engagement_scope_items WHERE engagement_id = ?').all(String(req.params.id)) as Record<string, unknown>[];
      const resources = db.prepare('SELECT id, category, title, extracted_content FROM engagement_resources WHERE engagement_id = ?').all(String(req.params.id)) as Record<string, unknown>[];

      // Build reference context based on lens
      let lensInstruction = '';
      let referenceContext = '';

      if (lens === 'scope') {
        lensInstruction = 'Analyse the draft output purely against the agreed engagement scope. Identify gaps where scope items are not adequately addressed, areas with insufficient depth, and topics mentioned in scope that are missing from the output.';
      } else if (lens === 'engagement_letter') {
        const letterResource = resources.find(r => String(r.category || '').toLowerCase().includes('letter') || String(r.title || '').toLowerCase().includes('engagement letter'));
        if (letterResource && letterResource.extracted_content) {
          referenceContext = `\n\nENGAGEMENT LETTER (reference):\n${String(letterResource.extracted_content).slice(0, 6000)}`;
        } else {
          // Fall back to stored letter_content on engagement
          const letterContent = String(engagement?.letter_content || '');
          if (letterContent) referenceContext = `\n\nENGAGEMENT LETTER:\n${letterContent.slice(0, 6000)}`;
        }
        lensInstruction = 'Compare the draft output against the original engagement letter. Identify: commitments made in the letter not yet delivered, scope agreed in the letter but missing from output, tone/format mismatches, and client expectations set in the letter that are unmet.';
      } else if (lens === 'quality_blueprint') {
        const blueprintResource = resources.find(r => String(r.category || '').toLowerCase().includes('blueprint') || String(r.title || '').toLowerCase().includes('blueprint'));
        if (blueprintResource && blueprintResource.extracted_content) {
          referenceContext = `\n\nQUALITY BLUEPRINT:\n${String(blueprintResource.extracted_content).slice(0, 6000)}`;
        }
        lensInstruction = 'Assess the draft output against the quality blueprint standards. Identify gaps in structure, missing mandatory sections, quality criteria not met, areas below the expected standard of evidence, and recommendations lacking implementation specificity.';
      } else if (lens === 'regulatory') {
        lensInstruction = 'Review the draft output through a regulatory scrutiny lens. Identify gaps in regulatory citations, areas where the analysis might not withstand regulatory challenge, missing references to applicable regulations/guidelines, and conclusions that need stronger regulatory grounding.';
      } else if (lens === 'client') {
        const clientIntelResource = resources.find(r => String(r.category || '').toLowerCase().includes('client') || String(r.category || '').toLowerCase().includes('intel'));
        if (clientIntelResource && clientIntelResource.extracted_content) {
          referenceContext = `\n\nCLIENT INTELLIGENCE:\n${String(clientIntelResource.extracted_content).slice(0, 4000)}`;
        }
        lensInstruction = 'Analyse the draft output from the client\'s perspective. Identify: client-specific context that should be incorporated but is missing, generic statements that should be tailored to the client, areas where client pain points are not addressed, and recommendations that may be impractical for this specific client.';
      } else if (lens === 'red_team') {
        lensInstruction = 'Challenge the draft output as a critical reviewer or opposing counsel. Identify: assumptions that are not sufficiently justified, conclusions that could be disputed, evidence gaps that weaken key arguments, alternative interpretations not considered, and risks that are underplayed or omitted.';
      } else if (lens === 'senior_partner') {
        lensInstruction = 'Review as a senior partner doing a final quality check before client delivery. Identify: anything that would embarrass the firm, commercial risks or opportunities not addressed, strategic recommendations missing from a tactical output, narrative inconsistencies, and areas needing a stronger executive-level framing.';
      } else if (lens === 'custom' && custom_instruction) {
        lensInstruction = custom_instruction;
      } else {
        lensInstruction = 'Analyse the draft output and identify what additional information, documents, or conversations would most improve it.';
      }

      const gapPrompt = `You are a senior FCP consulting reviewer. ${lensInstruction}

ENGAGEMENT SCOPE:
${scope_items.map(si => `- ${String(si.title)}: ${String(si.description || '')}`).join('\n')}

AVAILABLE RESOURCES:
${resources.map(r => `- [${String(r.category)}] ${String(r.title)}`).join('\n')}
${referenceContext}

DRAFT OUTPUT (first 12000 chars):
${String(iteration.output_content || '').slice(0, 12000)}

Return a JSON object with this exact structure:
{
  "gaps": [
    {
      "priority": "high" | "medium" | "low",
      "area": "Short area/section name",
      "gap": "Specific description of what is missing or needs strengthening",
      "suggestion": "Concrete suggestion for how to address this gap"
    }
  ],
  "overall_assessment": "2-3 sentence overall assessment of the draft quality and key themes",
  "confidence": "high" | "medium" | "low",
  "lens_used": "${lens}"
}

Return ONLY valid JSON, no markdown fences, no explanation.`;

      const gapResult = await callChat({
        model: mapModelToProvider('claude-haiku-4-5-20251001'),
        system: 'You are a senior FCP consulting reviewer. Return only valid JSON.',
        messages: [{ role: 'user', content: gapPrompt }],
        maxTokens: 3000,
      });

      const rawText = gapResult.text || '{}';
      let result: { gaps: unknown[]; overall_assessment: string; confidence: string; lens_used: string } = {
        gaps: [], overall_assessment: '', confidence: 'medium', lens_used: lens,
      };
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) result = { ...result, ...JSON.parse(jsonMatch[0]) };
      } catch { /* keep defaults */ }

      db.prepare('UPDATE engagement_iterations SET gap_analysis = ? WHERE id = ?').run(JSON.stringify(result), String(req.params.itId));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Team / Stakeholders ──────────────────────────────────────────────────────

  // GET /api/engagements/:id/team — list all team members + client contacts
  router.get('/:id/team', (req: Request, res: Response) => {
    try {
      const members = db.prepare('SELECT * FROM engagement_stakeholders WHERE engagement_id = ? ORDER BY created_at ASC').all(String(req.params.id));
      res.json(members);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/engagements/:id/team — add a team member or client contact
  router.post('/:id/team', (req: Request, res: Response) => {
    try {
      const { name, role, organisation, contact_info, stakeholder_type = 'client_contact', expertise_areas = [], notes } = req.body;
      if (!name) return res.status(400).json({ error: 'name required' });
      const id = randomUUID();
      db.prepare(`INSERT INTO engagement_stakeholders (id, engagement_id, name, role, organisation, contact_info, stakeholder_type, expertise_areas, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, String(req.params.id), name, role || null, organisation || null,
        contact_info || null, stakeholder_type, JSON.stringify(expertise_areas), notes || null
      );
      logChange(String(req.params.id), 'team', 'member_added', `Added ${stakeholder_type}: ${name}`);
      res.json(db.prepare('SELECT * FROM engagement_stakeholders WHERE id = ?').get(id));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /api/engagements/:id/team/:memberId — update team member
  router.patch('/:id/team/:memberId', (req: Request, res: Response) => {
    try {
      const { name, role, organisation, contact_info, stakeholder_type, expertise_areas, notes } = req.body;
      const updates: string[] = [];
      const values: unknown[] = [];
      if (name !== undefined) { updates.push('name = ?'); values.push(name); }
      if (role !== undefined) { updates.push('role = ?'); values.push(role); }
      if (organisation !== undefined) { updates.push('organisation = ?'); values.push(organisation); }
      if (contact_info !== undefined) { updates.push('contact_info = ?'); values.push(contact_info); }
      if (stakeholder_type !== undefined) { updates.push('stakeholder_type = ?'); values.push(stakeholder_type); }
      if (expertise_areas !== undefined) { updates.push('expertise_areas = ?'); values.push(JSON.stringify(expertise_areas)); }
      if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
      if (updates.length) { values.push(String(req.params.memberId)); db.prepare(`UPDATE engagement_stakeholders SET ${updates.join(', ')} WHERE id = ?`).run(...values); }
      res.json(db.prepare('SELECT * FROM engagement_stakeholders WHERE id = ?').get(String(req.params.memberId)));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/engagements/:id/team/:memberId — remove team member
  router.delete('/:id/team/:memberId', (req: Request, res: Response) => {
    try {
      const member = db.prepare('SELECT name FROM engagement_stakeholders WHERE id = ?').get(String(req.params.memberId)) as { name: string } | undefined;
      db.prepare('DELETE FROM engagement_stakeholders WHERE id = ? AND engagement_id = ?').run(String(req.params.memberId), String(req.params.id));
      if (member) logChange(String(req.params.id), 'team', 'member_removed', `Removed: ${member.name}`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/engagements/:id/team/extract — Claude Haiku extracts team from engagement letter
  router.post('/:id/team/extract', async (req: Request, res: Response) => {
    try {
      const letterDoc = db.prepare(`SELECT * FROM engagement_documents WHERE engagement_id = ? AND document_type = 'engagement_letter' ORDER BY uploaded_at DESC LIMIT 1`).get(String(req.params.id)) as Record<string, unknown> | undefined;
      const planDoc = db.prepare(`SELECT * FROM engagement_documents WHERE engagement_id = ? AND document_type = 'project_plan' ORDER BY uploaded_at DESC LIMIT 1`).get(String(req.params.id)) as Record<string, unknown> | undefined;
      const doc = letterDoc || planDoc;
      if (!doc) return res.status(400).json({ error: 'No engagement letter uploaded. Upload the letter first.' });

      // Fix extensionless files from old multer config
      let teamFilePath = doc.file_path as string;
      if (teamFilePath && !path.extname(teamFilePath) && doc.file_name) {
        const ext = path.extname(String(doc.file_name));
        if (ext) {
          const newPath = teamFilePath + ext;
          try { await fs.rename(teamFilePath, newPath); teamFilePath = newPath;
            db.prepare('UPDATE engagement_documents SET file_path = ? WHERE id = ?').run(newPath, String(doc.id));
          } catch { /* keep original */ }
        }
      }
      let fileContent = '';
      try {
        const { extractTextFromFile } = await import('../services/text-extractor.js');
        fileContent = (await extractTextFromFile(teamFilePath)) ?? '';
      } catch {
        fileContent = String(doc.extracted_content || '');
      }

      const teamResult = await callChat({
        model: mapModelToProvider('claude-haiku-4-5-20251001'),
        system: 'You are a document extraction assistant. Return only valid JSON.',
        messages: [{
          role: 'user',
          content: `Analyse this engagement document and extract all people involved.

For each person, identify:
- Whether they are on the SERVICE PROVIDER team (consultants/advisors) or CLIENT CONTACT (at the client organisation)
- Their name, role/title, organisation, and any expertise areas mentioned

Also suggest any ADDITIONAL EXPERTISE AREAS that seem needed for this engagement but aren't represented in the named people (e.g. if the scope mentions technical work but no tech specialist is named).

Return JSON only:
{
  "delivery_team": [
    { "name": "", "role": "", "organisation": "", "expertise_areas": [] }
  ],
  "client_contacts": [
    { "name": "", "role": "", "organisation": "" }
  ],
  "suggested_expertise": [
    { "area": "", "reason": "" }
  ]
}

Document:
${fileContent.slice(0, 30000)}

Return ONLY valid JSON.`,
        }],
        maxTokens: 2048,
      });
      const rawText = teamResult.text || '{}';
      let extracted: { delivery_team?: Array<Record<string, unknown>>; client_contacts?: Array<Record<string, unknown>>; suggested_expertise?: Array<Record<string, unknown>> } = {};
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch { /**/ }
      res.json(extracted);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Peer Benchmarks ──────────────────────────────────────────────────────────

  // POST /api/engagements/:id/peer-benchmarks/web-search — Claude web search benchmark
  router.post('/:id/peer-benchmarks/web-search', async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'query required' });

      const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id)) as Record<string, unknown>;
      if (!engagement) return res.status(404).json({ error: 'Not found' });

      const benchmarkResult = await callChat({
        model: mapModelToProvider('claude-haiku-4-5-20251001'),
        system: 'You are a financial crime compliance analyst conducting peer benchmarking research. Return only valid JSON.',
        messages: [{
          role: 'user',
          content: `Search for: ${query}

Context: This is for an engagement on "${engagement.title}" with client domain areas: ${String(engagement.domain_areas || '[]')}.

After searching, extract and return a JSON object with these fields:
{
  "anonymized_label": "A short descriptive label for this benchmark set (NOT actual institution names)",
  "domain": "Type of institutions benchmarked (e.g., Nordic universal banks, EU fintechs)",
  "scope_similarity": "How closely this benchmark matches the current engagement scope",
  "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
  "maturity_data": {
    "overall_maturity": "Description of typical maturity level",
    "common_gaps": ["Gap 1", "Gap 2"],
    "leading_practices": ["Practice 1", "Practice 2"],
    "regulatory_context": "Relevant regulatory findings or enforcement actions"
  },
  "raw_summary": "2-3 paragraph narrative of what was found"
}

Return ONLY valid JSON.`,
        }],
        maxTokens: 2048,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      });

      const rawText = benchmarkResult.text || '{}';
      let extracted: Record<string, unknown> = {};
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch { /**/ }

      const id = randomUUID();
      db.prepare(`INSERT INTO engagement_peer_benchmarks (id, engagement_id, benchmark_type, anonymized_label, domain, scope_similarity, maturity_data, key_findings, search_query, raw_content)
        VALUES (?, ?, 'web_search', ?, ?, ?, ?, ?, ?, ?)`).run(
        id, String(req.params.id),
        String(extracted.anonymized_label || query),
        String(extracted.domain || ''),
        String(extracted.scope_similarity || ''),
        JSON.stringify(extracted.maturity_data || {}),
        JSON.stringify(extracted.key_findings || []),
        query,
        String(extracted.raw_summary || rawText.slice(0, 5000))
      );
      logChange(String(req.params.id), 'resource_collection', 'peer_benchmark_added', `Web search benchmark: ${query}`);
      res.json(db.prepare('SELECT id, benchmark_type, anonymized_label, domain, scope_similarity, maturity_data, key_findings, search_query, created_at FROM engagement_peer_benchmarks WHERE id = ?').get(id));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/engagements/:id/peer-benchmarks/from-internal/:sourceId — use internal engagement as benchmark
  router.post('/:id/peer-benchmarks/from-internal/:sourceId', async (req: Request, res: Response) => {
    try {
      const sourceEng = db.prepare('SELECT * FROM engagements WHERE id = ? AND enable_as_benchmark = 1').get(String(req.params.sourceId)) as Record<string, unknown> | undefined;
      if (!sourceEng) return res.status(404).json({ error: 'Source engagement not available as benchmark' });

      const sourceQG = db.prepare('SELECT * FROM engagement_quality_gates WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1').get(String(req.params.sourceId)) as Record<string, unknown> | undefined;
      const sourceIterations = db.prepare("SELECT output_content FROM engagement_iterations WHERE engagement_id = ? AND status = 'approved' ORDER BY iteration_number DESC LIMIT 1").get(String(req.params.sourceId)) as Record<string, unknown> | undefined;

      // Count existing benchmarks to assign letter label
      const existingCount = (db.prepare('SELECT COUNT(*) as n FROM engagement_peer_benchmarks WHERE engagement_id = ?').get(String(req.params.id)) as { n: number }).n;
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const label = `Peer Institution ${letters[existingCount] || existingCount + 1}`;

      const domainAreas = (() => { try { return JSON.parse(String(sourceEng.domain_areas || '[]')).join(', '); } catch { return ''; } })();

      // Extract key findings from quality gate if available
      let keyFindings: string[] = [];
      let maturityData: Record<string, unknown> = {};
      if (sourceQG) {
        try {
          const sc = JSON.parse(String(sourceQG.scope_completeness || '{}'));
          const ba = JSON.parse(String(sourceQG.blueprint_alignment || '{}'));
          maturityData = {
            overall_score: sourceQG.overall_score,
            scope_completeness: sc.score,
            blueprint_alignment: ba.score,
            release_ready: sourceQG.release_ready,
          };
          keyFindings = JSON.parse(String(sourceQG.blockers || '[]')).slice(0, 5);
        } catch { /**/ }
      }

      const id = randomUUID();
      db.prepare(`INSERT INTO engagement_peer_benchmarks (id, engagement_id, benchmark_type, source_engagement_id, anonymized_label, domain, scope_similarity, maturity_data, key_findings)
        VALUES (?, ?, 'internal', ?, ?, ?, 'Similar scope and domain', ?, ?)`).run(
        id, String(req.params.id), String(req.params.sourceId), label, domainAreas,
        JSON.stringify(maturityData), JSON.stringify(keyFindings)
      );
      logChange(String(req.params.id), 'resource_collection', 'peer_benchmark_added', `Internal benchmark added: ${label}`);
      res.json(db.prepare('SELECT id, benchmark_type, anonymized_label, domain, scope_similarity, maturity_data, key_findings, created_at FROM engagement_peer_benchmarks WHERE id = ?').get(id));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/engagements/:id/peer-benchmarks
  router.get('/:id/peer-benchmarks', (req: Request, res: Response) => {
    try {
      res.json(db.prepare('SELECT id, benchmark_type, anonymized_label, domain, scope_similarity, maturity_data, key_findings, search_query, created_at FROM engagement_peer_benchmarks WHERE engagement_id = ? ORDER BY created_at DESC').all(String(req.params.id)));
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/engagements/:id/peer-benchmarks/:benchmarkId
  router.delete('/:id/peer-benchmarks/:benchmarkId', (req: Request, res: Response) => {
    try {
      db.prepare('DELETE FROM engagement_peer_benchmarks WHERE id = ? AND engagement_id = ?').run(String(req.params.benchmarkId), String(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Quality Gate ─────────────────────────────────────────────────────────────

  // POST /api/engagements/:id/quality-gate/run — SSE: run all quality checks
  router.post('/:id/quality-gate/run', async (req: Request, res: Response) => {
    try {
      const { iteration_id } = req.body;
      const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id)) as Record<string, unknown>;
      if (!engagement) return res.status(404).json({ error: 'Not found' });

      // Get the iteration to review (latest approved or specified)
      const iteration = iteration_id
        ? db.prepare('SELECT * FROM engagement_iterations WHERE id = ?').get(iteration_id) as Record<string, unknown>
        : db.prepare("SELECT * FROM engagement_iterations WHERE engagement_id = ? AND status IN ('approved','draft') ORDER BY iteration_number DESC LIMIT 1").get(String(req.params.id)) as Record<string, unknown>;

      if (!iteration) return res.status(400).json({ error: 'No iteration found to review' });

      const scope_items = db.prepare("SELECT * FROM engagement_scope_items WHERE engagement_id = ? AND status != 'removed'").all(String(req.params.id)) as Array<Record<string, unknown>>;
      const boundaries = db.prepare('SELECT * FROM engagement_boundaries WHERE engagement_id = ?').all(String(req.params.id)) as Array<Record<string, unknown>>;
      const deliverables = db.prepare('SELECT * FROM engagement_deliverables WHERE engagement_id = ?').all(String(req.params.id)) as Array<Record<string, unknown>>;
      const peer_benchmarks = db.prepare("SELECT * FROM engagement_peer_benchmarks WHERE engagement_id = ?").all(String(req.params.id)) as Array<Record<string, unknown>>;

      let qualityBlueprint: Record<string, unknown> = {};
      try { qualityBlueprint = JSON.parse(String(engagement.quality_blueprint || '{}')); } catch { /**/ }

      const outputContent = String(iteration.output_content || '');
      const scopeSummary = scope_items.map((si, i) => `${i + 1}. ${si.title}`).join('\n');
      const blueprintStr = JSON.stringify(qualityBlueprint, null, 2);
      const peersStr = peer_benchmarks.map(pb => `${pb.anonymized_label}: ${JSON.stringify(pb.maturity_data)}`).join('\n');

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const qgModel = mapModelToProvider('claude-haiku-4-5-20251001');

      const results: Record<string, unknown> = {};

      async function runCheck(checkId: string, label: string, prompt: string): Promise<Record<string, unknown>> {
        res.write(`data: ${JSON.stringify({ type: 'check_start', check: checkId, label })}\n\n`);
        const r = await callChat({
          model: qgModel,
          system: 'You are a quality assessment assistant. Return only valid JSON.',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 1024,
        });
        const raw = r.text || '{}';
        let parsed: Record<string, unknown> = {};
        try { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { raw }; } catch { parsed = { raw }; }
        res.write(`data: ${JSON.stringify({ type: 'check_done', check: checkId, label, result: parsed })}\n\n`);
        return parsed;
      }

      // 8A: Scope Completeness
      results['scope_completeness'] = await runCheck('8A', 'Scope Completeness', `
Assess whether the following deliverable addresses all confirmed scope items.
Scope items:\n${scopeSummary}
Deliverable:\n${outputContent.slice(0, 8000)}
Return JSON: { "score": 0-100, "addressed": ["item title"], "partial": ["item title"], "missing": ["item title"], "notes": "" }`);

      // 8B: Blueprint Alignment
      if (Object.keys(qualityBlueprint).length > 0) {
        results['blueprint_alignment'] = await runCheck('8B', 'Blueprint Alignment', `
Compare this deliverable against the Quality Blueprint.
Blueprint:\n${blueprintStr.slice(0, 2000)}
Deliverable:\n${outputContent.slice(0, 6000)}
Return JSON: { "score": 0-100, "structure_match": 0-100, "tone_match": 0-100, "citation_match": 0-100, "finding_format_match": 0-100, "deviations": ["deviation"], "notes": "" }`);
      } else {
        results['blueprint_alignment'] = { score: null, notes: 'No quality blueprint extracted — skip Phase 3a to enable this check.' };
        res.write(`data: ${JSON.stringify({ type: 'check_skip', check: '8B', label: 'Blueprint Alignment', reason: 'No blueprint' })}\n\n`);
      }

      // 8C: Cross-Consistency
      results['cross_consistency'] = await runCheck('8C', 'Cross-Workstream Consistency', `
Analyse this deliverable for internal consistency issues.
Deliverable:\n${outputContent.slice(0, 8000)}
Return JSON: { "score": 0-100, "severity_consistent": true/false, "terminology_consistent": true/false, "conflicts": ["description"], "notes": "" }`);

      // 8D: Assumptions & Limitations (generated from boundaries register)
      const assumptionsText = boundaries.length > 0
        ? boundaries.map(b => `[${b.boundary_type}] ${b.description}`).join('\n')
        : 'No formal assumptions or boundaries recorded.';
      results['assumptions_section'] = `# Assumptions and Limitations\n\n${boundaries.filter(b => b.boundary_type === 'assumption').map(b => `- ${b.description}`).join('\n') || 'None recorded.'}\n\n## Exclusions\n${boundaries.filter(b => b.boundary_type === 'exclusion').map(b => `- ${b.description}`).join('\n') || 'None recorded.'}\n\n## Limitations\n${boundaries.filter(b => b.boundary_type === 'limitation').map(b => `- ${b.description}`).join('\n') || 'None recorded.'}`;
      res.write(`data: ${JSON.stringify({ type: 'check_done', check: '8D', label: 'Assumptions & Limitations', result: { generated: true, boundary_count: boundaries.length } })}\n\n`);

      // 8E: Executive Summary
      res.write(`data: ${JSON.stringify({ type: 'check_start', check: '8E', label: 'Executive Summary' })}\n\n`);
      const execSummaryResult = await callChat({
        model: qgModel,
        system: 'You are a senior consulting analyst. Write professional executive summaries.',
        messages: [{ role: 'user', content: `Generate a concise executive summary for this consulting deliverable. Use a professional tone suitable for senior management.

Deliverable:\n${outputContent.slice(0, 10000)}
Deliverables expected:\n${deliverables.map(d => d.title).join(', ')}
${peer_benchmarks.length > 0 ? `\nPeer context available: ${peersStr.slice(0, 1000)}` : ''}

Write 3-4 paragraphs: context, key findings, main recommendations, and next steps. Start with the most important message.` }],
        maxTokens: 1500,
      });
      results['executive_summary'] = execSummaryResult.text;
      res.write(`data: ${JSON.stringify({ type: 'check_done', check: '8E', label: 'Executive Summary', result: { generated: true, length: String(results['executive_summary']).length } })}\n\n`);

      // 8F: Expert Panel Review (4 lenses)
      const expertLenses = [
        { id: 'devil_advocate', name: "Devil's Advocate", instruction: "Challenge the findings and assumptions. What would a critical reader dispute? What evidence is missing?" },
        { id: 'regulatory', name: 'Regulatory', instruction: "Check regulatory accuracy. Are citations correct? Is terminology precise? Are any requirements misstated or missing?" },
        { id: 'client_perspective', name: 'Client Perspective', instruction: "How will the client receive this? Are there surprises? Is the tone appropriate? Are recommendations actionable for the client's context?" },
        { id: 'pragmatist', name: 'Pragmatist', instruction: "Are recommendations implementable? Do they fit the client's likely capacity and resources? Is the timeline realistic?" },
      ];
      const expertResults: Record<string, unknown> = {};
      for (const lens of expertLenses) {
        res.write(`data: ${JSON.stringify({ type: 'check_start', check: `8F-${lens.id}`, label: `Expert: ${lens.name}` })}\n\n`);
        const r = await callChat({
          model: qgModel,
          system: `You are reviewing a consulting deliverable from the perspective of a ${lens.name}. Return only valid JSON.`,
          messages: [{ role: 'user', content: `${lens.instruction}\n\nDeliverable:\n${outputContent.slice(0, 5000)}\n\nReturn JSON: { "verdict": "positive|neutral|concerns", "key_points": ["point 1", "point 2"], "top_concern": "" }` }],
          maxTokens: 600,
        });
        const raw = r.text || '{}';
        try { const m = raw.match(/\{[\s\S]*\}/); expertResults[lens.id] = m ? JSON.parse(m[0]) : { raw }; } catch { expertResults[lens.id] = { raw }; }
        res.write(`data: ${JSON.stringify({ type: 'check_done', check: `8F-${lens.id}`, label: `Expert: ${lens.name}`, result: expertResults[lens.id] })}\n\n`);
      }
      results['expert_reviews'] = expertResults;

      // Calculate overall score
      const scores: number[] = [];
      if (typeof (results['scope_completeness'] as Record<string, unknown>)?.score === 'number') scores.push((results['scope_completeness'] as Record<string, unknown>).score as number);
      if (typeof (results['blueprint_alignment'] as Record<string, unknown>)?.score === 'number') scores.push((results['blueprint_alignment'] as Record<string, unknown>).score as number);
      if (typeof (results['cross_consistency'] as Record<string, unknown>)?.score === 'number') scores.push((results['cross_consistency'] as Record<string, unknown>).score as number);
      const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      const missing = (results['scope_completeness'] as Record<string, unknown>)?.missing as string[] || [];
      const conflicts = (results['cross_consistency'] as Record<string, unknown>)?.conflicts as string[] || [];
      const blockers = [...missing.map(m => `Missing scope: ${m}`), ...conflicts];
      const releaseReady = overallScore !== null && overallScore >= 80 && blockers.length === 0;

      // Save quality gate record
      const qgId = randomUUID();
      db.prepare(`INSERT INTO engagement_quality_gates (id, engagement_id, iteration_id, scope_completeness, blueprint_alignment, cross_consistency, assumptions_section, executive_summary, expert_reviews, overall_score, release_ready, blockers, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`).run(
        qgId, String(req.params.id), String(iteration.id),
        JSON.stringify(results['scope_completeness']),
        JSON.stringify(results['blueprint_alignment']),
        JSON.stringify(results['cross_consistency']),
        String(results['assumptions_section'] || ''),
        String(results['executive_summary'] || ''),
        JSON.stringify(results['expert_reviews']),
        overallScore, releaseReady ? 1 : 0,
        JSON.stringify(blockers)
      );
      db.prepare("UPDATE engagements SET status = 'quality_gate', updated_at = datetime('now') WHERE id = ?").run(String(req.params.id));
      logChange(String(req.params.id), 'quality_gate', 'quality_gate_run', `Quality gate completed. Score: ${overallScore?.toFixed(1) ?? 'N/A'}%`);

      res.write(`data: ${JSON.stringify({ type: 'done', quality_gate_id: qgId, overall_score: overallScore, release_ready: releaseReady, blockers })}\n\n`);
      res.end();
    } catch (e) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(e) })}\n\n`);
      res.end();
    }
  });

  // GET /api/engagements/:id/quality-gate/latest
  router.get('/:id/quality-gate/latest', (req: Request, res: Response) => {
    try {
      const qg = db.prepare('SELECT * FROM engagement_quality_gates WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1').get(String(req.params.id));
      res.json(qg || null);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Engagement Export ─────────────────────────────────────────────────────────

  // POST /api/engagements/:id/export — export engagement deliverable
  router.post('/:id/export', async (req: Request, res: Response) => {
    try {
      const { format = 'docx', iteration_id, include_executive_summary = true } = req.body;
      const engagement = db.prepare('SELECT * FROM engagements WHERE id = ?').get(String(req.params.id)) as Record<string, unknown>;
      if (!engagement) return res.status(404).json({ error: 'Not found' });

      // Get iteration content
      const iteration = iteration_id
        ? db.prepare('SELECT * FROM engagement_iterations WHERE id = ?').get(iteration_id) as Record<string, unknown>
        : db.prepare("SELECT * FROM engagement_iterations WHERE engagement_id = ? AND status IN ('approved','draft') ORDER BY iteration_number DESC LIMIT 1").get(String(req.params.id)) as Record<string, unknown>;

      if (!iteration || !iteration.output_content) return res.status(400).json({ error: 'No iteration content to export' });

      // Get quality gate for executive summary
      const qg = db.prepare('SELECT * FROM engagement_quality_gates WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 1').get(String(req.params.id)) as Record<string, unknown> | undefined;

      let fullContent = '';
      if (include_executive_summary && qg?.executive_summary) {
        fullContent += `# Executive Summary\n\n${qg.executive_summary}\n\n---\n\n`;
      }
      fullContent += String(iteration.output_content);
      if (qg?.assumptions_section) {
        fullContent += `\n\n---\n\n${qg.assumptions_section}`;
      }

      const title = String(engagement.title || 'Engagement Report');
      const client = String(engagement.client_name || '');
      const { generateDocx } = await import('../services/export-docx.js');
      const { generateXlsx } = await import('../services/export-xlsx.js');
      const { generatePdf }  = await import('../services/export-pdf.js');

      const timestamp = Date.now();
      let buffer: Buffer;
      let filename: string;
      let contentType: string;

      if (format === 'docx') {
        buffer = await generateDocx(fullContent, { title, author: String(engagement.your_organisation || 'ANTON'), subject: client });
        filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${timestamp}.docx`;
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (format === 'xlsx') {
        buffer = await generateXlsx(fullContent, { title, author: String(engagement.your_organisation || 'ANTON') });
        filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${timestamp}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (format === 'pdf') {
        buffer = await generatePdf(fullContent, { title, author: String(engagement.your_organisation || 'ANTON') });
        filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${timestamp}.pdf`;
        contentType = 'application/pdf';
      } else if (format === 'md') {
        const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        filename = `${safeTitle}_${timestamp}.md`;
        logChange(String(req.params.id), 'quality_gate', 'export_generated', 'Exported as MD');
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(fullContent);
      } else {
        return res.status(400).json({ error: 'Invalid format. Use docx, xlsx, pdf, or md' });
      }

      logChange(String(req.params.id), 'quality_gate', 'export_generated', `Exported as ${format.toUpperCase()}`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // ── Changelog ───────────────────────────────────────────────────────────────

  router.get('/:id/changelog', (req: Request, res: Response) => {
    try {
      const changes = db.prepare('SELECT * FROM engagement_changelog WHERE engagement_id = ? ORDER BY created_at DESC LIMIT 50').all(String(req.params.id));
      res.json(changes);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
