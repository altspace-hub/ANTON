import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

const TEMPLATES_DIR = path.join(process.cwd(), 'uploads', 'templates');
fs.ensureDirSync(TEMPLATES_DIR);

const upload = multer({
  dest: TEMPLATES_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.docx', '.pptx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

export function createTemplatesRouter(db: Database.Database): Router {
  const router = Router();

  // GET /api/templates — list all templates
  router.get('/templates', (_req, res) => {
    try {
      const templates = db.prepare('SELECT * FROM brand_templates ORDER BY created_at DESC').all();
      res.json(templates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch templates';
      res.status(500).json({ error: message });
    }
  });

  // POST /api/templates/upload — upload a template file
  router.post('/templates/upload', upload.single('template'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded or invalid file type (only .docx and .pptx allowed)' });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const id = randomUUID();
    const name = (req.body.name as string | undefined) || req.file.originalname.replace(/\.[^.]+$/, '');

    // Rename temp file to preserve the extension
    const finalPath = path.join(TEMPLATES_DIR, `${id}.${ext}`);
    try {
      fs.renameSync(req.file.path, finalPath);
    } catch (err) {
      res.status(500).json({ error: 'Failed to save template file' });
      return;
    }

    try {
      db.prepare(
        'INSERT INTO brand_templates (id, name, type, file_path, file_size) VALUES (?, ?, ?, ?, ?)'
      ).run(id, name, ext, finalPath, req.file.size);

      res.json({ id, name, type: ext });
    } catch (err) {
      // Clean up saved file if DB insert fails
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      const message = err instanceof Error ? err.message : 'Failed to save template';
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/templates/:id — delete a template
  router.delete('/templates/:id', (req, res) => {
    try {
      const tpl = db.prepare('SELECT * FROM brand_templates WHERE id = ?').get(req.params.id) as
        | { id: string; name: string; type: string; file_path: string; file_size: number }
        | undefined;

      if (!tpl) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      if (fs.existsSync(tpl.file_path)) {
        fs.unlinkSync(tpl.file_path);
      }

      db.prepare('DELETE FROM brand_templates WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete template';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
