/**
 * export-docx.ts
 * Converts Markdown content to a well-formatted .docx file.
 * Uses the `docx` npm package (pure JS, no native deps).
 *
 * Supports: # headings, ## subheadings, ### h3, **bold**, *italic*,
 *           bullet lists (- item), numbered lists (1. item), --- dividers,
 *           tables (| col | col |), and plain paragraphs.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
} from 'docx';

// ── Brand config type ─────────────────────────────────────────
interface BrandFontEntry { family: string; size: string; color: string }
interface BrandConfig {
  fonts: { body: BrandFontEntry; h1: BrandFontEntry; h2: BrandFontEntry; h3: BrandFontEntry; h4: BrandFontEntry };
  palette: string[];
}

// ── Default colour palette (openEXPERT brand) ─────────────────
const DEF_TEAL = '2DD4A8';
const DEF_DARK = '0F1B2D';
const DEF_GRAY = '707070';
const DEF_WHITE = 'FFFFFF';

/** Strip '#' from hex color */
function hex(c: string): string { return c.replace('#', ''); }

/** Convert "24pt" → 48 half-points for docx */
function ptToHalf(s: string): number {
  const n = parseInt(s, 10);
  return isNaN(n) ? 22 : n * 2;
}

/** Derive styling constants from optional brand config */
function resolveStyle(brand?: BrandConfig | null) {
  const accent    = brand?.palette?.[0] ? hex(brand.palette[0]) : DEF_TEAL;
  const bodyFont  = brand?.fonts?.body?.family || 'Calibri';
  const bodySize  = brand ? ptToHalf(brand.fonts.body.size) : 22;
  const h1Font    = brand?.fonts?.h1?.family || bodyFont;
  const h1Size    = brand ? ptToHalf(brand.fonts.h1.size) : 36;
  const h1Color   = brand?.fonts?.h1?.color ? hex(brand.fonts.h1.color) : accent;
  const h2Font    = brand?.fonts?.h2?.family || bodyFont;
  const h2Size    = brand ? ptToHalf(brand.fonts.h2.size) : 28;
  const h2Color   = brand?.fonts?.h2?.color ? hex(brand.fonts.h2.color) : DEF_DARK;
  const h3Font    = brand?.fonts?.h3?.family || bodyFont;
  const h3Size    = brand ? ptToHalf(brand.fonts.h3.size) : 24;
  const h3Color   = brand?.fonts?.h3?.color ? hex(brand.fonts.h3.color) : '333333';
  const h4Font    = brand?.fonts?.h4?.family || bodyFont;
  const h4Size    = brand ? ptToHalf(brand.fonts.h4.size) : 22;
  const h4Color   = brand?.fonts?.h4?.color ? hex(brand.fonts.h4.color) : '44546A';
  return { accent, bodyFont, bodySize, h1Font, h1Size, h1Color, h2Font, h2Size, h2Color, h3Font, h3Size, h3Color, h4Font, h4Size, h4Color };
}

// ── Inline text parser ────────────────────────────────────────

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Handle **bold**, *italic*, and plain text
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else if (part) {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text: '' })];
}

// ── Table parser ──────────────────────────────────────────────

function parseMarkdownTable(lines: string[], accent: string = DEF_TEAL): Table | null {
  const dataLines = lines.filter((l) => !l.match(/^\|[\s:-]+\|/));
  if (dataLines.length === 0) return null;

  const rows = dataLines.map((line) => {
    return line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
  });

  const colCount = Math.max(...rows.map((r) => r.length));
  const headerBg = DEF_DARK;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, rowIdx) =>
      new TableRow({
        children: Array.from({ length: colCount }, (_, colIdx) => {
          const cellText = cells[colIdx] ?? '';
          return new TableCell({
            shading: rowIdx === 0
              ? { type: ShadingType.CLEAR, color: headerBg, fill: headerBg }
              : undefined,
            borders: rowIdx === 0 ? {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: accent },
            } : undefined,
            children: [
              new Paragraph({
                children: parseInline(cellText).map((run) =>
                  rowIdx === 0 ? new TextRun({ ...run, bold: true, color: DEF_WHITE }) : run
                ),
                spacing: { before: 30, after: 30 },
              }),
            ],
          });
        }),
      })
    ),
  });
}

// ── Main converter ────────────────────────────────────────────

export async function generateDocx(
  markdown: string,
  metadata: { title?: string; author?: string; subject?: string } = {},
  brandConfig?: BrandConfig | null
): Promise<Buffer> {
  const s = resolveStyle(brandConfig);
  const lines = markdown.split('\n');
  const children: (Paragraph | Table)[] = [];

  let i = 0;
  let lastWasBlank = false;
  while (i < lines.length) {
    const line = lines[i];

    // Heading 1
    if (line.startsWith('# ')) {
      children.push(
        new Paragraph({
          text: line.slice(2).trim(),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 60 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: s.accent } },
        })
      );
      i++;
      continue;
    }

    // Heading 2
    if (line.startsWith('## ')) {
      children.push(
        new Paragraph({
          text: line.slice(3).trim(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 40 },
        })
      );
      i++;
      continue;
    }

    // Heading 3
    if (line.startsWith('### ')) {
      children.push(
        new Paragraph({
          text: line.slice(4).trim(),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 30 },
        })
      );
      i++;
      continue;
    }

    // Heading 4
    if (line.startsWith('#### ')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line.slice(5).trim(), bold: true, color: s.h4Color, font: s.h4Font, size: s.h4Size })],
          spacing: { before: 120, after: 20 },
        })
      );
      i++;
      continue;
    }

    // Horizontal rule (---) — drawn as a thin border paragraph
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
      children.push(
        new Paragraph({
          text: '',
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DEF_GRAY } },
          spacing: { before: 60, after: 60 },
        })
      );
      i++;
      continue;
    }

    // Table — collect all table lines
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseMarkdownTable(tableLines, s.accent);
      if (table) {
        children.push(new Paragraph({ text: '', spacing: { before: 60 } }));
        children.push(table);
        children.push(new Paragraph({ text: '', spacing: { after: 40 } }));
      }
      continue;
    }

    // Bullet list
    if (line.match(/^[\s]*[-*]\s+/)) {
      const depth = (line.match(/^(\s*)/) || ['', ''])[1].length;
      const text = line.replace(/^[\s]*[-*]\s+/, '');
      children.push(
        new Paragraph({
          children: parseInline(text),
          bullet: { level: Math.min(Math.floor(depth / 2), 8) },
          spacing: { before: 20, after: 20 },
        })
      );
      i++;
      continue;
    }

    // Numbered list
    if (line.match(/^[\s]*\d+\.\s+/)) {
      const text = line.replace(/^[\s]*\d+\.\s+/, '');
      children.push(
        new Paragraph({
          children: parseInline(text),
          numbering: { reference: 'ordered-list', level: 0 },
          spacing: { before: 20, after: 20 },
        })
      );
      i++;
      continue;
    }

    // Blank line — collapse consecutive blank lines into one small gap
    if (line.trim() === '') {
      if (!lastWasBlank) {
        children.push(new Paragraph({ text: '', spacing: { before: 40 } }));
        lastWasBlank = true;
      }
      // Skip consecutive blank lines entirely
      i++;
      continue;
    }
    lastWasBlank = false;

    // Default: paragraph with inline formatting
    children.push(
      new Paragraph({
        children: parseInline(line),
        spacing: { before: 30, after: 30 },
        alignment: AlignmentType.LEFT,
      })
    );
    i++;
  }

  const doc = new Document({
    creator: metadata.author || 'openEXPERT by ANTON',
    title: metadata.title || 'openEXPERT Output',
    subject: metadata.subject || 'AI-Generated Analysis',
    description: 'Generated by openEXPERT — AI-powered compliance analysis',

    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: NumberFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },

    styles: {
      default: {
        document: {
          run: { font: s.bodyFont, size: s.bodySize },
          paragraph: { spacing: { line: 276 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          run: { size: s.h1Size, bold: true, color: s.h1Color, font: s.h1Font },
          paragraph: { spacing: { before: 300, after: 60 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          run: { size: s.h2Size, bold: true, color: s.h2Color, font: s.h2Font },
          paragraph: { spacing: { before: 200, after: 40 } },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          run: { size: s.h3Size, bold: true, color: s.h3Color, font: s.h3Font },
          paragraph: { spacing: { before: 160, after: 30 } },
        },
      ],
    },

    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: metadata.title || 'openEXPERT Analysis', color: DEF_GRAY, size: 18 }),
                  new TextRun({ text: '  |  Generated by ANTON', color: DEF_GRAY, size: 18, italics: true }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'openEXPERT by ANTON   |   Page ', color: DEF_GRAY, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: DEF_GRAY, size: 16 }),
                  new TextRun({ text: ' of ', color: DEF_GRAY, size: 16 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], color: DEF_GRAY, size: 16 }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
