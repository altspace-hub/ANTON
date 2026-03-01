/**
 * text-extractor.ts
 * Extracts plain text from any supported file type.
 * Supported: .pdf .docx .doc .txt .md .csv .xlsx .html
 */

import * as path from 'path';
import fs from 'fs-extra';

// ── Type-safe dynamic imports for ESM compatibility ──────────

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB — hard ceiling before loading into memory

async function extractPdf(filePath: string): Promise<string> {
  // H2: Guard against OOM — check size before reading the whole file into memory.
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
    console.warn(`[extractor] PDF too large (${sizeMB} MB > 50 MB limit): ${path.basename(filePath)}`);
    return (
      `[CONTEXT NOTE: ${path.basename(filePath)} could not be loaded — ` +
      `file size ${sizeMB} MB exceeds the 50 MB limit. ` +
      `Split the document into smaller parts and re-upload.]`
    );
  }

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
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractXlsx(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
    console.warn(`[extractor] Excel too large (${sizeMB} MB > 50 MB limit): ${path.basename(filePath)}`);
    return (
      `[CONTEXT NOTE: ${path.basename(filePath)} could not be loaded — ` +
      `file size ${sizeMB} MB exceeds the 50 MB limit. ` +
      `Split the workbook into smaller files and re-upload.]`
    );
  }

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
  return fs.readFile(filePath, 'utf-8');
}

async function extractText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

async function extractHtml(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, 'utf-8');
  // Strip tags, decode basic entities
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
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
 * or extraction fails.
 */
export async function extractTextFromFile(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    switch (ext) {
      case '.pdf':   return await extractPdf(filePath);
      case '.docx':
      case '.doc':   return await extractDocx(filePath);
      case '.xlsx':
      case '.xls':   return await extractXlsx(filePath);
      case '.csv':   return await extractCsv(filePath);
      case '.txt':
      case '.md':    return await extractText(filePath);
      case '.html':  return await extractHtml(filePath);
      default:
        console.warn(`[extractor] Unsupported extension: ${ext} — ${filePath}`);
        return null;
    }
  } catch (err) {
    console.error(`[extractor] Failed to extract ${filePath}:`, err);
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
      tokenEstimate: Math.round(words * 1.3),
    });
  }

  return results;
}
