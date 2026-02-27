import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { fileTypeFromBuffer } from 'file-type';
import { extractTextFromFile } from '../services/text-extractor.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
fs.ensureDirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

const router = Router();

// POST /api/files/upload
router.post('/files/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // MIME type validation - verify file content matches declared extension
  const ALLOWED_MIMES: Record<string, string> = {
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc':  'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv':  'text/csv',
    '.html': 'text/html',
  };

  const ext = path.extname(req.file.originalname).toLowerCase();
  const expectedMime = ALLOWED_MIMES[ext];
  if (expectedMime) {
    const fileBuffer = await fs.readFile(req.file.path);
    const detected = await fileTypeFromBuffer(fileBuffer);
    if (detected && detected.mime !== expectedMime) {
      await fs.remove(req.file.path);
      res.status(400).json({ error: `File content does not match declared type (expected ${expectedMime}, got ${detected.mime})` });
      return;
    }
  }

  // Extract text content from the uploaded file
  let text = '';
  try {
    text = (await extractTextFromFile(req.file.path)) ?? '';
  } catch (err) {
    console.error('[files] Text extraction failed:', err);
  }

  res.json({
    id: req.file.filename,
    originalName: req.file.originalname,
    path: req.file.path,
    size: req.file.size,
    extension: path.extname(req.file.originalname).toLowerCase(),
    text,
  });
});

// GET /api/files/:id
router.get('/files/:id', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.id);
  // Existence check before realpath (realpath throws on missing file)
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  // Resolve symlinks then verify the real path stays inside UPLOAD_DIR.
  // Without realpathSync, a symlink could point outside the upload directory.
  let realFilePath: string;
  try {
    realFilePath = fs.realpathSync(filePath);
  } catch {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const realUploadDir = path.resolve(UPLOAD_DIR);
  if (!realFilePath.startsWith(realUploadDir + path.sep) && realFilePath !== realUploadDir) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  res.sendFile(realFilePath);
});

export default router;
