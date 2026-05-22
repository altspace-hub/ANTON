import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { streamToResponse, callSync, isApiKeyConfigured } from '../services/claude-client.js';
import { generatePptx, resolveBrand, type PresentationBrand } from '../services/export-pptx.js';
import { safeError } from '../lib/error-response.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './outputs');

function loadExpertPrompt(): string {
  try {
    return fs.readFileSync(path.join(__dirname, '../prompts/presentation-expert.md'), 'utf-8');
  } catch {
    return 'You are Maya, a visual communications expert. Ask targeted questions to understand the user\'s needs, then produce a structured presentation brief.';
  }
}

export async function createPresentationsRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  // POST /api/presentations/consult — streaming expert consultation turn
  router.post('/presentations/consult', async (req, res) => {
    if (!isApiKeyConfigured()) {
      res.status(500).json({ error: 'API key not configured.' });
      return;
    }

    const { messages } = req.body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!messages || messages.length === 0) {
      res.status(400).json({ error: 'messages is required' });
      return;
    }

    try {
      await streamToResponse(
        {
          model: 'claude-opus-4-7',
          thinking: 'think',
          system: loadExpertPrompt(),
          messages,
        },
        res
      );
    } catch (error) {
      const message = safeError(error);
      if (!res.headersSent) res.status(500).json({ error: message });
    }
  });

  // GET /api/presentations — list all presentations (most recent first)
  router.get('/presentations', async (_req, res) => {
    try {
      const rows = await db.all(
          `SELECT id, title, purpose, audience, style, slide_count, status, filename, created_at
           FROM presentations
           ORDER BY created_at DESC
           LIMIT 50`
        );
      res.json(rows);
    } catch {
      res.json([]);
    }
  });

  // POST /api/presentations — save a new presentation record
  router.post('/presentations', async (req, res) => {
    const { title, purpose, audience, style, slideCount, brief, conversation } = req.body as {
      title?: string;
      purpose?: string;
      audience?: string;
      style?: string;
      slideCount?: number;
      brief?: object;
      conversation?: object[];
    };

    const id = randomUUID();
    try {
      await db.run(
        `INSERT INTO presentations (id, title, purpose, audience, style, slide_count, brief, conversation, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW(), NOW())`
      , id,
        title || 'Untitled Presentation',
        purpose || '',
        audience || '',
        style || 'dark-professional',
        slideCount || 8,
        JSON.stringify(brief || {}),
        JSON.stringify(conversation || []));
      const row = await db.get('SELECT * FROM presentations WHERE id = ?', id);
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // PATCH /api/presentations/:id — update fields on an existing presentation
  router.patch('/presentations/:id', async (req, res) => {
    const { id } = req.params;
    const { title, purpose, audience, style, slideCount, brief, conversation, status, filePath, filename } =
      req.body as {
        title?: string;
        purpose?: string;
        audience?: string;
        style?: string;
        slideCount?: number;
        brief?: object;
        conversation?: object[];
        status?: string;
        filePath?: string;
        filename?: string;
      };

    try {
      await db.run(`UPDATE presentations SET
           title        = COALESCE(?, title),
           purpose      = COALESCE(?, purpose),
           audience     = COALESCE(?, audience),
           style        = COALESCE(?, style),
           slide_count  = COALESCE(?, slide_count),
           brief        = COALESCE(?, brief),
           conversation = COALESCE(?, conversation),
           status       = COALESCE(?, status),
           file_path    = COALESCE(?, file_path),
           filename     = COALESCE(?, filename),
           updated_at   = NOW()
         WHERE id = ?`
      , 
        title ?? null,
        purpose ?? null,
        audience ?? null,
        style ?? null,
        slideCount ?? null,
        brief ? JSON.stringify(brief) : null,
        conversation ? JSON.stringify(conversation) : null,
        status ?? null,
        filePath ?? null,
        filename ?? null,
        id
      );
      const row = await db.get('SELECT * FROM presentations WHERE id = ?', id);
      if (!row) { res.status(404).json({ error: 'Not found' }); return; }
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // DELETE /api/presentations/:id — delete record and file
  router.delete('/presentations/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const row = await db.get('SELECT file_path FROM presentations WHERE id = ?', id) as { file_path?: string } | undefined;

      if (row?.file_path) {
        try { fs.removeSync(row.file_path); } catch { /* non-fatal */ }
      }

      await db.run('DELETE FROM presentations WHERE id = ?', id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/presentations/generate — generate .pptx from a brief (direct, no script execution)
  router.post('/presentations/generate', async (req, res) => {
    if (!isApiKeyConfigured()) {
      res.status(500).json({ error: 'API key not configured.' });
      return;
    }

    const { id, brief } = req.body as {
      id?: string;
      brief: {
        title: string;
        purpose: string;
        audience: string;
        coreMessage: string;
        keyMessages: string[];
        tone: string;
        style: string;
        slideCount: number;
        timeMinutes: number;
        specificContent?: string;
        suggestedStructure: Array<{ slideNum: number; type: string; title: string; notes: string }>;
      };
    };

    if (!brief) {
      res.status(400).json({ error: 'brief is required' });
      return;
    }

    if (id) {
      try {
        await db.run(`UPDATE presentations SET status = 'generating', updated_at = NOW() WHERE id = ?`, id);
      } catch { /* non-fatal */ }
    }

    try {
      const structureGuide = brief.suggestedStructure
        .map((s) => `Slide ${s.slideNum} (${s.type}): ${s.title} — ${s.notes}`)
        .join('\n');

      const userPrompt = `Create a ${brief.slideCount}-slide presentation with the following brief:

Title: ${brief.title}
Purpose: ${brief.purpose}
Audience: ${brief.audience}
Core message: ${brief.coreMessage}
Key messages:
${brief.keyMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}
Tone: ${brief.tone}
Style: ${brief.style}
Duration: ${brief.timeMinutes} minutes
${brief.specificContent ? `Specific content: ${brief.specificContent}` : ''}

Suggested slide structure:
${structureGuide}

Generate the full slide content now.`;

      const systemPrompt = `You are a professional presentation writer. Generate slide content in this EXACT format — output ONLY the slide blocks, no other text.

AVAILABLE SLIDE TYPES — use ALL of them to create visual variety:

## SLIDE 1: Opening Title
Type: title
Title: The presentation title here
Subtitle: Subtitle, date, or context line

## SLIDE 2: Agenda / Contents
Type: agenda
Body:
- First section
- Second section
- Third section

## SLIDE N: Standard Content
Type: content
Title: Slide Title
Body:
- Key point one — with enough detail to be meaningful
- Key point two
- Key point three

## SLIDE N: Section Divider
Type: section-divider
Title: Section Name
Subtitle: Optional one-line context

## SLIDE N: Key Metrics / KPIs  ← USE whenever there are numbers to show
Type: stats
Title: At a Glance
Body:
- 87% | Customer Satisfaction
- £2.4M | Annual Savings
- 14 | Regulatory Requirements
- Q3 2026 | Target Completion

## SLIDE N: Priority List / Steps  ← USE for ordered actions, processes, next steps
Type: numbered-cards
Title: Priority Actions
Body:
- First action item — with owner or context
- Second action item — with deadline
- Third action item — with expected outcome

## SLIDE N: Key Message / Finding  ← USE for the single most important takeaway per section
Type: callout
Title: Critical Finding
Body:
- The main highlighted message displayed prominently
- Supporting context point one
- Supporting context point two

## SLIDE N: Categorised List with Icons  ← USE when items have different types/categories
Type: icon-list
Title: Key Risks Identified
Body:
- ⚠️ High risk item with context
- 🔴 Critical issue requiring action
- ✅ Completed or resolved item
- 📋 Process or compliance item
- 🎯 Strategic priority

## SLIDE N: Side-by-Side Comparison  ← USE for before/after, pros/cons, current vs future
Type: two-column
Title: Slide Title
Subtitle: Current State | Target State
Left:
- Left column point 1
- Left column point 2
Right:
- Right column point 1
- Right column point 2

## SLIDE N: Structured Data Table
Type: table
Title: Slide Title
Headers: Column 1 | Column 2 | Status
Row: Item A | Description | GREEN
Row: Item B | Description | AMBER
Row: Item C | Description | RED

## SLIDE N: Impactful Quote
Type: quote
Title: Slide Title
Subtitle: Speaker Name / Source
Body:
- The full quote text goes here as a single item

FORMATTING RULES:
- Always start with a title slide, end with a closing/summary slide
- Use section-divider to separate major sections of the presentation
- Maximum 6 bullet points per content/icon-list slide
- Maximum 6 stats per stats slide (use 2-4 for best visual impact)
- For stats: format as "value | label" where value is the big number/text
- For two-column: put column labels in Subtitle as "Left Label | Right Label"
- Use RAG (RED/AMBER/GREEN) in table status columns for visual impact
- Make all content specific and relevant — no generic filler text
- VARY slide types throughout: avoid using content type for every slide
- Use callout at least once per major section for the key takeaway
- Use numbered-cards for any list of 3-6 ordered actions or steps`;



      const result = await callSync({
        model: 'claude-opus-4-7',
        thinking: 'think',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Read brand settings from the user profile (graceful fallback to defaults)
      const profileRow = await db.get('SELECT organisation, brand_config FROM user_profiles WHERE id = ?', 'default') as { organisation: string | null; brand_config: string | null } | undefined;

      const brandOverride: Partial<PresentationBrand> = {};
      if (profileRow?.organisation?.trim()) {
        brandOverride.companyName = profileRow.organisation.trim();
      }
      if (profileRow?.brand_config) {
        try {
          const bc = JSON.parse(profileRow.brand_config) as {
            fonts?: { body?: { family?: string } };
            palette?: string[];
          };
          if (bc.fonts?.body?.family?.trim()) brandOverride.fontFamily = bc.fonts.body.family.trim();
          if (bc.palette?.length) {
            const clean = bc.palette.map((h: string) => h.replace(/^#/, '')).filter(Boolean);
            if (clean[0]) brandOverride.accentColor    = clean[0];
            if (clean[1]) brandOverride.secondaryColor = clean[1];
            if (clean.length >= 2) brandOverride.chartColors = clean;
          }
        } catch { /* non-fatal — fall through to defaults */ }
      }
      const brand = resolveBrand(brandOverride);

      const pptxBuffer = await generatePptx(result.text, {
        title: brief.title,
        author: brand.companyName,
      }, brand);

      const pptxId = randomUUID();
      const filename = `presentation_${pptxId}.pptx`;
      const filePath = path.join(OUTPUT_DIR, filename);
      await fs.outputFile(filePath, pptxBuffer);

      if (id) {
        await db.run(
          `UPDATE presentations SET status = 'ready', file_path = ?, filename = ?, updated_at = NOW() WHERE id = ?`
        , filePath, filename, id);
      }

      res.json({ success: true, filename, filePath });
    } catch (error) {
      if (id) {
        try {
          await db.run(`UPDATE presentations SET status = 'failed', updated_at = NOW() WHERE id = ?`, id);
        } catch { /* non-fatal */ }
      }
      res.status(500).json({ error: safeError(error) });
    }
  });

  // GET /api/presentations/download/:filename — serve the generated .pptx
  router.get('/presentations/download/:filename', async (req, res) => {
    const { filename } = req.params;
    // Security: only allow safe filenames
    if (!/^[\w\-]+\.pptx$/.test(filename)) {
      res.status(400).json({ error: 'Invalid filename' });
      return;
    }
    const filePath = path.join(OUTPUT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.download(filePath, filename);
  });

  return router;
}
