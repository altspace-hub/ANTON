import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { callChat, streamChat, setSSEHeaders } from '../services/provider-router.js';
import { generatePptx, resolveBrand, type PresentationBrand } from '../services/export-pptx.js';
import { safeError } from '../lib/error-response.js';
import { assertOwned, ownerFilter, scopesToOwner } from '../middleware/ownership.js';
import { loadLayer0Profile, INSTANCE_PROFILE_ID } from './profile.js';

// ── Ownership (H9, team-server readiness 2026-09-23) ────────────────────────
// A presentation had no owner at all: the list returned every person's decks
// with their file names, a file name was all the download route asked for, and
// PATCH / DELETE / generate worked on any id. Migration 285 adds
// presentations.user_id; new rows record the creator and every route below is
// scoped with ownership.ts — solo mode and admins see everything, a team-mode
// user sees their own rows, and a row they may not see answers 404 like a
// missing one. Rows written before 285 have no owner: admins only in team mode.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || './outputs');

/** True when `p` resolves to a file inside OUTPUT_DIR (not the directory itself). */
function isInsideOutputDir(p: string): boolean {
  const rel = path.relative(OUTPUT_DIR, path.resolve(p));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

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
    const { messages } = req.body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!messages || messages.length === 0) {
      res.status(400).json({ error: 'messages is required' });
      return;
    }

    // Large tier of the Settings default, streamed through the router. The page
    // reads `text_delta` frames and stops at [DONE]; the router writes only the
    // deltas, so this handler owns the headers and the terminator.
    try {
      setSSEHeaders(res);
      await streamChat(
        {
          tier: 'large',
          thinkingLevel: 'think',
          system: loadExpertPrompt(),
          messages,
          maxTokens: 16000,
          db,
        },
        res
      );
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const message = safeError(error);
      console.warn(`[presentations] purpose=presentation-consult failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  });

  // GET /api/presentations — the caller's presentations (most recent first)
  router.get('/presentations', async (req, res) => {
    try {
      const scope = ownerFilter(req, 'user_id');
      const rows = await db.all(
          `SELECT id, title, purpose, audience, style, slide_count, status, filename, created_at
           FROM presentations
           WHERE 1=1${scope.sql}
           ORDER BY created_at DESC
           LIMIT 50`
        , ...scope.params);
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
        `INSERT INTO presentations (id, user_id, title, purpose, audience, style, slide_count, brief, conversation, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NOW(), NOW())`
      , id,
        req.user?.id ?? null,
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
      if (!(await assertOwned(db, req, res, { table: 'presentations', ownerColumn: 'user_id', id }))) return;
      // The deck's file is named by /generate, not by the client. A team-mode user
      // who could write `filename` could point their own row at someone else's deck
      // and download it through their own row; `filePath` names what DELETE removes.
      if (scopesToOwner(req) && (filePath !== undefined || filename !== undefined)) {
        res.status(400).json({ error: 'filePath and filename are set by generation' });
        return;
      }
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
      if (!(await assertOwned(db, req, res, { table: 'presentations', ownerColumn: 'user_id', id }))) return;
      const row = await db.get('SELECT file_path FROM presentations WHERE id = ?', id) as { file_path?: string } | undefined;

      // Only ever a file inside OUTPUT_DIR: file_path is client-writable through
      // PATCH (for solo and admins), and removeSync would otherwise delete any path.
      if (row?.file_path && isInsideOutputDir(row.file_path)) {
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
      // The row this deck is filed under must be the caller's — generation writes
      // its status, file_path and filename.
      try {
        if (!(await assertOwned(db, req, res, { table: 'presentations', ownerColumn: 'user_id', id }))) return;
      } catch (error) {
        res.status(500).json({ error: safeError(error) });
        return;
      }
      try {
        await db.run(`UPDATE presentations SET status = 'generating', updated_at = NOW() WHERE id = ?`, id);
      } catch { /* non-fatal */ }
    } else if (scopesToOwner(req)) {
      // A team-mode download is reached through the caller's own row (below), so a
      // deck generated without one could never be downloaded. Save it first.
      res.status(400).json({ error: 'id is required — save the presentation first' });
      return;
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



      // Whole deck in one answer: large tier of the Settings default.
      const result = await callChat({
        tier: 'large',
        thinkingLevel: 'think',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 32000,
        db,
      });

      // Read brand settings (graceful fallback to defaults). The brand is the house
      // style on the instance row. The organisation named on the deck is the
      // person's own (loadLayer0Profile — the same 'default' row in solo), because
      // in team mode the instance row is no longer anyone's profile; someone who has
      // not set one gets the instance organisation, which travels with the brand
      // an admin sets (PUT /api/profile?scope=instance) and names whose deck it is.
      const profileRow = await db.get('SELECT organisation, brand_config FROM user_profiles WHERE id = ?', INSTANCE_PROFILE_ID) as { organisation: string | null; brand_config: string | null } | undefined;
      const ownOrganisation = (await loadLayer0Profile(db, req))?.organisation?.trim();

      const brandOverride: Partial<PresentationBrand> = {};
      const organisation = ownOrganisation || profileRow?.organisation?.trim();
      if (organisation) {
        brandOverride.companyName = organisation;
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
    try {
      // In team mode the name must belong to a presentation row the caller owns,
      // checked before the disk is touched, so another person's deck answers
      // exactly like a file that does not exist. Solo and admins keep the plain
      // by-name download, as before.
      if (scopesToOwner(req)) {
        const scope = ownerFilter(req, 'user_id');
        const owned = await db.get(
          `SELECT 1 AS ok FROM presentations WHERE filename = ?${scope.sql}`, filename, ...scope.params,
        );
        if (!owned) {
          res.status(404).json({ error: 'File not found' });
          return;
        }
      }
      const filePath = path.join(OUTPUT_DIR, filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      res.download(filePath, filename);
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}
