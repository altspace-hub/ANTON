/**
 * text-extractor.ts
 * Extracts plain text from any supported file type.
 * Supported: .pdf .docx .doc .txt .md .csv .xlsx .html
 */

import * as path from 'path';
import fs from 'fs-extra';
import { estimateTokens } from './token-estimator.js';
import { decodeEntities, removeScriptsAndStyles, stripTags } from '../lib/html-to-text.js';

// ── Limits ───────────────────────────────────────────────────

/** Hard ceiling on file size before any parser loads it into memory (every type). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
/** Hard ceiling on extracted characters per file; the remainder is cut with a visible note. */
export const MAX_EXTRACTED_CHARS = 2_000_000;

const MAX_FILE_MB_LABEL = `${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`;

/**
 * Size guard shared by every extractor. Returns a CONTEXT NOTE (which stands in
 * for the file's text, so the model and the manifest both see why it is absent)
 * when the file is over MAX_FILE_BYTES, or null when it is safe to load.
 */
async function oversizeNote(filePath: string, kind: string, advice: string): Promise<string | null> {
  const stat = await fs.stat(filePath);
  if (stat.size <= MAX_FILE_BYTES) return null;
  const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
  console.warn(`[extractor] ${kind} too large (${sizeMB} MB > ${MAX_FILE_MB_LABEL} limit): ${path.basename(filePath)}`);
  return (
    `[CONTEXT NOTE: ${path.basename(filePath)} could not be loaded — ` +
    `file size ${sizeMB} MB exceeds the ${MAX_FILE_MB_LABEL} limit. ${advice}]`
  );
}

/**
 * Cut extracted text at MAX_EXTRACTED_CHARS and append a note the model and the
 * source manifest can both see. Text within the cap is returned unchanged.
 */
export function capExtractedText(text: string, fileName: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  console.warn(`[extractor] Extracted text truncated (${text.length} chars > ${MAX_EXTRACTED_CHARS} limit): ${fileName}`);
  return (
    text.slice(0, MAX_EXTRACTED_CHARS) +
    `\n\n[CONTEXT NOTE: ${fileName} was truncated — the extracted text is ` +
    `${text.length.toLocaleString('en-US')} characters, above the ` +
    `${MAX_EXTRACTED_CHARS.toLocaleString('en-US')}-character limit; only the first ` +
    `${MAX_EXTRACTED_CHARS.toLocaleString('en-US')} characters are included. ` +
    `Split the document into smaller parts and re-upload for full coverage.]`
  );
}

// ── Type-safe dynamic imports for ESM compatibility ──────────

async function extractPdf(filePath: string): Promise<string> {
  // H2: Guard against OOM — check size before reading the whole file into memory.
  const note = await oversizeNote(filePath, 'PDF', 'Split the document into smaller parts and re-upload.');
  if (note) return note;

  try {
    // pdf-parse v2: buffer passed as `data` in LoadParameters constructor
    const { PDFParse } = await import('pdf-parse');
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text ?? '';
  } catch (err) {
    // H1: Detect password-protected PDFs and surface a clear, user-visible warning
    // instead of silently dropping the file from the knowledge context.
    const msg = err instanceof Error ? err.message : String(err);
    if (/encrypt|password|protected/i.test(msg)) {
      console.warn(`[extractor] Password-protected PDF skipped: ${path.basename(filePath)}`);
      return (
        `[CONTEXT NOTE: ${path.basename(filePath)} could not be loaded — ` +
        `the file is password-protected. Remove the password and re-upload ` +
        `to include it in the analysis.]`
      );
    }
    throw err; // Re-throw non-password errors to be caught by extractTextFromFile
  }
}

async function extractDocx(filePath: string): Promise<string> {
  // mammoth inflates the whole .docx zip in memory — same OOM exposure as PDF/XLSX.
  const note = await oversizeNote(filePath, 'Word document', 'Split the document into smaller parts and re-upload.');
  if (note) return note;

  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractXlsx(filePath: string): Promise<string> {
  const note = await oversizeNote(filePath, 'Excel', 'Split the workbook into smaller files and re-upload.');
  if (note) return note;

  // Use SheetJS (xlsx) which supports both .xlsx and legacy .xls formats
  const XLSX = await import('xlsx');
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    lines.push(`--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    // sheet_to_csv handles empty cells, merged cells, and dates cleanly
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    lines.push(csv);
  }
  return lines.join('\n');
}

async function extractCsv(filePath: string): Promise<string> {
  const note = await oversizeNote(filePath, 'CSV', 'Split the file into smaller parts and re-upload.');
  if (note) return note;
  return fs.readFile(filePath, 'utf-8');
}

async function extractText(filePath: string): Promise<string> {
  const note = await oversizeNote(filePath, 'Text file', 'Split the file into smaller parts and re-upload.');
  if (note) return note;
  return fs.readFile(filePath, 'utf-8');
}

async function extractHtml(filePath: string): Promise<string> {
  const note = await oversizeNote(filePath, 'HTML file', 'Split the file into smaller parts and re-upload.');
  if (note) return note;
  const raw = await fs.readFile(filePath, 'utf-8');
  // Strip tags, then decode entities (once, last)
  return decodeEntities(stripTags(removeScriptsAndStyles(raw)))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Public API ────────────────────────────────────────────────

export interface ExtractedFile {
  name: string;
  path: string;
  extension: string;
  sizeBytes: number;
  text: string;
  wordCount: number;
  tokenEstimate: number;
}

/**
 * Extract text from a single file. Returns null if the file type is unsupported
 * or extraction fails. Every type is size-guarded before it is loaded
 * (MAX_FILE_BYTES) and the result is capped at MAX_EXTRACTED_CHARS with a
 * visible truncation note.
 */
export async function extractTextFromFile(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    let text: string;
    switch (ext) {
      case '.pdf':   text = await extractPdf(filePath); break;
      case '.docx':
      case '.doc':   text = await extractDocx(filePath); break;
      case '.xlsx':
      case '.xls':   text = await extractXlsx(filePath); break;
      case '.csv':   text = await extractCsv(filePath); break;
      case '.txt':
      case '.md':    text = await extractText(filePath); break;
      case '.html':  text = await extractHtml(filePath); break;
      default:
        console.warn(`[extractor] Unsupported extension: ${ext} — ${filePath}`);
        return null;
    }
    return capExtractedText(text, path.basename(filePath));
  } catch (err) {
    // The path can come from a request: an argument, never part of the format string.
    console.error('[extractor] Failed to extract %s:', filePath, err);
    return null;
  }
}

/**
 * Extract and return structured file info for a list of file paths.
 * Files that fail extraction are omitted from the result.
 */
export async function extractFiles(filePaths: string[]): Promise<ExtractedFile[]> {
  const results: ExtractedFile[] = [];

  for (const filePath of filePaths) {
    const text = await extractTextFromFile(filePath);
    if (text === null) continue;

    const stat = await fs.stat(filePath);
    const words = text.split(/\s+/).filter(Boolean).length;

    results.push({
      name: path.basename(filePath),
      path: filePath,
      extension: path.extname(filePath).toLowerCase(),
      sizeBytes: stat.size,
      text,
      wordCount: words,
      // Same tokeniser the resolver budgets with — words×1.3 under-counted code/tables.
      tokenEstimate: estimateTokens(text),
    });
  }

  return results;
}
