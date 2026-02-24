/**
 * export-pdf.ts
 * Converts Markdown content to a branded PDF using PDFKit.
 * Pure Node.js — no Chrome/Puppeteer dependency.
 *
 * Supports: # headings, ## sub-headings, **bold**, bullet lists,
 *           horizontal rules, and tables.
 */

import PDFDocument from 'pdfkit';

// ── Brand config type ────────────────────────────────────────
interface BrandFontEntry { family: string; size: string; color: string }
interface BrandConfig {
  fonts: { body: BrandFontEntry; h1: BrandFontEntry; h2: BrandFontEntry; h3: BrandFontEntry; h4: BrandFontEntry };
  palette: string[];
}

/** Convert hex color string (#RRGGBB or RRGGBB) to RGB tuple */
function hexToRgb(h: string): [number, number, number] {
  const c = h.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

// ── Default brand colours (RGB 0-255) ────────────────────────
const DEF_COLOR = {
  teal:      [45, 212, 168]  as [number, number, number],
  dark:      [11, 20, 38]    as [number, number, number],
  dark2:     [15, 27, 45]    as [number, number, number],
  card:      [21, 34, 56]    as [number, number, number],
  offWhite:  [224, 224, 224] as [number, number, number],
  gray:      [176, 176, 176] as [number, number, number],
  grayMed:   [112, 112, 112] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
};

/** Resolve PDF colours from optional brand config */
function resolvePdfStyle(brand?: BrandConfig | null) {
  const accent  = brand?.palette?.[0] ? hexToRgb(brand.palette[0]) : DEF_COLOR.teal;
  const h1Color = brand?.fonts?.h1?.color ? hexToRgb(brand.fonts.h1.color) : accent;
  const h2Color = brand?.fonts?.h2?.color ? hexToRgb(brand.fonts.h2.color) : DEF_COLOR.offWhite;
  const h3Color = brand?.fonts?.h3?.color ? hexToRgb(brand.fonts.h3.color) : DEF_COLOR.gray;
  const h4Color = brand?.fonts?.h4?.color ? hexToRgb(brand.fonts.h4.color) : DEF_COLOR.gray;
  const bodyColor = brand?.fonts?.body?.color ? hexToRgb(brand.fonts.body.color) : DEF_COLOR.offWhite;
  const h1Size = brand?.fonts?.h1?.size ? parseInt(brand.fonts.h1.size, 10) || 16 : 16;
  const h2Size = brand?.fonts?.h2?.size ? parseInt(brand.fonts.h2.size, 10) || 13 : 13;
  const h3Size = brand?.fonts?.h3?.size ? parseInt(brand.fonts.h3.size, 10) || 11 : 11;
  return { accent, h1Color, h2Color, h3Color, h4Color, bodyColor, h1Size, h2Size, h3Size };
}

// ── Fonts — PDFKit ships with Helvetica (system font, safe cross-platform)
const FONT = {
  regular: 'Helvetica',
  bold:    'Helvetica-Bold',
  italic:  'Helvetica-Oblique',
};

const PAGE = { margin: 60, width: 595, height: 842 }; // A4 points

// ── Inline text renderer (bold/italic segments) ──────────────

interface Segment { text: string; bold: boolean; italic: boolean }

function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)|([^*]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      if (m[1].startsWith('**')) {
        segments.push({ text: m[1].slice(2, -2), bold: true, italic: false });
      } else {
        segments.push({ text: m[1].slice(1, -1), bold: false, italic: true });
      }
    } else if (m[2]) {
      segments.push({ text: m[2], bold: false, italic: false });
    }
  }
  return segments;
}

// ── Table parser ─────────────────────────────────────────────

function parseMarkdownTable(lines: string[]): { headers: string[]; rows: string[][] } | null {
  const clean = lines.filter((l) => !l.match(/^\|[\s:-]+\|/));
  if (clean.length === 0) return null;
  const split = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim());
  const [header, ...rest] = clean;
  return { headers: split(header), rows: rest.map(split) };
}

// ── PDF Generator ────────────────────────────────────────────

export function generatePdf(
  markdown: string,
  metadata: { title?: string; author?: string } = {},
  brandConfig?: BrandConfig | null
): Promise<Buffer> {
  const ps = resolvePdfStyle(brandConfig);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
      info: {
        Title:   metadata.title  || 'openEXPERT Output',
        Author:  metadata.author || 'openEXPERT by ANTON',
        Creator: 'openEXPERT by ANTON',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bodyWidth = PAGE.width - PAGE.margin * 2;

    // ── Header bar ───────────────────────────────────────────
    doc.rect(0, 0, PAGE.width, 40).fill(DEF_COLOR.dark2);
    doc.fillColor(ps.accent).font(FONT.bold).fontSize(11)
      .text('openEXPERT', PAGE.margin, 13);
    doc.fillColor(DEF_COLOR.gray).font(FONT.regular).fontSize(9)
      .text('by ANTON', PAGE.margin + 85, 15);
    doc.fillColor(DEF_COLOR.grayMed).font(FONT.regular).fontSize(8)
      .text(
        new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        0, 15, { align: 'right', width: PAGE.width - PAGE.margin }
      );

    doc.moveDown(2);

    // ── Document title ───────────────────────────────────────
    if (metadata.title) {
      doc.fillColor(ps.accent).font(FONT.bold).fontSize(20)
        .text(metadata.title, { align: 'left' })
        .moveDown(0.5);
      doc.moveTo(PAGE.margin, doc.y)
        .lineTo(PAGE.margin + bodyWidth, doc.y)
        .strokeColor(ps.accent).lineWidth(1.5).stroke();
      doc.moveDown(1);
    }

    // ── Markdown renderer ────────────────────────────────────
    const lines = markdown.split('\n');
    let i = 0;

    function ensureSpace(needed = 60) {
      if (doc.y + needed > PAGE.height - PAGE.margin - 40) {
        doc.addPage();
        doc.rect(0, 0, PAGE.width, 40).fill(DEF_COLOR.dark2);
        doc.moveDown(3);
      }
    }

    function renderInline(text: string, opts: { fontSize?: number } = {}) {
      const segments = parseInline(text);
      const fs = opts.fontSize ?? 10;
      for (const seg of segments) {
        doc.fillColor(ps.bodyColor)
          .font(seg.bold ? FONT.bold : seg.italic ? FONT.italic : FONT.regular)
          .fontSize(fs);
        doc.text(seg.text, { continued: true, lineGap: 2 });
      }
      // End the continued text
      doc.text('', { continued: false });
    }

    while (i < lines.length) {
      const line = lines[i];

      // H1
      if (line.startsWith('# ')) {
        ensureSpace(80);
        doc.moveDown(0.8);
        doc.fillColor(ps.h1Color).font(FONT.bold).fontSize(ps.h1Size)
          .text(line.slice(2).trim(), { lineGap: 4 });
        doc.moveTo(PAGE.margin, doc.y + 2)
          .lineTo(PAGE.margin + bodyWidth, doc.y + 2)
          .strokeColor(ps.accent).lineWidth(1).stroke();
        doc.moveDown(0.6);
        i++; continue;
      }

      // H2
      if (line.startsWith('## ')) {
        ensureSpace(60);
        doc.moveDown(0.6);
        doc.fillColor(ps.h2Color).font(FONT.bold).fontSize(ps.h2Size)
          .text(line.slice(3).trim(), { lineGap: 3 });
        doc.moveDown(0.4);
        i++; continue;
      }

      // H3
      if (line.startsWith('### ')) {
        ensureSpace(40);
        doc.moveDown(0.4);
        doc.fillColor(ps.h3Color).font(FONT.bold).fontSize(ps.h3Size)
          .text(line.slice(4).trim(), { lineGap: 2 });
        doc.moveDown(0.3);
        i++; continue;
      }

      // H4
      if (line.startsWith('#### ')) {
        doc.fillColor(ps.h4Color).font(FONT.bold).fontSize(10)
          .text(line.slice(5).trim(), { lineGap: 2 });
        i++; continue;
      }

      // HR
      if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
        doc.moveDown(0.5);
        doc.moveTo(PAGE.margin, doc.y)
          .lineTo(PAGE.margin + bodyWidth, doc.y)
          .strokeColor(DEF_COLOR.card).lineWidth(1).stroke();
        doc.moveDown(0.5);
        i++; continue;
      }

      // Table
      if (line.startsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        const parsed = parseMarkdownTable(tableLines);
        if (parsed) {
          ensureSpace(60);
          const colCount = parsed.headers.length;
          const colW = bodyWidth / colCount;

          // Header
          doc.rect(PAGE.margin, doc.y, bodyWidth, 20).fill(DEF_COLOR.dark2);
          parsed.headers.forEach((h, ci) => {
            doc.fillColor(ps.accent).font(FONT.bold).fontSize(8)
              .text(h, PAGE.margin + colW * ci + 4, doc.y - 15, {
                width: colW - 8, height: 18, ellipsis: true,
              });
          });
          doc.moveDown(0.2);

          // Data rows
          parsed.rows.forEach((cells, rowIdx) => {
            ensureSpace(18);
            const bg = rowIdx % 2 === 0 ? DEF_COLOR.dark : DEF_COLOR.card;
            const rowY = doc.y;
            doc.rect(PAGE.margin, rowY, bodyWidth, 18).fill(bg);
            cells.forEach((cell, ci) => {
              doc.fillColor(ps.bodyColor).font(FONT.regular).fontSize(8)
                .text(cell, PAGE.margin + colW * ci + 4, rowY + 4, {
                  width: colW - 8, height: 14, ellipsis: true,
                });
            });
            doc.moveDown(0.15);
          });
          doc.moveDown(0.5);
        }
        continue;
      }

      // Bullet
      if (line.match(/^[\s]*[-*]\s+/)) {
        const depth = (line.match(/^(\s*)/) || ['', ''])[1].length;
        const text = line.replace(/^[\s]*[-*]\s+/, '');
        const indent = PAGE.margin + depth * 10;
        doc.fillColor(ps.accent).font(FONT.bold).fontSize(10)
          .text('•', indent, doc.y, { continued: true, width: 14 });
        doc.fillColor(ps.bodyColor).font(FONT.regular).fontSize(10)
          .text(' ' + text, { lineGap: 2, width: bodyWidth - depth * 10 - 14 });
        i++; continue;
      }

      // Blank line
      if (line.trim() === '') {
        doc.moveDown(0.4);
        i++; continue;
      }

      // Default paragraph
      ensureSpace(14);
      renderInline(line);
      doc.moveDown(0.2);
      i++;
    }

    // ── Footer bar ───────────────────────────────────────────
    const pages = doc.bufferedPageRange();
    for (let p = 0; p < pages.count; p++) {
      doc.switchToPage(pages.start + p);
      doc.rect(0, PAGE.height - 30, PAGE.width, 30).fill(DEF_COLOR.dark2);
      doc.fillColor(DEF_COLOR.grayMed).font(FONT.regular).fontSize(8)
        .text(
          `openEXPERT by ANTON  |  Page ${p + 1} of ${pages.count}`,
          PAGE.margin, PAGE.height - 18, { align: 'center', width: bodyWidth }
        );
    }

    doc.end();
  });
}
