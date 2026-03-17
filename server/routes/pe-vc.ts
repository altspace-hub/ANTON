/**
 * pe-vc.ts — PE/VC "My Way of Working" API routes
 *
 * GET  /api/pe-vc/setup-status         — check if fund identity + at least one IC memo template are set up
 * GET  /api/pe-vc/identity             — get fund identity profile
 * PUT  /api/pe-vc/identity             — save/update fund identity
 * POST /api/pe-vc/identity/extract     — upload IC memo PDF/DOCX → Claude extracts fund metadata
 * GET  /api/pe-vc/templates            — list ic_memo_templates
 * GET  /api/pe-vc/templates/:id        — get single template
 * PUT  /api/pe-vc/templates/:id        — upsert a template (use id='new' to create)
 * DELETE /api/pe-vc/templates/:id      — delete a template
 * POST /api/pe-vc/templates/:id/set-default — mark template as default for its memo_type
 * POST /api/pe-vc/templates/extract    — POST { text, memoType } → Claude learns section structure
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { isApiKeyConfigured, getClient } from '../services/claude-client.js';
import { safeError } from '../lib/error-response.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 20 * 1024 * 1024 } });

export async function createPEVCRoutes(db: DatabaseAdapter) {
  const router = Router();

  // ── Setup status ───────────────────────────────────────────────────────────

  router.get('/pe-vc/setup-status', async (req, res) => {
    try {
      const identity = await db.get('SELECT id FROM fund_identity WHERE id = ?', 'default') as { id: string } | undefined;
      const templateCount = (await db.get('SELECT COUNT(*) as c FROM ic_memo_templates') as { c: number }).c;

      res.json({
        hasIdentity: !!identity,
        templateCount,
        setupComplete: !!identity && templateCount > 0,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Fund Identity ──────────────────────────────────────────────────────────

  router.get('/pe-vc/identity', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM fund_identity WHERE id = ?', 'default') as
        | Record<string, unknown>
        | undefined;

      if (!row) { res.json(null); return; }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/pe-vc/identity', async (req, res) => {
    try {
      const {
        fund_name, fund_type, geography_focus, sector_focus,
        typical_check_size, investment_style_notes, partner_name,
        firm_website, currency,
      } = req.body as Record<string, string | undefined>;

      const now = new Date().toISOString();
      await db.run(`
        INSERT INTO fund_identity
          (id, fund_name, fund_type, geography_focus, sector_focus,
           typical_check_size, investment_style_notes, partner_name,
           firm_website, currency, created_at, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          fund_name = excluded.fund_name,
          fund_type = excluded.fund_type,
          geography_focus = excluded.geography_focus,
          sector_focus = excluded.sector_focus,
          typical_check_size = excluded.typical_check_size,
          investment_style_notes = excluded.investment_style_notes,
          partner_name = excluded.partner_name,
          firm_website = excluded.firm_website,
          currency = excluded.currency,
          updated_at = excluded.updated_at
      `,
        fund_name || null, fund_type || null, geography_focus || null, sector_focus || null,
        typical_check_size || null, investment_style_notes || null, partner_name || null,
        firm_website || null, currency || 'EUR', now, now
      );

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Fund identity extraction via Claude ────────────────────────────────────
  // POST /api/pe-vc/identity/extract
  // Accepts: multipart 'file' field OR JSON body with { text: string }

  router.post('/pe-vc/identity/extract', upload.single('file'), async (req, res) => {
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

      const systemPrompt = `You are a PE/VC fund identity extractor. You read investment documents — IC memos, quarterly reports, LP letters, pitch decks — and extract structured information about the fund.

Extract ONLY information clearly present in the document. Use null for any field not found. Do not guess or invent.

Always respond with valid JSON only — no markdown fences, no prose, no explanation outside the JSON.`;

      const userMessage = `Extract the fund identity information from this document:

---
${sourceText}
---

Return a JSON object with this structure (use null for fields not found):
{
  "fund_name": "name of the fund or firm",
  "fund_type": "one of: VC Early, VC Growth, PE Growth, PE Buyout, PE Turnaround, Multi-strategy, or describe if other",
  "geography_focus": "geographic focus e.g. Nordics, DACH, Pan-European, Global",
  "sector_focus": "primary sectors e.g. SaaS, Deep Tech, Healthcare, B2B Software",
  "typical_check_size": "typical investment size e.g. €2-10M, €50-200M",
  "investment_style_notes": "any observed investment style, thesis, or preferences",
  "partner_name": "name of the lead partner or firm contact if present",
  "firm_website": "website URL if present",
  "currency": "primary currency code: EUR, USD, GBP, SEK, NOK, DKK etc.",
  "confidence": "high / medium / low",
  "notes": "any observations or fields the user should double-check"
}`;

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

  // ── IC Memo Templates ──────────────────────────────────────────────────────

  router.get('/pe-vc/templates', async (req, res) => {
    try {
      const rows = await db.all(
        'SELECT id, name, memo_type, is_default, created_at, updated_at FROM ic_memo_templates ORDER BY memo_type, name'
      ) as Array<{ id: string; name: string; memo_type: string; is_default: number; created_at: string; updated_at: string }>;

      res.json(rows.map(r => ({ ...r, isDefault: !!r.is_default })));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/pe-vc/templates/:id', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM ic_memo_templates WHERE id = ?', req.params.id) as {
        id: string; name: string; memo_type: string; template_content: string; section_order: string; style_notes: string; is_default: number; created_at: string; updated_at: string }
        | undefined;

      if (!row) { res.status(404).json({ error: 'Template not found' }); return; }

      let sectionOrder: unknown[] = [];
      try { sectionOrder = JSON.parse(row.section_order); } catch { /* keep empty */ }

      res.json({ ...row, sectionOrder, isDefault: !!row.is_default });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/pe-vc/templates/:id', async (req, res) => {
    try {
      const { name, memoType, templateContent, sectionOrder, styleNotes, isDefault } = req.body as {
        name?: string; memoType?: string; templateContent?: string;
        sectionOrder?: unknown[]; styleNotes?: string; isDefault?: boolean;
      };

      if (!name || !memoType) {
        res.status(400).json({ error: 'name and memoType are required' });
        return;
      }

      const id = req.params.id === 'new' ? randomUUID() : req.params.id;
      const now = new Date().toISOString();

      if (isDefault) {
        await db.run('UPDATE ic_memo_templates SET is_default = 0 WHERE memo_type = ?', memoType);
      }

      await db.run(`
        INSERT INTO ic_memo_templates
          (id, name, memo_type, template_content, section_order, style_notes, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          memo_type = excluded.memo_type,
          template_content = excluded.template_content,
          section_order = excluded.section_order,
          style_notes = excluded.style_notes,
          is_default = excluded.is_default,
          updated_at = excluded.updated_at
      `, 
        id, name, memoType,
        templateContent || '',
        JSON.stringify(sectionOrder || []),
        styleNotes || '',
        isDefault ? 1 : 0,
        now, now
      );

      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/pe-vc/templates/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM ic_memo_templates WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/pe-vc/templates/:id/set-default', async (req, res) => {
    try {
      const row = await db.get('SELECT id, memo_type FROM ic_memo_templates WHERE id = ?', req.params.id) as
        | { id: string; memo_type: string } | undefined;
      if (!row) { res.status(404).json({ error: 'Template not found' }); return; }
      await db.run('UPDATE ic_memo_templates SET is_default = 0 WHERE memo_type = ?', row.memo_type);
      await db.run('UPDATE ic_memo_templates SET is_default = 1 WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── IC Memo template extraction via Claude ─────────────────────────────────
  // POST /api/pe-vc/templates/extract
  // Accepts: multipart 'file' field OR JSON body with { text: string, memoType: string }

  router.post('/pe-vc/templates/extract', upload.single('file'), async (req, res) => {
    if (!isApiKeyConfigured()) {
      res.status(503).json({ error: 'API key not configured' });
      return;
    }

    let filePath: string | undefined;
    try {
      const memoType = (req.body?.memoType || 'full-ic-memo') as string;
      let exampleText = '';

      if (req.file) {
        filePath = req.file.path;
        try {
          const { extractTextFromFile } = await import('../services/text-extractor.js');
          exampleText = ((await extractTextFromFile(filePath)) ?? '').slice(0, 12000);
        } catch {
          exampleText = (await fs.readFile(filePath, 'utf-8').catch(() => '')).slice(0, 12000);
        }
      } else if (req.body?.text) {
        exampleText = (req.body.text as string).slice(0, 12000);
      } else {
        res.status(400).json({ error: 'Provide a file upload or text body' });
        return;
      }

      if (!exampleText.trim()) {
        res.status(422).json({ error: 'Could not extract readable text. Try pasting the text instead.' });
        return;
      }

      const systemPrompt = `You are an IC memo structure extractor for PE/VC professionals. You analyse example investment committee memos and extract their structure, section order, and stylistic patterns so that future memos can follow the same format exactly.

Extract ONLY what you can observe. Do not invent sections that aren't present.

Always respond with valid JSON only — no markdown fences, no prose, no explanation outside the JSON.`;

      const userMessage = `Analyse this ${memoType} IC memo example and extract its template structure:

---
${exampleText}
---

Return a JSON object with this structure:
{
  "memoType": "${memoType}",
  "extractedAt": "${new Date().toISOString()}",
  "sections": [
    {
      "id": "short-id",
      "label": "Section heading as it appears in the memo",
      "position": 0,
      "description": "What this section covers and how it is typically written",
      "requiredContent": ["bullet 1 of what must be included", "bullet 2"],
      "typicalLength": "e.g. 1 paragraph, 1-2 pages, bullet list"
    }
  ],
  "sectionOrder": ["list of section IDs in the order they appear"],
  "style": {
    "formality": "formal / semi-formal / analytical",
    "perspective": "first-person / third-person / neutral",
    "tone": "observations about the writing style",
    "recommendation_placement": "beginning / end / separate section",
    "uses_exhibits": true,
    "uses_financial_tables": true
  },
  "decisionFramework": {
    "how_risks_presented": "e.g. separate section, inline, appendix",
    "how_recommendation_framed": "e.g. clear Invest/Pass, conditional, vote requested",
    "key_metrics_highlighted": ["IRR", "MOIC", "EV/EBITDA", "..."]
  },
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

      res.json(extracted);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    } finally {
      if (filePath) fs.unlink(filePath).catch(() => {});
    }
  });

  return router;
}
