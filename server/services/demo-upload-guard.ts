/**
 * demo-upload-guard.ts — the content check every upload path shares
 * (2026-10-02).
 *
 * Five routes take a file a person sends: run attachments (routes/files.ts),
 * Engagement Task documents and resources (services/engagement-uploads.ts),
 * Knowledge Base documents (routes/documents.ts), project files
 * (routes/project-files.ts) and Task Agent attachments (routes/task-agent.ts).
 * The text extractor opens .docx with mammoth and .xlsx/.xls with SheetJS;
 * both inflate the whole ZIP archive in memory, in the Node process every
 * visitor of a public demo shares. A file of a few kilobytes can expand to
 * gigabytes (a "ZIP bomb"). Before this file only routes/files.ts and
 * engagement-uploads.ts checked, each with its own copy; the other three
 * routes checked nothing.
 *
 * uploadContentRefusal answers, for one file:
 *   - the bytes match the extension: a type file-type recognises must be the
 *     type the name says (a .docx that is really a plain ZIP, a .pdf that is
 *     an image). A file file-type does not recognise passes (plain text);
 *   - a file an extractor opens as a ZIP does not expand past the limit. The
 *     archive is walked the way the readers walk it (the end record, every
 *     central entry, its local header) and every compressed entry is really
 *     inflated, counting the bytes and stopping at the limit, so headers that
 *     lie about their sizes do not get past it. Nothing is kept in memory.
 *     The limit is ZIP_MAX_EXPANSION_RATIO (default 100) times the file's
 *     size, and for a demo visitor never more than VISITOR_MAX_EXPANDED_BYTES.
 *   - for a demo visitor, an archive that cannot be walked (no end record, an
 *     inconsistent directory, ZIP64, too many entries) is refused: it cannot
 *     be checked. Everyone else keeps the earlier rule for such a file (the
 *     sizes its local headers declare, against the ratio).
 *
 * routes/files.ts runs the check for every caller, as it did; the other four
 * paths run it for a demo visitor only (demoVisitorUploadRefusal), after
 * multer and before the file is stored, indexed or extracted.
 */
import path from 'node:path';
import fs from 'fs-extra';
import { createInflateRaw } from 'node:zlib';
import { fileTypeFromBuffer } from 'file-type';
import { isDemoVisitor } from './rag/demo-storage.js';

type Env = Record<string, string | undefined>;

/** A file multer received: on disk (path) or in memory (buffer). */
export interface UploadedFileLike {
  originalname: string;
  size?: number;
  path?: string;
  buffer?: Buffer;
  /** The extension the extractor will go by, when the file is not on disk under it (e.g. '.docx'). */
  extension?: string;
}

export interface UploadContentRefusal {
  error: string;
  code: 'UPLOAD_CONTENT' | 'ZIP_BOMB_DETECTED';
}

export interface ContentCheckOptions {
  /** A demo visitor: the expansion ceiling applies, and an archive that cannot be walked is refused. */
  visitor: boolean;
  env?: Env;
}

/**
 * What a file with each extension must be when file-type recognises it.
 * .doc and .xls are Compound File Binary containers, which file-type names
 * application/x-cfb.
 */
const EXPECTED_MIME: Readonly<Record<string, readonly string[]>> = {
  '.pdf':  ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.doc':  ['application/msword', 'application/x-cfb'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls':  ['application/vnd.ms-excel', 'application/x-cfb'],
  '.csv':  ['text/csv'],
  '.html': ['text/html'],
  '.png':  ['image/png'],
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.gif':  ['image/gif'],
  '.webp': ['image/webp'],
};

/** Opened by mammoth (JSZip), which finds an archive by its end record anywhere in the file. */
const JSZIP_READ = new Set(['.docx', '.doc']);
/** Opened by SheetJS, which reads a ZIP only when the file starts with "PK". */
const SHEETJS_READ = new Set(['.xlsx', '.xls']);

/** What a demo visitor's file may expand to, whatever its size: 100 MB. */
export const VISITOR_MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
/** More central entries than any Office file has; a visitor's archive with more is refused. */
export const MAX_ZIP_ENTRIES = 5000;

export function zipExpansionRatio(env: Env = process.env): number {
  const n = Number(env.ZIP_MAX_EXPANSION_RATIO);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const LOCAL = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type ZipMeasure =
  | { kind: 'not-zip' }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'measured'; expandedBytes: number; overBudget: boolean; entries: number };

/** Bytes a raw deflate stream starting at `input` inflates to, counted and stopped just past `limit`. */
function inflatedBytes(input: Buffer, limit: number): Promise<number> {
  return new Promise((resolve) => {
    let total = 0;
    let settled = false;
    const inflate = createInflateRaw({ chunkSize: 256 * 1024 });
    const settle = (): void => { if (!settled) { settled = true; resolve(total); } };
    inflate.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > limit) { settle(); inflate.destroy(); }
    });
    // The end of the stream, a corrupt or truncated one: what came out counts.
    inflate.on('end', settle);
    inflate.on('error', settle);
    inflate.on('close', settle);
    inflate.end(input);
  });
}

/**
 * Walks a ZIP archive as mammoth and SheetJS do and inflates every entry,
 * stopping once the total passes `budget`. Each entry is inflated from its
 * data to the end of its deflate stream (SheetJS reads that far; JSZip reads
 * the compressed size the directory states, a prefix of it), so the count is
 * never less than what either reader produces.
 */
export async function measureZipExpansion(buf: Buffer, budget: number): Promise<ZipMeasure> {
  const startsLikeZip = buf.length >= 4 && buf.readUInt32LE(0) === SIG_LOCAL;
  const eocd = buf.lastIndexOf(EOCD);
  if (eocd < 0) return startsLikeZip ? { kind: 'unreadable', reason: 'no end record' } : { kind: 'not-zip' };
  if (eocd + 22 > buf.length) return { kind: 'unreadable', reason: 'truncated end record' };

  const onDisk = buf.readUInt16LE(eocd + 8);
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return { kind: 'unreadable', reason: 'zip64' };
  if (onDisk !== total) return { kind: 'unreadable', reason: 'entry counts differ' };
  if (total > MAX_ZIP_ENTRIES) return { kind: 'unreadable', reason: 'too many entries' };
  // The directory ends where the end record starts: no bytes before the
  // archive (JSZip and SheetJS would place its entries differently) and no gap.
  if (cdOffset + cdSize !== eocd) return { kind: 'unreadable', reason: 'directory out of place' };

  let expanded = 0;
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== SIG_CENTRAL) return { kind: 'unreadable', reason: 'bad central entry' };
    const method = buf.readUInt16LE(p + 10);
    const csz = buf.readUInt32LE(p + 20);
    const usz = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (csz === 0xffffffff || usz === 0xffffffff || local === 0xffffffff) return { kind: 'unreadable', reason: 'zip64' };
    p += 46 + nameLen + extraLen + commentLen;

    if (local + 30 > buf.length || buf.readUInt32LE(local) !== SIG_LOCAL) return { kind: 'unreadable', reason: 'bad local header' };
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (dataStart > buf.length) return { kind: 'unreadable', reason: 'bad local header' };

    // What the headers declare is a floor: past the budget on its own word.
    const declared = Math.max(usz, buf.readUInt32LE(local + 22));
    if (expanded + declared > budget) return { kind: 'measured', expandedBytes: expanded + declared, overBudget: true, entries: i + 1 };

    if (method === 0) {
      expanded += Math.min(csz, buf.length - dataStart);
    } else if (method === 8) {
      expanded += await inflatedBytes(buf.subarray(dataStart), budget - expanded);
    }
    // Any other method: neither reader inflates it (both refuse the entry).
    if (expanded > budget) return { kind: 'measured', expandedBytes: expanded, overBudget: true, entries: i + 1 };
  }
  if (p !== eocd) return { kind: 'unreadable', reason: 'directory size differs' };
  return { kind: 'measured', expandedBytes: expanded, overBudget: false, entries: total };
}

/**
 * The earlier rule (routes/files.ts, SEC-09): the uncompressed sizes every
 * local header in the file declares, summed. Kept for a caller who is not a
 * visitor when the archive cannot be walked.
 */
export function declaredLocalExpansion(buf: Buffer): number {
  let sum = 0;
  let pos = 0;
  while (pos < buf.length - 30) {
    const idx = buf.indexOf(LOCAL, pos);
    if (idx === -1 || idx + 26 > buf.length) break;
    sum += buf.readUInt32LE(idx + 22);
    pos = idx + 4;
  }
  return sum;
}

/** The file's name as shown in a refusal: no path, at most 120 characters. */
function shownName(file: UploadedFileLike): string {
  const name = path.basename(String(file.originalname ?? '')).trim() || 'This file';
  return name.length > 120 ? `${name.slice(0, 117)}...` : name;
}

/**
 * The extensions a reader will go by: the name the person gave, and the name
 * the file is stored under (the extractor goes by the stored path) or will be.
 */
function extensionsOf(file: UploadedFileLike): string[] {
  const exts = new Set<string>([path.extname(String(file.originalname ?? '')).toLowerCase()]);
  if (file.path) exts.add(path.extname(file.path).toLowerCase());
  if (file.extension) exts.add(file.extension.toLowerCase());
  exts.delete('');
  return [...exts];
}

/**
 * Whether this file's content may be kept: null when it may, otherwise the
 * 400 body to send (a plain sentence and a code).
 */
export async function uploadContentRefusal(file: UploadedFileLike, opts: ContentCheckOptions): Promise<UploadContentRefusal | null> {
  const env = opts.env ?? process.env;
  const name = shownName(file);
  let buf = file.buffer;
  if (!buf && file.path) {
    // Every upload path stores under UPLOAD_DIR; nothing outside it is read.
    const stored = path.resolve(file.path);
    if (!stored.startsWith(path.resolve(env.UPLOAD_DIR || './uploads') + path.sep)) {
      return { error: `"${name}" was refused: it could not be checked.`, code: 'UPLOAD_CONTENT' };
    }
    buf = await fs.readFile(stored);
  }
  buf ??= Buffer.alloc(0);
  const exts = extensionsOf(file);

  const expectedFor = exts.filter((e) => EXPECTED_MIME[e]);
  if (expectedFor.length > 0 && buf.length > 0) {
    const detected = await fileTypeFromBuffer(buf);
    if (detected) {
      for (const ext of expectedFor) {
        if (!EXPECTED_MIME[ext].includes(detected.mime)) {
          return { error: `"${name}" was refused: its content is not a ${ext} file.`, code: 'UPLOAD_CONTENT' };
        }
      }
    }
  }

  const startsWithPk = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
  const zipRead = exts.some((e) => JSZIP_READ.has(e)) || (startsWithPk && exts.some((e) => SHEETJS_READ.has(e)));
  if (!zipRead || buf.length === 0) return null;

  const ratio = zipExpansionRatio(env);
  const byRatio = buf.length * ratio;
  const ceiling = opts.visitor ? VISITOR_MAX_EXPANDED_BYTES : Number.POSITIVE_INFINITY;
  const budget = Math.min(byRatio, ceiling);
  const tooBig = (): UploadContentRefusal => ({
    error: budget === ceiling
      ? `"${name}" was refused: it expands to more than ${Math.round(ceiling / (1024 * 1024))} MB when opened.`
      : `"${name}" was refused: it expands to more than ${ratio} times its size when opened.`,
    code: 'ZIP_BOMB_DETECTED',
  });

  const measure = await measureZipExpansion(buf, budget);
  if (measure.kind === 'measured') return measure.overBudget ? tooBig() : null;
  if (measure.kind === 'not-zip') return null;
  if (opts.visitor) {
    const ext = exts.find((e) => JSZIP_READ.has(e) || SHEETJS_READ.has(e)) ?? exts[0] ?? '';
    return { error: `"${name}" was refused: it could not be opened as a ${ext} file to check it.`, code: 'UPLOAD_CONTENT' };
  }
  return declaredLocalExpansion(buf) > byRatio ? tooBig() : null;
}

/** The first refusal among several files, or null. */
export async function firstUploadContentRefusal(files: UploadedFileLike[], opts: ContentCheckOptions): Promise<UploadContentRefusal | null> {
  for (const file of files) {
    const refusal = await uploadContentRefusal(file, opts);
    if (refusal) return refusal;
  }
  return null;
}

/**
 * For a demo visitor (a non-admin on DEMO_MODE=true): the first of these
 * files whose content is refused, as the 400 body to send. Null for anyone
 * else, and when every file passes.
 */
export async function demoVisitorUploadRefusal(
  req: { user?: { id?: string; role?: string } },
  files: UploadedFileLike[],
  env: Env = process.env,
): Promise<UploadContentRefusal | null> {
  if (!isDemoVisitor(req, env)) return null;
  return firstUploadContentRefusal(files, { visitor: true, env });
}
