import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

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

export async function createTemplatesRouter(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  // GET /api/templates — list all templates
  router.get('/templates', async (_req, res) => {
    try {
      const templates = await db.all('SELECT * FROM brand_templates ORDER BY created_at DESC');
      res.json(templates);
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/templates/upload — upload a template file
  router.post('/templates/upload', upload.single('template'), async (req, res) => {
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
      await db.run(
        'INSERT INTO brand_templates (id, name, type, file_path, file_size) VALUES (?, ?, ?, ?, ?)'
      , id, name, ext, finalPath, req.file.size);

      res.json({ id, name, type: ext });
    } catch (err) {
      // Clean up saved file if DB insert fails
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/templates/:id — delete a template
  router.delete('/templates/:id', async (req, res) => {
    try {
      const tpl = await db.get('SELECT * FROM brand_templates WHERE id = ?', req.params.id) as
        | { id: string; name: string; type: string; file_path: string; file_size: number }
        | undefined;

      if (!tpl) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }

      if (fs.existsSync(tpl.file_path)) {
        fs.unlinkSync(tpl.file_path);
      }

      await db.run('DELETE FROM brand_templates WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
