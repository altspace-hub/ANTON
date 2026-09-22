/**
 * text-extractor-limits.test.ts — every file type is size-guarded before a parser
 * loads it (MAX_FILE_BYTES; DOCX was unbounded before Wave 2), and extracted text
 * is capped at MAX_EXTRACTED_CHARS with a note the model and the manifest can see.
 *
 * Oversize inputs are sparse files (fs.truncate) — the guard trips on st_size and
 * nothing ever reads them, so the test costs milliseconds, not 50 MB of writes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { Document, Packer, Paragraph } from 'docx';
import {
  extractTextFromFile,
  extractFiles,
  capExtractedText,
  MAX_FILE_BYTES,
  MAX_EXTRACTED_CHARS,
} from '../../server/services/text-extractor';
import { estimateTokens } from '../../server/services/token-estimator';

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'anton-extractor-limits-'));
});

afterAll(async () => {
  await fs.remove(dir);
});

async function sparseFile(name: string, bytes: number): Promise<string> {
  const p = path.join(dir, name);
  await fs.writeFile(p, '');
  await fs.truncate(p, bytes);
  return p;
}

async function textFile(name: string, content: string): Promise<string> {
  const p = path.join(dir, name);
  await fs.writeFile(p, content, 'utf-8');
  return p;
}

describe('DOCX size guard', () => {
  it('extracts a real .docx within the limit', async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph('Hello from a Word document.')] }] });
    const p = path.join(dir, 'small.docx');
    await fs.writeFile(p, await Packer.toBuffer(doc));

    const text = await extractTextFromFile(p);

    // KNOWN RED (2026-09-16): mammoth 1.x (incl. latest 1.12.3) declares
    // @xmldom/xmldom ^0.8.6 and calls DOMParser.parseFromString(xml) with no MIME
    // type; the pnpm override ">=0.8.13" (commit f532c324, CVE remediation) lets
    // pnpm resolve 0.9.10, where that argument is mandatory. Every valid .docx
    // therefore throws inside extractDocx and is silently dropped from the
    // knowledge context. Fix: pin the override to ">=0.8.13 <0.9.0" (0.8.15 is
    // the newest 0.8.x) and re-install. This test goes green with that change.
    expect(
      text,
      'DOCX extraction returned null — @xmldom/xmldom 0.9.x is installed but mammoth needs 0.8.x; ' +
        'pin package.json pnpm.overrides["@xmldom/xmldom"] to ">=0.8.13 <0.9.0" and re-install.',
    ).not.toBeNull();
    expect(text).toContain('Hello from a Word document.');
  });

  it('refuses a .docx over MAX_FILE_BYTES with a CONTEXT NOTE instead of loading it', async () => {
    const p = await sparseFile('huge.docx', MAX_FILE_BYTES + 1);

    const started = Date.now();
    const text = await extractTextFromFile(p);

    expect(text).toMatch(/^\[CONTEXT NOTE: huge\.docx could not be loaded/);
    expect(text).toMatch(/exceeds the 50 MB limit/);
    expect(Date.now() - started).toBeLessThan(5_000); // never parsed
  });

  it('accepts a .docx at exactly MAX_FILE_BYTES (the guard is strict >)', async () => {
    // A sparse zero-filled "docx" is not a valid zip — mammoth throws and the
    // extractor returns null. What matters here is that the size guard did NOT
    // trip (which would have returned a note string instead of null).
    const p = await sparseFile('edge.docx', MAX_FILE_BYTES);
    const text = await extractTextFromFile(p);
    expect(text).toBeNull();
  });
});

describe('size guard on the previously unbounded plain types', () => {
  it.each(['big.csv', 'big.txt', 'big.md', 'big.html'])('refuses %s over MAX_FILE_BYTES', async (name) => {
    const p = await sparseFile(name, MAX_FILE_BYTES + 1);
    const text = await extractTextFromFile(p);
    expect(text).toMatch(/^\[CONTEXT NOTE: .* could not be loaded/);
    expect(text).toMatch(/exceeds the 50 MB limit/);
  });
});

describe('extracted-character cap', () => {
  it('cuts text over MAX_EXTRACTED_CHARS and appends a visible truncation note', async () => {
    const body = 'lorem ipsum '.repeat(Math.ceil((MAX_EXTRACTED_CHARS + 50_000) / 12));
    const p = await textFile('long.md', body);

    const text = await extractTextFromFile(p);

    expect(text).not.toBeNull();
    expect(text!.startsWith(body.slice(0, 200))).toBe(true);
    expect(text!.slice(0, MAX_EXTRACTED_CHARS)).toBe(body.slice(0, MAX_EXTRACTED_CHARS));
    const note = text!.slice(MAX_EXTRACTED_CHARS);
    expect(note).toMatch(/^\n\n\[CONTEXT NOTE: long\.md was truncated/);
    expect(note).toContain(`${MAX_EXTRACTED_CHARS.toLocaleString('en-US')}-character limit`);
    expect(note).toContain(body.length.toLocaleString('en-US'));
  });

  it('leaves text within the cap untouched', async () => {
    const p = await textFile('short.txt', 'Just a short note.');
    expect(await extractTextFromFile(p)).toBe('Just a short note.');
    expect(capExtractedText('x'.repeat(MAX_EXTRACTED_CHARS), 'edge.txt')).toBe('x'.repeat(MAX_EXTRACTED_CHARS));
  });

  it('extractFiles reports the capped text and budgets it with estimateTokens', async () => {
    // Prose, not one repeated character: tiktoken is quadratic on a single giant "word".
    const body = 'sentence after sentence. '.repeat(Math.ceil((MAX_EXTRACTED_CHARS + 50_000) / 25));
    const p = await textFile('capped.txt', body);

    const [file] = await extractFiles([p]);

    expect(file.text.length).toBeGreaterThan(MAX_EXTRACTED_CHARS);
    expect(file.text.length).toBeLessThan(body.length); // 50k chars cut, ~250-char note added
    expect(file.text).toContain('[CONTEXT NOTE: capped.txt was truncated');
    expect(file.tokenEstimate).toBe(estimateTokens(file.text));
    expect(file.sizeBytes).toBe(body.length);
  });
});
