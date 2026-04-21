import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

// PERF-04: Heavy export libraries (docx, exceljs, puppeteer) are loaded lazily on first use
// to improve server startup time. Dynamic imports are cached by Node's module system after first call.
let _generateDocx: typeof import('../services/export-docx.js').generateDocx | undefined;
let _generateXlsx: typeof import('../services/export-xlsx.js').generateXlsx | undefined;
let _generatePdf:  typeof import('../services/export-pdf.js').generatePdf   | undefined;
let _generatePptx: typeof import('../services/export-pptx.js').generatePptx | undefined;
let _templateInjector: typeof import('../services/template-injector.js') | undefined;

async function getExporter(format: string) {
  if (format === 'docx') {
    if (!_generateDocx) _generateDocx = (await import('../services/export-docx.js')).generateDocx;
    return _generateDocx;
  }
  if (format === 'xlsx') {
    if (!_generateXlsx) _generateXlsx = (await import('../services/export-xlsx.js')).generateXlsx;
    return _generateXlsx;
  }
  if (format === 'pdf') {
    if (!_generatePdf) _generatePdf = (await import('../services/export-pdf.js')).generatePdf;
    return _generatePdf;
  }
  if (format === 'pptx') {
    if (!_generatePptx) _generatePptx = (await import('../services/export-pptx.js')).generatePptx;
    return _generatePptx;
  }
  return null;
}
async function getTemplateInjector() {
  if (!_templateInjector) _templateInjector = await import('../services/template-injector.js');
  return _templateInjector;
}
import { validate } from '../lib/validate.js';
import { ExportSchema, ExportWithTemplateSchema, TrustCertificateSchema } from '../lib/schemas.js';
// LONE-08: Script formats — loaded synchronously (no binary deps, pure TS)
import { generateFountain, generateFdx } from '../services/export-fountain.js';

const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';
fs.ensureDirSync(OUTPUT_DIR);

function getUserId(req: unknown): string {
  return (req as { user?: { id?: string } }).user?.id ?? 'default';
}

// Factory function — accepts the shared db instance from server/index.ts
export async function createExportRouter(db: DatabaseAdapter): Promise<Router> {
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
      // GOV-04 + ATTR-02: provenance fields passed through to export footers
      const model           = (metadata?.model           as string | undefined);
      const thinking        = (metadata?.thinking        as string | undefined);
      const moduleId        = (metadata?.moduleId        as string | undefined);
      const sessionId       = (metadata?.sessionId       as string | undefined);
      const creativity      = (metadata?.creativity      as string | undefined);
      const documentsLoaded = (metadata?.documentsLoaded as string[] | undefined);

      // EXPORT-03: Track exports per session and inject a change log section
      let exportedContent = content;
      if (sessionId && format !== 'pptx') {
        try {
          const contentHash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

          // Ensure table exists (idempotent)
          await db.exec(`CREATE TABLE IF NOT EXISTS session_exports (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
            session_id TEXT NOT NULL, module_id TEXT, format TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1, content_hash TEXT NOT NULL,
            exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), exported_by TEXT
          )`);

          // Look up prior exports for this session
          const priorExports = await db.all(
            `SELECT version, exported_at FROM session_exports WHERE session_id = ? ORDER BY version DESC LIMIT 5`
          , sessionId) as Array<{ version: number; exported_at: string }>;

          const newVersion = priorExports.length > 0 ? priorExports[0].version + 1 : 1;
          const isRevision = priorExports.length > 0;

          // Insert export record
          await db.run(
            `INSERT INTO session_exports (session_id, module_id, format, version, content_hash) VALUES (?, ?, ?, ?, ?)`
          , sessionId, moduleId ?? null, format, newVersion, contentHash);

          // Inject change log table into exported content
          const versionLabel = `v${newVersion}.0`;
          const priorRows = priorExports.map((e) => {
            const d = new Date(e.exported_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            return `| v${e.version}.0 | ${d} | Prior export |`;
          }).join('\n');
          const changeLog = isRevision
            ? `\n\n---\n\n## Document Change Log\n\n| Version | Date | Summary |\n|---------|------|---------|\n| ${versionLabel} | ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} | Revised analysis |\n${priorRows}\n`
            : `\n\n---\n\n## Document Change Log\n\n| Version | Date | Summary |\n|---------|------|---------|\n| ${versionLabel} | ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} | Initial export |\n`;

          exportedContent = content + changeLog;
        } catch { /* non-fatal — export continues without change log */ }
      }

      // Load brand config from user profile
      let brandConfig = null;
      try {
        const profile = await db.get('SELECT brand_config FROM user_profiles WHERE user_id = ?', getUserId(req)) as { brand_config: string } | undefined;
        if (profile?.brand_config) {
          brandConfig = JSON.parse(profile.brand_config);
        }
      } catch { /* non-fatal — use defaults */ }

      switch (format) {
        case 'md': {
          const filename = `${basename}.md`;
          await fs.writeFile(path.join(OUTPUT_DIR, filename), exportedContent, 'utf-8');
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(exportedContent);
          break;
        }

        case 'docx': {
          const filename = `${basename}.docx`;
          const fn = await getExporter('docx') as typeof import('../services/export-docx.js').generateDocx;
          const buffer = await fn(exportedContent, { title, author, model, thinking, moduleId, sessionId, creativity, documentsLoaded }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'xlsx': {
          const filename = `${basename}.xlsx`;
          const fn = await getExporter('xlsx') as typeof import('../services/export-xlsx.js').generateXlsx;
          const buffer = await fn(exportedContent, { title, author, model, thinking, moduleId, sessionId, creativity, documentsLoaded }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'pdf': {
          const filename = `${basename}.pdf`;
          const fn = await getExporter('pdf') as typeof import('../services/export-pdf.js').generatePdf;
          const buffer = await fn(exportedContent, { title, author, model, thinking, moduleId, sessionId, creativity, documentsLoaded }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'pptx': {
          const filename = `${basename}.pptx`;
          const fn = await getExporter('pptx') as typeof import('../services/export-pptx.js').generatePptx;
          const buffer = await fn(content, { title, author });
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        // LONE-08: Fountain screenplay export
        case 'fountain': {
          const filename = `${basename}.fountain`;
          const buffer = generateFountain(content, { title, author });
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        // LONE-08: Final Draft XML export
        case 'fdx': {
          const filename = `${basename}.fdx`;
          const buffer = generateFdx(content, { title, author });
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
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
      const tpl = await db.get('SELECT * FROM brand_templates WHERE id = ?', templateId) as
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

      const ti = await getTemplateInjector();
      if (format === 'docx') {
        await ti.injectIntoDocxTemplate(tpl.file_path, content, outputPath);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        res.send(await fs.readFile(outputPath));
      } else {
        await ti.injectIntoPptxTemplate(tpl.file_path, content, outputPath);
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
      const userId = getUserId(req);

      // Fetch session row (with ownership check)
      const session = await db.get('SELECT id, module_id, title, config, created_at FROM sessions WHERE id = ? AND user_id = ?', sessionId, userId) as
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
      const qualityRow = await db.get(
        `SELECT score_overall, score_completeness, score_accuracy, score_structure, score_actionability, score_citations, scored_at
         FROM quality_scores WHERE session_id = ? ORDER BY scored_at DESC LIMIT 1`
      , sessionId) as {
        score_overall: number; score_completeness: number | null; score_accuracy: number | null;
        score_structure: number | null; score_actionability: number | null; score_citations: number | null;
        scored_at: string;
      } | undefined;

      // Fetch user feedback for this session
      const feedbackRows = await db.all(
        `SELECT rating, comment FROM session_feedback WHERE session_id = ? ORDER BY created_at DESC LIMIT 10`
      , sessionId) as Array<{ rating: number; comment: string | null }>;

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
      const generatePdfFn = await getExporter('pdf') as typeof import('../services/export-pdf.js').generatePdf;
      const buffer = await generatePdfFn(markdown, { title: `Trust Certificate — ${sessionTitle}`, author: 'ANTON by openEXPERT' }, brandConfig);

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
