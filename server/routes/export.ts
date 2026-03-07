import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import type Database from 'better-sqlite3';
import { generateDocx } from '../services/export-docx.js';
import { generateXlsx } from '../services/export-xlsx.js';
import { generatePdf }  from '../services/export-pdf.js';
import { generatePptx } from '../services/export-pptx.js';
import { injectIntoDocxTemplate, injectIntoPptxTemplate } from '../services/template-injector.js';
import { validate } from '../lib/validate.js';
import { ExportSchema, ExportWithTemplateSchema, TrustCertificateSchema } from '../lib/schemas.js';

const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';
fs.ensureDirSync(OUTPUT_DIR);

// Factory function — accepts the shared db instance from server/index.ts
export function createExportRouter(db: Database.Database): Router {
  const router = Router();

  // POST /api/export — generate file for download
  router.post('/export', validate(ExportSchema), async (req, res) => {
    try {
      const { format, content, metadata } = req.body;

      // content and format validated by ExportSchema

      // EXPORT-04: Auto-name files as {Module}_{YYYYMMDD} when no explicit filename provided
      const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const moduleSlug = metadata?.moduleId
        ? String(metadata.moduleId).replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()
        : null;
      const autoBasename = moduleSlug ? `${moduleSlug}_${datestamp}` : `openexpert_${datestamp}`;
      const basename  = (metadata?.filename  as string) || autoBasename;
      const title     = (metadata?.title     as string) || basename;
      const author    = (metadata?.author    as string) || 'ANTON by openEXPERT';
      // GOV-04: provenance fields passed through to export footers
      const model     = (metadata?.model     as string | undefined);
      const thinking  = (metadata?.thinking  as string | undefined);
      const moduleId  = (metadata?.moduleId  as string | undefined);
      const sessionId = (metadata?.sessionId as string | undefined);
      const creativity = (metadata?.creativity as string | undefined);

      // Load brand config from user profile
      let brandConfig = null;
      try {
        const profile = db.prepare('SELECT brand_config FROM user_profiles WHERE id = ?').get('default') as { brand_config: string | null } | undefined;
        if (profile?.brand_config) {
          brandConfig = JSON.parse(profile.brand_config);
        }
      } catch { /* non-fatal — use defaults */ }

      switch (format) {
        case 'md': {
          const filename = `${basename}.md`;
          await fs.writeFile(path.join(OUTPUT_DIR, filename), content, 'utf-8');
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(content);
          break;
        }

        case 'docx': {
          const filename = `${basename}.docx`;
          const buffer = await generateDocx(content, { title, author, model, thinking, moduleId, sessionId, creativity }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'xlsx': {
          const filename = `${basename}.xlsx`;
          const buffer = await generateXlsx(content, { title, author, model, thinking, moduleId, sessionId, creativity }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'pdf': {
          const filename = `${basename}.pdf`;
          const buffer = await generatePdf(content, { title, author, model, thinking, moduleId, sessionId, creativity }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'pptx': {
          const filename = `${basename}.pptx`;
          const buffer = await generatePptx(content, { title, author });
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        default:
          res.status(400).json({ error: `Unsupported format: ${format}` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      console.error('[export] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/export/with-template — inject content into a brand template and download
  router.post('/export/with-template', validate(ExportWithTemplateSchema), async (req, res) => {
    try {
      const { templateId, content, format } = req.body as {
        templateId: string;
        content: string;
        format: 'docx' | 'pptx';
      };

      // templateId, content, format validated by ExportWithTemplateSchema

      // Look up the template record from the shared db
      const tpl = db.prepare('SELECT * FROM brand_templates WHERE id = ?').get(templateId) as
        | { id: string; name: string; type: string; file_path: string }
        | undefined;

      if (!tpl) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      if (!fs.existsSync(tpl.file_path)) {
        res.status(404).json({ error: 'Template file missing from disk' });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFilename = `template-export-${timestamp}.${format}`;
      const outputPath = path.join(OUTPUT_DIR, outputFilename);

      if (format === 'docx') {
        await injectIntoDocxTemplate(tpl.file_path, content, outputPath);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        res.send(await fs.readFile(outputPath));
      } else {
        await injectIntoPptxTemplate(tpl.file_path, content, outputPath);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        res.send(await fs.readFile(outputPath));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Template export failed';
      console.error('[export/with-template] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/export/trust-certificate — generate a quality trust certificate PDF for a session
  router.post('/export/trust-certificate', validate(TrustCertificateSchema), async (req, res) => {
    try {
      const { sessionId } = req.body as { sessionId: string };

      // Fetch session row
      const session = db.prepare('SELECT id, module_id, title, config, created_at FROM sessions WHERE id = ?').get(sessionId) as
        | { id: string; module_id: string | null; title: string | null; config: string | null; created_at: string }
        | undefined;

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Parse config for model info
      let modelUsed = 'Unknown';
      try {
        const cfg = session.config ? JSON.parse(session.config) : {};
        if (cfg.model) modelUsed = cfg.model;
      } catch { /* ignore */ }

      // Fetch latest quality score for this session
      const qualityRow = db.prepare(
        `SELECT score_overall, score_completeness, score_accuracy, score_structure, score_actionability, score_citations, scored_at
         FROM quality_scores WHERE session_id = ? ORDER BY scored_at DESC LIMIT 1`
      ).get(sessionId) as {
        score_overall: number; score_completeness: number | null; score_accuracy: number | null;
        score_structure: number | null; score_actionability: number | null; score_citations: number | null;
        scored_at: string;
      } | undefined;

      // Fetch user feedback for this session
      const feedbackRows = db.prepare(
        `SELECT rating, comment FROM output_feedback WHERE session_id = ? ORDER BY created_at DESC LIMIT 5`
      ).all(sessionId) as Array<{ rating: number; comment: string | null }>;

      const avgRating = feedbackRows.length > 0
        ? (feedbackRows.reduce((s, r) => s + r.rating, 0) / feedbackRows.length).toFixed(1)
        : null;

      const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
      const fmt = (v: number | null | undefined) => v != null ? `${v.toFixed(1)} / 10` : '—';
      const certDate = new Date().toISOString().split('T')[0];
      const moduleLabel = (session.module_id ?? 'General').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const sessionTitle = session.title || session.id;

      const markdown = [
        `# ANTON Quality Certificate`,
        ``,
        `| | |`,
        `|---|---|`,
        `| **Session** | ${sessionTitle} |`,
        `| **Module** | ${moduleLabel} |`,
        `| **Model** | ${modelUsed} |`,
        `| **Session Date** | ${session.created_at.split('T')[0]} |`,
        `| **Certificate Date** | ${certDate} |`,
        ``,
        `---`,
        ``,
        ...(qualityRow ? [
          `## Automated Quality Assessment`,
          ``,
          `| Dimension | Score |`,
          `|---|---|`,
          `| **Overall** | **${fmt(qualityRow.score_overall)}** |`,
          `| Completeness | ${fmt(qualityRow.score_completeness)} |`,
          `| Accuracy | ${fmt(qualityRow.score_accuracy)} |`,
          `| Structure | ${fmt(qualityRow.score_structure)} |`,
          `| Actionability | ${fmt(qualityRow.score_actionability)} |`,
          `| Citations | ${fmt(qualityRow.score_citations)} |`,
          ``,
          `*Assessed: ${qualityRow.scored_at.split('T')[0]}*`,
          ``,
          `---`,
          ``,
        ] : [
          `## Automated Quality Assessment`,
          ``,
          `*No automated quality score available for this session.*`,
          ``,
          `---`,
          ``,
        ]),
        ...(avgRating != null ? [
          `## User Feedback`,
          ``,
          `${stars(parseFloat(avgRating))} **${avgRating} / 5** (${feedbackRows.length} rating${feedbackRows.length !== 1 ? 's' : ''})`,
          ``,
          ...feedbackRows.filter(r => r.comment).map(r => `> "${r.comment}"`),
          ``,
          `---`,
          ``,
        ] : []),
        `*This certificate was automatically generated by ANTON on ${certDate}.*`,
        `*Quality scores reflect automated assessment by Claude Haiku across six dimensions.*`,
        `*This certificate does not constitute professional advice.*`,
      ].join('\n');

      const brandConfig: null = null; // use defaults
      const buffer = await generatePdf(markdown, { title: `Trust Certificate — ${sessionTitle}`, author: 'ANTON by openEXPERT' }, brandConfig);

      const filename = `trust-certificate-${sessionId.slice(0, 8)}-${certDate}.pdf`;
      await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Trust certificate generation failed';
      console.error('[export/trust-certificate] Error:', message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}

// Legacy default export for backwards compatibility — creates a router without db access
// (with-template endpoint requires db; only used when mounted via createExportRouter)
export default createExportRouter;
