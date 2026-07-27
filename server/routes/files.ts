import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { fileTypeFromBuffer } from 'file-type';
import { extractTextFromFile } from '../services/text-extractor.js';
import { validateParams } from '../lib/validate.js';
import { FileIdParamSchema } from '../lib/schemas.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
fs.ensureDirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // NOT AUTHORISATION — read this before assuming these files are protected.
    //
    // GET /files/:id serves any id that exists on disk: there is no ownership record
    // for uploads, so nothing distinguishes your file from someone else's. The id is
    // therefore the only thing standing between another user and the contents, i.e. a
    // capability URL.
    //
    // It previously was `Date.now()-Math.round(Math.random()*1e9)-originalname`, which
    // is a poor one: the timestamp is predictable, Math.random() is not cryptographically
    // random (V8's xorshift is recoverable from observed outputs) and spans only ~1e9,
    // and the original filename is frequently guessable. randomUUID() gives 122 bits
    // from a CSPRNG, which makes guessing infeasible.
    //
    // The REAL fix is an ownership record for uploads plus a check here — that needs a
    // new table and a migration, so it is deliberately not smuggled into this change.
    // Existing files keep resolving: the route only joins the id it was given.
    const unique = randomUUID();
    cb(null, `${unique}-${file.originalname}`);
  },
});

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const IMAGE_MEDIA_TYPES: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
};

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.csv', '.html', ...IMAGE_EXTENSIONS];
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
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
  };

  const ext = path.extname(req.file.originalname).toLowerCase();
  const expectedMime = ALLOWED_MIMES[ext];
  const fileBuffer = await fs.readFile(req.file.path);

  if (expectedMime) {
    const detected = await fileTypeFromBuffer(fileBuffer);
    if (detected && detected.mime !== expectedMime) {
      await fs.remove(req.file.path);
      res.status(400).json({ error: `File content does not match declared type (expected ${expectedMime}, got ${detected.mime})` });
      return;
    }
  }

  // SEC-09: ZIP bomb / compression ratio check for ZIP-based formats (.docx, .xlsx)
  // These formats are ZIP archives — expanded content must not exceed 100× compressed size.
  const ZIP_BASED_EXTS = new Set(['.docx', '.doc', '.xlsx']);
  if (ZIP_BASED_EXTS.has(ext)) {
    const compressedSize = req.file.size;
    // Quick heuristic: scan central directory for uncompressed sizes without fully extracting.
    // We walk the file buffer looking for local file header signatures (PK\x03\x04).
    let totalUncompressed = 0;
    let pos = 0;
    const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK local file header
    while (pos < fileBuffer.length - 30) {
      const idx = fileBuffer.indexOf(sig, pos);
      if (idx === -1) break;
      // Uncompressed size is at offset +22 from signature (4 bytes LE)
      const uncompressedSize = fileBuffer.readUInt32LE(idx + 22);
      totalUncompressed += uncompressedSize;
      pos = idx + 4;
    }
    const MAX_RATIO = Number(process.env.ZIP_MAX_EXPANSION_RATIO) || 100;
    if (compressedSize > 0 && totalUncompressed > compressedSize * MAX_RATIO) {
      await fs.remove(req.file.path);
      res.status(400).json({
        error: `File rejected: compressed content expands by more than ${MAX_RATIO}× (${Math.round(totalUncompressed / compressedSize)}× detected). Possible ZIP bomb.`,
        code: 'ZIP_BOMB_DETECTED',
      });
      return;
    }
  }

  const isImage = IMAGE_EXTENSIONS.has(ext);

  // For images: return base64 data for Claude vision API; for documents: extract text
  if (isImage) {
    const mediaType = IMAGE_MEDIA_TYPES[ext] || 'image/png';
    const base64 = fileBuffer.toString('base64');
    res.json({
      id: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      extension: ext,
      isImage: true,
      mediaType,
      base64,
    });
    return;
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
    extension: ext,
    text,
  });
});

// GET /api/files/:id
router.get('/files/:id', validateParams(FileIdParamSchema), (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.id as string);
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
