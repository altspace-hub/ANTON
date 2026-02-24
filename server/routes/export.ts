import { Router } from 'express';
import path from 'path';
import fs from 'fs-extra';
import type Database from 'better-sqlite3';
import { generateDocx } from '../services/export-docx.js';
import { generateXlsx } from '../services/export-xlsx.js';
import { generatePdf }  from '../services/export-pdf.js';
import { generatePptx } from '../services/export-pptx.js';
import { injectIntoDocxTemplate, injectIntoPptxTemplate } from '../services/template-injector.js';

const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';
fs.ensureDirSync(OUTPUT_DIR);

// Factory function — accepts the shared db instance from server/index.ts
export function createExportRouter(db: Database.Database): Router {
  const router = Router();

  // POST /api/export — generate file for download
  router.post('/export', async (req, res) => {
    try {
      const { format, content, metadata } = req.body;

      if (!content) {
        res.status(400).json({ error: 'No content to export' });
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const basename = (metadata?.filename as string) || `openexpert-${timestamp}`;
      const title    = (metadata?.title  as string) || basename;
      const author   = (metadata?.author as string) || 'openEXPERT by ANTON';

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
          const buffer = await generateDocx(content, { title, author }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'xlsx': {
          const filename = `${basename}.xlsx`;
          const buffer = await generateXlsx(content, { title, author }, brandConfig);
          await fs.writeFile(path.join(OUTPUT_DIR, filename), buffer);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          break;
        }

        case 'pdf': {
          const filename = `${basename}.pdf`;
          const buffer = await generatePdf(content, { title, author }, brandConfig);
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
  router.post('/export/with-template', async (req, res) => {
    try {
      const { templateId, content, format } = req.body as {
        templateId: string;
        content: string;
        format: 'docx' | 'pptx';
      };

      if (!templateId || !content || !format) {
        res.status(400).json({ error: 'templateId, content, and format are required' });
        return;
      }

      if (format !== 'docx' && format !== 'pptx') {
        res.status(400).json({ error: 'format must be "docx" or "pptx"' });
        return;
      }

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

  return router;
}

// Legacy default export for backwards compatibility — creates a router without db access
// (with-template endpoint requires db; only used when mounted via createExportRouter)
export default createExportRouter;
