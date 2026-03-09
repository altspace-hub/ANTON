/**
 * export-docx.ts
 * Converts Markdown content to a well-formatted .docx file.
 * Uses the `docx` npm package (pure JS, no native deps).
 *
 * Default layout (applied when no brand config is supplied):
 *   A4 portrait · 2-column (4657 DXA col, 432 DXA gutter)
 *   Body: Aptos 8 pt · Headings: Montserrat #1E3A8A
 *     H1 20 pt | H2 11 pt | H3 8 pt bold | H4 8 pt bold
 *   Spacing: before 0, after 160 twips (8 pt) on every paragraph
 *   Page break before H1 and H2 · Hierarchical heading auto-numbering
 *   --- dividers: skipped (no output) · Word-native list numbering
 *   Tables: DXA widths (max 4657 DXA per column)
 *
 * Supports: # headings, ## subheadings, ### h3, #### h4,
 *           **bold**, *italic*, bullet lists (- item),
 *           numbered lists (1. item), tables (| col | col |),
 *           and plain paragraphs.
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
  LevelFormat,
} from 'docx';

// ── Locale-aware export section labels ────────────────────────
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

// ── Types ─────────────────────────────────────────────────────

interface BrandFontEntry { family: string; size: string; color: string }

interface BrandConfig {
  fonts: {
    body: BrandFontEntry;
    h1: BrandFontEntry;
    h2: BrandFontEntry;
    h3: BrandFontEntry;
    h4: BrandFontEntry;
  };
  palette: string[];
  /** Optional layout overrides — defaults to 2-column A4 */
  layout?: { columns?: number; columnSpacing?: number };
}

/** Plain text-run spec used internally before constructing TextRun instances */
type RunSpec = { text: string; bold?: boolean; italics?: boolean };

// ── Default colour constants ───────────────────────────────────

/** Default heading colour: Montserrat #1E3A8A (per spec) */
const DEF_HEADING = '1E3A8A';
const DEF_TEAL    = '2DD4A8';
const DEF_DARK    = '0F1B2D';
const DEF_GRAY    = '707070';
const DEF_WHITE   = 'FFFFFF';

// ── A4 two-column layout constants (DXA = twentieths of a point) ─
//   A4 = 210 × 297 mm = 11906 × 16838 DXA
//   Margins: 1080 DXA (0.75 in) each side → content width 9746 DXA
//   2 columns + 432 DXA gutter → each column 4657 DXA wide
const PAGE_WIDTH_DXA  = 11906;
const PAGE_HEIGHT_DXA = 16838;
const MARGIN_DXA      = 1080;
const COL_GAP_DXA     = 432;
const COL_WIDTH_DXA   = 4657;

/** Universal paragraph spacing: 0 before, 160 twips (8 pt) after */
const PARA_SPACING = { before: 0, after: 160 } as const;

// ── Utility helpers ───────────────────────────────────────────

/** Strip '#' prefix from a hex colour string */
function hex(c: string): string { return c.replace('#', ''); }

/** Convert "20pt" string → half-points integer for docx */
function ptToHalf(s: string): number {
  const n = parseInt(s, 10);
  return isNaN(n) ? 16 : n * 2;
}

/** Build resolved style constants, applying brand overrides over spec defaults */
function resolveStyle(brand?: BrandConfig | null) {
  const accent      = brand?.palette?.[0]        ? hex(brand.palette[0]) : DEF_TEAL;
  const bodyFont    = brand?.fonts?.body?.family  || 'Aptos';
  const bodySize    = brand?.fonts?.body          ? ptToHalf(brand.fonts.body.size)  : 16; // 8 pt
  const h1Font      = brand?.fonts?.h1?.family    || 'Montserrat';
  const h1Size      = brand?.fonts?.h1            ? ptToHalf(brand.fonts.h1.size)    : 40; // 20 pt
  const h1Color     = brand?.fonts?.h1?.color     ? hex(brand.fonts.h1.color) : DEF_HEADING;
  const h2Font      = brand?.fonts?.h2?.family    || 'Montserrat';
  const h2Size      = brand?.fonts?.h2            ? ptToHalf(brand.fonts.h2.size)    : 22; // 11 pt
  const h2Color     = brand?.fonts?.h2?.color     ? hex(brand.fonts.h2.color) : DEF_HEADING;
  const h3Font      = brand?.fonts?.h3?.family    || 'Montserrat';
  const h3Size      = brand?.fonts?.h3            ? ptToHalf(brand.fonts.h3.size)    : 16; // 8 pt bold
  const h3Color     = brand?.fonts?.h3?.color     ? hex(brand.fonts.h3.color) : DEF_HEADING;
  const h4Font      = brand?.fonts?.h4?.family    || 'Montserrat';
  const h4Size      = brand?.fonts?.h4            ? ptToHalf(brand.fonts.h4.size)    : 16; // 8 pt bold
  const h4Color     = brand?.fonts?.h4?.color     ? hex(brand.fonts.h4.color) : DEF_HEADING;
  const columns     = brand?.layout?.columns    ?? 1;
  const colSpacing  = brand?.layout?.columnSpacing ?? COL_GAP_DXA;
  return {
    accent, bodyFont, bodySize,
    h1Font, h1Size, h1Color,
    h2Font, h2Size, h2Color,
    h3Font, h3Size, h3Color,
    h4Font, h4Size, h4Color,
    columns, colSpacing,
  };
}

// ── Heading prefix stripper ───────────────────────────────────

/**
 * Strips leading §N and decimal-number prefixes so that the
 * automatic heading counter is the single source of numbering.
 * Examples: "§32. Expert Areas" → "Expert Areas"
 *           "1.2 Overview"      → "Overview"
 *           "PART 9: Title"     → "PART 9: Title" (kept — not a bare number)
 */
function stripHeadingPrefix(text: string): string {
  return text
    .replace(/^§\d+\.?\s*/, '')           // §32. or §32
    .replace(/^\d+(\.\d+)*\.?\s+/, '')    // 1.  or 1.2.  or 1.2.3
    .trim();
}

// ── Inline text parser (returns plain specs, not TextRun instances) ──

function parseInline(text: string): RunSpec[] {
  const runs: RunSpec[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push({ text: part.slice(2, -2), bold: true });
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push({ text: part.slice(1, -1), italics: true });
    } else if (part) {
      runs.push({ text: part });
    }
  }
  return runs.length > 0 ? runs : [{ text: '' }];
}

/** Convert RunSpecs to TextRun instances, merging any per-call overrides */
function makeRuns(
  specs: RunSpec[],
  overrides?: { bold?: boolean; color?: string; font?: string; size?: number },
): TextRun[] {
  return specs.map(s => new TextRun({ ...s, ...overrides }));
}

// ── Table parser ──────────────────────────────────────────────

// EXPORT-05: Wide tables get the full usable page width (both columns + gutter)
const FULL_PAGE_USABLE_DXA = PAGE_WIDTH_DXA - (MARGIN_DXA * 2); // ~9746 DXA
const MIN_CELL_WIDTH_DXA = 600; // ~0.4 inch minimum per cell
const WIDE_TABLE_THRESHOLD = 8; // >= 8 columns → use full page width

function parseMarkdownTable(lines: string[], accent: string = DEF_TEAL): Table | null {
  // Remove the separator row (|---|---|)
  const dataLines = lines.filter(l => !l.match(/^\|[\s:-]+\|/));
  if (dataLines.length === 0) return null;

  const rows = dataLines.map(line =>
    line.split('|').slice(1, -1).map(cell => cell.trim())
  );
  const colCount = Math.max(...rows.map(r => r.length));

  // EXPORT-05: Wide tables (>= 8 cols) span full usable page width; narrow tables stay in one column
  const isWide = colCount >= WIDE_TABLE_THRESHOLD;
  const tableWidthDxa = isWide ? FULL_PAGE_USABLE_DXA : COL_WIDTH_DXA;
  const rawCellWidth = Math.floor(tableWidthDxa / colCount);
  const cellWidthDxa = Math.max(rawCellWidth, MIN_CELL_WIDTH_DXA);

  return new Table({
    width: { size: tableWidthDxa, type: WidthType.DXA },
    rows: rows.map((cells, rowIdx) =>
      new TableRow({
        children: Array.from({ length: colCount }, (_, colIdx) => {
          const cellText = cells[colIdx] ?? '';
          const specs = parseInline(cellText);
          return new TableCell({
            width: { size: cellWidthDxa, type: WidthType.DXA },
            shading: rowIdx === 0
              ? { type: ShadingType.CLEAR, color: DEF_DARK, fill: DEF_DARK }
              : undefined,
            borders: rowIdx === 0
              ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: accent } }
              : undefined,
            children: [
              new Paragraph({
                children: makeRuns(
                  specs,
                  rowIdx === 0 ? { bold: true, color: DEF_WHITE } : undefined,
                ),
                spacing: PARA_SPACING,
              }),
            ],
          });
        }),
      })
    ),
  });
}

// ── Main converter ────────────────────────────────────────────

// GOV-04: Build export footer with analysis provenance metadata
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

  // ATTR-02: Sources & Scope section
  const sourcesSection = meta.documentsLoaded && meta.documentsLoaded.length > 0
    ? `\n\n**Sources & Scope:** ${meta.documentsLoaded.join(', ')}`
    : '';

  return `\n\n---\n\n**Legal Disclaimer:** This document has been prepared by ANTON AI (openEXPERT) for informational purposes only. It does not constitute legal, regulatory, or compliance advice. The analysis is based on information provided and AI-generated content, which may contain errors or omissions. Users must verify all findings independently and consult qualified legal and compliance professionals before acting on this output. Futurechain / openEXPERT accepts no liability for decisions made based on this document.${sourcesSection}${provenance}`;
}

interface ExportMetadata {
  title?: string;
  author?: string;
  subject?: string;
  model?: string;
  thinking?: string;
  moduleId?: string;
  sessionId?: string;
  creativity?: string;
  documentsLoaded?: string[];
  // EXPORT-01/02 — governance cover page
  clientName?: string;
  projectName?: string;
  version?: string;
  reviewer?: string;
  status?: 'DRAFT' | 'FINAL' | 'CONFIDENTIAL DRAFT';
  classificationLabel?: string; // e.g. "CONFIDENTIAL — For Recipient Only"
  includeCoverPage?: boolean;
}

// EXPORT-01: Build a governance-ready cover page as the first section
function buildCoverPage(meta: ExportMetadata, s: ReturnType<typeof resolveStyle>): (Paragraph | Table)[] {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const items: (Paragraph | Table)[] = [];

  // Top ANTON branding line
  items.push(new Paragraph({ children: [new TextRun({ text: 'ANTON by openEXPERT', color: '2DD4A8', size: 36, bold: true, font: s.h1Font })], spacing: { before: 0, after: 400 } }));

  // Classification badge
  const classification = meta.classificationLabel || 'CONFIDENTIAL — For Recipient Only';
  items.push(new Paragraph({
    children: [new TextRun({ text: classification.toUpperCase(), color: 'E74C3C', size: 20, bold: true, font: s.h2Font })],
    spacing: { before: 200, after: 800 },
  }));

  // Main title
  items.push(new Paragraph({
    children: [new TextRun({ text: meta.title || 'Analysis Report', color: 'FFFFFF', size: 64, bold: true, font: s.h1Font })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 400 },
  }));

  if (meta.subject) {
    items.push(new Paragraph({ children: [new TextRun({ text: meta.subject, color: 'B0B0B0', size: 28, font: s.bodyFont })], spacing: { before: 0, after: 800 } }));
  }

  // Status watermark
  const status = meta.status || 'DRAFT';
  items.push(new Paragraph({ children: [new TextRun({ text: status, color: status === 'FINAL' ? '27AE60' : 'F5A623', size: 32, bold: true, font: s.h1Font })], spacing: { before: 0, after: 1600 } }));

  // Cover metadata table
  const rows: Array<[string, string]> = [
    ['Client', meta.clientName || '—'],
    ['Project', meta.projectName || '—'],
    ['Date', date],
    ['Version', meta.version || 'v1.0'],
    ['Author', meta.author || 'ANTON FCP Workbench'],
    ['Reviewer', meta.reviewer || '________________________'],
    ['Session ID', meta.sessionId ? meta.sessionId.slice(0, 8).toUpperCase() : '—'],
  ];

  const COL1 = 1440; const COL2 = 3600;

  items.push(new Table({
    width: { size: COL1 + COL2, type: WidthType.DXA },
    rows: rows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({ width: { size: COL1, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, font: s.bodyFont, color: 'B0B0B0' })], spacing: { before: 40, after: 40 } })], shading: { type: ShadingType.CLEAR, fill: '152238' } }),
        new TableCell({ width: { size: COL2, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: value, size: 18, font: s.bodyFont, color: 'E0E0E0' })], spacing: { before: 40, after: 40 } })], shading: { type: ShadingType.CLEAR, fill: '0F1B2D' } }),
      ],
    })),
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: '2DD4A8' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: '2DD4A8' },
      left:   { style: BorderStyle.NONE },
      right:  { style: BorderStyle.NONE },
      insideHorizontal:{ style: BorderStyle.SINGLE, size: 1, color: '152238' },
      insideVertical:{ style: BorderStyle.NONE },
    },
  }));

  // LEGAL-01 disclaimer
  items.push(new Paragraph({
    children: [new TextRun({ text: 'AI-Assisted Analysis — Not Legal Advice — Requires Professional Review', size: 16, italics: true, color: '707070', font: s.bodyFont })],
    spacing: { before: 800, after: 0 },
  }));

  return items;
}

export async function generateDocx(
  markdown: string,
  metadata: ExportMetadata = {},
  brandConfig?: BrandConfig | null,
): Promise<Buffer> {
  const s = resolveStyle(brandConfig);
  const lines = (markdown + buildExportFooter(metadata)).split('\n');
  const children: (Paragraph | Table)[] = [];

  // Hierarchical heading counters for auto-numbering
  let h1n = 0, h2n = 0, h3n = 0, h4n = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // ── Heading 1 — page break before, 20 pt Montserrat, numbered ──
    if (line.startsWith('# ')) {
      h1n++; h2n = 0; h3n = 0; h4n = 0;
      const clean = stripHeadingPrefix(line.slice(2).trim());
      children.push(new Paragraph({
        children: makeRuns(parseInline(`${h1n}  ${clean}`)),
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: h1n > 1,  // Page break before each major section except the first
        spacing: PARA_SPACING,
      }));
      i++; continue;
    }

    // ── Heading 2 — no page break, numbered ──
    if (line.startsWith('## ')) {
      h2n++; h3n = 0; h4n = 0;
      const clean = stripHeadingPrefix(line.slice(3).trim());
      children.push(new Paragraph({
        children: makeRuns(parseInline(`${h1n}.${h2n}  ${clean}`)),
        heading: HeadingLevel.HEADING_2,
        spacing: PARA_SPACING,
      }));
      i++; continue;
    }

    // ── Heading 3 — no page break, 8 pt Montserrat bold, numbered ──
    if (line.startsWith('### ')) {
      h3n++; h4n = 0;
      const clean = stripHeadingPrefix(line.slice(4).trim());
      children.push(new Paragraph({
        children: makeRuns(parseInline(`${h1n}.${h2n}.${h3n}  ${clean}`)),
        heading: HeadingLevel.HEADING_3,
        spacing: PARA_SPACING,
      }));
      i++; continue;
    }

    // ── Heading 4 — no page break, 8 pt Montserrat bold, numbered ──
    if (line.startsWith('#### ')) {
      h4n++;
      const clean = stripHeadingPrefix(line.slice(5).trim());
      children.push(new Paragraph({
        children: makeRuns(
          parseInline(`${h1n}.${h2n}.${h3n}.${h4n}  ${clean}`),
          { bold: true, font: s.h4Font, size: s.h4Size, color: s.h4Color },
        ),
        spacing: PARA_SPACING,
      }));
      i++; continue;
    }

    // ── Horizontal rule (---) — skip entirely per spec ──────────
    if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/)) {
      i++; continue;
    }

    // ── Markdown table — collect all table lines ─────────────────
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const table = parseMarkdownTable(tableLines, s.accent);
      if (table) {
        children.push(new Paragraph({ text: '', spacing: PARA_SPACING }));
        children.push(table);
        children.push(new Paragraph({ text: '', spacing: PARA_SPACING }));
      }
      continue;
    }

    // ── Bullet list (Word-native numbering, no unicode inline) ───
    if (line.match(/^[\s]*[-*]\s+/)) {
      const depth = (line.match(/^(\s*)/) || ['', ''])[1].length;
      const text = line.replace(/^[\s]*[-*]\s+/, '');
      children.push(new Paragraph({
        children: makeRuns(parseInline(text)),
        numbering: { reference: 'bullet-list', level: Math.min(Math.floor(depth / 2), 8) },
        spacing: PARA_SPACING,
      }));
      i++; continue;
    }

    // ── Numbered list (Word-native decimal numbering) ────────────
    if (line.match(/^[\s]*\d+\.\s+/)) {
      const text = line.replace(/^[\s]*\d+\.\s+/, '');
      children.push(new Paragraph({
        children: makeRuns(parseInline(text)),
        numbering: { reference: 'ordered-list', level: 0 },
        spacing: PARA_SPACING,
      }));
      i++; continue;
    }

    // ── Blank line — skip (spacing handled by after-spacing) ─────
    if (line.trim() === '') {
      i++; continue;
    }

    // ── Default body paragraph ───────────────────────────────────
    children.push(new Paragraph({
      children: makeRuns(parseInline(line)),
      spacing: PARA_SPACING,
      alignment: AlignmentType.LEFT,
    }));
    i++;
  }

  // ── Build Document ───────────────────────────────────────────
  const doc = new Document({
    creator: metadata.author || 'ANTON by openEXPERT',
    title: metadata.title || 'openEXPERT Output',
    subject: metadata.subject || 'AI-Generated Analysis',
    description: 'Generated by openEXPERT — AI-powered compliance analysis',

    numbering: {
      config: [
        // Bullet list: Word-native bullets at 3 indent levels
        {
          reference: 'bullet-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: '\u25E6',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
            },
            {
              level: 2,
              format: LevelFormat.BULLET,
              text: '\u25AA',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            },
          ],
        },
        // Ordered list: decimal numbering
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
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
          paragraph: { spacing: { line: 276 } }, // ~1.15× line height
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          run: { size: s.h1Size, bold: true, color: s.h1Color, font: s.h1Font },
          paragraph: { spacing: PARA_SPACING },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          run: { size: s.h2Size, bold: true, color: s.h2Color, font: s.h2Font },
          paragraph: { spacing: PARA_SPACING },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          run: { size: s.h3Size, bold: true, color: s.h3Color, font: s.h3Font },
          paragraph: { spacing: PARA_SPACING },
        },
      ],
    },

    sections: [
      // EXPORT-01: cover page section (only when requested)
      ...(metadata.includeCoverPage !== false ? [{
        properties: {
          page: {
            size: { width: PAGE_WIDTH_DXA, height: PAGE_HEIGHT_DXA },
            margin: { top: MARGIN_DXA, right: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA },
          },
        },
        children: buildCoverPage(metadata, s),
      }] : []),
      {
        // ── A4 two-column layout ─────────────────────────────────
        properties: {
          column: {
            count: s.columns,
            space: s.colSpacing,
          },
          page: {
            size: { width: PAGE_WIDTH_DXA, height: PAGE_HEIGHT_DXA },
            margin: {
              top: MARGIN_DXA,
              right: MARGIN_DXA,
              bottom: MARGIN_DXA,
              left: MARGIN_DXA,
            },
          },
        },

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
          // EXPORT-02: footer includes confidentiality classification + version + status + page number
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: (metadata.classificationLabel || 'CONFIDENTIAL').toUpperCase(), color: 'E74C3C', size: 14, bold: true }),
                  new TextRun({ text: '   |   ', color: DEF_GRAY, size: 14 }),
                  new TextRun({ text: `${metadata.status || 'DRAFT'}   ${metadata.version || 'v1.0'}   |   ANTON by openEXPERT   |   Page `, color: DEF_GRAY, size: 14 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: DEF_GRAY, size: 14 }),
                  new TextRun({ text: ' of ', color: DEF_GRAY, size: 14 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], color: DEF_GRAY, size: 14 }),
                ],
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 1, color: '2DD4A8', space: 4 } },
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
