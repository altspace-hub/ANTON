/**
 * export-pdf.ts
 * Converts Markdown content to a branded PDF using PDFKit.
 * Pure Node.js — no Chrome/Puppeteer dependency.
 *
 * Supports: # headings, ## sub-headings, **bold**, bullet lists,
 *           horizontal rules, and tables.
 */

import PDFDocument from 'pdfkit';

// ── Locale-aware export section labels ───────────────────────
const EXPORT_LABELS: Record<string, Record<string, string>> = {
  en: {
    executiveSummary: 'Executive Summary',
    analysis: 'Analysis',
    recommendations: 'Recommendations',
    introduction: 'Introduction',
    conclusion: 'Conclusion',
    references: 'References',
    methodology: 'Methodology',
    background: 'Background',
    keyFindings: 'Key Findings',
  },
  ar: {
    executiveSummary: 'الملخص التنفيذي',
    analysis: 'التحليل',
    recommendations: 'التوصيات',
    introduction: 'مقدمة',
    conclusion: 'خاتمة',
    references: 'المراجع',
    methodology: 'المنهجية',
    background: 'الخلفية',
    keyFindings: 'النتائج الرئيسية',
  },
  de: {
    executiveSummary: 'Zusammenfassung',
    analysis: 'Analyse',
    recommendations: 'Empfehlungen',
    introduction: 'Einleitung',
    conclusion: 'Fazit',
    references: 'Referenzen',
    methodology: 'Methodik',
    background: 'Hintergrund',
    keyFindings: 'Wichtigste Erkenntnisse',
  },
  es: {
    executiveSummary: 'Resumen Ejecutivo',
    analysis: 'Análisis',
    recommendations: 'Recomendaciones',
    introduction: 'Introducción',
    conclusion: 'Conclusión',
    references: 'Referencias',
    methodology: 'Metodología',
    background: 'Antecedentes',
    keyFindings: 'Hallazgos Clave',
  },
  fr: {
    executiveSummary: 'Résumé Exécutif',
    analysis: 'Analyse',
    recommendations: 'Recommandations',
    introduction: 'Introduction',
    conclusion: 'Conclusion',
    references: 'Références',
    methodology: 'Méthodologie',
    background: 'Contexte',
    keyFindings: 'Conclusions Clés',
  },
  hi: {
    executiveSummary: 'कार्यकारी सारांश',
    analysis: 'विश्लेषण',
    recommendations: 'सिफारिशें',
    introduction: 'परिचय',
    conclusion: 'निष्कर्ष',
    references: 'संदर्भ',
    methodology: 'पद्धति',
    background: 'पृष्ठभूमि',
    keyFindings: 'मुख्य निष्कर्ष',
  },
  ja: {
    executiveSummary: 'エグゼクティブサマリー',
    analysis: '分析',
    recommendations: '推奨事項',
    introduction: 'はじめに',
    conclusion: '結論',
    references: '参考文献',
    methodology: '方法論',
    background: '背景',
    keyFindings: '主な発見事項',
  },
  ko: {
    executiveSummary: '경영진 요약',
    analysis: '분석',
    recommendations: '권고사항',
    introduction: '서론',
    conclusion: '결론',
    references: '참고문헌',
    methodology: '방법론',
    background: '배경',
    keyFindings: '주요 결과',
  },
  pt: {
    executiveSummary: 'Resumo Executivo',
    analysis: 'Análise',
    recommendations: 'Recomendações',
    introduction: 'Introdução',
    conclusion: 'Conclusão',
    references: 'Referências',
    methodology: 'Metodologia',
    background: 'Contexto',
    keyFindings: 'Principais Conclusões',
  },
  'zh-CN': {
    executiveSummary: '执行摘要',
    analysis: '分析',
    recommendations: '建议',
    introduction: '介绍',
    conclusion: '结论',
    references: '参考文献',
    methodology: '方法论',
    background: '背景',
    keyFindings: '主要发现',
  },
};

/**
 * Returns localised section header labels for the given language.
 * Falls back to English for any language not in the map.
 */
export function getExportLabels(language: string): Record<string, string> {
  return EXPORT_LABELS[language] ?? EXPORT_LABELS['en'];
}

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

// GOV-04: Build export footer with analysis provenance metadata (shared with docx)
function buildExportFooter(meta: {
  model?: string; thinking?: string; moduleId?: string;
  sessionId?: string; creativity?: string; documentsLoaded?: string[];
} = {}): string {
  const parts: string[] = [];
  if (meta.moduleId) parts.push(`Module: ${meta.moduleId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);
  if (meta.model)    parts.push(`Model: ${meta.model}`);
  if (meta.thinking) parts.push(`Thinking: ${meta.thinking}`);
  if (meta.creativity) parts.push(`Creativity: ${meta.creativity}`);
  if (meta.sessionId) parts.push(`Session: ${meta.sessionId}`);
  parts.push(`Generated: ${new Date().toISOString().split('T')[0]}`);
  const provenance = parts.length ? `\n\n*Analysis configuration: ${parts.join(' | ')}*` : '';

  const sourcesSection = meta.documentsLoaded && meta.documentsLoaded.length > 0
    ? `\n\n**Sources & Scope:** ${meta.documentsLoaded.join(', ')}`
    : '';

  return `\n\n---\n\n**Legal Disclaimer:** This document has been prepared by ANTON AI (openEXPERT) for informational purposes only. It does not constitute legal, regulatory, or compliance advice. The analysis is based on information provided and AI-generated content, which may contain errors or omissions. Users must verify all findings independently and consult qualified legal and compliance professionals before acting on this output. Futurechain / openEXPERT accepts no liability for decisions made based on this document.${sourcesSection}${provenance}`;
}

// ── PDF Generator ────────────────────────────────────────────

export function generatePdf(
  markdown: string,
  metadata: { title?: string; author?: string; model?: string; thinking?: string; moduleId?: string; sessionId?: string; creativity?: string; documentsLoaded?: string[] } = {},
  brandConfig?: BrandConfig | null
): Promise<Buffer> {
  const ps = resolvePdfStyle(brandConfig);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
      info: {
        Title:   metadata.title  || 'ANTON Output',
        Author:  metadata.author || 'ANTON by openEXPERT',
        Creator: 'ANTON by openEXPERT',
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
      .text('ANTON', PAGE.margin, 13);
    doc.fillColor(DEF_COLOR.gray).font(FONT.regular).fontSize(9)
      .text('by openEXPERT', PAGE.margin + 55, 15);
    doc.fillColor(DEF_COLOR.grayMed).font(FONT.regular).fontSize(8)
      .text(
        new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        0, 15, { align: 'right', width: PAGE.width - PAGE.margin }
      );

    doc.moveDown(2.5);

    // ── Document title ───────────────────────────────────────
    if (metadata.title) {
      doc.fillColor(ps.accent).font(FONT.bold).fontSize(20)
        .text(metadata.title, PAGE.margin, doc.y, { width: bodyWidth, align: 'left' })
        .moveDown(0.5);
      doc.moveTo(PAGE.margin, doc.y)
        .lineTo(PAGE.margin + bodyWidth, doc.y)
        .strokeColor(ps.accent).lineWidth(1.5).stroke();
      doc.moveDown(1);
    }

    // ── Markdown renderer ────────────────────────────────────
    const lines = (markdown + buildExportFooter(metadata)).split('\n');
    let i = 0;

    function ensureSpace(needed = 60) {
      if (doc.y + needed > PAGE.height - PAGE.margin - 40) {
        doc.addPage();
        doc.rect(0, 0, PAGE.width, 40).fill(DEF_COLOR.dark2);
        doc.moveDown(3);
      }
    }

    function renderInline(text: string, opts: { fontSize?: number; x?: number; width?: number } = {}) {
      const segments = parseInline(text);
      if (segments.length === 0) return;
      const fs = opts.fontSize ?? 10;
      const startX = opts.x ?? PAGE.margin;
      const w = opts.width ?? bodyWidth;
      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si];
        const isLast = si === segments.length - 1;
        doc.fillColor(ps.bodyColor)
          .font(seg.bold ? FONT.bold : seg.italic ? FONT.italic : FONT.regular)
          .fontSize(fs);
        if (si === 0) {
          // Anchor first segment with explicit position + width so we never inherit
          // a narrow column from a prior PDFKit continued call (e.g. bullet dot).
          // continued: false on the last segment so PDFKit properly advances doc.y.
          doc.text(seg.text, startX, doc.y, { continued: !isLast, lineGap: 2, width: w });
        } else {
          doc.text(seg.text, { continued: !isLast, lineGap: 2 });
        }
      }
    }

    while (i < lines.length) {
      const line = lines[i];

      // H1
      if (line.startsWith('# ')) {
        ensureSpace(80);
        doc.moveDown(0.8);
        doc.fillColor(ps.h1Color).font(FONT.bold).fontSize(ps.h1Size)
          .text(line.slice(2).trim(), PAGE.margin, doc.y, { lineGap: 4, width: bodyWidth });
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
          .text(line.slice(3).trim(), PAGE.margin, doc.y, { lineGap: 3, width: bodyWidth });
        doc.moveDown(0.4);
        i++; continue;
      }

      // H3
      if (line.startsWith('### ')) {
        ensureSpace(40);
        doc.moveDown(0.4);
        doc.fillColor(ps.h3Color).font(FONT.bold).fontSize(ps.h3Size)
          .text(line.slice(4).trim(), PAGE.margin, doc.y, { lineGap: 2, width: bodyWidth });
        doc.moveDown(0.3);
        i++; continue;
      }

      // H4
      if (line.startsWith('#### ')) {
        doc.fillColor(ps.h4Color).font(FONT.bold).fontSize(10)
          .text(line.slice(5).trim(), PAGE.margin, doc.y, { lineGap: 2, width: bodyWidth });
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

          const stripMd = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');

          // Header
          doc.rect(PAGE.margin, doc.y, bodyWidth, 20).fill(DEF_COLOR.dark2);
          parsed.headers.forEach((h, ci) => {
            doc.fillColor(ps.accent).font(FONT.bold).fontSize(8)
              .text(stripMd(h), PAGE.margin + colW * ci + 4, doc.y - 15, {
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
                .text(stripMd(cell), PAGE.margin + colW * ci + 4, rowY + 4, {
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
        const rawText = line.replace(/^[\s]*[-*]\s+/, '');
        const indent = PAGE.margin + depth * 10;
        const dotWidth = 16;
        const textX = indent + dotWidth;
        const textWidth = PAGE.margin + bodyWidth - textX;
        const bulletY = doc.y;
        // Render dot at absolute position (advances doc.y by one line)
        doc.fillColor(ps.accent).font(FONT.bold).fontSize(10)
          .text('•', indent, bulletY, { width: dotWidth });
        // Reset y to same line so text sits beside the dot
        doc.y = bulletY;
        // renderInline handles **bold** / *italic* and starts at explicit x/width
        renderInline(rawText, { x: textX, width: textWidth });
        i++; continue;
      }

      // Numbered list (1. 2. 3. …)
      if (line.match(/^\s*\d+\.\s+/)) {
        const depth = (line.match(/^(\s*)/) || ['', ''])[1].length;
        const numMatch = line.match(/^\s*(\d+)\.\s+/);
        const num = numMatch ? numMatch[1] : '1';
        const rawText = line.replace(/^\s*\d+\.\s+/, '');
        const indent = PAGE.margin + depth * 10;
        const numWidth = 20;
        const textX = indent + numWidth;
        const textWidth = PAGE.margin + bodyWidth - textX;
        const listY = doc.y;
        doc.fillColor(ps.accent).font(FONT.bold).fontSize(10)
          .text(`${num}.`, indent, listY, { width: numWidth });
        doc.y = listY;
        renderInline(rawText, { x: textX, width: textWidth });
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
          `ANTON by openEXPERT  |  Page ${p + 1} of ${pages.count}`,
          PAGE.margin, PAGE.height - 18, { align: 'center', width: bodyWidth }
        );
    }

    doc.end();
  });
}
