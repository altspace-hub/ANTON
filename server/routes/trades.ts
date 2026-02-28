/**
 * trades.ts — "My Way of Working" API routes
 *
 * GET  /api/trades/setup-status       — check if identity + at least one template are set up
 * GET  /api/trades/identity            — get business identity profile
 * PUT  /api/trades/identity            — save/update business identity
 * GET  /api/trades/templates           — list document templates
 * GET  /api/trades/templates/:id       — get single document template
 * PUT  /api/trades/templates/:id       — upsert a template
 * DELETE /api/trades/templates/:id     — delete a template
 * POST /api/trades/templates/extract   — extract template from uploaded example (via Claude)
 * POST /api/trades/identity/extract    — extract business identity from uploaded doc (via Claude)
 * GET  /api/trades/patterns            — list process patterns
 * GET  /api/trades/patterns/:id        — get single pattern
 * PUT  /api/trades/patterns/:id        — upsert a pattern
 * DELETE /api/trades/patterns/:id      — delete a pattern
 * POST /api/trades/templates/:id/set-default — mark template as default for its document type
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import { isApiKeyConfigured, getClient } from '../services/claude-client.js';
import { safeError } from '../lib/error-response.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 20 * 1024 * 1024 } });

export function createTradesRoutes(db: Database.Database) {
  const router = Router();

  // ── Setup status ──────────────────────────────────────────────────────────

  router.get('/trades/setup-status', (req, res) => {
    try {
      const identity = db.prepare('SELECT id FROM business_identity WHERE id = ?').get('default') as { id: string } | undefined;
      const templateCount = (db.prepare('SELECT COUNT(*) as c FROM document_templates').get() as { c: number }).c;
      const patternCount = (db.prepare('SELECT COUNT(*) as c FROM process_patterns').get() as { c: number }).c;

      res.json({
        hasIdentity: !!identity,
        templateCount,
        patternCount,
        setupComplete: !!identity && templateCount > 0,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Business Identity ─────────────────────────────────────────────────────

  router.get('/trades/identity', (req, res) => {
    try {
      const row = db.prepare('SELECT profile_data, created_at, updated_at FROM business_identity WHERE id = ?').get('default') as
        | { profile_data: string; created_at: string; updated_at: string }
        | undefined;

      if (!row) {
        res.json(null);
        return;
      }

      let profile: unknown = {};
      try { profile = JSON.parse(row.profile_data); } catch { /* keep empty */ }
      res.json({ profile, createdAt: row.created_at, updatedAt: row.updated_at });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/trades/identity', (req, res) => {
    try {
      const profile = req.body;
      if (!profile || typeof profile !== 'object') {
        res.status(400).json({ error: 'profile body is required' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO business_identity (id, profile_data, created_at, updated_at)
        VALUES ('default', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET profile_data = excluded.profile_data, updated_at = excluded.updated_at
      `).run(JSON.stringify(profile), now, now);

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Identity extraction via Claude ───────────────────────────────────────
  // POST /api/trades/identity/extract
  // Accepts: multipart 'file' field OR JSON body with { text: string }
  // Returns extracted business identity fields for pre-filling the form.

  router.post('/trades/identity/extract', upload.single('file'), async (req, res) => {
    if (!isApiKeyConfigured()) {
      res.status(503).json({ error: 'API key not configured' });
      return;
    }

    let filePath: string | undefined;
    try {
      let sourceText = '';

      if (req.file) {
        filePath = req.file.path;
        try {
          const { extractTextFromFile } = await import('../services/text-extractor.js');
          sourceText = ((await extractTextFromFile(filePath)) ?? '').slice(0, 15000);
        } catch {
          // Fallback for plain-text files when extractor fails
          sourceText = (await fs.readFile(filePath, 'utf-8').catch(() => '')).slice(0, 15000);
        }
      } else if (req.body?.text) {
        sourceText = (req.body.text as string).slice(0, 15000);
      } else {
        res.status(400).json({ error: 'Provide a file upload or text body' });
        return;
      }

      if (!sourceText.trim()) {
        res.status(422).json({ error: 'Could not extract readable text from this file. Try pasting the text instead.' });
        return;
      }

      const systemPrompt = `You are a business identity extractor. You read documents from tradespeople — invoices, quotes, letterheads, emails, business cards — and extract structured business identity information.

Extract ONLY information you can clearly read in the document. Use null for any field not found. Do not guess or invent.

Always respond with valid JSON only — no markdown fences, no prose, no explanation outside the JSON.`;

      const userMessage = `Extract the business identity information from this document:

---
${sourceText}
---

Return a JSON object with this structure (use null for fields not found):
{
  "businessName": "company or trading name",
  "ownerName": "owner or contact person's name",
  "tradeType": "type of trade or service (e.g. Plumbing, Electrical, Painting, Carpentry)",
  "country": "2-letter country code if determinable (SE, NO, FI, GB, AU, US etc.) or null",
  "phone": "phone number as written",
  "email": "email address",
  "address": "full postal address",
  "hourlyRate": null,
  "travelRate": null,
  "currency": "currency code e.g. SEK, EUR, GBP, USD, NOK, AUD — infer from symbols if code not stated",
  "defaultPaymentTerms": null,
  "vatRegistered": null,
  "vatNumber": "VAT, moms, or org number if present",
  "invoicePrefix": "invoice number prefix if visible (e.g. INV-, FAK-, 2024-)",
  "latePaymentText": "any late payment or interest clause verbatim",
  "paymentDetails": "bank, IBAN, Bankgiro, sort code, BSB, or payment account details as written",
  "confidence": "high / medium / low",
  "foundFields": ["array of field names that were actually found — omit null fields"],
  "notes": "any observations or fields the user should double-check"
}

For numeric fields (hourlyRate, travelRate, defaultPaymentTerms): return the number only if clearly stated, otherwise null.
For vatRegistered: return true if VAT number or moms reg is present, false if explicitly unregistered, null if unknown.`;

      const client = getClient();
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      res.json(extracted);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    } finally {
      if (filePath) fs.unlink(filePath).catch(() => {});
    }
  });

  // ── Document Templates ────────────────────────────────────────────────────

  router.get('/trades/templates', (req, res) => {
    try {
      const rows = db.prepare('SELECT id, document_type, name, is_default, created_at, updated_at FROM document_templates ORDER BY document_type, name').all() as
        Array<{ id: string; document_type: string; name: string; is_default: number; created_at: string; updated_at: string }>;

      res.json(rows.map(r => ({ ...r, isDefault: !!r.is_default })));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/trades/templates/:id', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id) as
        | { id: string; document_type: string; name: string; template_data: string; is_default: number; source_examples: string; created_at: string; updated_at: string }
        | undefined;

      if (!row) { res.status(404).json({ error: 'Template not found' }); return; }

      let templateData: unknown = {};
      let sourceExamples: unknown[] = [];
      try { templateData = JSON.parse(row.template_data); } catch { /* keep */ }
      try { sourceExamples = JSON.parse(row.source_examples); } catch { /* keep */ }

      res.json({ ...row, templateData, sourceExamples, isDefault: !!row.is_default });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/trades/templates/:id', (req, res) => {
    try {
      const { documentType, name, templateData, isDefault, sourceExamples } = req.body;
      if (!documentType || !name) {
        res.status(400).json({ error: 'documentType and name are required' });
        return;
      }

      const id = req.params.id === 'new' ? randomUUID() : req.params.id;
      const now = new Date().toISOString();

      // If setting as default, clear existing default for this type first
      if (isDefault) {
        db.prepare("UPDATE document_templates SET is_default = 0 WHERE document_type = ?").run(documentType);
      }

      db.prepare(`
        INSERT INTO document_templates (id, document_type, name, template_data, is_default, source_examples, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          document_type = excluded.document_type,
          name = excluded.name,
          template_data = excluded.template_data,
          is_default = excluded.is_default,
          source_examples = excluded.source_examples,
          updated_at = excluded.updated_at
      `).run(
        id,
        documentType,
        name,
        JSON.stringify(templateData || {}),
        isDefault ? 1 : 0,
        JSON.stringify(sourceExamples || []),
        now,
        now
      );

      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/trades/templates/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM document_templates WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/trades/templates/:id/set-default', (req, res) => {
    try {
      const row = db.prepare('SELECT id, document_type FROM document_templates WHERE id = ?').get(req.params.id) as
        | { id: string; document_type: string } | undefined;
      if (!row) { res.status(404).json({ error: 'Template not found' }); return; }
      db.prepare('UPDATE document_templates SET is_default = 0 WHERE document_type = ?').run(row.document_type);
      db.prepare('UPDATE document_templates SET is_default = 1 WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Template extraction via Claude ────────────────────────────────────────
  // POST /api/trades/templates/extract
  // Accepts: multipart with 'file' field OR JSON body with { text: string, documentType: string }

  router.post('/trades/templates/extract', upload.single('file'), async (req, res) => {
    if (!isApiKeyConfigured()) {
      res.status(503).json({ error: 'API key not configured' });
      return;
    }

    try {
      const documentType = (req.body?.documentType || 'invoice') as string;
      let exampleText = '';

      if (req.file) {
        // Read the uploaded file as text
        try {
          const fileContent = await fs.readFile(req.file.path, 'utf-8');
          exampleText = fileContent.slice(0, 10000); // cap at 10k chars
        } catch {
          // File might be binary (PDF/image) — use placeholder
          exampleText = `[File uploaded: ${req.file.originalname}. File type may not be readable as plain text.]`;
        }
      } else if (req.body?.text) {
        exampleText = (req.body.text as string).slice(0, 10000);
      } else {
        res.status(400).json({ error: 'Provide either a file upload or text body' });
        return;
      }

      const systemPrompt = `You are a document template extractor. You analyze example business documents from tradespeople and extract their structure, vocabulary, and formatting patterns.

Extract ONLY what you can observe in the example. Do not add fields that are not present.

Always respond with valid JSON only — no markdown, no prose, no code fences.`;

      const userMessage = `Analyze this example ${documentType} from a tradesperson and extract their template:

---
${exampleText}
---

Return a JSON object with this structure:
{
  "documentType": "${documentType}",
  "extractedAt": "ISO timestamp",
  "structure": {
    "sections": [
      {"id": "header", "label": "what user calls it or blank", "position": 0, "content": "template description"},
      ...
    ]
  },
  "vocabulary": {
    "documentTitle": "what they call this document (e.g. Faktura, Invoice)",
    "labourLabel": "what they call labour/work (e.g. Arbete, Labour)",
    "materialsLabel": "what they call materials (e.g. Material, Parts)",
    "travelLabel": "what they call travel if present",
    "vatLabel": "how they show VAT",
    "totalLabel": "how they show the total (e.g. Att betala, Total)",
    "dueLabel": "how they show due date"
  },
  "formatting": {
    "currencyFormat": "e.g. 1 234,50 kr or SEK 1234.50",
    "dateFormat": "e.g. YYYY-MM-DD or DD MMM YYYY",
    "lineItemStyle": "grouped or mixed",
    "showHourlyRate": true/false,
    "showTravelSeparately": true/false,
    "includeVatBreakdown": true/false
  },
  "tone": {
    "formality": "casual / warm-professional / formal",
    "signOff": "how they sign off if present",
    "greeting": "how they greet if present"
  },
  "businessRules": [
    "Any specific rules observed, e.g. 'Rounds to nearest 10 SEK', '2 year warranty statement at bottom'"
  ],
  "confidence": "high / medium / low",
  "notes": "any observations or things the user should confirm"
}`;

      const client = getClient();
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      // Log to pattern_learning_log
      db.prepare(`
        INSERT INTO pattern_learning_log (source_type, source_ref, patterns_extracted, user_confirmed)
        VALUES (?, ?, ?, 0)
      `).run(
        req.file ? 'uploaded_example' : 'pasted_text',
        req.file?.originalname || 'pasted',
        JSON.stringify(extracted)
      );

      // Clean up temp file
      if (req.file) {
        fs.unlink(req.file.path).catch(() => { /* non-fatal */ });
      }

      res.json(extracted);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Process Patterns ──────────────────────────────────────────────────────

  router.get('/trades/patterns', (req, res) => {
    try {
      const rows = db.prepare('SELECT id, process_type, name, pattern_data, created_at, updated_at FROM process_patterns ORDER BY process_type, name').all() as
        Array<{ id: string; process_type: string; name: string; pattern_data: string; created_at: string; updated_at: string }>;

      res.json(rows.map(r => {
        let patternData: Record<string, string> = {};
        try { patternData = JSON.parse(r.pattern_data) as Record<string, string>; } catch { /* keep empty */ }
        return { ...r, pattern_data: patternData };
      }));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/trades/patterns/:id', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM process_patterns WHERE id = ?').get(req.params.id) as
        | { id: string; process_type: string; name: string; pattern_data: string; created_at: string; updated_at: string }
        | undefined;

      if (!row) { res.status(404).json({ error: 'Pattern not found' }); return; }

      let patternData: unknown = {};
      try { patternData = JSON.parse(row.pattern_data); } catch { /* keep */ }

      res.json({ ...row, patternData });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/trades/patterns/:id', (req, res) => {
    try {
      const { processType, name, patternData } = req.body;
      if (!processType || !name) {
        res.status(400).json({ error: 'processType and name are required' });
        return;
      }

      const id = req.params.id === 'new' ? randomUUID() : req.params.id;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO process_patterns (id, process_type, name, pattern_data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          process_type = excluded.process_type,
          name = excluded.name,
          pattern_data = excluded.pattern_data,
          updated_at = excluded.updated_at
      `).run(id, processType, name, JSON.stringify(patternData || {}), now, now);

      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/trades/patterns/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM process_patterns WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
