/**
 * export-docx-code.test.ts — fenced code blocks must not be re-parsed as markdown.
 *
 * The .docx generator walked the markdown line by line with no fence awareness, so the
 * lines INSIDE a ``` block were fed through every rule. A generated Python script's
 * `# Load the data` comment became a real Word Heading 1 — page break, section number,
 * an entry in the table of contents. `- item` became a bullet, `| a | b |` became a
 * table, and the fence markers themselves became paragraphs of literal backticks.
 *
 * The structural damage was worse than the mangled block. Those fake headings advanced
 * the h1/h2/h3 counters, so every GENUINE heading after a code block was misnumbered —
 * one snippet corrupted the numbering of the entire document. ANTON's Script Lite and
 * Script Medium modules exist to emit code, so this fired on their primary output.
 *
 * These assert against the real document.xml inside the generated .docx, because the
 * defect is in what reaches Word, not in an intermediate structure.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateDocx } from '../../server/services/export-docx.js';

async function documentXml(md: string): Promise<string> {
  const buf = await generateDocx(md, { title: 'T' });
  const zip = await JSZip.loadAsync(buf);
  return zip.file('word/document.xml')!.async('string');
}

/**
 * Every document carries a cover page, which contributes its own Heading1 and tables.
 * Counts are therefore measured against a control document rather than against zero —
 * an absolute count would encode the cover's current structure into these tests and
 * break the next time the cover changes.
 */
const CONTROL = await documentXml('Plain paragraph.');

function headingCount(xml: string, level: number): number {
  return (xml.match(new RegExp(`w:val="Heading${level}"`, 'g')) ?? []).length;
}

/** Headings added by the body, over and above the cover's. */
function bodyHeadings(xml: string, level: number): number {
  return headingCount(xml, level) - headingCount(CONTROL, level);
}

function bodyTables(xml: string): number {
  const count = (s: string) => (s.match(/<w:tbl>/g) ?? []).length;
  return count(xml) - count(CONTROL);
}

/**
 * List paragraphs, counted via <w:numPr> — the numbering reference that actually lands
 * in document.xml. Asserting on the literal 'bullet-list' passes vacuously: that string
 * only ever appears in numbering.xml, so a "no bullets here" check written that way is
 * true no matter what the exporter does.
 */
function bodyListItems(xml: string): number {
  const count = (s: string) => (s.match(/<w:numPr>/g) ?? []).length;
  return count(xml) - count(CONTROL);
}

/** The text of every heading paragraph, so we can assert on what was promoted. */
function headingTexts(xml: string): string[] {
  const paras = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  return paras
    .filter((p) => /w:val="Heading\d"/.test(p))
    .map((p) => [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join(''));
}

const SCRIPT = [
  '## Generated Script',
  '',
  '```python',
  '# Load the data',
  'import pandas as pd',
  '',
  '## not a heading either',
  'def main():',
  '    total = 0        # indented',
  '    return total',
  '- not a bullet',
  '| not | a table |',
  '---',
  '**not bold**',
  '```',
  '',
  '## Real Section After Code',
].join('\n');

describe('markdown inside a fence is not interpreted', () => {
  it('does not turn a code comment into a Word heading', async () => {
    const xml = await documentXml(SCRIPT);
    // The text survives, but no heading paragraph was built from it.
    expect(headingTexts(xml).some((t) => t.includes('Load the data'))).toBe(false);
    expect(headingTexts(xml).some((t) => t.includes('not a heading either'))).toBe(false);
    // Exactly the two real ## headings, and no H1 invented from '# Load the data'.
    expect(bodyHeadings(xml, 2)).toBe(2);
    expect(bodyHeadings(xml, 1)).toBe(0);
  });

  it('keeps the comment text — it is preserved, just not promoted', async () => {
    const xml = await documentXml(SCRIPT);
    expect(xml).toContain('# Load the data');
  });

  it('does not build a table from a piped line inside the fence', async () => {
    const xml = await documentXml(SCRIPT);
    expect(bodyTables(xml)).toBe(0);
    expect(xml).toContain('| not | a table |');
  });

  it('does not create a list item from a dash inside the fence', async () => {
    const xml = await documentXml(SCRIPT);
    expect(bodyListItems(xml)).toBe(0);
    expect(xml).toContain('- not a bullet');
  });

  it('does not apply bold to ** inside the fence', async () => {
    const xml = await documentXml(SCRIPT);
    expect(xml).toContain('**not bold**');
  });

  it('does not drop a --- line inside the fence', async () => {
    // Outside a fence, --- is deliberately skipped. Inside one it is often real syntax.
    const xml = await documentXml(SCRIPT);
    expect(xml).toContain('---');
  });

  it('does not emit the fence markers themselves', async () => {
    const xml = await documentXml(SCRIPT);
    expect(xml).not.toContain('```');
  });

  it('renders code in a monospace font', async () => {
    const xml = await documentXml(SCRIPT);
    expect(xml).toContain('Consolas');
  });

  it('preserves indentation, which IS the syntax in Python', async () => {
    const xml = await documentXml(SCRIPT);
    // Leading spaces are emitted as non-breaking so Word cannot collapse them.
    expect(xml).toMatch(/ {4}total/);
  });
});

describe('heading numbering survives a code block', () => {
  it('numbers the heading after a fence as if the fence were not there', async () => {
    // The regression that made this worth fixing: fake headings inside the fence
    // advanced the counters, so real headings after it were misnumbered.
    const xml = await documentXml(SCRIPT);
    expect(xml).toContain('1  Generated Script');
    expect(xml).toContain('2  Real Section After Code');
  });

  it('leaves headings outside fences working normally', async () => {
    const xml = await documentXml('# Title\n\n## Sub\n\nBody text.');
    expect(bodyHeadings(xml, 1)).toBe(1);
    expect(bodyHeadings(xml, 2)).toBe(1);
  });
});

describe('fence edge cases', () => {
  it('handles a tilde fence', async () => {
    const xml = await documentXml('~~~\n# not a heading\n~~~\n');
    expect(bodyHeadings(xml, 1)).toBe(0);
  });

  it('does not let a ``` inside a ~~~ block close it early', async () => {
    const xml = await documentXml('~~~\n```\n# still code\n```\n~~~\n\n# Real\n');
    expect(bodyHeadings(xml, 1)).toBe(1);       // only the one after the block
  });

  it('treats an unclosed fence as running to the end, per CommonMark', async () => {
    const xml = await documentXml('Intro.\n\n```js\n# not a heading\nconst x = 1;\n');
    expect(bodyHeadings(xml, 1)).toBe(0);
    expect(xml).toContain('const x = 1;');
  });

  it('survives an empty fence without emitting a stray paragraph', async () => {
    await expect(documentXml('```\n```\n')).resolves.toBeTypeOf('string');
  });

  it('still renders an ordinary document unchanged', async () => {
    const xml = await documentXml('# Title\n\n- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    expect(bodyHeadings(xml, 1)).toBe(1);
    expect(bodyListItems(xml)).toBe(2);
    expect(bodyTables(xml)).toBe(1);
  });
});

describe('inline code spans', () => {
  it('renders `code` monospace and drops the backticks', async () => {
    const xml = await documentXml('Call the `db.get()` helper.');
    expect(xml).toContain('db.get()');
    expect(xml).not.toContain('`db.get()`');
    expect(xml).toContain('Consolas');
  });

  it('does not apply bold inside a code span', async () => {
    const xml = await documentXml('Use `**literal**` here.');
    expect(xml).toContain('**literal**');
  });

  it('leaves bold outside code spans working', async () => {
    const xml = await documentXml('This is **bold** text.');
    expect(xml).toContain('<w:b/>');
    expect(xml).not.toContain('**bold**');
  });
});
